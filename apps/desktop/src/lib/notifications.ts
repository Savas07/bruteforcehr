/**
 * OS notifications through `tauri-plugin-notification` (Notification Center on macOS, toasts on
 * Windows). The main window's capability grants only the permission check, the permission request
 * and `notify`. Design builds in a plain browser have no shell: notifications are then unsupported.
 */
import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export type NotificationPermission = "granted" | "denied" | "default" | "unsupported";

const supported = () => isTauri();

/** Whether the OS lets the app notify, without asking. */
export async function notificationPermission(): Promise<NotificationPermission> {
  if (!supported()) return "unsupported";
  return (await isPermissionGranted()) ? "granted" : "default";
}

/** Asks the OS once (it remembers the answer); resolves to the outcome. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!supported()) return "unsupported";
  if (await isPermissionGranted()) return "granted";
  const answer = await requestPermission();
  return answer === "granted" ? "granted" : answer === "denied" ? "denied" : "default";
}

/** Shows a notification now (no-op without permission or shell). */
export async function notify(title: string, body: string): Promise<void> {
  if (!supported() || !(await isPermissionGranted())) return;
  sendNotification({ title, body });
}
