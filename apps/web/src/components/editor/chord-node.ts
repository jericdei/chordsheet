import { mergeAttributes, Node } from "@tiptap/core";

/**
 * An inline, zero-width atom anchored before the syllable it belongs to.
 * The chord name (`.chord-label`) is positioned above the line with CSS.
 */
export const ChordNode = Node.create({
  name: "chord",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      chord: {
        default: "C",
        parseHTML: (el) => el.getAttribute("data-chord"),
        renderHTML: (attrs) => ({ "data-chord": attrs.chord }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-chord]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "chord" }),
      ["span", { class: "chord-label", contenteditable: "false" }, String(HTMLAttributes["data-chord"] ?? "")],
    ];
  },

  renderText({ node }) {
    return `[${node.attrs.chord}]`;
  },
});

/**
 * A line of chords only — intros, instrumentals, turnarounds. Chords render inline
 * ("G - D - Em - C") instead of above the text; separators are plain, editable text.
 */
export const ChordLine = Node.create({
  name: "chordLine",
  group: "block",
  content: "(text | chord)*",
  marks: "",
  defining: true,

  parseHTML() {
    return [{ tag: "p[data-chord-line]", priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-chord-line": "", class: "chord-line" }), 0];
  },
});
