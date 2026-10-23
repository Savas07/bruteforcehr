// Secrets and parameters of the mail functions (docs/adr/0012-mail-sync.md, docs/runbooks/mail.md).
import { defineSecret, defineString } from "firebase-functions/params";
import { z } from "zod";
import { secretOrNull } from "../secrets";
import { type Keyring, parseKeyring } from "./crypto";
import { googleOAuth } from "./oauth/google";
import { microsoftOAuth } from "./oauth/microsoft";
import type { OAuthProvider } from "./oauth/types";

/** Key-encryption keyring for mail credentials: `{ "current": "k1", "keys": { "k1": "<base64 32 bytes>" } }`. */
export const MAIL_TOKEN_KEYS = defineSecret("MAIL_TOKEN_KEYS");
/** Google OAuth web client `{ "clientId", "clientSecret" }`, or `unset` until the owner creates it. */
export const GOOGLE_OAUTH_CLIENT = defineSecret("GOOGLE_OAUTH_CLIENT");
/** Entra app (multi-tenant + personal accounts) `{ "clientId", "clientSecret" }`, or `unset`. */
export const MICROSOFT_OAUTH_CLIENT = defineSecret("MICROSOFT_OAUTH_CLIENT");
/** Origin of the Hosting site that rewrites `/connect/**` to the `connect` function (ADR 0006). */
export const PUBLIC_BASE_URL = defineString("PUBLIC_BASE_URL", { default: "https://bruteforcehr.web.app" });

let cachedKeyring: { source: string; keyring: Keyring } | null = null;

export function mailKeyring(): Keyring {
  const source = MAIL_TOKEN_KEYS.value();
  if (cachedKeyring?.source !== source) cachedKeyring = { source, keyring: parseKeyring(source) };
  return cachedKeyring.keyring;
}

const OAuthClientSchema = z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) });

/** Test seam: a fake provider replaces the real one (never set in production code paths). */
const testProviders = new Map<"google" | "microsoft", OAuthProvider>();
export function setOAuthProviderForTests(id: "google" | "microsoft", provider: OAuthProvider | null): void {
  if (provider === null) testProviders.delete(id);
  else testProviders.set(id, provider);
}

/** The OAuth provider, or null while its client secret is still `unset` (feature off). */
export function oauthProvider(id: "google" | "microsoft"): OAuthProvider | null {
  const override = testProviders.get(id);
  if (override !== undefined) return override;
  const raw = secretOrNull(id === "google" ? GOOGLE_OAUTH_CLIENT : MICROSOFT_OAUTH_CLIENT);
  if (raw === null) return null;
  const config = OAuthClientSchema.parse(JSON.parse(raw));
  return id === "google" ? googleOAuth(config) : microsoftOAuth(config);
}

export function redirectUri(provider: "google" | "microsoft"): string {
  return `${PUBLIC_BASE_URL.value().replace(/\/$/u, "")}/connect/${provider}/callback`;
}

/** Secrets every function that opens a mailbox needs. */
export const MAIL_SECRETS = [MAIL_TOKEN_KEYS, GOOGLE_OAUTH_CLIENT, MICROSOFT_OAUTH_CLIENT];
