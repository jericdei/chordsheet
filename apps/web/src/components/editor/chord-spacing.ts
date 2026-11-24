import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** Minimum horizontal gap between two chord labels, in px. */
const GAP = 6;
/** Minimum spacer width when it shows a hyphen, in px. */
const MIN_HYPHEN_WIDTH = 16;
/** Stop re-measuring after this many consecutive layout-only passes (guards against oscillation with wrapping). */
const MAX_PASSES = 6;

interface Spacer {
  width: number;
  /** The spacer splits a word, so it shows a hyphen ("Glo - ria"). */
  hyphen: boolean;
}

interface SpacingState {
  spacers: Map<number, Spacer>;
  decorations: DecorationSet;
}

const key = new PluginKey<SpacingState>("chordSpacing");

function buildDecorations(doc: PMNode, spacers: Map<number, Spacer>) {
  const decos: Decoration[] = [];
  for (const [pos, spacer] of spacers) {
    if (pos < 0 || pos > doc.content.size) continue;
    decos.push(
      Decoration.widget(
        pos,
        () => {
          const el = document.createElement("span");
          el.className = "chord-spacer";
          el.style.width = `${spacer.width}px`;
          el.contentEditable = "false";
          el.textContent = spacer.hyphen ? "-" : "";
          return el;
        },
        { side: -1, key: `spacer-${pos}-${spacer.width}-${spacer.hyphen ? 1 : 0}`, ignoreSelection: true },
      ),
    );
  }
  return DecorationSet.create(doc, decos);
}

const isLetter = (s: string) => /[\p{L}\p{N}'’]/u.test(s);

function sameSpacers(a: Map<number, Spacer>, b: Map<number, Spacer>) {
  if (a.size !== b.size) return false;
  for (const [pos, s] of a) {
    const o = b.get(pos);
    if (!o || o.width !== s.width || o.hyphen !== s.hyphen) return false;
  }
  return true;
}

/** Measure chord labels and work out how much room each crowded chord needs. */
function measure(view: EditorView, current: Map<number, Spacer>): Map<number, Spacer> {
  const next = new Map<number, Spacer>();
  const { doc } = view.state;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name !== "paragraph") return false;
    const chords: number[] = [];
    node.forEach((child, offset) => {
      if (child.type.name === "chord") chords.push(pos + 1 + offset);
    });
    for (let i = 1; i < chords.length; i++) {
      const a = chords[i - 1]!;
      const b = chords[i]!;
      const aDom = view.nodeDOM(a) as HTMLElement | null;
      const bDom = view.nodeDOM(b) as HTMLElement | null;
      const aLabel = aDom?.querySelector?.(".chord-label");
      const bLabel = bDom?.querySelector?.(".chord-label");
      if (!aDom || !bDom || !aLabel || !bLabel) continue;
      // Only chords on the same visual line can collide.
      if (Math.abs(aDom.getBoundingClientRect().top - bDom.getBoundingClientRect().top) > 4) continue;
      const existing = current.get(b)?.width ?? 0;
      const deficit = aLabel.getBoundingClientRect().right + GAP - bLabel.getBoundingClientRect().left;
      const width = Math.ceil(Math.max(0, existing + deficit));
      if (width < 2) continue;
      const before = doc.textBetween(Math.max(pos + 1, b - 1), b, "", "");
      const after = doc.textBetween(b + 1, Math.min(b + 2, pos + node.nodeSize - 1), "", "");
      const hyphen = isLetter(before) && isLetter(after);
      // A hyphen needs a little room of its own to be legible ("ex - cel").
      next.set(b, { width: hyphen ? Math.max(width, MIN_HYPHEN_WIDTH) : width, hyphen });
    }
    return false;
  });
  return next;
}

/**
 * Keeps chord names from overlapping. When two chords sit on syllables too close together,
 * a display-only spacer is placed before the second chord (with a hyphen if it splits a
 * word), stretching the lyric so every chord has room. Nothing is written to the document.
 */
export const ChordSpacing = Extension.create({
  name: "chordSpacing",

  addProseMirrorPlugins() {
    return [
      new Plugin<SpacingState>({
        key,
        state: {
          init: (_config, state: EditorState) => ({ spacers: new Map(), decorations: DecorationSet.create(state.doc, []) }),
          apply(tr: Transaction, value: SpacingState): SpacingState {
            const meta = tr.getMeta(key) as Map<number, Spacer> | undefined;
            if (meta) return { spacers: meta, decorations: buildDecorations(tr.doc, meta) };
            if (!tr.docChanged) return value;
            const mapped = new Map<number, Spacer>();
            for (const [pos, spacer] of value.spacers) {
              const result = tr.mapping.mapResult(pos, 1);
              if (!result.deleted) mapped.set(result.pos, spacer);
            }
            return { spacers: mapped, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
        view(view) {
          let frame = 0;
          let passes = 0;
          let lastDoc = view.state.doc;
          const run = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const current = key.getState(view.state)?.spacers ?? new Map();
            const next = measure(view, current);
            if (sameSpacers(current, next)) return;
            if (++passes > MAX_PASSES) return;
            view.dispatch(view.state.tr.setMeta(key, next).setMeta("addToHistory", false));
          };
          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(run);
          };
          const onResize = () => {
            passes = 0;
            schedule();
          };
          window.addEventListener("resize", onResize);
          void document.fonts?.ready.then(onResize);
          schedule();
          return {
            update(v) {
              if (v.state.doc !== lastDoc) {
                lastDoc = v.state.doc;
                passes = 0;
              }
              schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              window.removeEventListener("resize", onResize);
            },
          };
        },
      }),
    ];
  },
});
