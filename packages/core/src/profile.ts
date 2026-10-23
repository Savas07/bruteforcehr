import { z } from "zod";
import {
  CountryCodeSchema,
  EmailSchema,
  IdSchema,
  LanguageTagSchema,
  LinkSchema,
  MoneySchema,
  TimeZoneSchema,
  TimestampSchema,
} from "./common";
import { RemoteTypeSchema, SenioritySchema, UiLanguageSchema } from "./enums";

export const TargetLocationSchema = z.object({
  /** Display label, e.g. "Istanbul", "Berlin", "Netherlands", "US (remote)". */
  label: z.string().min(1).max(120),
  city: z.string().min(1).nullable(),
  countryCode: CountryCodeSchema.nullable(),
  /** Willing to relocate here (vs. already living there). */
  relocation: z.boolean(),
});
export type TargetLocation = z.infer<typeof TargetLocationSchema>;

export const WorkAuthorizationStatusSchema = z.enum([
  "citizen",
  "permanent_resident",
  "work_permit",
  "needs_sponsorship",
]);
export type WorkAuthorizationStatus = z.infer<typeof WorkAuthorizationStatusSchema>;

export const WorkAuthorizationSchema = z.object({
  /** Country code, or `EU` for the EU/EEA blue-card area. */
  region: z.union([CountryCodeSchema, z.literal("EU")]),
  status: WorkAuthorizationStatusSchema,
});
export type WorkAuthorization = z.infer<typeof WorkAuthorizationSchema>;

export const LanguageLevelSchema = z.enum(["native", "C2", "C1", "B2", "B1", "A2", "A1"]);
export type LanguageLevel = z.infer<typeof LanguageLevelSchema>;

export const SpokenLanguageSchema = z.object({
  language: LanguageTagSchema,
  level: LanguageLevelSchema,
});
export type SpokenLanguage = z.infer<typeof SpokenLanguageSchema>;

export const SalaryPeriodSchema = z.enum(["year", "month", "day", "hour"]);
export type SalaryPeriod = z.infer<typeof SalaryPeriodSchema>;

export const SalaryFloorSchema = MoneySchema.extend({ period: SalaryPeriodSchema });
export type SalaryFloor = z.infer<typeof SalaryFloorSchema>;

const ClockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const ProfileSettingsSchema = z.object({
  /** §4.6: suggest Ghosted after this many silent days. */
  ghostedAfterDays: z.int().min(1).max(365),
  /** §4.6: suggest a follow-up this many days after Applied with no response. */
  followUpAfterDays: z.int().min(1).max(90),
  /** §8: keep job-mail bodies this many days after the application closes. */
  mailBodyRetentionDays: z.int().min(0).max(3650),
  /** §4.7: transitions apply automatically at or above this confidence (with a strong link). */
  autoApplyConfidence: z.number().min(0.5).max(1),
  /** §4.9: "Allow sending email text to AI". */
  aiMailTextAllowed: z.boolean(),
  /** §4.4: daily cap for emails sent through the Apply flow. */
  dailySendCap: z.int().min(0).max(200),
  quietHours: z.object({ start: ClockTimeSchema, end: ClockTimeSchema }).nullable(),
  /** Notify about rejections (gentle copy; can be muted). */
  notifyRejections: z.boolean(),
});
export type ProfileSettings = z.infer<typeof ProfileSettingsSchema>;

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  ghostedAfterDays: 21,
  followUpAfterDays: 7,
  mailBodyRetentionDays: 180,
  autoApplyConfidence: 0.9,
  aiMailTextAllowed: false,
  dailySendCap: 20,
  quietHours: null,
  notifyRejections: true,
};

/** `users/{uid}`; `id` is the uid. */
export const ProfileSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1).max(200),
  email: EmailSchema,
  phone: z.string().min(3).max(40).nullable(),
  headline: z.string().max(200).nullable(),
  links: z.array(LinkSchema).max(20),
  targetRoles: z.array(z.string().min(1).max(120)).max(20),
  seniority: SenioritySchema.nullable(),
  locations: z.array(TargetLocationSchema).max(30),
  /** Accepted workplace types, most preferred first. Empty = no preference. */
  remotePreferences: z.array(RemoteTypeSchema).max(3),
  salaryFloor: SalaryFloorSchema.nullable(),
  workAuthorization: z.array(WorkAuthorizationSchema).max(30),
  languages: z.array(SpokenLanguageSchema).max(20),
  timezone: TimeZoneSchema,
  uiLanguage: UiLanguageSchema,
  /** Companies hidden from the feed (company-level hide from job actions). */
  hiddenCompanies: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        domain: z
          .string()
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
          .nullable(),
        hiddenAt: TimestampSchema,
      }),
    )
    .max(500),
  /** Skills used for matching (normalized, lower-case). */
  skills: z.array(z.string().min(1).max(60)).max(200),
  defaultCvId: IdSchema.nullable(),
  onboardingCompletedAt: TimestampSchema.nullable(),
  /**
   * §2.4/§4.5: AI features (CV import structuring, CV assists). `cvImport`/`cvAssist` refuse when
   * this is `false`; a profile without the field counts as enabled (`DEFAULT_AI_ENABLED`). Sending
   * email text to AI is the separate `settings.aiMailTextAllowed` toggle (M5).
   */
  aiEnabled: z.boolean(),
  settings: ProfileSettingsSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Value of `Profile.aiEnabled` for new profiles and for documents written before the field existed. */
export const DEFAULT_AI_ENABLED = true;
