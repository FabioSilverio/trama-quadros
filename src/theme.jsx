import React, { useEffect, useLayoutEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
const key = "trama-appearance";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const modes = {
  system: ["Sistema", Monitor],
  light: ["Claro", Sun],
  dark: ["Escuro", Moon],
};
function readMode() {
  try {
    const mode = localStorage.getItem(key);
    return Object.hasOwn(modes, mode) ? mode : "system";
  } catch {
    return "system";
  }
}
export function useAppearance() {
  const [mode, setMode] = useState(readMode),
    [systemDark, setSystemDark] = useState(media.matches);
  const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#19181e" : "#fbfbfd";
  }, [theme]);
  useEffect(() => {
    const sync = (e) => {
        if (e.key === key || e.key === null) setMode(readMode());
      },
      system = (e) => setSystemDark(e.matches);
    window.addEventListener("storage", sync);
    media.addEventListener("change", system);
    return () => {
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", system);
    };
  }, []);
  function change(value) {
    setMode(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private storage may be unavailable. */
    }
  }
  return { mode, theme, change };
}
export function ThemePicker({ appearance }) {
  const Icon = modes[appearance.mode][1];
  return (
    <label
      className="theme-picker"
      title={"Tema · " + modes[appearance.mode][0]}
    >
      <Icon size={16} />
      <select
        aria-label="Tema"
        value={appearance.mode}
        onChange={(e) => appearance.change(e.target.value)}
      >
        {Object.entries(modes).map(([value, [label]]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
