import { SetlistPage } from "@/components/SetlistPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SetlistPage key={id} id={id} />;
}
