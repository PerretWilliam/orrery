"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEMES, THEME_KEY, parseTheme, resolveTheme, systemDarkQuery, type Theme } from "@/lib/theme";

const EVENT = "orrery-theme";
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Stands in for blocked storage: the choice then only lasts until the page is left. */
let unsaved: Theme = "system";

function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return unsaved;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(theme, systemDarkQuery().matches) === "dark");
}

function subscribe(onChange: () => void) {
  const media = systemDarkQuery();
  const follow = () => {
    apply(read());
    onChange();
  };
  window.addEventListener(EVENT, follow);
  window.addEventListener("storage", follow);
  media.addEventListener("change", follow);
  return () => {
    window.removeEventListener(EVENT, follow);
    window.removeEventListener("storage", follow);
    media.removeEventListener("change", follow);
  };
}

function choose(theme: Theme) {
  unsaved = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Blocked storage: `unsaved` holds the choice.
  }
  apply(theme);
  window.dispatchEvent(new Event(EVENT));
}

const useTheme = () => useSyncExternalStore(subscribe, read, () => "system" as Theme);

/** Mounted on every page: applies changes made in another tab, and follows the OS live while on "system". */
export function ThemeSync() {
  useTheme();
  return null;
}

/** System, light or dark. Remembered in this browser only. */
export function ThemeChoice() {
  const t = useTranslations("Shell");
  const theme = useTheme();
  return (
    // Pressing the selected item asks for an empty selection: ignored, a theme is always chosen.
    <ToggleGroup variant="outline" aria-label={t("themeLabel")} value={[theme]} onValueChange={([next]) => (next ? choose(parseTheme(next)) : undefined)}>
      {THEMES.map((candidate) => {
        const Icon = ICONS[candidate];
        return (
          <ToggleGroupItem key={candidate} value={candidate} className="aria-pressed:bg-secondary aria-pressed:text-secondary-foreground">
            <Icon aria-hidden data-icon="inline-start" />
            {t(`theme.${candidate}`)}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
