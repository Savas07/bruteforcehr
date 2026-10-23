/**
 * Build-time GitHub Releases data for the Download, Changelog and Home pages (website.md › Download,
 * Changelog). GitHub Releases are the single source of truth for versions (ADR 0004), so nothing here
 * is hard-coded: the site is rebuilt by the release workflow's `website` job after every publish.
 *
 * - No published release (empty list, `/releases/latest` 404) is a normal state: pages say so.
 * - Any other API or network failure fails the build, so a broken fetch never deploys a false
 *   "No release yet".
 * - `GITHUB_TOKEN` is optional (CI sets it for the higher rate limit). With a token, drafts become
 *   visible, so they are filtered out explicitly.
 */
import { GITHUB_REPO } from "./site.ts";

const API = `https://api.github.com/repos/${GITHUB_REPO}`;
/** Long-lived pre-release that carries the beta updater manifest; not a version (ADR 0004 §4). */
const UPDATER_CHANNEL_TAG = "updater-beta";
/** sha256sum output uploaded by the release workflow next to the installers. */
const CHECKSUMS_ASSET = "SHA256SUMS.txt";

export type DesktopOs = "mac" | "windows";

export interface Installer {
  os: DesktopOs;
  fileName: string;
  /** Direct, tag-pinned download URL (`…/releases/download/vX.Y.Z/<file>`). */
  url: string;
  sizeBytes: number;
  /** Lower-case hex SHA-256. */
  sha256: string;
}

export interface Release {
  tag: string;
  /** Tag without the leading `v`; never localised. */
  version: string;
  /** Release title as written on GitHub; falls back to the tag. */
  title: string;
  /** Fragment used on /changelog/ (`v0-1-1`), so in-app "What's new" links can deep-link. */
  anchor: string;
  publishedAt: Date;
  prerelease: boolean;
  htmlUrl: string;
  /** GitHub-rendered (sanitised) release notes, headings shifted below the entry heading. */
  notesHtml: string;
}

export interface LatestRelease extends Release {
  installers: Installer[];
  checksumsUrl: string | null;
}

interface ApiAsset {
  name: string;
  size: number;
  browser_download_url: string;
  /** `sha256:<hex>`, computed by GitHub on upload (null for older assets). */
  digest?: string | null;
}

interface ApiRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  body_html?: string | null;
  assets: ApiAsset[];
}

const INSTALLER_SUFFIXES: readonly { os: DesktopOs; suffix: string }[] = [
  { os: "mac", suffix: "_universal.dmg" },
  { os: "windows", suffix: "_x64-setup.exe" },
];

function headers(accept: string): Headers {
  const result = new Headers({
    Accept: accept,
    "User-Agent": "bruteforcehr-website-build",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const token = process.env.GITHUB_TOKEN;
  if (token !== undefined && token !== "") result.set("Authorization", `Bearer ${token}`);
  return result;
}

async function fail(response: Response, what: string): Promise<never> {
  const detail = (await response.text()).slice(0, 300);
  throw new Error(`GitHub ${what} responded ${response.status} ${response.statusText}: ${detail}`);
}

/** `<https://…&page=2>; rel="next", …` → the next page URL. */
function nextPage(link: string | null): string | null {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
}

/** Version titles are `h2` on /changelog/; release-note headings start one level below. */
function shiftHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-6])(?=[\s>])/g, (_, slash: string, level: string) => {
    const shifted = Math.min(6, Math.max(3, Number(level) + 1));
    return `<${slash}h${shifted}`;
  });
}

function toRelease(api: ApiRelease): Release {
  if (api.published_at === null) throw new Error(`Release ${api.tag_name} is published without a date`);
  const version = api.tag_name.replace(/^v/, "");
  const title = api.name?.trim();
  return {
    tag: api.tag_name,
    version,
    title: title === undefined || title === "" ? api.tag_name : title,
    anchor: `v${version.replace(/[^0-9A-Za-z]+/g, "-")}`,
    publishedAt: new Date(api.published_at),
    prerelease: api.prerelease,
    htmlUrl: api.html_url,
    notesHtml: shiftHeadings(api.body_html ?? ""),
  };
}

/** `<hex>  <name>` (sha256sum) or `<hex> *<name>` (binary mode) → name → hex. */
function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

