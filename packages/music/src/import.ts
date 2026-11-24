import { CHORD_LINE_NODE, CHORD_NODE, type DocNode } from "./doc";
import { formatKey, isBassOnlyChord, isValidChord, isValidKey, resolveBassChord } from "./theory";

export interface ImportResult {
  doc: DocNode;
  title?: string;
  artist?: string;
  key?: string;
}

const SECTION_RE =
  /^\s*[[(]?\s*((?:intro|verse|chorus|pre-?chorus|bridge|outro|refrain|tag|interlude|instrumental|coda|ending|hook|vamp|response|antiphon|stanza)(?:\s*\d+)?(?:\s*[:\-–].*)?)\s*[\])]?\s*:?\s*$/i;
const BAR_TOKEN_RE = /^(?:\||\|\||\/|-|%|\.|:|x\d+|\(x\d+\)|\d+x|N\.?C\.?)$/i;

const text = (t: string): DocNode => ({ type: "text", text: t });
const chord = (c: string): DocNode => ({ type: CHORD_NODE, attrs: { chord: c } });

function paragraph(content: DocNode[]): DocNode {
  // ProseMirror rejects empty text nodes; merge adjacent ones.
  const out: DocNode[] = [];
  for (const node of content) {
    if (node.type === "text") {
      if (!node.text) continue;
      const prev = out[out.length - 1];
      if (prev?.type === "text") {
        prev.text += node.text;
        continue;
      }
    }
    out.push({ ...node });
  }
  return out.length ? { type: "paragraph", content: out } : { type: "paragraph" };
}

function stripBrackets(token: string) {
  return token.replace(/^[([]+|[)\]]+$/g, "");
}

/** Chords read from a token, with their column offset inside the token. */
type TokenChord = { offset: number; chord: string };

/**
 * Read the chord(s) in one whitespace-separated token of a chord line:
 *  - a chord ("G", "Am7", "D/F#", "C6/9"), optionally bracketed "(G)"
 *  - a bass-only slash chord "/G" (resolved later against the previous chord)
 *  - chords joined by dashes on one held note: "Gsus-G7", "C-/B" → two chords
 * Returns null when the token isn't chord notation.
 */
function tokenChords(token: string): TokenChord[] | null {
  const bare = stripBrackets(token);
  const lead = Math.max(0, token.indexOf(bare));
  const isChordish = (t: string) => isValidChord(t) || isBassOnlyChord(t);
  if (bare && isChordish(bare)) return [{ offset: lead, chord: bare }];
  if (bare.includes("-")) {
    const parts = bare.split("-");
    if (parts.length > 1 && parts.every((p) => p && isChordish(p))) {
      let offset = lead;
      return parts.map((chord) => {
        const out = { offset, chord };
        offset += chord.length + 1;
        return out;
      });
    }
  }
  return null;
}

/** Resolves "/G" against the most recent chord, across lines of the same import. */
interface ChordContext {
  last?: string;
}

function resolve(chordText: string, ctx: ChordContext) {
  const full = resolveBassChord(chordText, ctx.last);
  if (!isBassOnlyChord(full)) ctx.last = full;
  return full;
}

/** Chords of a chord line with their columns, or null if the line isn't only chords. */
function lineChords(line: string): Array<{ col: number; chord: string }> | null {
  const out: Array<{ col: number; chord: string }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let chords = 0;
  while ((m = re.exec(line))) {
    if (BAR_TOKEN_RE.test(m[0])) continue;
    const found = tokenChords(m[0]);
    if (!found) return null;
    chords += found.length;
    for (const f of found) out.push({ col: m.index + f.offset, chord: f.chord });
  }
  return chords > 0 ? out : null;
}

export function isChordLine(line: string): boolean {
  return lineChords(line) !== null;
}

function isSectionLine(line: string) {
  return SECTION_RE.test(line) && !isChordLine(line);
}

