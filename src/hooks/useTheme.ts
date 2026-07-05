import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "donuscheduler.theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "dark";
}

function resolveTheme(mode: ThemeMode) {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveTheme(mode);
  document.documentElement.dataset.themeMode = mode;
}

export function initializeTheme() {
  if (typeof window === "undefined") return;
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyTheme(themeMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);

    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [themeMode]);

  return { themeMode, setThemeMode: setThemeModeState };
}
