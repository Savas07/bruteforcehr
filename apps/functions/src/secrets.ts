import { defineSecret } from "firebase-functions/params";

/**
 * Value of a secret that exists but is not configured yet. `defineSecret` needs the secret at
 * deploy time, so optional integrations are created with this one version; the feature reports
 * "not configured" until the owner sets a real value and redeploys (docs/runbooks/jobs.md).
 */
export const UNSET_SECRET = "unset";

/** The secret's value, or null while it is empty or still `UNSET_SECRET`. */
export function secretOrNull(secret: { value(): string }): string | null {
  const value = secret.value().trim();
  return value === "" || value === UNSET_SECRET ? null : value;
}

/**
 * Keys of the keyed job sources (docs/integrations/*.md). Names must match the connectors'
 * `secrets` (`CONNECTOR_SECRET_NAMES` in @bfhr/jobs-connectors; a unit test keeps them in sync).
 */
export const JOB_SOURCE_SECRETS = [
  defineSecret("ADZUNA_APP_ID"),
  defineSecret("ADZUNA_APP_KEY"),
  defineSecret("JOOBLE_API_KEYS"),
  defineSecret("USAJOBS_API_KEY"),
  defineSecret("USAJOBS_USER_AGENT"),
  defineSecret("REED_API_KEY"),
] as const;

/** Configured job-source secrets by name (null = not configured → the source is skipped with `no_key`). */
export function jobSourceSecrets(): Record<string, string | null> {
  return Object.fromEntries(JOB_SOURCE_SECRETS.map((secret) => [secret.name, secretOrNull(secret)]));
}
