"use client";

import { chordLineNode, chordsForKey, resolveBassChord, collectChords, importText, transposeChord, type DocNode } from "@chordsheet/music";
import type { Editor } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { AudioLines, Bold, CopyPlus, Heading, Italic, Music2, Redo2, Type, Underline, Undo2, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui";
import { songExtensions } from "./extensions";
import { ChordPicker } from "./ChordPicker";

export type EditorMode = "lyrics" | "chords";

export interface SongEditorHandle {
  setContent: (doc: DocNode) => void;
  getJSON: () => DocNode;
  transpose: (semitones: number, preferFlats: boolean) => void;
  chordCount: () => number;
}

interface PickerState {
  pos: number;
  current?: string;
  left: number;
  top: number;
}

interface Ghost {
  left: number;
  top: number;
  height: number;
}

const PICKER_WIDTH = 340;

function ToolbarButton({
  active,
  onClick,
  title,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-30",
        active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Resolve a click to a text position. Lines with chords have padding above them (the chord
 * row), so a click there — natural when aiming at "where the chord goes" — is nudged down
 * onto the lyric line below instead of snapping to the start of the paragraph.
 */
function posFromPoint(view: EditorView, x: number, y: number): number | null {
  for (const dy of [0, 6, 12, 18, 24, 30]) {
    const hit = view.posAtCoords({ left: x, top: y + dy });
    if (!hit) continue;
    const c = view.coordsAtPos(hit.pos);
    if (y + dy >= c.top - 2 && y + dy <= c.bottom + 2) return hit.pos;
  }
  return view.posAtCoords({ left: x, top: y })?.pos ?? null;
}

/**
 * Rewrite the chord line containing `pos`, adding `insert` at `pos` and/or dropping the chord
 * at `removeAt`, then re-tidying separators ("G - Am - D"). Returns the position right after
 * the inserted chord (or `pos`).
 */
function rewriteChordLine(editor: Editor, pos: number, opts: { insert?: string; removeAt?: number }): number {
  const { state } = editor;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const start = $pos.start();
  const rel = pos - start;
  const newChord: DocNode | null = opts.insert ? { type: "chord", attrs: { chord: opts.insert } } : null;
  const parts: DocNode[] = [];
  let inserted = !newChord;
  parent.forEach((child, offset) => {
    if (child.isText) {
      const text = child.text ?? "";
      if (!inserted && rel >= offset && rel < offset + text.length) {
        parts.push({ type: "text", text: text.slice(0, rel - offset) }, newChord!, { type: "text", text: text.slice(rel - offset) });
        inserted = true;
        return;
      }
      parts.push({ type: "text", text });
      return;
    }
    if (!inserted && offset >= rel) {
      parts.push(newChord!);
      inserted = true;
    }
    if (opts.removeAt !== undefined && start + offset === opts.removeAt) return;
    parts.push(child.toJSON() as DocNode);
  });
  if (!inserted) parts.push(newChord!);

  const content = chordLineNode(parts).content ?? [];
  const nodes = content.map((n) => state.schema.nodeFromJSON(n));
  let after = pos;
  if (newChord) {
    let size = 0;
    for (const n of content) {
      size += n.type === "text" ? (n.text ?? "").length : 1;
      if (n === newChord) break;
    }
    after = start + size;
  }
  editor.view.dispatch(state.tr.replaceWith(start, start + parent.content.size, nodes));
  return after;
}

/** Top-level range of the section starting at heading `headingPos`: up to the next heading. */
function sectionRange(doc: PMNode, headingPos: number) {
  let to = doc.content.size;
  let found = false;
  let lastChild: PMNode | null = null;
  doc.forEach((child, offset) => {
    if (offset === headingPos) found = child.type.name === "heading";
    else if (found && offset > headingPos && to === doc.content.size) {
      if (child.type.name === "heading") to = offset;
    }
    if (found && offset >= headingPos && offset < to) lastChild = child;
  });
  return found ? { from: headingPos, to, lastChild: lastChild as PMNode | null } : null;
}

/** Position of the heading that starts the section containing `pos`, or null. */
function sectionAt(doc: PMNode, pos: number): number | null {
  const index = doc.resolve(Math.min(pos, doc.content.size)).index(0);
  let result: number | null = null;
  doc.forEach((child, offset, i) => {
    if (i <= index && child.type.name === "heading") result = offset;
  });
  return result;
}

function duplicateSection(editor: Editor, headingPos: number) {
  const { state } = editor;
  const range = sectionRange(state.doc, headingPos);
  if (!range) return;
  let content = state.doc.slice(range.from, range.to).content;
  // Keep a blank line between the original and the copy.
  const endsBlank = range.lastChild?.type.name === "paragraph" && range.lastChild.content.size === 0;
  if (!endsBlank) content = Fragment.from(state.schema.nodes.paragraph!.create()).append(content);
  const copyStart = range.to + (endsBlank ? 0 : 2);
  const tr = state.tr.insert(range.to, content);
  tr.setSelection(TextSelection.create(tr.doc, copyStart + 1)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
}

type ChordTarget =
  | { kind: "edit"; pos: number }
  | { kind: "insert"; pos: number; /** Right edge of the chord the new one follows (client px). */ afterLabel?: number };

/**
 * Work out what a chord-mode click means. Chords are zero-width anchors, so the positions
 * before and after a chord share the same x — at the end of a line, a click to the right of
 * the last chord would otherwise land on that chord. Any chord whose label lies left of the
 * click is stepped over, so the new chord is added after it ("Amen  G  D").
 */
function resolveChordTarget(view: EditorView, x: number, y: number): ChordTarget | null {
  let pos = posFromPoint(view, x, y);
  if (pos === null) return null;
  const { doc } = view.state;
  // posAtCoords may return the position after a run of chords; walk back to its start so
  // every chord in the run is considered.
  while (pos > 0 && doc.resolve(pos).nodeBefore?.type.name === "chord") pos--;
  let afterLabel: number | undefined;
  while (doc.nodeAt(pos)?.type.name === "chord") {
    const label = (view.nodeDOM(pos) as HTMLElement | null)?.querySelector?.(".chord-label");
    const rect = label?.getBoundingClientRect();
    if (!rect || x <= rect.right) {
      // Clicked on (or left of) this chord's label: only an edit if nothing was stepped over.
      return afterLabel === undefined ? { kind: "edit", pos } : { kind: "insert", pos, afterLabel };
    }
    afterLabel = rect.right;
    pos++;
  }
  return { kind: "insert", pos, afterLabel };
}

function findChordPos(view: EditorView, el: Element): number | null {
  const base = view.posAtDOM(el, 0);
  for (const candidate of [base, base - 1, base + 1]) {
    if (candidate >= 0 && view.state.doc.nodeAt(candidate)?.type.name === "chord") return candidate;
  }
  return null;
}

export const SongEditor = forwardRef<
  SongEditorHandle,
  { initialContent: DocNode; musicKey: string; onChange: (doc: DocNode) => void }
>(function SongEditor({ initialContent, musicKey, onChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<EditorMode>(() =>
    collectChords(initialContent).length === 0 && JSON.stringify(initialContent).length < 80 ? "lyrics" : "chords",
  );
  const [brush, setBrush] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [sectionHover, setSectionHover] = useState<{ pos: number; top: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<(Ghost & { label: string }) | null>(null);
  const draggingRef = useRef(false);

  // Refs so ProseMirror's event handlers (created once) see current state.
  const modeRef = useRef(mode);
  const brushRef = useRef(brush);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  modeRef.current = mode;
  brushRef.current = brush;
  onChangeRef.current = onChange;

  const openPicker = useCallback((view: EditorView, pos: number, current?: string) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const coords = view.coordsAtPos(pos);
    const left = Math.max(0, Math.min(coords.left - rect.left - 24, rect.width - PICKER_WIDTH));
    setPicker({ pos, current, left, top: coords.bottom - rect.top + 10 });
    setGhost(null);
  }, []);

  /** Inserts a chord and returns the position right after it. */
  const insertChord = useCallback((pos: number, chord: string) => {
    const editor = editorRef.current;
    if (!editor) return pos;
    if (editor.state.doc.resolve(pos).parent.type.name === "chordLine") return rewriteChordLine(editor, pos, { insert: chord });
    editor.chain().insertContentAt(pos, { type: "chord", attrs: { chord } }, { updateSelection: false }).run();
    return pos + 1;
  }, []);

  /**
   * Move the chord at `from` to the insertion point `to` (positions in the current doc) in
   * one transaction, so it is a single undo step. Only lyric lines take part; chords in an
   * intro/instrumental chord line are edited through the picker instead.
   * Returns the chord's new position, or null if the move isn't allowed.
   */
  const moveChord = useCallback((from: number, to: number): number | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const { state } = editor;
    const node = state.doc.nodeAt(from);
    if (node?.type.name !== "chord") return null;
    if (state.doc.resolve(from).parent.type.name !== "paragraph") return null;
    if (to < 0 || to > state.doc.content.size || state.doc.resolve(to).parent.type.name !== "paragraph") return null;
    if (to === from || to === from + 1) return from;
    const tr = state.tr.delete(from, from + 1);
    const target = tr.mapping.map(to);
    tr.insert(target, node);
    editor.view.dispatch(tr.scrollIntoView());
    return target;
  }, []);

  /** Where a dragged chord would land for a pointer at (x, y), or null if not droppable. */
  const dropTarget = useCallback((view: EditorView, x: number, y: number) => {
    const hit = resolveChordTarget(view, x, y);
    if (!hit) return null;
    if (view.state.doc.resolve(hit.pos).parent.type.name !== "paragraph") return null;
    return hit;
  }, []);

  const startChordPress = useCallback(
    (view: EditorView, from: number, el: HTMLElement, down: PointerEvent) => {
      const name = String(view.state.doc.nodeAt(from)?.attrs.chord ?? "");
      const movable = view.editable && view.state.doc.resolve(from).parent.type.name === "paragraph";
      let dragging = false;
      let target: number | null = null;

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        el.classList.remove("chord-dragging");
        document.body.classList.remove("dragging-chord");
        draggingRef.current = false;
        setDragGhost(null);
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        if (!dragging) {
          if (!movable || Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
          dragging = true;
          draggingRef.current = true;
          el.classList.add("chord-dragging");
          document.body.classList.add("dragging-chord");
          setPicker(null);
          setGhost(null);
        }
        e.preventDefault();
        // Scroll while dragging near the top/bottom edge of the window.
        if (e.clientY < 70) window.scrollBy(0, -14);
        else if (e.clientY > window.innerHeight - 50) window.scrollBy(0, 14);
        const hit = dropTarget(view, e.clientX, e.clientY);
        const container = containerRef.current;
        target = hit && hit.pos !== from && hit.pos !== from + 1 ? hit.pos : hit ? from : null;
        if (!hit || !container) {
          setDragGhost(null);
          return;
        }
        const rect = container.getBoundingClientRect();
        const c = view.coordsAtPos(hit.pos);
        const after = hit.kind === "insert" ? hit.afterLabel : undefined;
        const left = after !== undefined ? Math.max(c.left, after + 6) : c.left;
        setDragGhost({ left: left - rect.left, top: c.top - rect.top, height: c.bottom - c.top, label: name });
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        const wasDragging = dragging;
        stop();
        if (!wasDragging) openPicker(view, from, name);
        else if (target !== null) moveChord(from, target);
      };
      const onCancel = () => stop();
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [dropTarget, moveChord, openPicker],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...songExtensions(),
      Placeholder.configure({
        includeChildren: false,
        showOnlyCurrent: false,
        placeholder: ({ node, editor: e }) =>
          node.type.name === "chordLine"
            ? "Intro / instrumental chords — click here in Chords mode (or ⌘K) to add them"
            : e.isEmpty
              ? "Type or paste your lyrics here… (pasting a chord sheet keeps its chords)"
              : "",
      }),
    ],
    content: initialContent,
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as DocNode),
    editorProps: {
      attributes: { spellcheck: "false", class: "px-1" },
      handleDOMEvents: {
        // Pressing a chord name: a click opens it for editing, a drag moves it.
        pointerdown: (view, event) => {
          if (event.button !== 0) return false;
          const chordEl = (event.target as HTMLElement | null)?.closest?.(".chord");
          if (!chordEl) return false;
          const pos = findChordPos(view, chordEl);
          if (pos === null) return false;
          event.preventDefault();
          startChordPress(view, pos, chordEl as HTMLElement, event);
          return true;
        },
        mousedown: (view, event) => {
          if (event.button !== 0) return false;
          const target = event.target as HTMLElement | null;
          if (target?.closest?.(".chord")) {
            event.preventDefault();
            return true;
          }
          if (modeRef.current !== "chords") return false;

          event.preventDefault();
          const hit = resolveChordTarget(view, event.clientX, event.clientY);
          if (!hit) return true;
          const pos = hit.pos;
          if (hit.kind === "edit") {
            openPicker(view, pos, String(view.state.doc.nodeAt(pos)?.attrs.chord ?? ""));
            return true;
          }
          const parent = view.state.doc.resolve(pos).parent;
          if (!parent.isTextblock || parent.type.name === "heading") return true;
          if (brushRef.current) insertChord(pos, brushRef.current);
          else openPicker(view, pos);
          return true;
        },
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (!text || html.includes("data-chord")) return false;
        const result = importText(text);
        if (collectChords(result.doc).length === 0) return false;
        editorRef.current?.commands.insertContent(result.doc.content ?? []);
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      setContent: (doc) => editor?.commands.setContent(doc, { emitUpdate: false }),
      getJSON: () => (editor?.getJSON() as DocNode) ?? { type: "doc" },
      chordCount: () => (editor ? collectChords(editor.getJSON() as DocNode).length : 0),
      transpose: (semitones, preferFlats) => {
        if (!editor) return;
        const { state } = editor;
        const tr = state.tr;
        state.doc.descendants((node, pos) => {
          if (node.type.name === "chord") {
            tr.setNodeMarkup(pos, undefined, { chord: transposeChord(String(node.attrs.chord), semitones, preferFlats) });
          }
        });
        if (tr.docChanged) editor.view.dispatch(tr);
      },
    }),
    [editor],
  );

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const used = new Set<string>();
      e.state.doc.descendants((node) => {
        if (node.type.name === "chord") used.add(String(node.attrs.chord));
      });
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        heading: e.isActive("heading"),
        chordLine: e.isActive("chordLine"),
        sectionPos: sectionAt(e.state.doc, e.state.selection.from) ?? -1,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        usedChords: [...used].sort().join("|"),
      };
    },
  });

  const usedChords = useMemo(() => (state?.usedChords ? state.usedChords.split("|") : []), [state?.usedChords]);
  const palette = useMemo(() => {
    const opts = chordsForKey(musicKey);
    const base = opts.filter((o) => o.group === "diatonic");
    const known = new Set(opts.map((o) => o.chord));
    return { base, common: opts.filter((o) => o.group === "common").slice(0, 4), extras: usedChords.filter((c) => !known.has(c)) };
  }, [musicKey, usedChords]);

  // Keyboard: ⌘/Ctrl+K opens the chord picker at the cursor; Esc drops the brush.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editor) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPicker(editor.view, editor.state.selection.from);
    } else if (e.key === "Escape" && brush) {
      setBrush(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!editor || !container || draggingRef.current) return;
    const target = e.target as HTMLElement;
    const rect = container.getBoundingClientRect();

    // Section actions appear when hovering a section heading.
    if (!target.closest("[data-section-actions]")) {
      const heading = target.closest(".ProseMirror h3");
      const pos = heading ? editor.view.posAtDOM(heading, 0) - 1 : -1;
      if (heading && editor.state.doc.nodeAt(pos)?.type.name === "heading") {
        const top = heading.getBoundingClientRect().top - rect.top;
        setSectionHover((cur) => (cur?.pos === pos && cur.top === top ? cur : { pos, top }));
      } else if (sectionHover) {
        setSectionHover(null);
      }
    }

    if (mode !== "chords" || picker) return;
    if (target.closest(".chord") || target.closest("[data-section-actions]")) {
      setGhost(null);
      return;
    }
    const hit = resolveChordTarget(editor.view, e.clientX, e.clientY);
    const parent = hit ? editor.state.doc.resolve(hit.pos).parent : null;
    if (!hit || hit.kind === "edit" || !parent?.isTextblock || parent.type.name === "heading") {
      setGhost(null);
      return;
    }
    const c = editor.view.coordsAtPos(hit.pos);
    // After an existing chord, preview the new one just past that chord's name.
    const left = hit.afterLabel !== undefined ? Math.max(c.left, hit.afterLabel + 6) : c.left;
    setGhost({ left: left - rect.left, top: c.top - rect.top, height: c.bottom - c.top });
  };

  const closePicker = useCallback(() => {
    setPicker(null);
  }, []);

  const pick = (input: string) => {
    if (!editor || !picker) return;
    // "/G" keeps the previous chord and changes the bass: after Am it becomes Am/G.
    let previous: string | undefined;
    editor.state.doc.nodesBetween(0, picker.pos, (node, pos) => {
      if (node.type.name === "chord" && pos < picker.pos) previous = String(node.attrs.chord);
    });
    const chord = resolveBassChord(input, previous);
    let nextPos: number;
    if (picker.current !== undefined) {
      editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(picker.pos, undefined, { chord });
          return true;
        })
        .run();
      nextPos = picker.pos + 1;
    } else {
      nextPos = insertChord(picker.pos, chord);
    }
    setPicker(null);
    if (mode === "lyrics") editor.chain().focus().setTextSelection(nextPos).run();
  };

  /** Shift the chord being edited one letter left/right within its line; the picker follows it. */
  const nudgeChord = (direction: -1 | 1) => {
    if (!editor || !picker || picker.current === undefined) return;
    const $pos = editor.state.doc.resolve(picker.pos);
    const to = direction < 0 ? picker.pos - 1 : picker.pos + 2;
    if (to < $pos.start() || to > $pos.end()) return;
    const moved = moveChord(picker.pos, to);
    if (moved !== null) openPicker(editor.view, moved, picker.current);
  };

  const removeChord = () => {
    if (!editor || !picker) return;
    if (editor.state.doc.resolve(picker.pos).parent.type.name === "chordLine") rewriteChordLine(editor, picker.pos, { removeAt: picker.pos });
    else editor.chain().deleteRange({ from: picker.pos, to: picker.pos + 1 }).run();
    setPicker(null);
  };

  return (
    <div className="rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200">
      {/* Toolbar */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-slate-100 bg-surface/95 px-3 py-2 backdrop-blur">
        <div className="flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Editing mode">
          {(
            [
              ["lyrics", Type, "Lyrics"],
              ["chords", Music2, "Chords"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setGhost(null);
                if (value === "lyrics") {
                  setBrush(null);
                  editor?.commands.focus();
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                mode === value ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />
        <ToolbarButton title="Bold (⌘B)" active={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic (⌘I)" active={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline (⌘U)" active={state?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Section label (Verse, Chorus…)"
          active={state?.heading}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Chord line — intro / instrumental chords (G - D - Em - C)"
          active={state?.chordLine}
          onClick={() => editor?.chain().focus().toggleNode("chordLine", "paragraph").run()}
        >
          <AudioLines className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Duplicate the current section (e.g. repeat a chorus)"
          disabled={!state || state.sectionPos < 0}
          onClick={() => editor && state && state.sectionPos >= 0 && duplicateSection(editor, state.sectionPos)}
        >
          <CopyPlus className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <ToolbarButton title="Undo (⌘Z)" disabled={!state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo (⇧⌘Z)" disabled={!state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <span className="ml-auto hidden text-xs text-slate-400 lg:block">
          {mode === "lyrics" ? "⌘K adds a chord at the cursor" : brush ? "Click lyrics to stamp the chord · Esc to stop" : "Click a syllable to add a chord"}
        </span>
      </div>

      {/* Chord palette (chord mode) */}
      {mode === "chords" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-orange-50/40 px-3 py-2">
          <span className="mr-1 text-xs font-medium text-slate-500">Quick chords:</span>
          {[...palette.base.map((o) => ({ chord: o.chord, hint: o.numeral })), ...palette.common.map((o) => ({ chord: o.chord, hint: o.numeral })), ...palette.extras.map((c) => ({ chord: c, hint: "" }))].map(
            ({ chord, hint }) => (
              <button
                key={chord}
                type="button"
                title={hint ? `${chord} · ${hint} — click, then click lyrics to place` : chord}
                onClick={() => setBrush((b) => (b === chord ? null : chord))}
                className={cn(
                  "rounded-md px-2 py-1 text-sm font-bold transition-colors",
                  brush === chord ? "bg-chord text-surface shadow-sm" : "bg-surface text-chord ring-1 ring-orange-200 hover:bg-orange-100",
                )}
              >
                {chord}
              </button>
            ),
          )}
          {brush && (
            <button type="button" onClick={() => setBrush(null)} className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <X className="h-3 w-3" /> Stop placing {brush}
            </button>
          )}
        </div>
      )}

      {/* Editor */}
      <div
        ref={containerRef}
        className={cn("song-editor relative px-5 py-6 sm:px-8", mode === "chords" && "mode-chords")}
        onKeyDown={onKeyDown}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setGhost(null);
          setSectionHover(null);
        }}
      >
        <EditorContent editor={editor} />
        {sectionHover && editor && (
          <div data-section-actions className="absolute right-4 z-10" style={{ top: sectionHover.top - 4 }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                duplicateSection(editor, sectionHover.pos);
                setSectionHover(null);
              }}
              className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <CopyPlus className="h-3.5 w-3.5" /> Duplicate section
            </button>
          </div>
        )}
        {ghost && mode === "chords" && (
          <div className="pointer-events-none absolute" style={{ left: ghost.left, top: ghost.top }}>
            <div className="absolute -top-5 -left-1 rounded bg-chord px-1 text-xs font-bold whitespace-nowrap text-surface shadow">
              {brush ?? "+"}
            </div>
            <div className="w-0.5 rounded bg-chord/70" style={{ height: ghost.height }} />
          </div>
        )}
        {dragGhost && (
          <div className="pointer-events-none absolute z-20" style={{ left: dragGhost.left, top: dragGhost.top }}>
            <div className="absolute -top-6 -left-1 rounded bg-chord px-1.5 py-0.5 text-sm font-bold whitespace-nowrap text-surface shadow-lg">
              {dragGhost.label}
            </div>
            <div className="w-0.5 rounded bg-chord" style={{ height: dragGhost.height }} />
          </div>
        )}
        {picker && (
          <ChordPicker
            musicKey={musicKey}
            current={picker.current}
            extraChords={usedChords}
            left={picker.left}
            top={picker.top}
            onPick={pick}
            onRemove={picker.current !== undefined ? removeChord : undefined}
            onMove={picker.current !== undefined && editor?.state.doc.resolve(picker.pos).parent.type.name === "paragraph" ? nudgeChord : undefined}
            onClose={closePicker}
          />
        )}
      </div>
    </div>
  );
});
