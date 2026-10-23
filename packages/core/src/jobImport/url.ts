import { siteFor } from "./sites";

/** Query parameters that only track the click or UI state, never select the posting. */
const TRACKING_PARAMS =
  /^(utm_.*|gclid|gclsrc|dclid|fbclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|trk|trkInfo|trackingId|refId|lipi|eBP|originalSubdomain|position|pageNum|from|src|source|ref|referrer|igshid|si|share_id|cmp|campaign)$/i;

/**
 * The address to fetch for a shared link or text: the first http(s) URL in the input (share sheets
 * often send "Look at this job https://…"), upgraded to https, without fragment and tracking
 * parameters, then the site's canonical posting URL when the adapter knows one. Null when the
 * input holds no usable web address.
 */
export function importUrlFrom(input: string): URL | null {
  const trimmed = input.trim();
  const candidate =
    /https?:\/\/[^\s<>"'`]+/i.exec(trimmed)?.[0] ??
    (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(trimmed) ? `https://${trimmed}` : null);
  if (candidate === null) return null;
  let url: URL;
  try {
    url = new URL(candidate.replace(/[),.;!?\]]+$/, ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  url.protocol = "https:";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  const canonical = siteFor(url)?.canonicalUrl?.(url) ?? null;
  return canonical === null ? url : new URL(canonical);
}
