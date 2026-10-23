/** One robots.txt group: the agents it names and its allow/disallow rules. */
interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

/** Parses robots.txt (RFC 9309): groups of user-agent lines followed by allow/disallow lines. */
export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (current === null || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current !== null) {
      // An empty Disallow allows everything; it adds no rule.
      if (value !== "") current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return { groups };
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

/**
 * Whether `agent` may fetch `path`: the most specific group naming the agent (else `*`), then the
 * longest matching rule wins; on a tie, allow wins (RFC 9309 §2.2.2).
 */
export function isAllowedByRobots(rules: RobotsRules, agent: string, path: string): boolean {
  const name = agent.toLowerCase();
  const own = rules.groups.filter((group) => group.agents.some((value) => value !== "*" && name.includes(value)));
  const groups = own.length > 0 ? own : rules.groups.filter((group) => group.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!patternMatches(rule.pattern, path)) continue;
      const length = rule.pattern.length;
      if (best === null || length > best.length || (length === best.length && rule.allow)) {
        best = { allow: rule.allow, length };
      }
    }
  }
  return best?.allow ?? true;
}