async function fetchChecksums(asset: ApiAsset | undefined): Promise<Map<string, string>> {
  if (asset === undefined) return new Map();
  const response = await fetch(asset.browser_download_url, { headers: headers("application/octet-stream") });
  if (!response.ok) await fail(response, CHECKSUMS_ASSET);
  return parseSha256Sums(await response.text());
}

/**
 * SHA-256 per installer from `SHA256SUMS.txt`; GitHub's own upload digest is the fallback for a
 * release published without the file, and a cross-check when both exist. No checksum at all fails
 * the build: the page never offers a file it can't verify.
 */
function checksumFor(asset: ApiAsset, sums: Map<string, string>, tag: string): string {
  const listed = sums.get(asset.name);
  const digest =
    asset.digest?.startsWith("sha256:") === true ? asset.digest.slice("sha256:".length) : undefined;
  if (listed !== undefined && digest !== undefined && listed !== digest.toLowerCase()) {
    throw new Error(`${tag}: ${CHECKSUMS_ASSET} and GitHub disagree on the SHA-256 of ${asset.name}`);
  }
  const sha256 = listed ?? digest?.toLowerCase();
  if (sha256 === undefined)
    throw new Error(`${tag}: no SHA-256 for ${asset.name} (${CHECKSUMS_ASSET} or digest)`);
  return sha256;
}

async function loadReleases(): Promise<Release[]> {
  const releases: Release[] = [];
  let url: string | null = `${API}/releases?per_page=100`;
  while (url !== null) {
    const response = await fetch(url, { headers: headers("application/vnd.github.html+json") });
    if (!response.ok) await fail(response, "releases list");
    const page = (await response.json()) as ApiRelease[];
    releases.push(...page.filter((api) => !api.draft && api.tag_name !== UPDATER_CHANNEL_TAG).map(toRelease));
    url = nextPage(response.headers.get("link"));
  }
  return releases.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

async function loadLatest(): Promise<LatestRelease | null> {
  // `/releases/latest` is the release GitHub marks "latest": never a draft or pre-release.
  const response = await fetch(`${API}/releases/latest`, {
    headers: headers("application/vnd.github.html+json"),
  });
  if (response.status === 404) return null;
  if (!response.ok) await fail(response, "latest release");
  const api = (await response.json()) as ApiRelease;
  const checksumsAsset = api.assets.find((asset) => asset.name === CHECKSUMS_ASSET);
  const sums = await fetchChecksums(checksumsAsset);
  const installers: Installer[] = [];
  for (const { os, suffix } of INSTALLER_SUFFIXES) {
    const asset = api.assets.find((candidate) => candidate.name.endsWith(suffix));
    if (asset === undefined) continue;
    installers.push({
      os,
      fileName: asset.name,
      url: asset.browser_download_url,
      sizeBytes: asset.size,
      sha256: checksumFor(asset, sums, api.tag_name),
    });
  }
  return { ...toRelease(api), installers, checksumsUrl: checksumsAsset?.browser_download_url ?? null };
}

// Module-level promises: every page of one build shares a single fetch.
let releasesPromise: Promise<Release[]> | undefined;
let latestPromise: Promise<LatestRelease | null> | undefined;

/** Published releases and pre-releases, newest first (Changelog, Home "What's new"). */
export function getReleases(): Promise<Release[]> {
  releasesPromise ??= loadReleases();
  return releasesPromise;
}

/** The release marked latest, with its installers and checksums; `null` before the first release. */
export function getLatestRelease(): Promise<LatestRelease | null> {
  latestPromise ??= loadLatest();
  return latestPromise;
}

export function installerFor(release: LatestRelease | null, os: DesktopOs): Installer | undefined {
  return release?.installers.find((installer) => installer.os === os);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
const sizeFormat = new Intl.NumberFormat("en-GB", {
  style: "unit",
  unit: "megabyte",
  maximumFractionDigits: 1,
});

/** "23 October 2026" (UTC, so the build machine's zone doesn't matter). */
export const formatDate = (date: Date): string => dateFormat.format(date);
/** ISO date for `<time datetime>`. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
/** Decimal megabytes, as macOS Finder and most download pages show them. */
export const formatSize = (bytes: number): string => sizeFormat.format(bytes / 1_000_000);
