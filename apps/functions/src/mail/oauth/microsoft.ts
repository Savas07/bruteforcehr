// Microsoft identity platform, authorization code flow with PKCE (multi-tenant + personal accounts):
// https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
import type { MailConnectIntent } from "@bfhr/core";
import { GRAPH_READ_SCOPE, GRAPH_SEND_SCOPE, graphErrorDialect } from "../providers/graph";
import { RestClient } from "../providers/rest";
import type { Fetch } from "../providers/types";
import { requestTokens, type TokenEndpoint } from "./token-endpoint";
import type {
  AuthorizeParams,
  OAuthCallbackError,
  OAuthClientConfig,
  OAuthProfile,
  OAuthProvider,
  OAuthTokens,
} from "./types";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const PROFILE_URL = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName";
const GRAPH_RESOURCE = "https://graph.microsoft.com/";
const USER_READ_SCOPE = "https://graph.microsoft.com/User.Read";
/** What the privacy policy lists for reading: Mail.Read, User.Read, offline_access and OpenID. */
const READ_SCOPES = ["openid", "email", "profile", "offline_access", GRAPH_READ_SCOPE, USER_READ_SCOPE];
/** OpenID Connect scopes are never resource-qualified. */
const OIDC_SCOPES: Record<string, true> = { openid: true, email: true, profile: true, offline_access: true };
/** Canonical spelling of the Graph scopes we compare against, keyed by lower-cased short name. */
const GRAPH_SCOPES: Record<string, string> = {
  "mail.read": GRAPH_READ_SCOPE,
  "mail.send": GRAPH_SEND_SCOPE,
  "user.read": USER_READ_SCOPE,
};

/**
 * The token response lists Graph scopes in short form (`Mail.Read`); `readScope` / `sendScope`
 * are resource-qualified URLs, so qualify short names (case-insensitively for known ones).
 */
export function normalizeMicrosoftScope(scope: string): string {
  if (OIDC_SCOPES[scope.toLowerCase()] === true) return scope.toLowerCase();
  const short = scope.toLowerCase().startsWith(GRAPH_RESOURCE) ? scope.slice(GRAPH_RESOURCE.length) : scope;
  if (short.includes("://")) return scope;
  return GRAPH_SCOPES[short.toLowerCase()] ?? `${GRAPH_RESOURCE}${short}`;
}

/**
 * AADSTS codes meaning the refresh token is dead: 700082 expired after inactivity, 50173 grant
 * revoked (password change), 70008 expired/revoked, 700084 SPA token lifetime, 50076/50079 MFA
 * re-registration, 65001 consent withdrawn. https://learn.microsoft.com/entra/identity-platform/reference-error-codes
 */
const DEAD_GRANT = /AADSTS(700082|50173|70008|700084|50076|50079|65001)\b/;

export function microsoftOAuth(config: OAuthClientConfig, options: { fetch?: Fetch } = {}): OAuthProvider {
  const fetch = options.fetch ?? globalThis.fetch;
  const tokenEndpoint: TokenEndpoint = {
    label: "microsoft",
    url: `${AUTHORITY}/token`,
    fetch,
    grantRevoked: (error) =>
      error.error === "invalid_grant" ||
      error.error === "interaction_required" ||
      DEAD_GRANT.test(error.error_description ?? ""),
    normalizeScope: normalizeMicrosoftScope,
  };

  return {
    id: "microsoft",
    readScope: GRAPH_READ_SCOPE,
    sendScope: GRAPH_SEND_SCOPE,

    // Sending adds Mail.Send only (incremental consent: the read scopes are already granted).
    scopesFor(intent: MailConnectIntent): string[] {
      return intent === "send" ? [...READ_SCOPES, GRAPH_SEND_SCOPE] : [...READ_SCOPES];
    },

    authorizeUrl(params: AuthorizeParams): string {
      const url = new URL(`${AUTHORITY}/authorize`);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: params.redirectUri,
        response_mode: "query",
        scope: this.scopesFor(params.intent).join(" "),
        state: params.state,
        prompt: "select_account",
        code_challenge: params.codeChallenge,
        code_challenge_method: "S256",
        ...(params.loginHint === null ? {} : { login_hint: params.loginHint }),
      }).toString();
      return url.toString();
    },

    // `scope` is optional on redemption and refresh: without it the token covers the scopes of
    // the authorize leg, which is what the intent asked for.
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

    // https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token
    refresh(refreshToken: string): Promise<OAuthTokens> {
      return requestTokens(tokenEndpoint, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    },

    // Deliberately a no-op: the Microsoft identity platform has no endpoint revoking one app's
    // delegated grant. `POST /me/revokeSignInSessions` would sign the user out of every app and
    // device, which disconnecting a mailbox must not do; users remove the app's consent at
    // https://myapps.microsoft.com (or https://account.live.com/consent/Manage for personal accounts).
    async revoke(): Promise<void> {},

    // https://learn.microsoft.com/graph/api/user-get (`mail` is null for some accounts, the UPN is
    // then the sign-in address).
    async profile(accessToken: string): Promise<OAuthProfile> {
      const client = new RestClient({
        tokens: { get: () => Promise.resolve(accessToken), invalidate: () => {} },
        fetch,
        label: "graph profile",
        dialect: graphErrorDialect,
        retryUnauthorized: false,
      });
      const me = await client.json<{
        mail?: string | null;
        userPrincipalName: string;
        displayName?: string | null;
      }>(PROFILE_URL, { scope: USER_READ_SCOPE });
      return { address: me.mail ?? me.userPrincipalName, displayName: me.displayName ?? null };
    },

    // https://learn.microsoft.com/entra/identity-platform/reference-error-codes (AADSTS65004 user
    // declined consent; AADSTS65001/90094/90095 admin consent required).
    callbackError(error: string, description: string | null): OAuthCallbackError {
      const text = description ?? "";
      if (error === "access_denied" && text.includes("AADSTS65004")) return "cancelled";
      if (error === "consent_required" || /AADSTS(90094|90095|65001)\b/.test(text))
        return "admin_consent_required";
      if (error === "access_denied") return "cancelled";
      return "failed";
    },
  };
}
