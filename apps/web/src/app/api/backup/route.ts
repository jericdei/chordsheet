import { buildBackup } from "@chordsheet/api";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download everything in the signed-in account as a JSON backup file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const backup = await buildBackup(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="chordsheet-backup-${stamp}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
