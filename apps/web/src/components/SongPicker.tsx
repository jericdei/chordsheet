"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Search, SquareDashed } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { NewSongModal } from "./NewSongModal";
import { Input, KeyBadge, Modal, Spinner } from "./ui";

export function SongPicker({
  title = "Choose a song",
  onClose,
  onPick,
  allowEmpty,
}: {
  title?: string;
  onClose: () => void;
  /** `null` means "empty slot". */
  onPick: (songId: string | null) => void;
  allowEmpty?: boolean;
}) {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);
  const songs = useQuery({ ...trpc.song.list.queryOptions({ search: deferred || undefined }), placeholderData: (p) => p });

  if (creating) {
    return <NewSongModal open initialTitle={search.trim()} onClose={() => setCreating(false)} onCreated={(song) => onPick(song.id)} />;
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your songs…"
          className="pl-9"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && songs.data?.[0]) onPick(songs.data[0].id);
          }}
        />
      </div>
      <div className="-mx-2 mt-3 max-h-[50vh] overflow-y-auto">
        {songs.isLoading && (
          <div className="flex justify-center py-6 text-slate-400">
            <Spinner />
          </div>
        )}
        {songs.data?.map((song) => (
          <button
            key={song.id}
            type="button"
            onClick={() => onPick(song.id)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
          >
            <KeyBadge musicKey={song.key} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{song.title}</span>
              {song.artist && <span className="block truncate text-xs text-slate-500">{song.artist}</span>}
            </span>
          </button>
        ))}
        {songs.data?.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">{deferred ? `No songs match “${deferred}”.` : "Your song library is empty."}</p>}
      </div>
      <div className="-mx-2 mt-2 space-y-1 border-t border-slate-100 pt-2">
        <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50">
          <Plus className="h-4 w-4" /> {deferred ? `Create new song “${deferred}”` : "Create a new song"}
        </button>
        {allowEmpty && (
          <button type="button" onClick={() => onPick(null)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
            <SquareDashed className="h-4 w-4" /> Add an empty slot (pick the song later)
          </button>
        )}
      </div>
    </Modal>
  );
}
