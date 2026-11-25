"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { THEME_KEY, nextTheme, parseTheme, resolveTheme, systemDarkQuery, type Theme } from "@/lib/theme";

const EVENT = "orrery-theme";
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
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

/** Cycles system → light → dark. Remembered in this browser only; "system" follows the OS, live. */
export function ThemeToggle() {
  const t = useTranslations("Shell");
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const Icon = ICONS[theme];
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={t("themeSwitch", { theme: t(`theme.${theme}`) })}
      onClick={() => {
        try {
          localStorage.setItem(THEME_KEY, nextTheme(theme));
        } catch {
          // Blocked storage: the choice only lasts until the page is left.
        }
        apply(nextTheme(theme));
        window.dispatchEvent(new Event(EVENT));
      }}
    >
      <Icon aria-hidden />
      {t(`theme.${theme}`)}
    </Button>
  );
}
