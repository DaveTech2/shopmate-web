import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
const current = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("sm_theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#fffaf6" : "#140b0a");
  window.dispatchEvent(new CustomEvent("sm-theme", { detail: t }));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>(current);
  useEffect(() => {
    const h = () => setT(current());
    window.addEventListener("sm-theme", h);
    return () => window.removeEventListener("sm-theme", h);
  }, []);
  return [t, applyTheme];
}

export function ThemeToggle() {
  const [t, set] = useTheme();
  const next = t === "light" ? "dark" : "light";
  return (
    <button className="iconbtn themebtn" onClick={() => set(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {t === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
