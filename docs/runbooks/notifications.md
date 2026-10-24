# Runbook — Push notifications (FCM → APNs)

Code: `apps/functions/src/notifications/`. Functions (codebase `default`, europe-west1): `pushMailMessage` (Firestore trigger, `users/{uid}/mailMessages/{id}` created), `pushJobAlert` (Firestore trigger, `serverOnly/jobAlerts/users/{uid}/jobAlertItems/{jobId}` created), `pushJobAlertDigest` and `pushDeliver` (task queues). Data model: [ADR 0002](../adr/0002-data-model.md) (`devices`, `settings.notifications`).

## What notifies

| Push                 | When                                                                                               | Toggle                               | Deep link (`data.link`)                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Interview invite     | mail stored with category `interview_invite`                                                       | `settings.notifications.interviews`  | `mail/review/{messageId}` while pending review; `applications/{id}/events/{eventId}` if applied automatically; else `applications/{id}` |
| Offer                | category `offer`                                                                                   | `settings.notifications.offers`      | same                                                                                                                                    |
| Assessment           | category `assessment`                                                                              | `settings.notifications.assessments` | same                                                                                                                                    |
| Decision             | category `rejection` (calm "Decision" copy, never "rejected")                                      | `settings.notifyRejections`          | same                                                                                                                                    |
| Application updated  | any other category whose status change was applied automatically (`reviewState` `auto_applied`)    | `settings.notifications.autoApplied` | `applications/{id}/events/{eventId}` (timeline row with Undo)                                                                           |
| New matches (digest) | saved-search alerts: one digest ~2 min after a run, or 09:00 local for searches with `dailyDigest` | `settings.notifications.jobAlerts`   | one job: `jobs/{jobId}`; one search: `jobs/searches/{id}`; several searches: `today`                                                    |

- Mail received more than 2 days before it was stored never notifies (lookback scans, a new account's first sync).
- `settings.notifications` null or missing = every category on. Copy is localized from `users/{uid}.uiLanguage` (EN, TR with "siz", DE with "du"), wording from the app catalogs.
- **Quiet hours** (`settings.quietHours` in `Profile.timezone`; `start` > `end` spans midnight): the push is deferred to their end through a `pushDeliver` task, which checks the toggles and quiet hours again. Muted kinds are dropped, not deferred.
- **Job alerts:** each `jobAlertItems` doc schedules a `pushJobAlertDigest` task (id per user and 2-minute window, or per user and local day for daily digests). The task sends one digest for all pending items of its mode and sets `notifiedAt` on them, also when the push was muted or deferred (each alert is handled once). Item shape (written by the jobs runner): `{ jobId, savedSearchId, score, dailyDigest, createdAt, notifiedAt: null, expireAt }`.
- **Payload:** `notification` {title, body}; `data` {`link`, `kind`}; `apns.headers` `apns-push-type: alert`, `apns-collapse-id` (hash of the message id or the job set, so a retried trigger replaces instead of duplicating); `aps` {alert, `sound: default`, `thread-id`: `application-{id}`, `mail` or `job-alerts`}.
- **Tokens:** sent with `sendEachForMulticast` to every distinct `devices/*.pushToken`. FCM `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` → that device's `pushToken` is set to null (only if it still holds that token).

## Client contract (iOS; owned by the iOS agents)

1. Ask for permission in context only (decisions.md D25): first saved-search alert turned on, or after the first successful mail import.
2. Add the `FirebaseMessaging` product of firebase-ios-sdk, the **Push Notifications** capability (`aps-environment` entitlement) and call `UIApplication.shared.registerForRemoteNotifications()`. Set `Messaging.messaging().apnsToken` from `didRegisterForRemoteNotificationsWithDeviceToken`.
3. Write the **FCM registration token** (`Messaging.messaging().token()` / `messaging(_:didReceiveRegistrationToken:)`, not the raw APNs token) to `users/{uid}/devices/{deviceId}` (`Device`: platform `ios`, pushToken, appVersion, osVersion, locale, lastSeenAt, createdAt). Use a stable per-install id (e.g. `identifierForVendor`); create with `set`, refresh with field updates of `pushToken` and `lastSeenAt` on every launch and token refresh. On sign-out delete the device doc (or set `pushToken` to null).
4. On tap, open `userInfo["link"]` through the same `onOpenURL` router as other `bruteforcehr://` links. Notification actions are "Open" only.
5. Settings › Notifications writes `settings.notifications` (whole object) and `settings.notifyRejections`; quiet hours write `settings.quietHours`.

Desktop (Tauri) registers no FCM token: its devices keep `pushToken` null. Instead, while the app runs and Settings › Notifications › "Show notifications on this computer" is on (per device, off by default), `MailNotificationsHost` (apps/desktop/src/features/settings/) shows an OS notification for each new job email that arrives through the `mailMessages` listener, decided by the same categories, `notifyRejections`, quiet hours (profile zone) and the 2-day age limit as the pushes (`mailNotificationDecision`). During quiet hours nothing pops up (no deferral on desktop); saved-search alerts aren't shown on desktop (their items live under `serverOnly`).

## Owner steps (APNs key; not automatable)

FCM delivers to iOS only with an APNs authentication key uploaded to the Firebase project. Until then `sendEachForMulticast` fails per token (logged as `failed` in `push_sent`), nothing else breaks.

1. Apple Developer → Certificates, Identifiers & Profiles → **Identifiers** → `com.savas07.bruteforcehr` → enable **Push Notifications** → Save.
2. **Keys** → **+** → name `BruteForceHR APNs`, enable **Apple Push Notifications service (APNs)** → Continue → Register → **Download** the `.p8` (only downloadable once). Note the **Key ID** and your **Team ID** (top right / Membership).
3. Firebase console → project `bruteforcehr` → Project settings → **General**: the iOS app `com.savas07.bruteforcehr` must be registered (done: `1:33654863934:ios:509e9f24c37d8dab7c796f`).
4. Project settings → **Cloud Messaging** → Apple app configuration → `com.savas07.bruteforcehr` → **APNs Authentication Key** → Upload the `.p8` with Key ID and Team ID. One key serves both development and production builds.
5. The FCM v1 API must be on: `gcloud services enable fcm.googleapis.com --project bruteforcehr` (done 2026-10-24).
6. Store the `.p8` in the password manager; never commit it.

The Firebase Cloud Messaging API uses the functions' default service account; no extra secret or IAM role is needed. Enqueueing `pushDeliver` / `pushJobAlertDigest` uses the same Cloud Tasks permissions as `mailSyncTask`.

## Operations

- **Logs** (PII-free): `push_sent` (kind, delivered, failed, removed), `push_deferred` (kind, at), `push_job_alert_digest` (mode, items). `gcloud functions logs read pushMailMessage --region europe-west1 --project bruteforcehr`.
- **Test a device:** with a token from the app, `getMessaging().send({ token, notification: { title: "Test" } })` from a Node shell with application-default credentials; `messaging/third-party-auth-error` means the APNs key is missing or for another team/bundle.
- **Nothing arrives:** check `users/{uid}/devices/*.pushToken` (null = never registered or cleared as unregistered), `settings.notifications` / `notifyRejections`, quiet hours, and the `push_*` logs.
