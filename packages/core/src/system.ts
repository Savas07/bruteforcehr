import { z } from "zod";
import { IdSchema, LanguageTagSchema, SemverSchema, TimestampSchema, UrlSchema } from "./common";
import { PlatformSchema } from "./enums";

/** `users/{uid}/devices/{id}` — one per installed client, for push. */
export const DeviceSchema = z.object({
  id: IdSchema,
  platform: PlatformSchema,
  /** APNs/FCM token; null until the user allows notifications. */
  pushToken: z.string().min(1).max(4_096).nullable(),
  appVersion: SemverSchema,
  osVersion: z.string().min(1).max(60),
  locale: LanguageTagSchema,
  lastSeenAt: TimestampSchema,
  createdAt: TimestampSchema,
});
export type Device = z.infer<typeof DeviceSchema>;

/** `appConfig/{platform}` — public read, server write. `id` is the platform. */
export const AppConfigSchema = z.object({
  id: PlatformSchema,
  latestVersion: SemverSchema,
  /** Clients below this version are blocked with an update prompt (expand→contract gate). */
  minSupportedVersion: SemverSchema,
  downloadUrl: UrlSchema.nullable(),
  releaseNotesUrl: UrlSchema.nullable(),
  featureFlags: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.boolean()),
  updatedAt: TimestampSchema,
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
