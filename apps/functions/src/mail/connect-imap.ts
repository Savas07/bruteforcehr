import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  imapPresetById,
  mailEndpointAllowed,
  type MailAccount,
  type MailConnectImapResponse,
  MailConnectImapRequestSchema,
  MailConnectImapResponseSchema,
  type MailEndpoint,
} from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifiedUid } from "../callable";
import { adminConverters as converters } from "../converters";
import { takeDaily, USER_DAILY_LIMITS, utcDayKey } from "../daily-usage";
import { saveMailSecret, secretRefOf } from "./accounts";
import { MAIL_TOKEN_KEYS } from "./config";
import { MailCallableError } from "./errors";
import { ImapAdapter, ImapConnectError, type ImapCredentials } from "./providers/imap";
import { startBackfill } from "./sync";

const SMTP_WARNING = {
  auth_failed: "smtp_auth_failed",
  host_unreachable: "smtp_unreachable",
  tls_failed: "smtp_tls_failed",
  imap_disabled: "smtp_auth_failed",
} as const;

function connectError(error: ImapConnectError): MailCallableError {
  switch (error.reason) {
    case "auth_failed":
      return new MailCallableError(
        "permission-denied",
        "auth_failed",
        "We couldn't sign in with this app password.",
        { field: "password" },
      );
    case "imap_disabled":
      return new MailCallableError(
        "failed-precondition",
        "imap_disabled",
        "IMAP access is turned off for this account at the provider.",
        { field: "password" },
      );
    case "tls_failed":
      return new MailCallableError(
        "failed-precondition",
        "tls_failed",
        "The server's security certificate couldn't be verified.",
        { field: "imapHost" },
      );
    default:
      return new MailCallableError("unavailable", "host_unreachable", "Can't reach the mail server.", {
        field: "imapHost",
      });
  }
}

/**
 * `mailConnectImap({ address, password, preset, username?, imap?, smtp?, lookbackDays, accountId? })`:
 * tests IMAP login (and SMTP, which may fail without blocking reading), stores the credentials
 * encrypted, writes the account and starts the lookback scan (connect-email.md Screen C).
 */
