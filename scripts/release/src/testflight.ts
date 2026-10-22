import { sign } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Sets TestFlight "What to Test" for an uploaded build through the App Store Connect API
 * (ADR 0004 §2, `ios` job). Auth: ES256 JWT with the team API key
 * (https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests),
 * at most 20 minutes valid, audience `appstoreconnect-v1`.
 */

const API = "https://api.appstoreconnect.apple.com";

export function appStoreConnectToken(input: {
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
  now: Date;
}): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const iat = Math.floor(input.now.getTime() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: input.keyId, typ: "JWT" })}.${encode({
    iss: input.issuerId,
    iat,
    exp: iat + 15 * 60,
    aud: "appstoreconnect-v1",
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: input.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** TestFlight shows plain text (max 4000 characters); Markdown links and emphasis are flattened. */
export function whatToTest(notes: string): string {
  const text = notes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
  return text.length <= 4000 ? text : `${text.slice(0, 3999)}…`;
}

interface Resource {
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}

export interface AscClient {
  request(method: string, path: string, body?: unknown): Promise<{ data: Resource | Resource[] }>;
}

export function createAscClient(token: () => string, fetchImpl: typeof fetch = fetch): AscClient {
  return {
    async request(method, path, body) {
      const response = await fetchImpl(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        throw new Error(`App Store Connect ${method} ${path}: ${response.status} ${await response.text()}`);
      }
      return (await response.json()) as { data: Resource | Resource[] };
    },
  };
}

function list(data: Resource | Resource[]): Resource[] {
  return Array.isArray(data) ? data : [data];
}

/**
 * Waits until App Store Connect has processed build `buildNumber` of `marketingVersion`, then
 * creates or updates its en-US "What to Test".
 */
export async function setWhatToTest(
  client: AscClient,
  input: {
    bundleId: string;
    marketingVersion: string;
    buildNumber: string;
    notes: string;
    pollIntervalMs: number;
    timeoutMs: number;
  },
): Promise<string> {
  const apps = list((await client.request("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(input.bundleId)}`)).data);
  const app = apps[0];
  if (!app) throw new Error(`No App Store Connect app with bundle id ${input.bundleId}`);

  const query =
    `/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(input.buildNumber)}` +
    `&filter[preReleaseVersion.version]=${encodeURIComponent(input.marketingVersion)}&limit=1`;
  const deadline = Date.now() + input.timeoutMs;
  let build: Resource;
  for (;;) {
    const found = list((await client.request("GET", query)).data)[0];
    const state = found?.attributes?.["processingState"];
    if (found && state === "VALID") {
      build = found;
      break;
    }
    if (state === "FAILED" || state === "INVALID") {
      throw new Error(`Build ${input.marketingVersion} (${input.buildNumber}) processing ended in ${String(state)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Build ${input.marketingVersion} (${input.buildNumber}) was not processed in time`);
    }
    await sleep(input.pollIntervalMs);
  }

  const whatsNew = whatToTest(input.notes);
  const localizations = list((await client.request("GET", `/v1/builds/${build.id}/betaBuildLocalizations`)).data);
  const english = localizations.find((item) => item.attributes?.["locale"] === "en-US");
  if (english) {
    await client.request("PATCH", `/v1/betaBuildLocalizations/${english.id}`, {
      data: { type: "betaBuildLocalizations", id: english.id, attributes: { whatsNew } },
    });
  } else {
    await client.request("POST", "/v1/betaBuildLocalizations", {
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: "en-US", whatsNew },
        relationships: { build: { data: { type: "builds", id: build.id } } },
      },
    });
  }
  return build.id;
}
