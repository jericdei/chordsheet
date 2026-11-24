import { loadSongForExport } from "@chordsheet/api";
import { notFound, redirect } from "next/navigation";
import { PrintSheet } from "@/components/print/PrintSheet";
import { parsePrintOptions } from "@/lib/print-options";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const key = typeof query.key === "string" ? query.key : null;
  const song = await loadSongForExport(user.id, id, key);
  if (!song) notFound();
  return <PrintSheet setlist={song} options={parsePrintOptions(query, { cover: false })} />;
}
