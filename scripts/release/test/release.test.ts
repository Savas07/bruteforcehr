import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAppConfig, MinSupportedVersionsSchema } from "../src/app-config";
import { buildLatestJson } from "../src/latest-json";
import { keyIdHex, parsePublicKey, verifySignature } from "../src/minisign";
import { changelogEntries, changesetSummary, releaseNotes } from "../src/notes";
import { appStoreConnectToken, setWhatToTest, whatToTest, type AscClient } from "../src/testflight";
import { compareVersions, parseTag, parseVersion } from "../src/version";

const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url));

describe("versions", () => {
  it("parses stable and beta tags", () => {
    expect(parseTag("v0.1.0")).toEqual({
      version: "0.1.0",
      tag: "v0.1.0",
      channel: "stable",
      marketingVersion: "0.1.0",
    });
    expect(parseTag("v0.2.0-beta.3")).toMatchObject({ channel: "beta", marketingVersion: "0.2.0" });
  });

  it("rejects anything that is not a release", () => {
    for (const bad of ["0.1.0", "v0.1", "v01.0.0", "v0.1.0-rc.1", "vupdater-beta"]) {
      expect(() => parseTag(bad), bad).toThrow();
    }
    expect(() => parseVersion("updater-beta")).toThrow();
  });

  it("orders pre-releases before their release", () => {
    expect(compareVersions("0.2.0-beta.3", "0.2.0")).toBe(-1);
    expect(compareVersions("0.2.0-beta.10", "0.2.0-beta.9")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("updater signatures (vector signed by `tauri signer sign`)", () => {
  const pubkey = fixture("test-key.pub").toString("utf8");
  const payload = fixture("payload.txt");
  const signature = fixture("payload.txt.sig").toString("utf8");

  it("accepts the genuine file and returns the trusted comment", () => {
    expect(verifySignature(pubkey, payload, signature)).toMatch(/file:payload\.txt$/);
  });

  it("rejects a modified file", () => {
    expect(() => verifySignature(pubkey, Buffer.concat([payload, Buffer.from("x")]), signature)).toThrow(
      "Signature does not match the file",
    );
  });

  it("rejects a signature from another key", () => {
    const appKey = JSON.parse(
      readFileSync(new URL("../../../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    ).plugins.updater.pubkey as string;
    expect(() => verifySignature(appKey, payload, signature)).toThrow(/^Signed with key /);
  });

  it("prints key ids like minisign", () => {
    expect(keyIdHex(parsePublicKey(pubkey).keyId)).toMatch(/^[0-9A-F]{16}$/);
  });
});

describe("latest.json", () => {
  it("points both Mac architectures at the universal bundle, pinned to the tag", () => {
    const manifest = buildLatestJson({
      version: "0.1.0",
      notes: "- First release",
      pubDate: new Date("2026-10-23T10:00:00Z"),
      macSignature: "mac-sig\n",
      windowsSignature: "win-sig",
    });
    expect(manifest).toEqual({
      version: "0.1.0",
      notes: "- First release",
      pub_date: "2026-10-23T10:00:00.000Z",
      platforms: {
        "darwin-aarch64": {
          url: "https://github.com/Savas07/bruteforcehr/releases/download/v0.1.0/BruteForceHR_0.1.0_universal.app.tar.gz",
          signature: "mac-sig",
        },
        "darwin-x86_64": {
          url: "https://github.com/Savas07/bruteforcehr/releases/download/v0.1.0/BruteForceHR_0.1.0_universal.app.tar.gz",
          signature: "mac-sig",
        },
        "windows-x86_64": {
          url: "https://github.com/Savas07/bruteforcehr/releases/download/v0.1.0/BruteForceHR_0.1.0_x64-setup.exe",
          signature: "win-sig",
        },
      },
    });
  });
});

describe("release notes", () => {
  const changelog = [
    "# @bfhr/desktop",
    "",
    "## 0.2.0",
    "",
    "### Minor Changes",
    "",
    "- 1a2b3c4: Desktop updates install on Restart.",
    "",
    "  Downloads run in the background.",
    "",
    "### Patch Changes",
    "",
    "- Updated dependencies [1a2b3c4]",
    "  - @bfhr/core@0.2.0",
    "- @bfhr/ui-tokens@0.2.0",
    "  - @bfhr/core@0.2.0",
    "",
    "## 0.1.0",
    "",
    "- 9f8e7d6: First release.",
  ].join("\n");

  it("takes one version's entries, without hashes or dependency bookkeeping", () => {
    expect(changelogEntries(changelog, "0.2.0")).toEqual([
      "- Desktop updates install on Restart.\n\n  Downloads run in the background.",
    ]);
    expect(changelogEntries(changelog, "0.1.0")).toEqual(["- First release."]);
    expect(changelogEntries(changelog, "0.3.0")).toEqual([]);
  });

  it("merges entries repeated across packages", () => {
    expect(releaseNotes(["- A", "- B", "- A"])).toBe("- A\n- B");
    expect(releaseNotes([])).toBe("Maintenance release: no user-facing changes.");
  });

  it("reads pending changeset summaries", () => {
    expect(
      releaseNotes([
        changesetSummary('---\n"@bfhr/desktop": minor\n---\n\nFirst release.\n\nSecond line.\n'),
      ]),
    ).toBe("- First release.\n  \n  Second line.");
  });
});

describe("appConfig", () => {
  const now = new Date("2026-10-23T10:00:00Z");

  it("advertises the release and keeps feature flags", () => {
    expect(
      buildAppConfig({
        platform: "macos",
        version: "0.2.0",
        minSupportedVersion: "0.1.0",
        featureFlags: { mail: true },
        now,
      }),
    ).toEqual({
      id: "macos",
      latestVersion: "0.2.0",
      minSupportedVersion: "0.1.0",
      downloadUrl:
        "https://github.com/Savas07/bruteforcehr/releases/download/v0.2.0/BruteForceHR_0.2.0_universal.dmg",
      releaseNotesUrl: "https://github.com/Savas07/bruteforcehr/releases/tag/v0.2.0",
      featureFlags: { mail: true },
      updatedAt: now,
    });
    expect(
      buildAppConfig({
        platform: "ios",
        version: "0.2.0",
        minSupportedVersion: "0.1.0",
        featureFlags: undefined,
        now,
      }),
    ).toMatchObject({ downloadUrl: null, featureFlags: {} });
  });

  it("refuses a minimum above the release", () => {
    expect(() =>
      buildAppConfig({
        platform: "windows",
        version: "0.1.0",
        minSupportedVersion: "0.2.0",
        featureFlags: undefined,
        now,
      }),
    ).toThrow(/above the released version/);
  });

  it("has a committed minimum for every platform", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../min-supported-versions.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(MinSupportedVersionsSchema.parse(committed)).toBeTruthy();
    expect(() => MinSupportedVersionsSchema.parse({ ios: "0.1.0" })).toThrow();
  });
});

describe("TestFlight What to Test", () => {
  it("signs an App Store Connect ES256 token", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = appStoreConnectToken({
      keyId: "KEY123",
      issuerId: "issuer-uuid",
      privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      now: new Date("2026-10-23T10:00:00Z"),
    });
    const [header = "", payload = "", signature = ""] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY123",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iss: "issuer-uuid",
      iat: 1792749600,
      exp: 1792749600 + 900,
      aud: "appstoreconnect-v1",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("flattens Markdown and caps the length", () => {
    expect(whatToTest("- **Bold** [link](https://example.com) `code`")).toBe("- Bold link code");
    expect(whatToTest("x".repeat(5000))).toHaveLength(4000);
  });

  it("waits for processing, then creates the en-US localization", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const states = ["PROCESSING", "VALID"];
    const client: AscClient = {
      async request(method, path, body) {
        calls.push({ method, path, body });
        if (path.startsWith("/v1/apps")) return { data: [{ id: "app1" }] };
        if (path.startsWith("/v1/builds?"))
          return { data: [{ id: "build1", attributes: { processingState: states.shift() } }] };
        if (path.endsWith("/betaBuildLocalizations")) return { data: [] };
        return { data: { id: "loc1" } };
      },
    };
    await expect(
      setWhatToTest(client, {
        bundleId: "com.savas07.bruteforcehr",
        marketingVersion: "0.1.0",
        buildNumber: "7",
        notes: "- First release",
        pollIntervalMs: 0,
        timeoutMs: 1000,
      }),
    ).resolves.toBe("build1");
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /v1/apps?filter[bundleId]=com.savas07.bruteforcehr",
      "GET /v1/builds?filter[app]=app1&filter[version]=7&filter[preReleaseVersion.version]=0.1.0&limit=1",
      "GET /v1/builds?filter[app]=app1&filter[version]=7&filter[preReleaseVersion.version]=0.1.0&limit=1",
      "GET /v1/builds/build1/betaBuildLocalizations",
      "POST /v1/betaBuildLocalizations",
    ]);
    expect(calls.at(-1)?.body).toEqual({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: "en-US", whatsNew: "- First release" },
        relationships: { build: { data: { type: "builds", id: "build1" } } },
      },
    });
  });
});