function sectionLabel(line: string) {
  const m = SECTION_RE.exec(line);
  const label = (m?.[1] ?? line).trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Merge a "chords over lyrics" pair into one paragraph using column positions. */
function mergeChordLine(chordLine: string, lyricLine: string, ctx: ChordContext): DocNode {
  const positions = lineChords(chordLine) ?? [];
  const content: DocNode[] = [];
  let cursor = 0;
  let lyric = lyricLine.replace(/\s+$/, "");
  for (const { col, chord: c } of positions) {
    if (col > lyric.length) lyric = lyric.padEnd(col, " ");
    const at = Math.max(col, cursor);
    content.push(text(lyric.slice(cursor, at)));
    content.push(chord(resolve(c, ctx)));
    cursor = at;
  }
  content.push(text(lyric.slice(cursor)));
  return paragraph(content);
}

const SEPARATOR_ONLY = /^[\s\-–—]*$/;

/**
 * Build (or re-tidy) an inline chord line. Between two chords, whitespace/dashes become a
 * single " - "; dangling dashes at either end are dropped; anything else the user wrote
 * ("|", "x2", "(repeat)") is kept, with whitespace collapsed.
 */
export function chordLineNode(parts: DocNode[]): DocNode {
  const content: DocNode[] = [];
  let pendingText = "";
  let lastWasChord = false;
  const flushText = () => {
    pendingText = pendingText.replace(/\s+/g, " ");
    if (pendingText) content.push(text(pendingText));
    pendingText = "";
  };
  for (const part of parts) {
    if (part.type === CHORD_NODE) {
      if (SEPARATOR_ONLY.test(pendingText)) pendingText = lastWasChord ? " - " : content.length === 0 ? "" : pendingText;
      flushText();
      content.push(part);
      lastWasChord = true;
    } else {
      pendingText += part.text ?? "";
      if (!SEPARATOR_ONLY.test(part.text ?? "")) lastWasChord = false;
    }
  }
  pendingText = SEPARATOR_ONLY.test(pendingText) ? "" : pendingText.replace(/\s+$/, "");
  flushText();
  const first = content[0];
  if (first?.type === "text") {
    first.text = first.text!.replace(/^\s+/, "");
    if (!first.text) content.shift();
  }
  return content.length ? { type: CHORD_LINE_NODE, content } : { type: CHORD_LINE_NODE };
}

/** A line of chords only (intro, instrumental): becomes an inline chord line. */
function chordOnlyLine(line: string, ctx: ChordContext): DocNode {
  const parts: DocNode[] = [];
  for (const token of line.trim().split(/\s+/)) {
    const found = BAR_TOKEN_RE.test(token) ? null : tokenChords(token);
    if (found) for (const f of found) parts.push(chord(resolve(f.chord, ctx)), text(" "));
    else parts.push(text(` ${token} `));
  }
  return chordLineNode(parts);
}

function chordProLine(line: string, ctx: ChordContext): DocNode {
  const content: DocNode[] = [];
  const hasLyrics = /[\p{L}\p{N}]/u.test(line.replace(/\[[^\]]*\]/g, "").replace(/\bx\d+\b/gi, ""));
  let last = 0;
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    content.push(text(line.slice(last, m.index)));
    const found = tokenChords(m[1]!.trim());
    if (found) for (const f of found) content.push(chord(resolve(f.chord, ctx)));
    else content.push(text(m[0]));
    last = m.index + m[0].length;
  }
  content.push(text(line.slice(last)));
  if (!hasLyrics && content.some((n) => n.type === CHORD_NODE)) return chordLineNode(content);
  return paragraph(content);
}

/** "Intro: G D Em C" → a section heading followed by a chord line. */
const LABELLED_CHORDS_RE = /^\s*[[(]?\s*([A-Za-z][\w\s-]*?\d*)\s*[\])]?\s*[:–]\s*(.+)$/;

/**
 * Convert pasted text into an editor document. Understands:
 *  - ChordPro inline chords: "[G]Amazing [C]grace" and directives ({title:}, {key:}, {c:}, {soc} …)
 *  - The common "chords above lyrics" layout found on chord websites
 *  - Section labels like "Verse 1", "[Chorus]", "Bridge:"
 */
export function importText(input: string): ImportResult {
  const lines = input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const result: ImportResult = { doc: { type: "doc", content: [] } };
  const blocks = result.doc.content!;
  const ctx: ChordContext = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const directive = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line);
    if (directive) {
      const name = directive[1]!.toLowerCase();
      const value = directive[2]?.trim() ?? "";
      if ((name === "title" || name === "t") && value) result.title = value;
      else if ((name === "artist" || name === "subtitle" || name === "st") && value) result.artist = value;
      else if (name === "key" && isValidKey(value)) result.key = formatKey(value);
      else if (["comment", "c", "ci", "comment_italic"].includes(name) && value)
        blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(value)] });
      else if (name === "soc" || name === "start_of_chorus")
        blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(value || "Chorus")] });
      else if (name === "sov" || name === "start_of_verse")
        blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(value || "Verse")] });
      else if (name === "sob" || name === "start_of_bridge")
        blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(value || "Bridge")] });
      continue;
    }

    if (!line.trim()) {
      blocks.push({ type: "paragraph" });
      continue;
    }
    const labelled = LABELLED_CHORDS_RE.exec(line);
    if (labelled && isChordLine(labelled[2]!) && !isChordLine(labelled[1]!)) {
      blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(sectionLabel(labelled[1]!))] });
      blocks.push(chordOnlyLine(labelled[2]!, ctx));
      continue;
    }
    if (isSectionLine(line)) {
      blocks.push({ type: "heading", attrs: { level: 3 }, content: [text(sectionLabel(line))] });
      continue;
    }
    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !isSectionLine(next) && !next.includes("[")) {
        blocks.push(mergeChordLine(line, next, ctx));
        i++;
      } else {
        blocks.push(chordOnlyLine(line, ctx));
      }
      continue;
    }
    blocks.push(line.includes("[") ? chordProLine(line, ctx) : paragraph([text(line)]));
  }

  // Collapse runs of blank paragraphs and trim the ends.
  const cleaned: DocNode[] = [];
  for (const block of blocks) {
    const blank = block.type === "paragraph" && !block.content;
    const prevBlank = cleaned.length > 0 && cleaned[cleaned.length - 1]!.type === "paragraph" && !cleaned[cleaned.length - 1]!.content;
    if (blank && (prevBlank || cleaned.length === 0)) continue;
    cleaned.push(block);
  }
  while (cleaned.length && cleaned[cleaned.length - 1]!.type === "paragraph" && !cleaned[cleaned.length - 1]!.content) cleaned.pop();
  result.doc.content = cleaned.length ? cleaned : [{ type: "paragraph" }];
  return result;
}
