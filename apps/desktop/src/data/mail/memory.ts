/**
 * Mail in memory for the design build and tests: the same `MailSource` / `MailRepository` as the
 * app, over a seed (fixtures). Review writes apply like the server's rules allow, and "Not job
 * mail" forgets the message as the `mailMessageReviewed` trigger does; tracker changes the trigger
 * would make are not simulated. Callables answer like the deployed functions: OAuth providers are
 * not configured yet (`provider_not_configured`), an app password `wrong` is refused.
 */
import type { MailAccount, MailConnectErrorReason, MailConnectImapRequest, MailMessage } from "@bfhr/core";
import { IMAP_PRESETS, MailConnectImapRequestSchema } from "@bfhr/core";
import type { LiveMailState, MailRepository, MailReviewDecision, MailSource } from "./repository";

/** Every write in order, for assertions. */
export type MailMemoryLogEntry =
  | { readonly kind: "review"; readonly decision: MailReviewDecision }
  | { readonly kind: "connectStart"; readonly provider: string }
  | { readonly kind: "connectImap"; readonly address: string; readonly accountId: string | null }
  | { readonly kind: "disconnect"; readonly accountId: string }
  | { readonly kind: "backfillStart"; readonly accountId: string; readonly lookbackDays: number }
  | { readonly kind: "syncNow"; readonly accountId: string };

export interface MemoryMailStore {
  readonly source: MailSource;
  readonly repository: MailRepository;
  readonly log: readonly MailMemoryLogEntry[];
}

export interface MemoryMailOptions {
  readonly uid?: string;
  readonly accounts: readonly MailAccount[];
  readonly messages: readonly MailMessage[];
  readonly now: () => Date;
  /** OAuth providers answer with a browser URL instead of `provider_not_configured`. */
  readonly oauthConfigured?: boolean;
  /** Callables settle after this many ms (design: lets the busy states show). */
  readonly latencyMs?: number;
}

/** A callable failure shaped like the Firebase SDK's `FunctionsError`. */
function callableError(code: string, reason: MailConnectErrorReason, field?: string): Error {
  return Object.assign(new Error(reason), {
    code: `functions/${code}`,
    details: field === undefined ? { reason } : { reason, field },
  });
}

export function createMemoryMailStore(options: MemoryMailOptions): MemoryMailStore {
  const { now, latencyMs = 0 } = options;
  const uid = options.uid ?? "memory-user";
  let accounts = [...options.accounts];
  let messages = [...options.messages];
  const log: MailMemoryLogEntry[] = [];
  const listeners = new Set<() => void>();
  let state: LiveMailState = snapshot();
  let nextId = 1;

  function snapshot(): LiveMailState {
    return {
      status: "ready",
      data: { mailAccounts: accounts, mailMessages: messages, pendingWrites: new Set(), fromCache: false },
    };
  }
  function changed(): void {
    state = snapshot();
    for (const listener of listeners) listener();
  }
  // The app's TS lib predates `Promise.withResolvers`.
  const settle = <T>(run: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(run());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, latencyMs);
    });

  const connectImap = (request: MailConnectImapRequest) => {
    const input = MailConnectImapRequestSchema.parse(request);
    log.push({ kind: "connectImap", address: input.address, accountId: input.accountId });
    if (input.preset === "outlook") throw callableError("failed-precondition", "oauth_required");
    if (input.password === "wrong") throw callableError("permission-denied", "auth_failed", "password");
    const at = now();
    const preset = IMAP_PRESETS.find((candidate) => candidate.id === input.preset);
    const imap = input.imap ?? preset?.imap;
    if (imap === undefined) throw callableError("unavailable", "host_unreachable", "imapHost");
    const smtp = input.smtp ?? preset?.smtp ?? null;
    const id = input.accountId ?? `memory-account-${nextId++}`;
    const account: MailAccount = {
      id,
      provider: "imap",
      address: input.address,
      displayName: preset?.label ?? null,
      status: "connected",
      syncCursor: null,
      secretRef: `mail/users/${uid}/mailTokens/${id}`,
      scopes: [],
      canSend: smtp !== null,
      lastSyncedAt: null,
      lastError: null,
      server: { preset: input.preset, username: input.username ?? input.address, imap, smtp },
      backfill: {
        state: "running",
        stage: "scanning",
        lookbackDays: input.lookbackDays,
        since: new Date(at.getTime() - input.lookbackDays * 86_400_000),
        scanned: 0,
        total: null,
        jobMessages: 0,
        applications: 0,
        interviewInvites: 0,
        jobAlerts: 0,
        pendingReview: 0,
        startedAt: at,
        finishedAt: null,
        error: null,
      },
      connectedAt: at,
      createdAt: at,
      updatedAt: at,
    };
    accounts = [...accounts.filter((candidate) => candidate.id !== id), account];
    changed();
    return {
      accountId: id,
      canSend: smtp !== null,
      smtpWarning: smtp === null ? ("smtp_not_configured" as const) : null,
    };
  };

  const repository: MailRepository = {
    uid,
    review(decision) {
      log.push({ kind: "review", decision });
      messages =
        decision.category === "not_job"
          ? messages.filter((message) => message.id !== decision.messageId)
          : messages.map((message) =>
              message.id === decision.messageId
                ? {
                    ...message,
                    reviewState: decision.reviewState,
                    category: decision.category,
                    applicationId: decision.applicationId,
                    reviewedAt: now(),
                  }
                : message,
            );
      changed();
      return { ids: { messageId: decision.messageId }, done: Promise.resolve() };
    },
    connectStart: (request) =>
      settle(() => {
        log.push({ kind: "connectStart", provider: request.provider });
        if (!options.oauthConfigured) throw callableError("failed-precondition", "provider_not_configured");
        return {
          url: `https://bruteforcehr.web.app/connect/${request.provider}?nonce=memory-nonce-0000000000`,
          nonce: "memory-nonce-0000000000",
          expiresAt: new Date(now().getTime() + 600_000).toISOString(),
        };
      }),
    connectImap: (request) => settle(() => connectImap(request)),
    disconnect: (accountId) =>
      settle(() => {
        log.push({ kind: "disconnect", accountId });
        const deletedMessages = messages.filter((message) => message.accountId === accountId).length;
        accounts = accounts.filter((account) => account.id !== accountId);
        messages = messages.filter((message) => message.accountId !== accountId);
        changed();
        return { deletedMessages };
      }),
    backfillStart: (accountId, lookbackDays) =>
      settle(() => {
        log.push({ kind: "backfillStart", accountId, lookbackDays });
        const at = now();
        accounts = accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                backfill: {
                  state: "queued",
                  stage: "scanning",
                  lookbackDays,
                  since: new Date(at.getTime() - lookbackDays * 86_400_000),
                  scanned: 0,
                  total: null,
                  jobMessages: 0,
                  applications: 0,
                  interviewInvites: 0,
                  jobAlerts: 0,
                  pendingReview: 0,
                  startedAt: null,
                  finishedAt: null,
                  error: null,
                },
              }
            : account,
        );
        changed();
      }),
    syncNow: (accountId) =>
      settle(() => {
        log.push({ kind: "syncNow", accountId });
        accounts = accounts.map((account) =>
          account.id === accountId ? { ...account, lastSyncedAt: now() } : account,
        );
        changed();
      }),
  };

  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => state,
    },
    repository,
    log,
  };
}
