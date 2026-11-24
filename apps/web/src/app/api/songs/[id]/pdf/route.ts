import { loadSongForExport, SESSION_COOKIE } from "@chordsheet/api";
import { cookies } from "next/headers";
import { pdfResponse, renderPdf } from "@/lib/pdf";
import { parsePrintOptions, printQuery } from "@/lib/print-options";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!user || !token) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const song = await loadSongForExport(user.id, id, key);
  if (!song) return new Response("Not found", { status: 404 });
  const options = parsePrintOptions(url.searchParams, { cover: false });
  const query = new URLSearchParams(printQuery(options));
  if (key) query.set("key", key);
  const pdf = await renderPdf(req, `/print/songs/${id}?${query}`, {
    title: song.name,
    sessionToken: token,
    continuous: options.layout === "continuous",
  });
  return pdfResponse(pdf, song.name, url.searchParams.get("download") === "1");
}
