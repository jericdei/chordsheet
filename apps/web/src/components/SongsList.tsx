"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Music, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { NewSongModal } from "./NewSongModal";
import { Button, EmptyState, Input, KeyBadge, LoadingBlock, PageHeader } from "./ui";

export function SongsList() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);
  const songs = useQuery({ ...trpc.song.list.queryOptions({ search: deferred || undefined }), placeholderData: (prev) => prev });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.song.pathKey() });
  const duplicate = useMutation(trpc.song.duplicate.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.song.delete.mutationOptions({ onSuccess: invalidate }));

  return (
    <>
      <PageHeader
        title="Songs"
        description="Your library of lyrics and chord charts."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New song
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or artist…" className="pl-9" />
      </div>

      {songs.isLoading ? (
        <LoadingBlock />
      ) : !songs.data?.length ? (
        deferred ? (
          <p className="py-10 text-center text-sm text-slate-500">No songs match “{deferred}”.</p>
        ) : (
          <EmptyState
            icon={<Music className="h-6 w-6" />}
            title="No songs yet"
            description="Create a song, type or paste the lyrics, then click on any syllable to drop a chord on it."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Create your first song
              </Button>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200">
          {songs.data.map((song) => (
            <li key={song.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <KeyBadge musicKey={song.key} />
              <Link href={`/songs/${song.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium">{song.title}</div>
                <div className="truncate text-sm text-slate-500">{song.artist || "—"}</div>
              </Link>
              <span className="hidden text-xs text-slate-400 sm:block">
                {new Date(song.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <div className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate.mutate({ id: song.id })}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Delete"
                  onClick={() => confirm(`Delete "${song.title}"?`) && remove.mutate({ id: song.id })}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewSongModal open={creating} onClose={() => setCreating(false)} onCreated={(song) => router.push(`/songs/${song.id}`)} />
    </>
  );
}
