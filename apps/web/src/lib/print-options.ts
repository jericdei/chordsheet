export type PrintLayout = "pages" | "continuous";

export interface PrintOptions {
  /** "pages": printable Letter pages. "continuous": one tall page to scroll on a tablet. */
  layout: PrintLayout;
  chords: boolean;
  size: "s" | "m" | "l";
  breaks: boolean;
  cover: boolean;
}

export const SHEET_FONT_SIZE: Record<PrintOptions["size"], string> = { s: "13px", m: "15px", l: "17.5px" };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export function parsePrintOptions(params: Params, defaults: Partial<PrintOptions> = {}): PrintOptions {
  const get = (name: string) => {
    if (params instanceof URLSearchParams) return params.get(name);
    const v = params[name];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  const flag = (name: string, fallback: boolean) => {
    const v = get(name);
    return v === null ? fallback : v === "1";
  };
  const size = get("size");
  return {
    layout: get("layout") === "continuous" ? "continuous" : (defaults.layout ?? "pages"),
    chords: flag("chords", defaults.chords ?? true),
    breaks: flag("breaks", defaults.breaks ?? true),
    cover: flag("cover", defaults.cover ?? true),
    size: size === "s" || size === "l" ? size : "m",
  };
}

export function printQuery(options: PrintOptions) {
  return new URLSearchParams({
    layout: options.layout,
    chords: options.chords ? "1" : "0",
    size: options.size,
    breaks: options.breaks ? "1" : "0",
    cover: options.cover ? "1" : "0",
  }).toString();
}
