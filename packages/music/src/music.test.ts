import { describe, expect, test } from "bun:test";
import {
  chordsForKey,
  docToBlocks,
  chordLineNode,
  collectChords,
  stripChords,
  importText,
  isBassOnlyChord,
  resolveBassChord,
  isChordLine,
  lineToColumns,
  parseChord,
  scaleNotes,
  semitonesBetween,
  transposeChord,
  transposeDoc,
  transposeKey,
} from "./index";

describe("theory", () => {
  test("parses chords", () => {
    expect(parseChord("G")).toEqual({ root: "G", quality: "", bass: undefined });
    expect(parseChord("F#m7b5")).toEqual({ root: "F#", quality: "m7b5", bass: undefined });
    expect(parseChord("D/F#")).toEqual({ root: "D", quality: "", bass: "F#" });
    expect(parseChord("Csus4")?.quality).toBe("sus4");
    expect(parseChord("Chorus")).toBeNull();
    expect(parseChord("Amazing")).toBeNull();
  });

  test("spells scales correctly", () => {
    expect(scaleNotes("G")).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(scaleNotes("F")).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(scaleNotes("Em")).toEqual(["E", "F#", "G", "A", "B", "C", "D"]);
    expect(scaleNotes("F#")).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
  });

  test("diatonic chords", () => {
    const diatonic = chordsForKey("D").filter((c) => c.group === "diatonic").map((c) => c.chord);
    expect(diatonic).toEqual(["D", "Em", "F#m", "G", "A", "Bm", "C#dim"]);
    const common = chordsForKey("G").filter((c) => c.group === "common").map((c) => c.chord);
    expect(common).toContain("D/F#");
    expect(common).toContain("F");
  });

  test("transposes", () => {
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("D/F#", 2)).toBe("E/G#");
    expect(transposeChord("C", -2, true)).toBe("Bb");
    expect(transposeKey("G", 3)).toBe("Bb");
    expect(transposeKey("Em", 2)).toBe("F#m");
    expect(semitonesBetween("G", "A")).toBe(2);
    expect(semitonesBetween("C", "A")).toBe(-3);
  });
});

describe("documents", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Verse 1" }] },
      {
        type: "paragraph",
        content: [
          { type: "chord", attrs: { chord: "G" } },
          { type: "text", text: "Amazing " },
          { type: "chord", attrs: { chord: "C" } },
          { type: "text", text: "grace" },
        ],
      },
    ],
  };

  test("transposeDoc", () => {
    const blocks = docToBlocks(transposeDoc(doc, 2));
    const line = blocks[1]!;
    expect(line.type).toBe("line");
    if (line.type === "line") {
      expect(line.tokens.filter((t) => t.kind === "chord").map((t) => (t as { chord: string }).chord)).toEqual(["A", "D"]);
    }
  });

  test("lineToColumns splits words and mid-word chords", () => {
    const cols = lineToColumns([
      { kind: "text", text: "Glo" },
      { kind: "chord", chord: "D" },
      { kind: "text", text: "ria in ex" },
    ]);
    expect(cols.map((c) => [c.chord ?? "", c.runs.map((r) => r.text).join(""), c.spaceAfter])).toEqual([
      ["", "Glo", false],
      ["D", "ria", true],
      ["", "in", true],
      ["", "ex", false],
    ]);
  });
});

