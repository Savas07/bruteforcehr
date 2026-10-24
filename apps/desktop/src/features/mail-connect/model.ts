/**
 * The connect dialog's model (connect-email.md "Decision — Desktop", "M5 desktop supplement"):
 * the eight provider choices and how each connects, the dialog's views, and the app-password
 * form's draft → validation → `mailConnectImap` request.
 */
import {
  EmailSchema,
  type ImapPreset,
  imapPresetById,
  imapPresetFor,
  type MailAccount,
  type MailConnectImapRequest,
  type MailEndpoint,
  type MailOAuthReturnReason,
  type MailSecurity,
  type OAuthMailProvider,
} from "@bfhr/core";

/** The picker's tiles, in order. */
export const PROVIDER_CHOICES = [
  "gmail",
  "outlook",
  "icloud",
  "yahoo",
  "yandex",
  "gmx",
  "webde",
  "other",
] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];

/** Choices the app-password form serves (Gmail too, as the alternative to Google sign-in). */
export type ImapChoice = Exclude<ProviderChoice, "outlook">;

/** Gmail and Outlook connect through the provider's sign-in in the browser. */
export const OAUTH_PROVIDER: Readonly<Partial<Record<ProviderChoice, OAuthMailProvider>>> = {
  gmail: "google",
  outlook: "microsoft",
};

export type LookbackDays = 30 | 90 | 180;

/** The browser sign-in: intro (expectation card), waiting for the return link, an error, or not set up yet. */
export type OAuthPhase =
  | { readonly step: "intro" }
  | {
      readonly step: "waiting";
      readonly url: string;
      readonly nonce: string;
      /** Epoch ms: the nonce is refused afterwards, so "Open browser again" starts over. */
      readonly expiresAt: number;
      /** Epoch ms, for "Still waiting?" after 10 minutes. */
      readonly startedAt: number;
    }
  | { readonly step: "error"; readonly reason: MailOAuthReturnReason }
  | { readonly step: "unavailable" };

export type ConnectView =
  | { readonly kind: "picker" }
  | { readonly kind: "oauth"; readonly provider: OAuthMailProvider; readonly phase: OAuthPhase }
  | { readonly kind: "imap"; readonly choice: ImapChoice }
  | { readonly kind: "scanning"; readonly accountId: string; readonly smtpWarning: boolean };

/** The tile a typed address points at (domain detection), or null for unknown domains. */
export function choiceForAddress(address: string): ProviderChoice | null {
  if (!EmailSchema.safeParse(address.trim()).success) return null;
  const preset = imapPresetFor(address.trim());
  if (preset === undefined) return null;
  return preset.id === "outlook" ? "outlook" : (preset.id as ProviderChoice);
}

export function presetOf(choice: ImapChoice): ImapPreset | undefined {
  return choice === "other" ? undefined : imapPresetById(choice);
}

/** `account.backfill.lookbackDays` when it's one of the choices, else the default. */
export function lookbackOf(account: MailAccount | null): LookbackDays {
  const days = account?.backfill?.lookbackDays;
  return days === 30 || days === 90 || days === 180 ? days : 90;
}

export function sinceDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export interface ImapDraft {
  readonly address: string;
  readonly password: string;
  /** Empty = the address. */
  readonly username: string;
  readonly imapHost: string;
  readonly imapPort: string;
  readonly imapSecurity: MailSecurity;
  /** Empty with Other = reading only. */
  readonly smtpHost: string;
  readonly smtpPort: string;
  readonly smtpSecurity: MailSecurity;
}

export type DraftField = "address" | "password" | "imapHost" | "imapPort" | "smtpHost" | "smtpPort";
export const DRAFT_FIELDS: readonly DraftField[] = [
  "address",
  "password",
  "imapHost",
  "imapPort",
  "smtpHost",
  "smtpPort",
];

/** The form's start: the preset's servers, Other's 993 / 587 defaults, or Reconnect's saved settings. */
export function initialDraft(choice: ImapChoice, address: string, account: MailAccount | null): ImapDraft {
  const server = account?.server ?? null;
  const preset = presetOf(choice);
  const imap = server?.imap ?? preset?.imap ?? { host: "", port: 993, security: "tls" as const };
  const smtp =
    server === null ? (preset?.smtp ?? { host: "", port: 587, security: "starttls" as const }) : server.smtp;
  const accountAddress = account?.address ?? address;
  return {
    address: accountAddress,
    password: "",
    username: server !== null && server.username !== accountAddress ? server.username : "",
    imapHost: imap.host,
    imapPort: String(imap.port),
    imapSecurity: imap.security,
    smtpHost: smtp?.host ?? "",
    smtpPort: String(smtp?.port ?? 587),
    smtpSecurity: smtp?.security ?? "starttls",
  };
}

const HOST = /^[A-Za-z0-9.-]+$/u;

function validPort(value: string): boolean {
  if (!/^\d{1,5}$/u.test(value.trim())) return false;
  const port = Number(value);
  return port >= 1 && port <= 65_535;
}

/** What's wrong before anything is sent: `missing` or `invalid`, per field. */
export function draftProblems(
  draft: ImapDraft,
  choice: ImapChoice,
): Partial<Record<DraftField, "missing" | "invalid">> {
  const problems: Partial<Record<DraftField, "missing" | "invalid">> = {};
  const address = draft.address.trim();
  if (address === "") problems.address = "missing";
  else if (!EmailSchema.safeParse(address).success) problems.address = "invalid";
  if (draft.password.trim() === "") problems.password = "missing";
  const imapHost = draft.imapHost.trim();
  if (imapHost === "") problems.imapHost = "missing";
  else if (!HOST.test(imapHost)) problems.imapHost = "invalid";
  if (!validPort(draft.imapPort)) problems.imapPort = "invalid";
  const smtpHost = draft.smtpHost.trim();
  if (smtpHost === "") {
    // Other may connect for reading only; a preset always knows its SMTP server.
    if (choice !== "other") problems.smtpHost = "missing";
  } else {
    if (!HOST.test(smtpHost)) problems.smtpHost = "invalid";
    if (!validPort(draft.smtpPort)) problems.smtpPort = "invalid";
  }
  return problems;
}

function endpoint(host: string, port: string, security: MailSecurity): MailEndpoint {
  return { host: host.trim().toLowerCase(), port: Number(port), security };
}

function sameEndpoint(a: MailEndpoint, b: MailEndpoint | undefined): boolean {
  return b !== undefined && a.host === b.host.toLowerCase() && a.port === b.port && a.security === b.security;
}

/**
 * The `mailConnectImap` request. Servers that match the preset are left out (the server uses the
 * preset's); Other sends both, or no SMTP for reading only.
 */
export function imapRequest(
  draft: ImapDraft,
  choice: ImapChoice,
  lookbackDays: LookbackDays,
  accountId: string | null,
): MailConnectImapRequest {
  const preset = presetOf(choice);
  const address = draft.address.trim();
  const username = draft.username.trim();
  const imap = endpoint(draft.imapHost, draft.imapPort, draft.imapSecurity);
  const smtp =
    draft.smtpHost.trim() === "" ? null : endpoint(draft.smtpHost, draft.smtpPort, draft.smtpSecurity);
  return {
    address,
    password: draft.password.trim(),
    preset: choice,
    username: username === "" || username === address ? null : username,
    imap: preset !== undefined && sameEndpoint(imap, preset.imap) ? null : imap,
    smtp: preset !== undefined && smtp !== null && sameEndpoint(smtp, preset.smtp) ? null : smtp,
    lookbackDays,
    accountId,
  };
}
