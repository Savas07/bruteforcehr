// OAuth 2.0 token endpoint call shared by Google and Microsoft (RFC 6749 §4.1.3, §6; error
// response §5.2). Errors carry the provider label, status and `error` code only.
import { z } from "zod";
import { retryAfterSeconds } from "../providers/rest";
import { type Fetch, MailAuthError, MailTransientError } from "../providers/types";
import type { OAuthTokens } from "./types";

const TokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number(),
  scope: z.string().optional(),
});

export const OAuthErrorBody = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});
export type OAuthErrorBody = z.infer<typeof OAuthErrorBody>;

export interface TokenEndpoint {
  label: string;
  url: string;
  fetch: Fetch;
  /** The grant is dead (revoked, expired, password changed): the account needs re-auth. */
  grantRevoked(error: OAuthErrorBody): boolean;
  /** Maps granted scope names to the form `readScope` / `sendScope` use. */
  normalizeScope?: (scope: string) => string;
}

export async function postForm(fetch: Fetch, label: string, url: string, form: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
  } catch {
    throw new MailTransientError(`${label} network error`);
  }
}

export async function requestTokens(endpoint: TokenEndpoint, form: Record<string, string>): Promise<OAuthTokens> {
  const response = await postForm(endpoint.fetch, endpoint.label, endpoint.url, form);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = OAuthErrorBody.safeParse(body);
    const code = error.success ? ` ${error.data.error}` : "";
    if (response.status === 429 || response.status >= 500) {
      throw new MailTransientError(`${endpoint.label} token ${response.status}${code}`, retryAfterSeconds(response.headers));
    }
    if (error.success && endpoint.grantRevoked(error.data)) throw new MailAuthError(`${endpoint.label} token${code}`);
    throw new Error(`${endpoint.label} token ${response.status}${code}`);
  }
  const tokens = TokenResponse.parse(body);
  const normalize = endpoint.normalizeScope ?? ((scope: string) => scope);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scopes: (tokens.scope ?? "").split(" ").filter((scope) => scope !== "").map(normalize),
  };
}