describe("import", () => {
  test("chords over lyrics", () => {
    const { doc } = importText("Verse 1\nG       C         G\nAmazing grace how sweet");
    expect(doc.content![0]!.type).toBe("heading");
    const p = doc.content![1]!;
    expect(p.content!.map((n) => n.type === "chord" ? `[${n.attrs!.chord}]` : n.text).join("")).toBe(
      "[G]Amazing [C]grace how [G]sweet",
    );
  });

  test("chordpro", () => {
    const res = importText("{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace\n[Chorus]");
    expect(res.title).toBe("Amazing Grace");
    expect(res.key).toBe("G");
    expect(res.doc.content![0]!.content!.filter((n) => n.type === "chord")).toHaveLength(2);
    expect(res.doc.content![1]!.type).toBe("heading");
  });

  test("detects chord lines", () => {
    expect(isChordLine("G   D/F#  Em7  | C")).toBe(true);
    expect(isChordLine("A man walked")).toBe(false);
  });

  const lineText = (n: { content?: Array<{ type: string; text?: string; attrs?: Record<string, unknown> }> }) =>
    (n.content ?? []).map((c) => (c.type === "chord" ? `[${c.attrs!.chord}]` : c.text)).join("");

  test("chord-only lines become dashed chord lines", () => {
    const { doc } = importText("G   D   Em   C\n\nG - D | Em x2");
    expect(doc.content![0]!.type).toBe("chordLine");
    expect(lineText(doc.content![0]!)).toBe("[G] - [D] - [Em] - [C]");
    expect(lineText(doc.content![2]!)).toBe("[G] - [D] | [Em] x2");
  });

  test("labelled intro line", () => {
    const { doc } = importText("Intro: G D/F# Em C\nVerse 1\nG\nHello");
    expect(doc.content![0]).toEqual({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Intro" }] });
    expect(lineText(doc.content![1]!)).toBe("[G] - [D/F#] - [Em] - [C]");
    expect(doc.content![2]!.type).toBe("heading");
  });

  test("chordpro chord-only line", () => {
    const { doc } = importText("[G] [D] [Em]");
    expect(doc.content![0]!.type).toBe("chordLine");
    expect(lineText(doc.content![0]!)).toBe("[G] - [D] - [Em]");
  });

  test("chord lines survive layout and transposition", () => {
    const { doc } = importText("Intro: G D");
    const blocks = docToBlocks(transposeDoc(doc, 2));
    expect(blocks[1]).toEqual({
      type: "chords",
      tokens: [{ kind: "chord", chord: "A" }, { kind: "text", text: " - " }, { kind: "chord", chord: "E" }],
    });
  });

  test("chord line tidying", () => {
    const c = (x: string) => ({ type: "chord", attrs: { chord: x } });
    const t = (x: string) => ({ type: "text", text: x });
    expect(lineText(chordLineNode([c("G"), t(" -"), c("Am"), t("  "), c("D")]))).toBe("[G] - [Am] - [D]");
    expect(lineText(chordLineNode([t("- "), c("G"), t(" - "), t(" - "), c("D"), t(" - ")]))).toBe("[G] - [D]");
    expect(lineText(chordLineNode([t("| "), c("G"), t(" | "), c("D"), t(" | x2")]))).toBe("| [G] | [D] | x2");
  });

  test("stripChords for lyrics-only copies", () => {
    const { doc } = importText("Intro: G D Em C\n\nVerse 1\n[G]Glo[D]ria in [C]excelsis\n\nChorus\n[G]Amen");
    const lyrics = stripChords(doc);
    expect(lyrics.content!.map((n) => n.type)).toEqual(["heading", "paragraph", "paragraph", "heading", "paragraph"]);
    expect(lyrics.content![1]!.content).toEqual([{ type: "text", text: "Gloria in excelsis" }]);
    expect(collectChords(lyrics)).toEqual([]);
  });

  const allLines = (doc: { content?: Array<{ content?: Array<{ type: string; text?: string; attrs?: Record<string, unknown> }> }> }) =>
    (doc.content ?? []).map((b) => lineText(b));

  test("bass-only slash chords use the previous chord", () => {
    const { doc } = importText("     C   G/B     Am        /G\nAma namin  sumasalangit Ka\n   Dm    /C  Gsus4\nSa aming mga sala");
    expect(allLines(doc)).toEqual(["Ama n[C]amin[G/B]  sumasa[Am]langit Ka [Am/G]", "Sa [Dm]aming [Dm/C]mga [Gsus4]sala"]);
  });

  test("bass-only chords carry over from the previous line", () => {
    const { doc } = importText("Am\nOne\n/G\nTwo");
    expect(allLines(doc)).toEqual(["[Am]One", "[Am/G]Two"]);
  });

  test("dash-joined chords on one held note", () => {
    const { doc } = importText("G/F  C/G    Gsus-G7   C\nSa lahat ng ma-----sama.");
    expect(allLines(doc)).toEqual(["[G/F]Sa la[C/G]hat ng [Gsus]ma---[G7]--sam[C]a."]);
  });

  test("intro line and odd chord shapes", () => {
    const { doc } = importText("Intro: C/G - Dm - G - C\n\nC6/9  Ddim/Ab  (G)\nHello there     world");
    expect(allLines(doc)).toEqual(["Intro", "[C/G] - [Dm] - [G] - [C]", "", "[C6/9]Hello [Ddim/Ab]there     [G]world"]);
  });

  test("[/G] in ChordPro", () => {
    const { doc } = importText("[C]Hello [/B]there");
    expect(allLines(doc)).toEqual(["[C]Hello [C/B]there"]);
  });
});

describe("bass-only resolution", () => {
  test("resolveBassChord", () => {
    expect(resolveBassChord("/G", "Am7")).toBe("Am7/G");
    expect(resolveBassChord("/E", "C/G")).toBe("C/E");
    expect(resolveBassChord("/G", undefined)).toBe("/G");
    expect(resolveBassChord("D", "C")).toBe("D");
    expect(isBassOnlyChord("/F#")).toBe(true);
    expect(transposeChord("C6/9", 2)).toBe("D6/9");
  });
});
