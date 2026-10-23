// Provider-specific OAuth 2.0 endpoints (Google, Microsoft identity platform). The generic
// `/connect/**` handler (./connect-http.ts) runs authorization code + PKCE through this seam.
import type { MailConnectIntent } from "@bfhr/core";

/** OAuth client credentials from Secret Manager (JSON `{ "clientId": "…", "clientSecret": "…" }`). */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface OAuthTokens {
  accessToken: string;
  /** Absent on refreshes that keep the old refresh token. */
  refreshToken: string | null;
  expiresAt: Date;
  /** Scopes actually granted (Google lets users uncheck some). */
  scopes: string[];
}

export interface OAuthProfile {
  address: string;
  displayName: string | null;
}

export interface AuthorizeParams {
  state: string;
  /** S256 challenge of the verifier kept server-side. */
  codeChallenge: string;
  redirectUri: string;
  intent: MailConnectIntent;
  loginHint: string | null;
}

/** Error the provider returned on the callback (`?error=`), mapped to the app return reason. */
export type OAuthCallbackError = "cancelled" | "admin_consent_required" | "failed";

export interface OAuthProvider {
  readonly id: "google" | "microsoft";
  /** Scopes requested for an intent; `requiredScopes` must all be granted for reading to work. */
  scopesFor(intent: MailConnectIntent): string[];
  readonly readScope: string;
  readonly sendScope: string;
  authorizeUrl(params: AuthorizeParams): string;
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthTokens>;
  /** Throws `MailAuthError` on `invalid_grant` (revoked / expired refresh token). */
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** Best effort: Google revokes the grant; Microsoft has no per-app revoke endpoint (no-op). */
  revoke(token: string): Promise<void>;
  profile(accessToken: string): Promise<OAuthProfile>;
  /** Maps the callback's `error` / `error_description` query parameters. */
  callbackError(error: string, description: string | null): OAuthCallbackError;
}
