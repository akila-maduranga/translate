"use client";

/**
 * Persisted user settings (API keys, default options).
 * Stored in localStorage so the user doesn't have to re-enter keys
 * on every page load. Keys are also accepted via server env vars
 * for Netlify deployments — the UI never overrides those.
 */

const STORAGE_KEY = "subtrans-settings-v1";

export interface UserSettings {
  tmdbApiKey: string;
  deepseekApiKey: string;
  batchSize: number;
  rollingContext: number;
  translationStyle: "natural" | "literal" | "formal";
}

export const DEFAULT_SETTINGS: UserSettings = {
  tmdbApiKey: "",
  deepseekApiKey: "",
  batchSize: 8,
  rollingContext: 4,
  translationStyle: "natural",
};

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