export const mailConnectImap = onCall(
  { secrets: [MAIL_TOKEN_KEYS], timeoutSeconds: 60 },
  async (request): Promise<MailConnectImapResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailConnectImapRequestSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Expected { address, password, preset, … }.");
    const input = parsed.data;
    const preset = imapPresetById(input.preset);
    if (preset?.oauthOnly) {
      throw new MailCallableError(
        "failed-precondition",
        "oauth_required",
        `${preset.label} only allows signing in with ${preset.oauthOnly === "microsoft" ? "Microsoft" : "Google"}.`,
      );
    }
    const imap: MailEndpoint | null = input.imap ?? preset?.imap ?? null;
    if (imap === null)
      throw new HttpsError("invalid-argument", "IMAP server settings are required for other providers.");
    const smtp: MailEndpoint | null = input.smtp ?? preset?.smtp ?? null;
    const address = input.address.toLowerCase();
    // Only mail ports with their TLS mode (MAIL_ENDPOINT_PORTS): the form must not reach other services.
    for (const [kind, endpoint] of [
      ["imap", imap],
      ["smtp", smtp],
    ] as const) {
      if (endpoint !== null && !mailEndpointAllowed(kind, endpoint)) {
        throw new MailCallableError(
          "invalid-argument",
          "port_not_allowed",
          kind === "imap"
            ? "Use port 993 with SSL/TLS or 143 with STARTTLS for IMAP."
            : "Use port 465 with SSL/TLS or 587 with STARTTLS for SMTP.",
          { field: kind === "imap" ? "imapHost" : "smtpHost" },
        );
      }
    }
    // Each attempt logs in at a user-chosen server: a daily limit keeps it from being a relay.
    const day = utcDayKey(new Date());
    const refused = await takeDaily(
      [
        {
          name: "user" as const,
          path: serverOnlyPaths.mailConnectDay(uid, day),
          field: "attempts",
          amount: 1,
          limit: USER_DAILY_LIMITS.mailConnectAttempts,
        },
      ],
      day,
    );
    if (refused !== null) {
      throw new MailCallableError(
        "resource-exhausted",
        "too_many_attempts",
        "That's a lot of connection attempts for today. Try again tomorrow.",
      );
    }

    const usernames = [input.username ?? address];
    if (input.username === null && preset?.tryLocalPartUsername)
      usernames.push(address.slice(0, address.indexOf("@")));
    let credentials: ImapCredentials | null = null;
    let lastError: unknown = null;
    for (const username of usernames) {
      const candidate: ImapCredentials = {
        username,
        password: input.password,
        imap,
        smtp,
        smtpSavesSent: preset?.smtpSavesSent ?? false,
        // SMTP takes the full address even where IMAP accepts the local part (iCloud).
        smtpUsername: input.username ?? address,
      };
      try {
        await ImapAdapter.verifyImap(candidate);
        credentials = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (!(error instanceof ImapConnectError && error.reason === "auth_failed")) break;
      }
    }
    if (credentials === null) {
      if (lastError instanceof ImapConnectError) throw connectError(lastError);
      logger.error("mail_imap_connect_failed", {
        name: lastError instanceof Error ? lastError.name : typeof lastError,
      });
      throw new MailCallableError(
        "unavailable",
        "provider_unavailable",
        "We couldn't finish connecting. Nothing was saved.",
      );
    }

    let smtpWarning: MailConnectImapResponse["smtpWarning"] = null;
    if (smtp === null) {
      smtpWarning = "smtp_not_configured";
    } else {
      try {
        await ImapAdapter.verifySmtp(credentials);
      } catch (error) {
        smtpWarning = error instanceof ImapConnectError ? SMTP_WARNING[error.reason] : "smtp_unreachable";
        credentials = { ...credentials, smtp: null };
      }
    }

    const db = getFirestore();
    const accounts = db.collection(firestorePaths.mailAccounts(uid));
    let accountId = input.accountId;
    if (accountId !== null) {
      const existing = await accounts.doc(accountId).get();
      if (!existing.exists || existing.get("provider") !== "imap")
        throw new MailCallableError("not-found", "account_not_found", "This account was not found.");
    } else {
      const same = await accounts
        .where("address", "==", address)
        .where("provider", "==", "imap")
        .limit(1)
        .get();
      accountId = same.docs[0]?.id ?? accounts.doc().id;
    }
    await saveMailSecret(uid, accountId, { kind: "imap", ...credentials });

    const now = new Date();
    const previous = await accounts.doc(accountId).get();
    const account: MailAccount = {
      id: accountId,
      provider: "imap",
      address,
      displayName: preset?.label ?? null,
      status: "connected",
      syncCursor: previous.exists ? ((previous.get("syncCursor") as string | null) ?? null) : null,
      secretRef: secretRefOf(uid, accountId),
      scopes: [],
      canSend: credentials.smtp !== null,
      lastSyncedAt: null,
      lastError: null,
      server: { preset: input.preset, username: credentials.username, imap, smtp: credentials.smtp },
      backfill: null,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (previous.exists) {
      const {
        id: _id,
        createdAt: _createdAt,
        backfill: _backfill,
        lastSyncedAt: _lastSyncedAt,
        ...update
      } = account;
      await accounts.doc(accountId).update(converters.mailAccount.toFirestoreUpdate(update));
    } else {
      await accounts.doc(accountId).set(converters.mailAccount.toFirestore(account));
    }
    if (!previous.exists || previous.get("backfill") == null)
      await startBackfill(uid, accountId, input.lookbackDays);
    logger.info("mail_connected", {
      provider: "imap",
      preset: input.preset,
      canSend: account.canSend,
      reconnect: previous.exists,
    });
    return MailConnectImapResponseSchema.parse({ accountId, canSend: account.canSend, smtpWarning });
  },
);
