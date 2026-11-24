import { loadSetlistForExport, SESSION_COOKIE } from "@chordsheet/api";
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
  const setlist = await loadSetlistForExport(user.id, id);
  if (!setlist) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const options = parsePrintOptions(url.searchParams);
  const pdf = await renderPdf(req, `/print/setlists/${id}?${printQuery(options)}`, {
    title: setlist.name,
    sessionToken: token,
    continuous: options.layout === "continuous",
  });
  return pdfResponse(pdf, setlist.name, url.searchParams.get("download") === "1");
}
