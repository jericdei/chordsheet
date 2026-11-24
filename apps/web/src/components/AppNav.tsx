"use client";

import { useMutation } from "@tanstack/react-query";
import { LayoutTemplate, ListMusic, LogOut, Music } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRealtimeStatus } from "@/lib/realtime";
import { useTRPC } from "@/lib/trpc";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button, cn } from "./ui";

const links = [
  { href: "/setlists", label: "Setlists", icon: ListMusic },
  { href: "/songs", label: "Songs", icon: Music },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
];

function LiveIndicator() {
  const status = useRealtimeStatus();
  if (status === "disabled") return null;
  const label = { connecting: "Connecting…", online: "Live sync on", offline: "Reconnecting…", disabled: "" }[status];
  return (
    <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex" title={label}>
      <span className={cn("h-2 w-2 rounded-full", status === "online" ? "bg-emerald-500" : "animate-pulse bg-amber-400")} />
      {status === "online" ? "Live" : label}
    </span>
  );
}

export function AppNav({ user }: { user: { email: string; name: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        router.replace("/login");
        router.refresh();
      },
    }),
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/setlists">
          <Logo />
        </Link>
        <nav className="ml-2 flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <LiveIndicator />
          <ThemeToggle className="hidden sm:flex" />
          <Link
            href="/account"
            title="Account & backup"
            className={cn(
              "hidden max-w-48 truncate rounded-lg px-2 py-1 text-sm md:block",
              pathname.startsWith("/account") ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            {user.name || user.email}
          </Link>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending} title="Sign out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
