// Push notifications (docs/runbooks/notifications.md). Everything here is JSON so a deferred push
// travels through Cloud Tasks unchanged and is localized only when it is delivered.
import type { ApplicationStatus } from "@bfhr/core";

/** What a push is about; picks the copy and the preference toggle. */
export type PushContent =
  | {
      readonly kind: "interview" | "offer" | "assessment";
      readonly company: string | null;
      readonly role: string | null;
    }
  /** A rejection; `updated` when the application was moved to Not selected automatically. */
  | { readonly kind: "decision"; readonly company: string | null; readonly updated: boolean }
  /** Any other automatic status change from an email. */
  | { readonly kind: "status_update"; readonly company: string | null; readonly status: ApplicationStatus }
  /** Digest of new saved-search matches; `jobs` are the best few, `count` all of them. */
  | {
      readonly kind: "job_alerts";
      readonly count: number;
      readonly searchName: string | null;
      readonly jobs: readonly { readonly title: string; readonly company: string }[];
    };

export type PushKind = PushContent["kind"];

export interface PushNotification {
  readonly content: PushContent;
  /** Exactly one `bruteforcehr://` deep link (docs/design/IA.md § Deep links). */
  readonly link: string;
  /** APNs `thread-id`: groups pushes of one application (or all job alerts) in Notification Center. */
  readonly threadId: string;
  /** APNs `apns-collapse-id` (≤ 64 bytes): a retried trigger replaces instead of duplicating. */
  readonly collapseId: string;
}
