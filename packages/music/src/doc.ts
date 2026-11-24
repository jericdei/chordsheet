import { transposeChord } from "./theory";

/** Minimal ProseMirror / Tiptap JSON shape. */
export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export const CHORD_NODE = "chord";
/** A line of chords only (intro, instrumental, outro) rendered inline, e.g. "G - D - Em - C". */
export const CHORD_LINE_NODE = "chordLine";

export function emptyDoc(): DocNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function isDocNode(value: unknown): value is DocNode {
  return typeof value === "object" && value !== null && typeof (value as DocNode).type === "string";
}

export function mapChords(node: DocNode, fn: (chord: string) => string): DocNode {
  if (node.type === CHORD_NODE) {
    const chord = String(node.attrs?.chord ?? "");
    return { ...node, attrs: { ...node.attrs, chord: fn(chord) } };
  }
  if (!node.content) return { ...node };
  return { ...node, content: node.content.map((c) => mapChords(c, fn)) };
}

export function transposeDoc(doc: DocNode, semitones: number, preferFlats = false): DocNode {
  if (semitones % 12 === 0) return doc;
  return mapChords(doc, (c) => transposeChord(c, semitones, preferFlats));
}

export function collectChords(node: DocNode, out: string[] = []): string[] {
  if (node.type === CHORD_NODE) out.push(String(node.attrs?.chord ?? ""));
  node.content?.forEach((c) => collectChords(c, out));
  return out;
}

// ---------------------------------------------------------------------------
// Layout helpers (used by PDF export and read-only renderers)
// ---------------------------------------------------------------------------

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type LineToken = { kind: "chord"; chord: string } | ({ kind: "text" } & Run);

export type SheetBlock =
  | { type: "section"; text: string }
  | { type: "line"; tokens: LineToken[] }
  /** Chords written inline (intro/instrumental), not above lyrics. */
  | { type: "chords"; tokens: LineToken[] }
  | { type: "blank" };

function runFromText(node: DocNode): Run {
  const marks = new Set((node.marks ?? []).map((m) => m.type));
  return {
    text: node.text ?? "",
    bold: marks.has("bold") || undefined,
    italic: marks.has("italic") || undefined,
    underline: marks.has("underline") || undefined,
  };
}

function textOf(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(textOf).join("");
}

function inlineToLines(content: DocNode[]): LineToken[][] {
  const lines: LineToken[][] = [[]];
  for (const child of content) {
    const current = lines[lines.length - 1]!;
    if (child.type === "hardBreak") lines.push([]);
    else if (child.type === CHORD_NODE) current.push({ kind: "chord", chord: String(child.attrs?.chord ?? "") });
    else if (child.type === "text") current.push({ kind: "text", ...runFromText(child) });
  }
  return lines;
}

export function docToBlocks(doc: DocNode): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  const visit = (node: DocNode) => {
    switch (node.type) {
      case "heading":
        blocks.push({ type: "section", text: textOf(node).trim() });
        return;
      case CHORD_LINE_NODE: {
        const tokens = inlineToLines(node.content ?? []).flat();
        blocks.push(tokens.length ? { type: "chords", tokens } : { type: "blank" });
        return;
      }
      case "paragraph": {
        const content = node.content ?? [];
        if (content.length === 0) {
          blocks.push({ type: "blank" });
          return;
        }
        for (const tokens of inlineToLines(content)) {
          blocks.push(tokens.length ? { type: "line", tokens } : { type: "blank" });
        }
        return;
      }
      default:
        node.content?.forEach(visit);
    }
  };
  visit(doc);
  // Trim leading/trailing blank lines.
  while (blocks[0]?.type === "blank") blocks.shift();
  while (blocks[blocks.length - 1]?.type === "blank") blocks.pop();
  return blocks;
}

export interface Column {
  chord?: string;
  runs: Run[];
  /** The column is followed by whitespace in the lyric. */
  spaceAfter: boolean;
}

/**
 * Break a line into word-sized columns. A chord always starts a new column so it can sit
 * above its syllable; text only starts a new column after whitespace. Renderers lay the
 * columns out in a wrapping row so chords never overlap.
 */
export function lineToColumns(tokens: LineToken[]): Column[] {
  const cols: Column[] = [];
  let cur: Column | null = null;
  const open = (chord?: string) => {
    cur = { chord, runs: [], spaceAfter: false };
    cols.push(cur);
    return cur;
  };
  for (const token of tokens) {
    if (token.kind === "chord") {
      open(token.chord);
      continue;
    }
    const pieces = token.text.match(/\s+|\S+/g) ?? [];
    for (const piece of pieces) {
      if (/^\s+$/.test(piece)) {
        const col: Column = cur ?? open();
        col.spaceAfter = true;
        continue;
      }
      const col: Column = !cur || (cur as Column).spaceAfter ? open() : (cur as Column);
      const last = col.runs[col.runs.length - 1];
      if (last && last.bold === token.bold && last.italic === token.italic && last.underline === token.underline) {
        last.text += piece;
      } else {
        col.runs.push({ text: piece, bold: token.bold, italic: token.italic, underline: token.underline });
      }
    }
  }
  return cols;
}

export function lineHasChords(tokens: LineToken[]) {
  return tokens.some((t) => t.kind === "chord");
}

/** Export a document as ChordPro-style text, e.g. "[G]Amazing [C]grace". */
export function docToChordPro(doc: DocNode): string {
  return docToBlocks(doc)
    .map((b) => {
      if (b.type === "blank") return "";
      if (b.type === "section") return `{comment: ${b.text}}`;
      return b.tokens.map((t) => (t.kind === "chord" ? `[${t.chord}]` : t.text)).join("");
    })
    .join("\n");
}

/**
 * A lyrics-only copy of a document: chords and chord lines are removed (words split by a
 * chord are rejoined), and section headings left with no lyrics under them are dropped.
 */
export function stripChords(doc: DocNode): DocNode {
  const sameMarks = (a?: DocMark[], b?: DocMark[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const strip = (node: DocNode): DocNode | null => {
    if (node.type === CHORD_LINE_NODE || node.type === CHORD_NODE) return null;
    if (!node.content) return { ...node };
    const content: DocNode[] = [];
    for (const child of node.content) {
      const next = strip(child);
      if (!next) continue;
      const last = content[content.length - 1];
      if (next.type === "text" && last?.type === "text" && sameMarks(last.marks, next.marks)) {
        content[content.length - 1] = { ...last, text: (last.text ?? "") + (next.text ?? "") };
      } else {
        content.push(next);
      }
    }
    return content.length ? { ...node, content } : { type: node.type, ...(node.attrs ? { attrs: node.attrs } : {}) };
  };
  const stripped = strip(doc) ?? emptyDoc();
  const blocks = stripped.content ?? [];
  const hasText = (n: DocNode): boolean => n.type === "text" ? Boolean(n.text?.trim()) : (n.content ?? []).some(hasText);
  const kept = blocks.filter((block, i) => {
    if (block.type !== "heading") return true;
    for (const next of blocks.slice(i + 1)) {
      if (next.type === "heading") return false;
      if (hasText(next)) return true;
    }
    return false;
  });
  // Removing intros/chord lines can leave blank lines at the edges.
  const isBlank = (n: DocNode) => n.type === "paragraph" && !hasText(n);
  while (kept.length && isBlank(kept[0]!)) kept.shift();
  while (kept.length && isBlank(kept[kept.length - 1]!)) kept.pop();
  return { ...stripped, content: kept.length ? kept : [{ type: "paragraph" }] };
}
