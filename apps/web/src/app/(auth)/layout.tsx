import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect("/setlists");
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-slate-200">{children}</div>
    </main>
  );
}
