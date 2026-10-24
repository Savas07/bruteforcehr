/**
 * Sender authentication for mail intelligence (docs/adr/0012-mail-sync.md "Linking"): the `From`
 * header is chosen by whoever sends the mail, so an ATS or company sender domain counts as strong
 * evidence only when the receiving provider vouches for it in `Authentication-Results` (RFC 8601).
 *
 * Only the topmost `Authentication-Results` header is read: the receiving provider (Gmail,
 * Microsoft, the IMAP host) adds it last, above anything the sender may have forged further down.
 */

/** `aligned("mail.acme.example", "acme.example")`: equal, or one is a subdomain of the other (relaxed alignment). */
function aligned(signingDomain: string, fromDomain: string): boolean {
  if (!signingDomain.includes(".") || !fromDomain.includes(".")) return false;
  return (
    signingDomain === fromDomain ||
    fromDomain.endsWith(`.${signingDomain}`) ||
    signingDomain.endsWith(`.${fromDomain}`)
  );
}

/** Removes RFC 5322 comments (`(sender IP is 1.2.3.4)`), nested ones included. */
function withoutComments(value: string): string {
  let text = value;
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/\([^()]*\)/gu, " ");
  }
  return text;
}

/**
 * Whether the provider's `Authentication-Results` value (the topmost header, unfolded or not)
 * shows that the `From` domain sent the message: `dmarc=pass` for that domain, or `dkim=pass`
 * with a signing domain (`header.d`, or the domain of `header.i`) aligned with it. Anything else,
 * including a missing header, is unauthenticated.
 */
export function senderAuthenticated(authenticationResults: string | null, fromAddress: string): boolean {
  if (authenticationResults === null) return false;
  const fromDomain = fromAddress
    .slice(fromAddress.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/u, "");
  if (fromDomain === "" || !fromAddress.includes("@")) return false;
  // The first element is the authserv-id; each further one is `method=result` with properties.
  const [, ...results] = withoutComments(authenticationResults.replace(/\r?\n[ \t]+/gu, " ")).split(";");
  for (const result of results) {
    const head = /^\s*([a-z0-9-]+)\s*=\s*([a-z0-9-]+)/iu.exec(result);
    if (head?.[1] === undefined || head[2]?.toLowerCase() !== "pass") continue;
    const method = head[1].toLowerCase();
    const properties = new Map<string, string>();
    for (const match of result.matchAll(/([a-z0-9-]+\.[a-z0-9-]+)\s*=\s*"?([^\s";]+)"?/giu)) {
      const [, key, value] = match;
      if (key !== undefined && value !== undefined) properties.set(key.toLowerCase(), value.toLowerCase());
    }
    if (method === "dmarc") {
      const headerFrom = properties.get("header.from");
      if (headerFrom === undefined || headerFrom.replace(/\.$/u, "") === fromDomain) return true;
    }
    if (method === "dkim") {
      const identity = properties.get("header.i");
      const signingDomain =
        properties.get("header.d") ??
        (identity === undefined ? undefined : identity.slice(identity.lastIndexOf("@") + 1));
      if (signingDomain !== undefined && aligned(signingDomain.replace(/\.$/u, ""), fromDomain)) return true;
    }
  }
  return false;
}
