import { z } from "zod";

/**
 * Firestore document id. Doc ids are the entity ids; they never contain `/`,
 * are not `.`/`..`, and do not use the reserved `__name__` form.
 */
export const IdSchema = z
  .string()
  .min(1)
  .max(1500)
  .regex(/^(?!\.\.?$)(?!__.*__$)[^/]+$/, "Invalid document id");

/** Domain timestamps are always `Date`; @bfhr/api converts them to Firestore timestamps. */
export const TimestampSchema = z.date();

export const UrlSchema = z.url({ protocol: /^https?$/ });
export const EmailSchema = z.email();

/** ISO 3166-1 alpha-2, upper case (`TR`, `DE`, `GB`, `US`). */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "Expected ISO 3166-1 alpha-2 code");

/** ISO 4217 currency code (`TRY`, `EUR`, `GBP`, `USD`). */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "Expected ISO 4217 currency code");

/** BCP 47 language tag limited to language + optional region (`en`, `de`, `tr`, `en-GB`). */
export const LanguageTagSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "Expected BCP 47 language tag");

/** IANA time zone name (`Europe/Istanbul`, `America/New_York`, `UTC`). */
export const TimeZoneSchema = z
  .string()
  .regex(/^(?:UTC|[A-Z][A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/, "Expected IANA time zone name");

/** Semantic version without build metadata (`1.4.0`, `1.5.0-beta.2`). */
export const SemverSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/, "Expected semantic version");

/** Lowercase hex SHA-256 digest. */
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected hex SHA-256 digest");

/** Probability-like confidence in [0, 1]. */
export const ConfidenceSchema = z.number().min(0).max(1);

export const LinkSchema = z.object({
  label: z.string().min(1).max(80),
  url: UrlSchema,
});
export type Link = z.infer<typeof LinkSchema>;

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;
