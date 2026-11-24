const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type Letter = (typeof LETTERS)[number];
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Keys in circle-of-fifths order, the way musicians usually pick them. */
export const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"] as const;
export const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"] as const;
export const ALL_KEYS: readonly string[] = [...MAJOR_KEYS, ...MINOR_KEYS];

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"]);

export interface ParsedNote {
  letter: Letter;
  accidental: string;
  pc: number;
}

export interface ParsedKey {
  tonic: ParsedNote;
  minor: boolean;
}

export interface ParsedChord {
  root: string;
  quality: string;
  bass?: string;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function normalizeAccidentals(s: string) {
  return s.replace(/♯/g, "#").replace(/♭/g, "b");
}

export function parseNote(input: string): ParsedNote | null {
  const m = /^([A-Ga-g])(##|bb|#|b)?$/.exec(normalizeAccidentals(input.trim()));
  if (!m) return null;
  const letter = m[1]!.toUpperCase() as Letter;
  const accidental = m[2] ?? "";
  const offset = accidental === "#" ? 1 : accidental === "##" ? 2 : accidental === "b" ? -1 : accidental === "bb" ? -2 : 0;
  return { letter, accidental, pc: mod12(LETTER_PC[letter] + offset) };
}

export function parseKey(key: string): ParsedKey | null {
  const m = /^([A-Ga-g](?:#|b|♯|♭)?)(m|min|minor)?$/.exec(key.trim());
  if (!m) return null;
  const tonic = parseNote(m[1]!);
  if (!tonic) return null;
  return { tonic, minor: Boolean(m[2]) };
}

export function isValidKey(key: string) {
  return parseKey(key) !== null;
}

export function keyPrefersFlats(key: string): boolean {
  const k = parseKey(key);
  if (!k) return false;
  const name = `${k.tonic.letter}${k.tonic.accidental}${k.minor ? "m" : ""}`;
  return FLAT_KEYS.has(name) || k.tonic.accidental.includes("b");
}

export function noteName(pc: number, preferFlats = false) {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]!;
}

// The quality may contain "6/9"; any other slash introduces the bass note.
const CHORD_RE = /^([A-G](?:#|b)?)((?:6\/9|[^/\s])*)(?:\/([A-G](?:#|b)?))?$/;
const QUALITY_RE = /^(?:6\/9|m|min|maj|M|dim|aug|sus|add|no|ø|°|o|\+|-|Δ|\^|\d|#|b|\(|\)|,)*$/;
const BASS_ONLY_RE = /^\/([A-G](?:#|b)?)$/;

export function parseChord(input: string): ParsedChord | null {
  const m = CHORD_RE.exec(normalizeAccidentals(input.trim()));
  if (!m) return null;
  const quality = m[2] ?? "";
  if (!QUALITY_RE.test(quality)) return null;
  return { root: m[1]!, quality, bass: m[3] };
}

export function isValidChord(input: string) {
  return parseChord(input) !== null;
}

/** A bass-only slash chord such as "/G": "keep the previous chord, change the bass". */
export function isBassOnlyChord(input: string) {
  return BASS_ONLY_RE.test(normalizeAccidentals(input.trim()));
}

/**
 * Expand a bass-only slash chord against the chord before it: "/G" after "Am" → "Am/G".
 * Any other chord (or a bass-only one with nothing before it) is returned unchanged.
 */
export function resolveBassChord(input: string, previous: string | undefined): string {
  const m = BASS_ONLY_RE.exec(normalizeAccidentals(input.trim()));
  const prev = previous ? parseChord(previous) : null;
  if (!m || !prev) return input.trim();
  return `${prev.root}${prev.quality}/${m[1]}`;
}

export function transposeNote(note: string, semitones: number, preferFlats = false) {
  const n = parseNote(note);
  if (!n) return note;
  return noteName(n.pc + semitones, preferFlats);
}

export function transposeChord(chord: string, semitones: number, preferFlats = false): string {
  const c = parseChord(chord);
  if (!c) return chord;
  if (mod12(semitones) === 0) return chord;
  const root = transposeNote(c.root, semitones, preferFlats);
  const bass = c.bass ? `/${transposeNote(c.bass, semitones, preferFlats)}` : "";
  return `${root}${c.quality}${bass}`;
}

/** Smallest signed interval (in semitones, -5..6) that moves `from`'s tonic to `to`'s tonic. */
export function semitonesBetween(from: string, to: string): number {
  const a = parseKey(from);
  const b = parseKey(to);
  if (!a || !b) return 0;
  const diff = mod12(b.tonic.pc - a.tonic.pc);
  return diff > 6 ? diff - 12 : diff;
}

/** Transpose a key name, returning the conventional spelling (e.g. "A#" → "Bb"). */
export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key);
  if (!k) return key;
  const pc = mod12(k.tonic.pc + semitones);
  const pool: readonly string[] = k.minor ? MINOR_KEYS : MAJOR_KEYS;
  const found = pool.find((name) => parseKey(name)!.tonic.pc === pc);
  return found ?? `${noteName(pc)}${k.minor ? "m" : ""}`;
}

export function formatKey(key: string) {
  const k = parseKey(key);
  if (!k) return key;
  return `${k.tonic.letter}${k.tonic.accidental}${k.minor ? "m" : ""}`;
}

// ---------------------------------------------------------------------------
// Chord suggestions for a key
// ---------------------------------------------------------------------------

export type ChordGroup = "diatonic" | "seventh" | "common";

export interface ChordOption {
  chord: string;
  numeral: string;
  group: ChordGroup;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

function accidentalFor(offset: number) {
  switch (offset) {
    case -2: return "bb";
    case -1: return "b";
    case 1: return "#";
    case 2: return "##";
    default: return "";
  }
}

/** Spell the note that is `degree` letters above the tonic and `semitones` above it in pitch. */
function spell(key: ParsedKey, degree: number, semitones: number) {
  const tonicIdx = LETTERS.indexOf(key.tonic.letter);
  const letter = LETTERS[(tonicIdx + degree) % 7]!;
  const target = mod12(key.tonic.pc + semitones);
  let offset = mod12(target - LETTER_PC[letter]);
  if (offset > 6) offset -= 12;
  const acc = accidentalFor(offset);
  // Fall back to plain chromatic spelling for exotic double accidentals.
  if (Math.abs(offset) > 1) return noteName(target, keyPrefersFlats(`${key.tonic.letter}${key.tonic.accidental}${key.minor ? "m" : ""}`));
  return `${letter}${acc}`;
}

export function scaleNotes(key: string): string[] {
  const k = parseKey(key);
  if (!k) return [];
  const steps = k.minor ? MINOR_STEPS : MAJOR_STEPS;
  return steps.map((s, i) => spell(k, i, s));
}

export function chordsForKey(key: string): ChordOption[] {
  const k = parseKey(key);
  if (!k) return [];
  const steps = k.minor ? MINOR_STEPS : MAJOR_STEPS;
  const notes = steps.map((s, i) => spell(k, i, s));
  const n = (i: number) => notes[i]!;

  const triadQualities = k.minor ? ["m", "dim", "", "m", "m", "", ""] : ["", "m", "m", "", "", "m", "dim"];
  const triadNumerals = k.minor
    ? ["i", "ii°", "III", "iv", "v", "VI", "VII"]
    : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const seventhQualities = k.minor
    ? ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"]
    : ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
  const seventhNumerals = k.minor
    ? ["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"]
    : ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];

  const options: ChordOption[] = [];
  notes.forEach((root, i) => {
    options.push({ chord: `${root}${triadQualities[i]}`, numeral: triadNumerals[i]!, group: "diatonic" });
  });
  notes.forEach((root, i) => {
    options.push({ chord: `${root}${seventhQualities[i]}`, numeral: seventhNumerals[i]!, group: "seventh" });
  });

  const common: Array<[string, string]> = k.minor
    ? [
        [`${n(4)}`, "V"],
        [`${n(4)}7`, "V7"],
        [`${n(4)}sus4`, "Vsus4"],
        [`${n(3)}`, "IV"],
        [`${n(0)}m/${n(2)}`, "i/♭3"],
        [`${n(6)}/${n(1)}`, "VII/2"],
        [`${n(0)}sus2`, "isus2"],
        [`${spell(k, 1, 1)}`, "♭II"],
      ]
    : [
        [`${n(4)}sus4`, "Vsus4"],
        [`${n(0)}/${n(2)}`, "I/3"],
        [`${n(4)}/${n(6)}`, "V/7"],
        [`${n(1)}`, "II (V/V)"],
        [`${n(2)}`, "III (V/vi)"],
        [`${spell(k, 6, 10)}`, "♭VII"],
        [`${n(3)}m`, "iv"],
        [`${n(0)}sus2`, "Isus2"],
        [`${n(3)}/${n(0)}`, "IV/1"],
        [`${n(0)}7`, "I7 (V/IV)"],
      ];
  for (const [chord, numeral] of common) options.push({ chord, numeral, group: "common" });
  return options;
}
