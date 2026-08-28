"use client";
import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<string>("system");
  useEffect(() => { setTheme(localStorage.getItem("gonebia-theme") ?? "system"); }, []);
  const apply = (t: string) => {
    localStorage.setItem("gonebia-theme", t);
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    setTheme(t);
  };
  return { theme, apply };
}

export function ThemeToggle() {
  const { theme, apply } = useTheme();
  return (
    <button onClick={() => apply(theme === "dark" ? "light" : "dark")} className="btn-ghost !px-2.5" aria-label="Toggle theme">
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
