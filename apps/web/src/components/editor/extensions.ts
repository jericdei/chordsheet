import StarterKit from "@tiptap/starter-kit";
import { ChordLine, ChordNode } from "./chord-node";
import { ChordSpacing } from "./chord-spacing";

/**
 * The document schema and rendering shared by the song editor and the print/PDF view, so a
 * printed sheet is laid out exactly like the editor shows it.
 */
export function songExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [3] },
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      link: false,
      strike: false,
    }),
    ChordNode,
    ChordLine,
    ChordSpacing,
  ];
}
