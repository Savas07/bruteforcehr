import { z } from "zod";
import { EmailSchema, IdSchema } from "../common";
import { type MailEndpoint, MailEndpointSchema } from "./schemas";

/** Lookback choices of the connect flow (connect-email.md Screen B: 30 / 90 / 180 days). */
export const MAIL_LOOKBACK_DAYS = [30, 90, 180] as const;
export const DEFAULT_MAIL_LOOKBACK_DAYS = 90;
export const MailLookbackDaysSchema = z.union([z.literal(30), z.literal(90), z.literal(180)]);

export interface ImapPreset {
  readonly id: string;
  readonly label: string;
  /** Address domains that select this preset (domain detection). */
  readonly domains: readonly string[];
  readonly imap: MailEndpoint;
  readonly smtp: MailEndpoint;
  /**
   * The provider no longer accepts app passwords over IMAP (OAuth only): the form routes the
   * user to the OAuth path instead. Outlook.com turned basic auth off on 2024-09-16
   * (https://support.microsoft.com/en-us/office/c5d65390-9676-4763-b41f-d7986499a90d).
   */
  readonly oauthOnly: "gmail" | "microsoft" | null;
  /** Where the user creates an app password (help card link). */
  readonly appPasswordUrl: string | null;
  /** Alternative user names to try when the full address is refused (iCloud accepts the local part). */
  readonly tryLocalPartUsername: boolean;
  /** The provider files mail sent over SMTP in Sent itself, so no IMAP APPEND (no duplicate). */
  readonly smtpSavesSent: boolean;
}

const tls = (host: string, port = 993): MailEndpoint => ({ host, port, security: "tls" });
const starttls = (host: string, port = 587): MailEndpoint => ({ host, port, security: "starttls" });

/**
 * App-password presets (IMAP + SMTP). Sources, checked 2026-10-24: Gmail
 * support.google.com/mail/answer/7126229, iCloud support.apple.com/102525, Yahoo
 * help.yahoo.com/kb/SLN4075, Yandex yandex.com/support/mail/mail-clients/others.html, GMX
 * hilfe.gmx.net/pop-imap/imap/imap-serverdaten.html, WEB.DE hilfe.web.de/pop-imap/imap/imap-serverdaten.html.
 */
export const IMAP_PRESETS = [
  {
    id: "gmail",
    label: "Gmail",
    domains: ["gmail.com", "googlemail.com"],
    imap: tls("imap.gmail.com"),
    smtp: tls("smtp.gmail.com", 465),
    oauthOnly: null,
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    tryLocalPartUsername: false,
    smtpSavesSent: true,
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    domains: ["icloud.com", "me.com", "mac.com"],
    imap: tls("imap.mail.me.com"),
    smtp: starttls("smtp.mail.me.com"),
    oauthOnly: null,
    appPasswordUrl: "https://account.apple.com/account/manage",
    tryLocalPartUsername: true,
    smtpSavesSent: false,
  },
  {
    id: "outlook",
    label: "Outlook.com",
    domains: [
      "outlook.com",
      "hotmail.com",
      "live.com",
      "msn.com",
      "outlook.de",
      "hotmail.de",
      "outlook.com.tr",
    ],
    imap: tls("outlook.office365.com"),
    smtp: starttls("smtp-mail.outlook.com"),
    oauthOnly: "microsoft",
    appPasswordUrl: null,
    tryLocalPartUsername: false,
    smtpSavesSent: true,
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    domains: ["yahoo.com", "yahoo.co.uk", "yahoo.de", "ymail.com", "rocketmail.com"],
    imap: tls("imap.mail.yahoo.com"),
    smtp: tls("smtp.mail.yahoo.com", 465),
    oauthOnly: null,
    appPasswordUrl: "https://login.yahoo.com/account/security",
    tryLocalPartUsername: false,
    smtpSavesSent: false,
  },
  {
    id: "yandex",
    label: "Yandex Mail",
    domains: ["yandex.com", "yandex.ru", "yandex.com.tr", "ya.ru"],
    imap: tls("imap.yandex.com"),
    smtp: tls("smtp.yandex.com", 465),
    oauthOnly: null,
    appPasswordUrl: "https://id.yandex.com/security/app-passwords",
    tryLocalPartUsername: false,
    smtpSavesSent: false,
  },
  {
    id: "gmx",
    label: "GMX",
    domains: ["gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com"],
    imap: tls("imap.gmx.net"),
    smtp: starttls("mail.gmx.net"),
    oauthOnly: null,
    appPasswordUrl: "https://www.gmx.net/mein-account/",
    tryLocalPartUsername: false,
    smtpSavesSent: false,
  },
  {
    id: "webde",
    label: "WEB.DE",
    domains: ["web.de"],
    imap: tls("imap.web.de"),
    smtp: starttls("smtp.web.de"),
    oauthOnly: null,
    appPasswordUrl: "https://web.de/mein-account/",
    tryLocalPartUsername: false,
    smtpSavesSent: false,
  },
] as const satisfies readonly ImapPreset[];

