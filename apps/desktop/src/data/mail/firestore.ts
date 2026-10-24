/**
 * Mail on Firestore: one pair of snapshot listeners per signed-in user (`mailAccounts`,
 * `mailMessages`), shared by every screen, and the repository: review writes go straight to the
 * message document (the outbox shows them at once, `pendingWrites`), everything else is a
 * callable of the `default` codebase (docs/runbooks/mail.md).
 */
import { firestorePaths } from "@bfhr/api";
import {
  MailConnectFinishRequestSchema,
  MailConnectFinishResponseSchema,
  MailConnectImapRequestSchema,
  MailConnectImapResponseSchema,
  MailConnectStartRequestSchema,
  MailConnectStartResponseSchema,
  MailDisconnectResponseSchema,
  type MailAccount,
  type MailConnectImapRequest,
  type MailConnectStartRequest,
  type MailMessage,
} from "@bfhr/core";
import {
  collection,
  doc,
  type DocumentSnapshot,
  type Firestore,
  type FirestoreError,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../lib/firebaseServices";
import { converters } from "../converters";
import type { LiveMailState, MailRepository, MailSource } from "./repository";

interface ListSnapshot<T> {
  readonly value: readonly T[];
  readonly pending: ReadonlySet<string>;
  readonly cache: boolean;
}

function decoded<T>(document: DocumentSnapshot, decode: (snapshot: DocumentSnapshot) => T): T | null {
  try {
    return decode(document);
  } catch (error) {
    console.error(`Skipping ${document.ref.path}`, error);
    return null;
  }
}

/** Keeps listeners this long after the last screen unsubscribed (same as the tracker's). */
const LINGER_MS = 30_000;

class FirestoreMailSource implements MailSource {
  private state: LiveMailState = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private stops: (() => void)[] = [];
  private lingerTimer: number | null = null;

  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
  ) {}

  getState = (): LiveMailState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.lingerTimer !== null) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = null;
    }
    if (this.stops.length === 0) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.lingerTimer = window.setTimeout(() => {
          this.lingerTimer = null;
          if (this.listeners.size === 0) this.stop();
        }, LINGER_MS);
      }
    };
  };

  private emit(state: LiveMailState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  private start(): void {
    const { db, uid } = this;
    let accounts: ListSnapshot<MailAccount> | null = null;
    let messages: ListSnapshot<MailMessage> | null = null;
    let failed = false;

    const fail = (error: FirestoreError) => {
      console.error("Mail data listener failed", error);
      if (failed) return;
      failed = true;
      this.stop();
      this.emit({
        status: "error",
        retry: () => {
          this.emit({ status: "loading" });
          this.start();
        },
      });
    };

    const publish = () => {
      if (failed || accounts === null || messages === null) return;
      this.emit({
        status: "ready",
        data: {
          mailAccounts: accounts.value,
          mailMessages: messages.value,
          pendingWrites: new Set([...accounts.pending, ...messages.pending]),
          fromCache: accounts.cache || messages.cache,
        },
      });
    };

    const listen = <T>(
      path: string,
      decode: (snapshot: DocumentSnapshot) => T,
      set: (list: ListSnapshot<T>) => void,
    ) =>
      onSnapshot(
        collection(db, path),
        { includeMetadataChanges: true },
        (snapshot) => {
          const value: T[] = [];
          const pending = new Set<string>();
          for (const document of snapshot.docs) {
            const entity = decoded(document, decode);
            if (entity === null) continue;
            value.push(entity);
            if (document.metadata.hasPendingWrites) pending.add(document.id);
          }
          set({ value, pending, cache: snapshot.metadata.fromCache });
          publish();
        },
        fail,
      );

    this.stops = [
      listen(
        firestorePaths.mailAccounts(uid),
        (d) => converters.mailAccount.fromSnapshot(d),
        (list) => (accounts = list),
      ),
      listen(
        firestorePaths.mailMessages(uid),
        (d) => converters.mailMessage.fromSnapshot(d),
        (list) => (messages = list),
      ),
    ];
  }
}

const sources = new Map<string, FirestoreMailSource>();

/** The shared live mail data of `uid` (listeners start with the first subscriber). */
export function firestoreMailSource(uid: string): MailSource {
  let source = sources.get(uid);
  if (!source) {
    source = new FirestoreMailSource(firestore(), uid);
    sources.set(uid, source);
  }
  return source;
}

/** Callables that connect an account wait for an IMAP + SMTP test: allow the server's 60 s. */
const CONNECT_TIMEOUT_MS = 70_000;

export function createFirestoreMailRepository(uid: string): MailRepository {
  const db = firestore();
  const call = async <Request>(name: string, request: Request, timeout?: number): Promise<unknown> => {
    const callable = httpsCallable<Request, unknown>(functions(), name, timeout ? { timeout } : undefined);
    return (await callable(request)).data;
  };
  return {
    uid,
    review(decision) {
      const update = converters.mailReviewUpdate({
        reviewState: decision.reviewState,
        category: decision.category,
        applicationId: decision.applicationId,
        reviewedAt: new Date(),
      });
      return {
        ids: { messageId: decision.messageId },
        done: updateDoc(doc(db, firestorePaths.mailMessage(uid, decision.messageId)), update),
      };
    },
    async connectStart(request: MailConnectStartRequest) {
      const data = await call("mailConnectStart", MailConnectStartRequestSchema.parse(request));
      return MailConnectStartResponseSchema.parse(data);
    },
    async connectFinish(request) {
      const data = await call("mailConnectFinish", MailConnectFinishRequestSchema.parse(request), CONNECT_TIMEOUT_MS);
      return MailConnectFinishResponseSchema.parse(data);
    },
    async connectImap(request: MailConnectImapRequest) {
      const data = await call(
        "mailConnectImap",
        MailConnectImapRequestSchema.parse(request),
        CONNECT_TIMEOUT_MS,
      );
      return MailConnectImapResponseSchema.parse(data);
    },
    async disconnect(accountId) {
      return MailDisconnectResponseSchema.parse(await call("mailDisconnect", { accountId }, 300_000));
    },
    async backfillStart(accountId, lookbackDays) {
      await call("mailBackfillStart", { accountId, lookbackDays });
    },
    async syncNow(accountId) {
      await call("mailSyncNow", { accountId });
    },
  };
}
