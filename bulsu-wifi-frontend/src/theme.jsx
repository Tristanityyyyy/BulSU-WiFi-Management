import { createContext, useContext, useEffect, useState } from "react";

// Theme is a per-device preference (localStorage), scoped to the admin area:
// the provider mounts only around /admin routes, so the portal pages
// (login, guest verify, session dashboard) always keep their branded light look.
// index.html has a matching inline script that pre-applies .dark before first
// paint on /admin paths to avoid a white flash.

const STORAGE_KEY = "theme";
const ThemeContext = createContext(null);

const getStoredTheme = () => {
  const t = localStorage.getItem(STORAGE_KEY);
  return t === "light" || t === "dark" || t === "system" ? t : "system";
};

const systemPrefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
      root.classList.toggle("dark", dark);
    };
    apply();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (theme === "system") mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // Leaving the admin area (provider unmounts) must never leak dark styles
  // into the portal, since shared ui components carry dark: variants.
  useEffect(() => () => document.documentElement.classList.remove("dark"), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// For non-reactive reads (e.g. deciding chart colors at render time).
export const isDarkActive = () => document.documentElement.classList.contains("dark");
