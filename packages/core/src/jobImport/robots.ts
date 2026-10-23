/**
 * robots.txt evaluation (RFC 9309): the group for our product token, else `*`; the longest
 * matching rule wins, `allow` on ties; `*` and `$` wildcards. For user-shared pages the verdict is
 * recorded, not binding (ADR 0005).
 */
export type RobotsVerdict = "allowed" | "disallowed";

interface Rule {
  allow: boolean;
  pattern: string;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

export function robotsVerdict(robotsTxt: string, productToken: string, pathWithQuery: string): RobotsVerdict {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (current === null || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current === null || (field !== "allow" && field !== "disallow")) continue;
    // An empty Disallow allows everything; it adds no rule.
    if (value !== "") current.rules.push({ allow: field === "allow", pattern: value });
  }
  const token = productToken.toLowerCase();
  const own = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && token.startsWith(agent)),
  );
  const chosen = own.length > 0 ? own : groups.filter((group) => group.agents.includes("*"));
  let best: Rule | null = null;
  for (const rule of chosen.flatMap((group) => group.rules)) {
    if (!matches(rule.pattern, pathWithQuery)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best === null || best.allow ? "allowed" : "disallowed";
}
