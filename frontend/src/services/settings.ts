import { Capacitor } from "@capacitor/core";

export type EngineMode = "on-device" | "remote";

export interface AppSettings {
  engineMode: EngineMode;
  /** Empty string means "same origin" (the Vite dev proxy or hosted web app). */
  remoteServerUrl: string;
}

const STORAGE_KEY = "bowlmetrics.settings.v1";

export function isMobileRuntime(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function defaultSettings(): AppSettings {
  return {
    // Phones default to fully offline analysis; desktop keeps the existing
    // FastAPI workflow unless the user opts into on-device mode.
    engineMode: isMobileRuntime() ? "on-device" : "remote",
    remoteServerUrl: "",
  };
}

export function loadSettings(): AppSettings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      engineMode:
        parsed.engineMode === "remote" || parsed.engineMode === "on-device"
          ? parsed.engineMode
          : defaults.engineMode,
      remoteServerUrl:
        typeof parsed.remoteServerUrl === "string"
          ? parsed.remoteServerUrl
          : defaults.remoteServerUrl,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private WebViews; settings still apply
    // for the current session.
  }
}
