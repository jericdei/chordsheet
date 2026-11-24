"use client";

import { chordsForKey, isBassOnlyChord, isValidChord, type ChordOption } from "@chordsheet/music";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../ui";

export interface ChordPickerProps {
  musicKey: string;
  current?: string;
  /** Chords already used in the song that are outside the key's suggestions. */
  extraChords: string[];
  left: number;
  top: number;
  onPick: (chord: string) => void;
  onRemove?: () => void;
  /** Shift the chord one letter left (-1) or right (1). Only for existing chords. */
  onMove?: (direction: -1 | 1) => void;
  onClose: () => void;
}

function ChordButton({
  option,
  shortcut,
  active,
  onPick,
  large,
}: {
  option: Pick<ChordOption, "chord" | "numeral">;
  shortcut?: string;
  active?: boolean;
  onPick: (c: string) => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(option.chord)}
      title={option.numeral ? `${option.chord} (${option.numeral})` : option.chord}
      className={cn(
        "group relative flex flex-col items-center rounded-lg border px-1.5 transition-colors",
        large ? "py-1.5" : "py-1",
        active
          ? "border-orange-400 bg-orange-50 text-chord"
          : "border-slate-200 bg-surface text-slate-800 hover:border-orange-300 hover:bg-orange-50 hover:text-chord",
      )}
    >
      <span className={cn("font-bold leading-tight", large ? "text-base" : "text-sm")}>{option.chord}</span>
      {option.numeral && <span className="text-[10px] leading-tight text-slate-400">{option.numeral}</span>}
      {shortcut && (
        <span className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 place-items-center rounded-full bg-brand-600 text-[9px] font-bold text-white group-hover:grid">
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function ChordPicker({ musicKey, current, extraChords, left, top, onPick, onRemove, onMove, onClose }: ChordPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(current ?? "");
  const [error, setError] = useState(false);

  const options = useMemo(() => chordsForKey(musicKey), [musicKey]);
  const diatonic = options.filter((o) => o.group === "diatonic");
  const sevenths = options.filter((o) => o.group === "seventh");
  const common = options.filter((o) => o.group === "common");
  const known = new Set(options.map((o) => o.chord));
  const extras = extraChords.filter((c) => !known.has(c));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the click that opened the picker doesn't close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const submitCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (!isValidChord(value) && !isBassOnlyChord(value)) {
      setError(true);
      return;
    }
    onPick(value);
  };

  return (
    <div
      ref={ref}
      className="absolute z-30 w-[340px] rounded-xl bg-surface p-3 shadow-2xl ring-1 ring-slate-200"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (onMove && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          onMove(e.key === "ArrowLeft" ? -1 : 1);
        } else if (!custom && /^[1-7]$/.test(e.key)) {
          e.preventDefault();
          onPick(diatonic[Number(e.key) - 1]!.chord);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key of {musicKey}</span>
        <span className="text-[11px] text-slate-400">press 1–7</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {diatonic.map((o, i) => (
          <ChordButton key={o.chord} option={o} shortcut={String(i + 1)} active={o.chord === current} onPick={onPick} large />
        ))}
      </div>

      <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sevenths</div>
      <div className="grid grid-cols-7 gap-1">
        {sevenths.map((o) => (
          <ChordButton key={o.chord} option={{ chord: o.chord, numeral: "" }} active={o.chord === current} onPick={onPick} />
        ))}
      </div>

      <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Common</div>
      <div className="flex flex-wrap gap-1">
        {common.map((o) => (
          <ChordButton key={o.chord + o.numeral} option={o} active={o.chord === current} onPick={onPick} />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Used in this song</div>
          <div className="flex flex-wrap gap-1">
            {extras.map((c) => (
              <ChordButton key={c} option={{ chord: c, numeral: "" }} active={c === current} onPick={onPick} />
            ))}
          </div>
        </>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitCustom();
        }}
      >
        <input
          ref={inputRef}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setError(false);
          }}
          placeholder="Any chord: Gsus4, D/F#, or /G for a new bass"
          className={cn(
            "h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-sm font-semibold focus:outline-none focus:ring-2",
            error ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:border-orange-400 focus:ring-orange-200",
          )}
        />
        <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-500">
          {current ? "Update" : "Add"}
        </button>
        {onMove && (
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200" role="group" aria-label="Move chord">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onMove(dir)}
                title={dir < 0 ? "Move one letter left (Alt+←)" : "Move one letter right (Alt+→)"}
                className="grid h-9 w-8 place-items-center text-slate-600 hover:bg-slate-100"
              >
                {dir < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove chord"
            className="grid h-9 w-9 place-items-center rounded-lg text-red-600 ring-1 ring-red-200 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </form>
      {error && <p className="mt-1 text-xs text-red-600">That doesn&apos;t look like a chord.</p>}
    </div>
  );
}
