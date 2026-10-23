import type { SecretParam } from "firebase-functions/params";

/**
 * Value of a secret that is created before the owner has the real value (job API keys, OAuth
 * clients). `defineSecret` needs the secret to exist at deploy time, so it is created with this
 * sentinel; the feature stays off until `firebase functions:secrets:set NAME` + a redeploy.
 */
export const UNSET_SECRET = "unset";

/** The secret's value, or null while it is empty or still the `unset` sentinel. */
export function secretOrNull(secret: SecretParam): string | null {
  const value = secret.value().trim();
  return value === "" || value === UNSET_SECRET ? null : value;
}
