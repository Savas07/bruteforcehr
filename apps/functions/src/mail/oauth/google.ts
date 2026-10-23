// Google OAuth 2.0 for web server apps with PKCE:
// https://developers.google.com/identity/protocols/oauth2/web-server
import type { MailConnectIntent } from "@bfhr/core";
import { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE, gmailErrorDialect } from "../providers/gmail";
import { RestClient, retryAfterSeconds } from "../providers/rest";
import { type Fetch, MailTransientError } from "../providers/types";
import { OAuthErrorBody, postForm, requestTokens, type TokenEndpoint } from "./token-endpoint";
import type { AuthorizeParams, OAuthCallbackError, OAuthClientConfig, OAuthProfile, OAuthProvider, OAuthTokens } from "./types";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const READ_SCOPES = ["openid", "email", GMAIL_READ_SCOPE];

export function googleOAuth(config: OAuthClientConfig, options: { fetch?: Fetch } = {}): OAuthProvider {
  const fetch = options.fetch ?? globalThis.fetch;
  const tokenEndpoint: TokenEndpoint = {
    label: "google",
    url: TOKEN_URL,
    fetch,
    // Revoked, expired or password-reset refresh tokens: https://developers.google.com/identity/protocols/oauth2#expiration
    grantRevoked: (error) => error.error === "invalid_grant",
  };

  return {
    id: "google",
    readScope: GMAIL_READ_SCOPE,
    sendScope: GMAIL_SEND_SCOPE,

    scopesFor(intent: MailConnectIntent): string[] {
      return intent === "send" ? [...READ_SCOPES, GMAIL_SEND_SCOPE] : [...READ_SCOPES];
    },

    authorizeUrl(params: AuthorizeParams): string {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: params.redirectUri,
        response_type: "code",
        scope: this.scopesFor(params.intent).join(" "),
        state: params.state,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        code_challenge: params.codeChallenge,
        code_challenge_method: "S256",
        ...(params.loginHint === null ? {} : { login_hint: params.loginHint }),
      }).toString();
      return url.toString();
    },

    exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthTokens> {
      return requestTokens(tokenEndpoint, {
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    },

    // https://developers.google.com/identity/protocols/oauth2/web-server#offline
    refresh(refreshToken: string): Promise<OAuthTokens> {
      return requestTokens(tokenEndpoint, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    },

    // https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
    async revoke(token: string): Promise<void> {
      const response = await postForm(fetch, "google revoke", REVOKE_URL, { token });
      if (response.ok) return;
      const body = OAuthErrorBody.safeParse(await response.json().catch(() => null));
      // Already revoked or expired: nothing left to revoke.
      if (response.status === 400 && body.success && body.data.error === "invalid_token") return;
      const code = body.success ? ` ${body.data.error}` : "";
      if (response.status === 429 || response.status >= 500) {
        throw new MailTransientError(`google revoke ${response.status}${code}`, retryAfterSeconds(response.headers));
      }
      throw new Error(`google revoke ${response.status}${code}`);
    },

    // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
    // (Gmail has no display name; `profile` scope is not requested, so userinfo has none either.)
    async profile(accessToken: string): Promise<OAuthProfile> {
      const client = new RestClient({
        tokens: { get: () => Promise.resolve(accessToken), invalidate: () => {} },
        fetch,
        label: "gmail profile",
        dialect: gmailErrorDialect,
        retryUnauthorized: false,
      });
      const profile = await client.json<{ emailAddress: string }>(PROFILE_URL, { scope: GMAIL_READ_SCOPE });
      return { address: profile.emailAddress, displayName: null };
    },

    // https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse
    callbackError(error: string): OAuthCallbackError {
      return error === "access_denied" ? "cancelled" : "failed";
    },
  };
}
