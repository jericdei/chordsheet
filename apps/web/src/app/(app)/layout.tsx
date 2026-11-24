import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RealtimeProvider } from "@/lib/realtime";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <RealtimeProvider>
      <AppNav user={{ email: user.email, name: user.name }} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </RealtimeProvider>
  );
}