export type ImapPresetId = (typeof IMAP_PRESETS)[number]["id"] | "other";
export const IMAP_PRESET_IDS = [...IMAP_PRESETS.map((preset) => preset.id), "other"] as const;
export const ImapPresetIdSchema = z.enum(IMAP_PRESET_IDS);

/** Preset for an address by its domain (case-insensitive), or undefined (→ "Other (IMAP)"). */
export function imapPresetFor(address: string): ImapPreset | undefined {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  return IMAP_PRESETS.find((preset) => (preset.domains as readonly string[]).includes(domain));
}

export function imapPresetById(id: string): ImapPreset | undefined {
  return IMAP_PRESETS.find((preset) => preset.id === id);
}

/**
 * Ports `mailConnectImap` connects to, each with its one security mode (ADR 0012: TLS or STARTTLS,
 * never plaintext): IMAP 993 (TLS) or 143 (STARTTLS), SMTP 465 (TLS) or 587 (STARTTLS). Anything else
 * is refused, so the connect form can't be pointed at arbitrary services.
 */
export const MAIL_ENDPOINT_PORTS = {
  imap: [
    { port: 993, security: "tls" },
    { port: 143, security: "starttls" },
  ],
  smtp: [
    { port: 465, security: "tls" },
    { port: 587, security: "starttls" },
  ],
} as const satisfies Record<"imap" | "smtp", readonly Pick<MailEndpoint, "port" | "security">[]>;

/** Whether an IMAP or SMTP endpoint uses one of `MAIL_ENDPOINT_PORTS`. */
export function mailEndpointAllowed(
  kind: "imap" | "smtp",
  endpoint: Pick<MailEndpoint, "port" | "security">,
): boolean {
  return MAIL_ENDPOINT_PORTS[kind].some(
    (allowed) => allowed.port === endpoint.port && allowed.security === endpoint.security,
  );
}

/**
 * `mailConnectImap` request: the app password travels once over TLS (callable), is tested
 * server-side, then stored encrypted. Without `imap`/`smtp`, the preset's servers are used.
 */
export const MailConnectImapRequestSchema = z.object({
  address: EmailSchema,
  password: z.string().min(1).max(500),
  preset: ImapPresetIdSchema,
  /** Defaults to the address. */
  username: z.string().min(1).max(320).nullable().default(null),
  imap: MailEndpointSchema.nullable().default(null),
  /** null with preset `other` = reading only (no sending). */
  smtp: MailEndpointSchema.nullable().default(null),
  lookbackDays: MailLookbackDaysSchema.default(DEFAULT_MAIL_LOOKBACK_DAYS),
  /** Reconnect an existing account (new password / settings) instead of adding one. */
  accountId: IdSchema.nullable().default(null),
});
export type MailConnectImapRequest = z.input<typeof MailConnectImapRequestSchema>;

/** Why SMTP is unusable while IMAP works ("Connected for reading" warning). */
export const SMTP_WARNING_REASONS = [
  "smtp_auth_failed",
  "smtp_unreachable",
  "smtp_tls_failed",
  "smtp_not_configured",
] as const;

export const MailConnectImapResponseSchema = z.object({
  accountId: IdSchema,
  canSend: z.boolean(),
  smtpWarning: z.enum(SMTP_WARNING_REASONS).nullable(),
});
export type MailConnectImapResponse = z.infer<typeof MailConnectImapResponseSchema>;

/**
 * `details.reason` of connect errors (connect-email.md field-level errors). `field` in
 * `details` names the form field to mark (`password`, `imapHost`, `smtpHost`).
 */
export const MAIL_CONNECT_ERROR_REASONS = [
  "email_unverified",
  "auth_failed",
  "host_unreachable",
  "tls_failed",
  "imap_disabled",
  "oauth_required",
  "account_not_found",
  "provider_unavailable",
  "provider_not_configured",
  /** `mailConnectImap`: a server port/security pair outside `MAIL_ENDPOINT_PORTS` (`field` names it). */
  "port_not_allowed",
  /** `mailConnectImap`: too many connect attempts today (docs/runbooks/limits.md). */
  "too_many_attempts",
  /** `mailConnectFinish`: the sign-in is older than 10 minutes, was already used, or is unknown. */
  "connect_expired",
  /** `mailConnectFinish`: the sign-in was started by another BruteForceHR account; nothing was saved. */
  "connect_wrong_user",
] as const;
export type MailConnectErrorReason = (typeof MAIL_CONNECT_ERROR_REASONS)[number];

