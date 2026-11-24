"use client";

import type { ExportSetlist, ExportSong } from "@chordsheet/api";
import { stripChords } from "@chordsheet/music";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { songExtensions } from "@/components/editor/extensions";
import { SHEET_FONT_SIZE, type PrintOptions } from "@/lib/print-options";

/** Read-only song body rendered with exactly the editor's extensions and CSS. */
function SongBody({ song, chords }: { song: ExportSong; chords: boolean }) {
  const content = useMemo(() => (chords ? song.content : stripChords(song.content)), [song.content, chords]);
  const editor = useEditor({ immediatelyRender: false, editable: false, extensions: songExtensions(), content });
  return (
    <div className="song-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

function SongHeader({ song, chords }: { song: ExportSong; chords: boolean }) {
  const meta = [song.tempo ? `${song.tempo} BPM` : null, song.timeSignature].filter(Boolean).join(" · ");
  return (
    <header className="mb-5 break-inside-avoid border-b border-slate-300 pb-2">
      {song.label && <div className="text-[11px] font-bold tracking-[0.12em] text-[#4338ca] uppercase">{song.label}</div>}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-bold">{song.title}</h1>
          {song.artist && <div className="text-sm text-slate-500">{song.artist}</div>}
        </div>
        <div className="shrink-0 text-right text-sm text-slate-600">
          {chords && (
            <div>
              Key: <b className="text-[#c2410c]">{song.key}</b>
              {song.key !== song.originalKey && <span className="text-slate-400"> (orig. {song.originalKey})</span>}
            </div>
          )}
          {meta && <div>{meta}</div>}
        </div>
      </div>
      {song.notes && <p className="mt-1 text-sm text-slate-600 italic">{song.notes}</p>}
    </header>
  );
}

function Cover({ setlist, chords }: { setlist: ExportSetlist; chords: boolean }) {
  const date = setlist.date
    ? new Date(setlist.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  const hasLabels = setlist.items.some((i) => i.label);
  return (
    <section className="print-cover">
      <h1 className="text-3xl font-bold">{setlist.name}</h1>
      {date && <p className="mt-1 text-slate-600">{date}</p>}
      {setlist.notes && <p className="mt-3 text-sm whitespace-pre-line text-slate-600">{setlist.notes}</p>}
      <ol className="mt-6">
        {setlist.items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-3 border-b border-slate-200 py-2 break-inside-avoid">
            <span className="w-6 text-right text-sm font-bold text-slate-400 tabular-nums">{i + 1}</span>
            {hasLabels && <span className="w-52 shrink-0 text-xs font-bold tracking-wide text-[#4338ca] uppercase">{item.label}</span>}
            <span className={item.song ? "flex-1" : "flex-1 text-slate-400"}>{item.song?.title ?? "—"}</span>
            {chords && <span className="w-10 text-right text-sm font-bold text-[#c2410c]">{item.song?.key ?? ""}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Marks the document ready for PDF capture once fonts have loaded and the chord-spacing
 * pass has settled (no DOM changes for a short while).
 */
function useReadySignal(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    const root = ref.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) document.documentElement.dataset.printReady = "true";
      }, 350);
    };
    const observer = new MutationObserver(settle);
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    void document.fonts.ready.then(settle);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);
}

export function PrintSheet({ setlist, options }: { setlist: ExportSetlist; options: PrintOptions }) {
  const ref = useRef<HTMLDivElement>(null);
  useReadySignal(ref);
  const songs = setlist.items.flatMap((i) => (i.song ? [i.song] : []));
  return (
    <div
      ref={ref}
      className={`print-sheet mx-auto max-w-[7.2in] ${options.layout === "continuous" ? "continuous" : options.breaks ? "page-breaks" : ""}`}
      style={{ "--sheet-font": SHEET_FONT_SIZE[options.size] } as React.CSSProperties}
    >
      {options.cover && <Cover setlist={setlist} chords={options.chords} />}
      {songs.map((song, i) => (
        <article key={i} className="print-song">
          <SongHeader song={song} chords={options.chords} />
          <SongBody song={song} chords={options.chords} />
        </article>
      ))}
      {songs.length === 0 && !options.cover && <p className="text-slate-500">This setlist has no songs yet.</p>}
    </div>
  );
}
