"use client";

import { importText } from "@chordsheet/music";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "@/lib/trpc";
import { KeySelect } from "./KeySelect";
import { Button, Field, Input, Modal, Spinner, Textarea, errorMessage } from "./ui";

export function NewSongModal({
  open,
  onClose,
  onCreated,
  initialTitle = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (song: { id: string; title: string; key: string }) => void;
  initialTitle?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("C");
  const [text, setText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const create = useMutation(
    trpc.song.create.mutationOptions({
      onSuccess: (song) => {
        void queryClient.invalidateQueries({ queryKey: trpc.song.list.queryKey() });
        setTitle("");
        setArtist("");
        setText("");
        onCreated(song);
      },
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const imported = text.trim() ? importText(text) : null;
    create.mutate({
      title: title.trim() || imported?.title || "Untitled song",
      artist: artist.trim() || imported?.artist || null,
      key: imported?.key && key === "C" ? imported.key : key,
      content: imported?.doc,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="New song" wide={showImport}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Glory to God" autoFocus />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Artist / composer">
            <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Key">
            <KeySelect value={key} onChange={setKey} className="w-24 font-semibold" />
          </Field>
        </div>
        {showImport ? (
          <Field label="Paste lyrics / chord sheet" hint="Chords above lyrics, ChordPro [G] brackets and section names are recognised.">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-mono text-[13px]" />
          </Field>
        ) : (
          <button type="button" onClick={() => setShowImport(true)} className="text-sm font-medium text-brand-600 hover:underline">
            + Paste existing lyrics or a chord sheet
          </button>
        )}
        {create.error && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create song
          </Button>
        </div>
      </form>
    </Modal>
  );
}
