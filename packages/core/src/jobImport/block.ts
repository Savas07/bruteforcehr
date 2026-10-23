/**
 * Recognizes pages that are not the posting but a wall in front of it: login walls, bot
 * challenges, CAPTCHAs and WAF denials. The import stops there and offers "paste the description"
 * instead (ADR 0005: no login bypass, no CAPTCHA solving, no evasion).
 */
export type PageBlock = "login_wall" | "bot_challenge" | "forbidden";

/** Markers only challenge/denial pages carry (Cloudflare, Vercel, Akamai, PerimeterX, DataDome, Indeed, Glassdoor). */
const CHALLENGE_MARKERS: readonly RegExp[] = [
  /<title>\s*Just a moment\.\.\.\s*<\/title>/i,
  /challenges\.cloudflare\.com|cf-browser-verification|cf_chl_opt|\/cdn-cgi\/challenge-platform/i,
  /<title>\s*Vercel Security Checkpoint\s*<\/title>/i,
  /<title>\s*Access Denied\s*<\/title>[\s\S]*errors\.edgesuite\.net/i,
  /px-captcha|perimeterx/i,
  /captcha-delivery\.com|datadome/i,
  /from=bot-detection|<title>\s*Authenticating\.\.\.\s*<\/title>/i,
  /<title>\s*Security \| Glassdoor\s*<\/title>/i,
  /<title>\s*(Attention Required|Pardon Our Interruption|Are you a robot\??|Robot Check)\b/i,
];

/** CAPTCHA widgets: a block only when the page has little else (apply forms embed reCAPTCHA too). */
const CAPTCHA_WIDGET = /g-recaptcha|h-captcha|hcaptcha\.com|recaptcha\/api\.js|turnstile/i;

/** Login walls reached by redirect (LinkedIn authwall, generic sign-in pages). */
const LOGIN_PATH = /\/(authwall|login|signin|sign-in|sign_in|uas\/login|account\/login|checkpoint|auth\/login)(\/|$|\?)/i;

export function detectBlock(page: { status: number; url: string; html: string; visibleTextLength: number }): PageBlock | null {
  let path = "";
  try {
    const url = new URL(page.url);
    path = `${url.pathname}${url.search}`;
  } catch {
    // An unparsable final URL can't be a login redirect.
  }
  if (LOGIN_PATH.test(path)) return "login_wall";
  const head = page.html.slice(0, 200_000);
  if (CHALLENGE_MARKERS.some((marker) => marker.test(head))) return "bot_challenge";
  if (page.status === 401) return "login_wall";
  if (page.status === 403) return "forbidden";
  if (CAPTCHA_WIDGET.test(head) && page.visibleTextLength < 600) return "bot_challenge";
  return null;
}
