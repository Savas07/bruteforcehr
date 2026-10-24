import { describe, expect, it } from "vitest";
import { fetchStub } from "../providers/fetch-stub";
import { MailAuthError, MailScopeError, MailTransientError } from "../providers/types";
import { googleOAuth } from "./google";
import { microsoftOAuth, normalizeMicrosoftScope } from "./microsoft";
import type { AuthorizeParams } from "./types";

const config = { clientId: "client-id", clientSecret: "client-secret" };
const params = (extra: Partial<AuthorizeParams> = {}): AuthorizeParams => ({
  state: "state-1",
  codeChallenge: "challenge-1",
  redirectUri: "https://example.web.app/connect/callback",
  intent: "read",
  loginHint: null,
  ...extra,
});
const form = (body: string | Uint8Array | null) => Object.fromEntries(new URLSearchParams(String(body)));

const GOOGLE_TOKEN = "POST https://oauth2.googleapis.com/token";
const MS_TOKEN = "POST https://login.microsoftonline.com/common/oauth2/v2.0/token";

describe("googleOAuth", () => {
  it("builds the authorize URL with offline access, consent, PKCE and login hint", () => {
    const google = googleOAuth(config);
    const url = new URL(google.authorizeUrl(params({ intent: "send", loginHint: "ada@gmail.com" })));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-id",
      redirect_uri: "https://example.web.app/connect/callback",
      response_type: "code",
      scope:
        "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      state: "state-1",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      login_hint: "ada@gmail.com",
    });
    expect(new URL(google.authorizeUrl(params())).searchParams.has("login_hint")).toBe(false);
    expect(google.scopesFor("read")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
    expect(google.readScope).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(google.sendScope).toBe("https://www.googleapis.com/auth/gmail.send");
  });

  it("exchanges the code with the verifier and splits granted scopes", async () => {
    const stub = fetchStub([
      {
        match: GOOGLE_TOKEN,
        responses: [
          {
            body: {
              access_token: "at",
              refresh_token: "rt",
              expires_in: 3599,
              scope: "openid https://www.googleapis.com/auth/gmail.readonly email",
              token_type: "Bearer",
            },
          },
        ],
      },
    ]);
    const before = Date.now();
    const tokens = await googleOAuth(config, { fetch: stub.fetch }).exchangeCode(
      "code-1",
      "verifier-1",
      "https://r",
    );
    expect(tokens).toMatchObject({
      accessToken: "at",
      refreshToken: "rt",
      scopes: ["openid", "https://www.googleapis.com/auth/gmail.readonly", "email"],
    });
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3599 * 1000);
    expect(stub.calls[0]?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(form(stub.calls[0]?.body ?? null)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
      redirect_uri: "https://r",
      client_id: "client-id",
      client_secret: "client-secret",
    });
  });

  it("refreshes, keeping a null refresh token, and maps invalid_grant / outages", async () => {
    const ok = fetchStub([
      {
        match: GOOGLE_TOKEN,
        responses: [{ body: { access_token: "at2", expires_in: 3600, scope: "email" } }],
      },
    ]);
    const refreshed = await googleOAuth(config, { fetch: ok.fetch }).refresh("rt");
    expect(refreshed.refreshToken).toBeNull();
    expect(form(ok.calls[0]?.body ?? null)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "rt",
    });

    const revoked = fetchStub([
      {
        match: GOOGLE_TOKEN,
        responses: [
          {
            status: 400,
            body: { error: "invalid_grant", error_description: "Token has been expired or revoked." },
          },
        ],
      },
    ]);
    const error = await googleOAuth(config, { fetch: revoked.fetch })
      .refresh("rt")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailAuthError);
    expect((error as Error).message).not.toContain("expired or revoked");

    const down = fetchStub([
      { match: GOOGLE_TOKEN, responses: [{ status: 503, headers: { "Retry-After": "7" }, body: "" }] },
    ]);
    const outage = await googleOAuth(config, { fetch: down.fetch })
      .refresh("rt")
      .catch((e: unknown) => e);
    expect(outage).toBeInstanceOf(MailTransientError);
    expect((outage as MailTransientError).retryAfterSeconds).toBe(7);

    const misconfigured = fetchStub([
      { match: GOOGLE_TOKEN, responses: [{ status: 401, body: { error: "invalid_client" } }] },
    ]);
    const config401 = await googleOAuth(config, { fetch: misconfigured.fetch })
      .refresh("rt")
      .catch((e: unknown) => e);
    expect(config401).not.toBeInstanceOf(MailAuthError);
    expect((config401 as Error).message).toBe("google token 401 invalid_client");
  });

  it("revokes with a token form and ignores already-invalid tokens", async () => {
    const stub = fetchStub([
      {
        match: "POST https://oauth2.googleapis.com/revoke",
        responses: [
          { status: 200, body: {} },
          { status: 400, body: { error: "invalid_token" } },
          { status: 400, body: { error: "unsupported_token_type" } },
        ],
      },
    ]);
    const google = googleOAuth(config, { fetch: stub.fetch });
    await google.revoke("rt");
    expect(form(stub.calls[0]?.body ?? null)).toEqual({ token: "rt" });
    await google.revoke("rt");
    await expect(google.revoke("rt")).rejects.toThrow("google revoke 400 unsupported_token_type");
  });

  it("reads the address from the Gmail profile", async () => {
    const stub = fetchStub([
      {
        match: "GET https://gmail.googleapis.com/gmail/v1/users/me/profile",
        responses: [{ body: { emailAddress: "ada@gmail.com", historyId: "1" } }],
      },
    ]);
    expect(await googleOAuth(config, { fetch: stub.fetch }).profile("at")).toEqual({
      address: "ada@gmail.com",
      displayName: null,
    });
    expect(stub.calls[0]?.headers.get("authorization")).toBe("Bearer at");

    const noScope = fetchStub([
      {
        match: "GET https://gmail.googleapis.com/gmail/v1/users/me/profile",
        responses: [
          {
            status: 403,
            body: { error: { status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] } },
          },
        ],
      },
    ]);
    await expect(googleOAuth(config, { fetch: noScope.fetch }).profile("at")).rejects.toBeInstanceOf(
      MailScopeError,
    );
  });

  it("maps callback errors", () => {
    const google = googleOAuth(config);
    expect(google.callbackError("access_denied", null)).toBe("cancelled");
    expect(google.callbackError("admin_policy_enforced", null)).toBe("failed");
  });
});

