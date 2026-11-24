import "server-only";
import { SESSION_COOKIE } from "@chordsheet/api";
import { chromium, type Browser } from "playwright-core";

/**
 * PDFs are printed by headless Chromium from the /print pages, which render songs with the
 * same Tiptap extensions and CSS as the editor — so the PDF matches what you see.
 */

/** Printable width for US Letter with 0.65in side margins, in CSS px (96/in). */
const CONTENT_WIDTH_PX = Math.round((8.5 - 1.3) * 96);

let browserPromise: Promise<Browser> | null = null;

function getBrowser() {
  if (!browserPromise) {
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    browserPromise = chromium
      .launch({
        executablePath,
        // Without an explicit binary (local dev), use the installed Google Chrome.
        channel: executablePath ? undefined : "chrome",
        headless: true,
        chromiumSandbox: false,
        args: ["--disable-dev-shm-usage", "--font-render-hinting=none"],
      })
      .then((browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/** Base URL the server can reach itself on. */
function internalBaseUrl(req: Request) {
  if (process.env.INTERNAL_APP_URL) return process.env.INTERNAL_APP_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return new URL(req.url).origin;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Tallest page PDF viewers reliably support (the spec's 200in / 14,400pt limit), in CSS px. */
const MAX_PAGE_HEIGHT_PX = 200 * 96;
const MARGIN_PX = { top: 0.6 * 96, bottom: 0.7 * 96 };

export async function renderPdf(
  req: Request,
  path: string,
  opts: { title: string; sessionToken: string; continuous?: boolean },
) {
  const base = internalBaseUrl(req);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: CONTENT_WIDTH_PX, height: 1000 },
    colorScheme: "light",
  });
  try {
    await context.addCookies([{ name: SESSION_COOKIE, value: opts.sessionToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`Print page responded ${response?.status()}`);
    await page.waitForFunction(() => document.documentElement.dataset.printReady === "true", null, { timeout: 20_000 });
    if (opts.continuous) {
      // One page exactly as tall as the content, so a tablet can scroll straight through.
      // Very long setlists continue onto another (equally tall) page past the 200in limit.
      const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const height = Math.min(contentHeight + MARGIN_PX.top + MARGIN_PX.bottom + 8, MAX_PAGE_HEIGHT_PX);
      return await page.pdf({
        width: "8.5in",
        height: `${height}px`,
        printBackground: true,
        margin: { top: "0.6in", bottom: "0.7in", left: "0.65in", right: "0.65in" },
      });
    }
    return await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.7in", left: "0.65in", right: "0.65in" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;padding:0 0.65in;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#94a3b8"><span>${escapeHtml(opts.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await context.close();
  }
}

export function pdfResponse(pdf: Uint8Array, name: string, download: boolean) {
  const filename = `${(name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "setlist").slice(0, 80)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