export const OAuthMailProviderSchema = z.enum(["google", "microsoft"]);
export type OAuthMailProvider = z.infer<typeof OAuthMailProviderSchema>;

/** `read` asks for reading only; `send` adds sending (incremental consent at the first email apply). */
export const MailConnectIntentSchema = z.enum(["read", "send"]);
export type MailConnectIntent = z.infer<typeof MailConnectIntentSchema>;

/** `mailConnectStart`: issues the short-lived nonce and returns the `/connect/{provider}` URL to open. */
export const MailConnectStartRequestSchema = z.object({
  provider: OAuthMailProviderSchema,
  intent: MailConnectIntentSchema.default("read"),
  lookbackDays: MailLookbackDaysSchema.default(DEFAULT_MAIL_LOOKBACK_DAYS),
  /** Login hint (pre-fills the provider's account picker). */
  address: EmailSchema.nullable().default(null),
});
export type MailConnectStartRequest = z.input<typeof MailConnectStartRequestSchema>;

export const MailConnectStartResponseSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  nonce: z.string().min(16).max(100),
  /** ISO 8601; the nonce is refused afterwards. */
  expiresAt: z.iso.datetime(),
});
export type MailConnectStartResponse = z.infer<typeof MailConnectStartResponseSchema>;

/**
 * `reason` values of the `bruteforcehr://connected?…&status=error&reason=` return link. With
 * `status=ok` the link carries `handoff` instead, which the app redeems with `mailConnectFinish`.
 */
export const MAIL_OAUTH_RETURN_REASONS = [
  "cancelled",
  "scope_missing",
  "admin_consent_required",
  "nonce_invalid",
  "provider_not_configured",
  "failed",
] as const;
export type MailOAuthReturnReason = (typeof MAIL_OAUTH_RETURN_REASONS)[number];

/** Pattern of the nonce and of the handoff secret on the return link (base64url). */
export const MAIL_CONNECT_NONCE_PATTERN = /^[\w-]{16,100}$/u;
export const MAIL_CONNECT_HANDOFF_PATTERN = /^[\w-]{43}$/u;

/**
 * `mailConnectFinish`: the signed-in app redeems the return link. The server holds the provider
 * tokens (encrypted) until then and saves the account only when the caller is the user who
 * started the connect; another caller gets `connect_wrong_user` and the grant is revoked.
 */
export const MailConnectFinishRequestSchema = z.object({
  nonce: z.string().regex(MAIL_CONNECT_NONCE_PATTERN),
  handoff: z.string().regex(MAIL_CONNECT_HANDOFF_PATTERN),
});
export type MailConnectFinishRequest = z.infer<typeof MailConnectFinishRequestSchema>;

export const MailConnectFinishResponseSchema = z.object({
  accountId: IdSchema,
  provider: z.enum(["gmail", "microsoft"]),
  /** The mailbox that was connected (lowercase), shown as "Connected <address>". */
  address: EmailSchema,
  displayName: z.string().nullable(),
  canSend: z.boolean(),
  /** An existing account of this mailbox was reconnected (no new lookback scan). */
  reconnect: z.boolean(),
});
export type MailConnectFinishResponse = z.infer<typeof MailConnectFinishResponseSchema>;

export const MailAccountRequestSchema = z.object({ accountId: IdSchema });
export type MailAccountRequest = z.infer<typeof MailAccountRequestSchema>;

/** `mailDisconnect`: revokes access and deletes the account's stored mail. */
export const MailDisconnectResponseSchema = z.object({ deletedMessages: z.int().min(0) });
export type MailDisconnectResponse = z.infer<typeof MailDisconnectResponseSchema>;

/** `mailSyncNow` (pull to refresh) and `mailBackfillStart` ("Try the scan again" / "Scan the last 180 days"). */
export const MailBackfillStartRequestSchema = z.object({
  accountId: IdSchema,
  lookbackDays: MailLookbackDaysSchema.default(DEFAULT_MAIL_LOOKBACK_DAYS),
});
export type MailBackfillStartRequest = z.input<typeof MailBackfillStartRequestSchema>;
