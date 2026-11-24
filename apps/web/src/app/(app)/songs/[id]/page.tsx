import { SongPage } from "@/components/SongPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongPage key={id} id={id} />;
}
