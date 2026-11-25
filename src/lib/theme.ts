/** Light, dark, or whatever the system prefers. The choice lives in this browser only. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = "orrery-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A stored value read back as a theme; anything unexpected is "system". */
export const parseTheme = (value: unknown): Theme => (THEMES.find((theme) => theme === value) ?? "system");

export const resolveTheme = (theme: Theme, systemPrefersDark: boolean): "light" | "dark" => (theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme);

/** Next theme in the toggle's cycle. */
export const nextTheme = (theme: Theme): Theme => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

/**
 * Runs in `<head>` before the first paint, so a dark page never flashes white. It only reads the stored choice and
 * toggles the `dark` class: it never throws (private mode, blocked storage) and sends nothing anywhere.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export const systemDarkQuery = () => matchMedia(DARK_QUERY);
