"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, readPreference, savePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "./ui";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setPref(readPreference());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readPreference() === "system" && applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <div className={cn("flex rounded-lg bg-slate-100 p-0.5", className)} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          title={`${label} theme`}
          onClick={() => {
            setPref(value);
            savePreference(value);
          }}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md transition-colors",
            pref === value ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
