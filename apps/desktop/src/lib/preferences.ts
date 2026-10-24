/**
 * Preferences of this computer (Settings › General and Notifications), kept in localStorage:
 * the UI language ("system" follows the OS), the appearance ("system" follows the OS) and whether
 * mail notifications show on this computer. The language is also written to `Profile.uiLanguage`
 * so pushes to the phone use it (src/features/settings/GeneralPane.tsx); the rest is per device.
 */
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";
import { type AppLocale, resolveAppLocale, type UiLanguage } from "../i18n/locale";

export type LanguagePreference = "system" | UiLanguage;
export type AppearancePreference = "system" | "light" | "dark";

export interface DevicePreferences {
  readonly language: LanguagePreference;
  readonly appearance: AppearancePreference;
  /** OS notifications for new job emails while the app runs (off until the user turns it on). */
  readonly mailNotifications: boolean;
}

const STORAGE_KEY = "bfhr.preferences.v1";
const DEFAULTS: DevicePreferences = { language: "system", appearance: "system", mailNotifications: false };

function read(): DevicePreferences {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof DevicePreferences, unknown>>;
    return {
      language:
        parsed.language === "en" || parsed.language === "tr" || parsed.language === "de"
          ? parsed.language
          : "system",
      appearance:
        parsed.appearance === "light" || parsed.appearance === "dark" ? parsed.appearance : "system",
      mailNotifications: parsed.mailNotifications === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let state = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function devicePreferences(): DevicePreferences {
  return state;
}

export function setDevicePreferences(patch: Partial<DevicePreferences>): void {
  state = { ...state, ...patch };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the choice holds for this session.
  }
  if (patch.appearance !== undefined) applyAppearance(state.appearance);
  for (const listener of listeners) listener();
}

export function useDevicePreferences(): DevicePreferences {
  return useSyncExternalStore(subscribe, () => state);
}

/** The UI language: the device choice, else the OS locale (English fallback). */
export function appLocaleFor(
  language: LanguagePreference,
  osTags: readonly (string | null | undefined)[],
): AppLocale {
  if (language === "system") return resolveAppLocale(osTags);
  // Keep the OS region when it speaks the chosen language ("de-AT"), else the language's default.
  const os = resolveAppLocale(osTags);
  return os.language === language ? os : resolveAppLocale([language]);
}

/**
 * Light / dark through `data-theme` (app.css), "system" removes it; the native window chrome
 * (title bar, vibrancy) follows through the window theme.
 */
export function applyAppearance(appearance: AppearancePreference): void {
  const root = document.documentElement;
  if (appearance === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = appearance;
  if (isTauri())
    void getCurrentWindow()
      .setTheme(appearance === "system" ? null : appearance)
      .catch(() => undefined);
}