describe("microsoftOAuth", () => {
  it("builds the authorize URL with query response mode, account picker, PKCE and login hint", () => {
    const microsoft = microsoftOAuth(config);
    const url = new URL(microsoft.authorizeUrl(params({ intent: "send", loginHint: "ada@contoso.com" })));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-id",
      response_type: "code",
      redirect_uri: "https://example.web.app/connect/callback",
      response_mode: "query",
      scope:
        "openid email profile offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read " +
        "https://graph.microsoft.com/Mail.Send",
      state: "state-1",
      prompt: "select_account",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      login_hint: "ada@contoso.com",
    });
    // Exactly what the privacy policy lists: reading asks Mail.Read, User.Read, offline_access and
    // OpenID; sending adds Mail.Send and nothing else (no Mail.ReadWrite).
    const read = [
      "openid",
      "email",
      "profile",
      "offline_access",
      "https://graph.microsoft.com/Mail.Read",
      "https://graph.microsoft.com/User.Read",
    ];
    expect(microsoft.scopesFor("read")).toEqual(read);
    expect(microsoft.scopesFor("send")).toEqual([...read, "https://graph.microsoft.com/Mail.Send"]);
    expect(microsoft.readScope).toBe("https://graph.microsoft.com/Mail.Read");
    expect(microsoft.sendScope).toBe("https://graph.microsoft.com/Mail.Send");
  });

  it("normalises short-form granted scopes to resource URLs", async () => {
    expect(normalizeMicrosoftScope("Mail.Read")).toBe("https://graph.microsoft.com/Mail.Read");
    expect(normalizeMicrosoftScope("mail.send")).toBe("https://graph.microsoft.com/Mail.Send");
    expect(normalizeMicrosoftScope("https://graph.microsoft.com/mail.read")).toBe(
      "https://graph.microsoft.com/Mail.Read",
    );
    expect(normalizeMicrosoftScope("Calendars.Read")).toBe("https://graph.microsoft.com/Calendars.Read");
    expect(normalizeMicrosoftScope("openid")).toBe("openid");
    expect(normalizeMicrosoftScope("offline_access")).toBe("offline_access");

    const stub = fetchStub([
      {
        match: MS_TOKEN,
        responses: [
          {
            body: {
              access_token: "at",
              refresh_token: "rt",
              expires_in: "3600",
              scope: "Mail.Read Mail.Send User.Read openid profile email",
              token_type: "Bearer",
            },
          },
        ],
      },
    ]);
    const tokens = await microsoftOAuth(config, { fetch: stub.fetch }).exchangeCode(
      "code",
      "verifier",
      "https://r",
    );
    expect(tokens.scopes).toEqual([
      "https://graph.microsoft.com/Mail.Read",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
      "openid",
      "profile",
      "email",
    ]);
    expect(form(stub.calls[0]?.body ?? null)).toEqual({
      grant_type: "authorization_code",
      code: "code",
      code_verifier: "verifier",
      redirect_uri: "https://r",
      client_id: "client-id",
      client_secret: "client-secret",
    });
  });

  it("maps dead refresh tokens to MailAuthError", async () => {
    for (const body of [
      {
        error: "invalid_grant",
        error_description: "AADSTS700082: The refresh token has expired due to inactivity.",
      },
      { error: "invalid_grant", error_description: "AADSTS50173: The provided grant has expired." },
      { error: "interaction_required", error_description: "AADSTS50076: MFA required." },
    ]) {
      const stub = fetchStub([{ match: MS_TOKEN, responses: [{ status: 400, body }] }]);
      await expect(microsoftOAuth(config, { fetch: stub.fetch }).refresh("rt")).rejects.toBeInstanceOf(
        MailAuthError,
      );
    }
    const bad = fetchStub([
      {
        match: MS_TOKEN,
        responses: [{ status: 400, body: { error: "invalid_request", error_description: "AADSTS900144" } }],
      },
    ]);
    const error = await microsoftOAuth(config, { fetch: bad.fetch })
      .refresh("rt")
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(MailAuthError);
    expect((error as Error).message).toBe("microsoft token 400 invalid_request");
  });

  it("reads mail, falling back to the UPN, with the display name", async () => {
    const stub = fetchStub([
      {
        match: "GET https://graph.microsoft.com/v1.0/me",
        responses: [
          {
            body: {
              mail: "ada@contoso.com",
              userPrincipalName: "ada_upn@contoso.com",
              displayName: "Ada Lovelace",
            },
          },
          { body: { mail: null, userPrincipalName: "ada@outlook.com", displayName: null } },
        ],
      },
    ]);
    const microsoft = microsoftOAuth(config, { fetch: stub.fetch });
    expect(await microsoft.profile("at")).toEqual({
      address: "ada@contoso.com",
      displayName: "Ada Lovelace",
    });
    expect(await microsoft.profile("at")).toEqual({ address: "ada@outlook.com", displayName: null });
    expect(stub.calls[0]?.url.searchParams.get("$select")).toBe("mail,userPrincipalName,displayName");
    expect(stub.calls[0]?.headers.get("authorization")).toBe("Bearer at");
  });

  it("does not call any endpoint on revoke", async () => {
    const stub = fetchStub([]);
    await microsoftOAuth(config, { fetch: stub.fetch }).revoke("rt");
    expect(stub.calls).toHaveLength(0);
  });

  it("maps callback errors", () => {
    const microsoft = microsoftOAuth(config);
    expect(
      microsoft.callbackError("access_denied", "AADSTS65004: User declined to consent to access the app."),
    ).toBe("cancelled");
    expect(
      microsoft.callbackError("access_denied", "AADSTS90094: The grant requires admin permission."),
    ).toBe("admin_consent_required");
    expect(
      microsoft.callbackError("invalid_client", "AADSTS65001: The user or administrator has not consented"),
    ).toBe("admin_consent_required");
    expect(microsoft.callbackError("consent_required", null)).toBe("admin_consent_required");
    expect(microsoft.callbackError("access_denied", null)).toBe("cancelled");
    expect(microsoft.callbackError("server_error", "AADSTS50000")).toBe("failed");
  });
});
