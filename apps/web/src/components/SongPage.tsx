"use client";

import { importText, keyPrefersFlats, semitonesBetween, transposeKey, type DocNode } from "@chordsheet/music";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CloudOff, FileDown, FileText, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { KeySelect } from "./KeySelect";
import { SongEditor, type SongEditorHandle } from "./editor/SongEditor";
import { Button, Field, Input, LoadingBlock, Modal, Select, Spinner, Textarea, cn, errorMessage } from "./ui";

interface Meta {
  title: string;
  artist: string;
  key: string;
  tempo: string;
  timeSignature: string;
}

type SaveStatus = "saved" | "dirty" | "saving" | "error";

const TIME_SIGNATURES = ["", "4/4", "3/4", "6/8", "2/4", "12/8", "2/2", "5/4", "7/8"];

export function SongPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery(trpc.song.byId.queryOptions({ id }));

  const editorRef = useRef<SongEditorHandle>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [initialContent, setInitialContent] = useState<DocNode | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<{ from: string; to: string } | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const metaRef = useRef<Meta | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const knownUpdatedAt = useRef<number>(0);
  metaRef.current = meta;

  const applyServer = useCallback((data: NonNullable<typeof query.data>) => {
    const m: Meta = {
      title: data.title,
      artist: data.artist ?? "",
      key: data.key,
      tempo: data.tempo ? String(data.tempo) : "",
      timeSignature: data.timeSignature ?? "",
    };
    setMeta(m);
    metaRef.current = m;
    knownUpdatedAt.current = new Date(data.updatedAt).getTime();
  }, []);

  // First load, and later remote updates from other devices/tabs.
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const updatedAt = new Date(data.updatedAt).getTime();
    if (!initialContent) {
      applyServer(data);
      setInitialContent(data.content);
      return;
    }
    if (updatedAt <= knownUpdatedAt.current) return;
    if (dirtyRef.current || savingRef.current) {
      setRemoteChanged(true);
      return;
    }
    applyServer(data);
    editorRef.current?.setContent(data.content);
  }, [query.data, initialContent, applyServer]);

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current || !metaRef.current || !editorRef.current) return;
    const m = metaRef.current;
    if (!m.title.trim()) {
      setStatus("error");
      setSaveError("Title is required");
      return;
    }
    dirtyRef.current = false;
    setStatus("saving");
    const run = (async () => {
      try {
        const tempo = parseInt(m.tempo, 10);
        const result = await trpcClient.song.update.mutate({
          id,
          title: m.title,
          artist: m.artist || null,
          key: m.key,
          tempo: Number.isFinite(tempo) && tempo >= 20 && tempo <= 400 ? tempo : null,
          timeSignature: m.timeSignature || null,
          content: editorRef.current!.getJSON(),
        });
        knownUpdatedAt.current = new Date(result.updatedAt).getTime();
        setSaveError(null);
        setStatus(dirtyRef.current ? "dirty" : "saved");
        void queryClient.invalidateQueries({ queryKey: trpc.song.list.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.setlist.pathKey() });
      } catch (err) {
        dirtyRef.current = true;
        setStatus("error");
        setSaveError(errorMessage(err));
      }
    })();
    savingRef.current = run;
    await run;
    savingRef.current = null;
    if (dirtyRef.current) timerRef.current = setTimeout(() => void save(), 1500);
  }, [id, trpcClient, queryClient, trpc]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus("dirty");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), 800);
  }, [save]);

  const updateMeta = (patch: Partial<Meta>) => {
    setMeta((m) => {
      const next = { ...m!, ...patch };
      metaRef.current = next;
      return next;
    });
    markDirty();
  };

  // Flush on unmount and warn before closing with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        void save();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirtyRef.current) void save();
    };
  }, [save]);

  const transposeBy = (semitones: number, toKey?: string) => {
    if (!meta) return;
    const newKey = toKey ?? transposeKey(meta.key, semitones);
    editorRef.current?.transpose(semitones, keyPrefersFlats(newKey));
    updateMeta({ key: newKey });
  };

  const onKeyChange = (newKey: string) => {
    if (!meta || newKey === meta.key) return;
    if ((editorRef.current?.chordCount() ?? 0) > 0) setPendingKey({ from: meta.key, to: newKey });
    else updateMeta({ key: newKey });
  };

  const exportPdf = async () => {
    const win = window.open("", "_blank");
    await save();
    const url = `/api/songs/${id}/pdf`;
    if (win) win.location.href = url;
    else window.location.href = url;
  };

  const deleteSong = async () => {
    if (!confirm(`Delete "${meta?.title}"? It will also be removed from any setlists.`)) return;
    dirtyRef.current = false;
    clearTimeout(timerRef.current);
    await trpcClient.song.delete.mutate({ id });
    void queryClient.invalidateQueries({ queryKey: trpc.song.pathKey() });
    router.push("/songs");
  };

  if (query.error) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-600">{errorMessage(query.error)}</p>
        <Link href="/songs" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to songs
        </Link>
      </div>
    );
  }
  if (!meta || !initialContent) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/songs" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Songs
        </Link>
        <div className="flex items-center gap-2">
          <SaveIndicator status={status} error={saveError} />
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <FileText className="h-4 w-4" /> Import text
          </Button>
          <Button size="sm" onClick={exportPdf}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button size="icon" variant="ghost" onClick={deleteSong} title="Delete song" aria-label="Delete song">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {remoteChanged && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <RefreshCw className="h-4 w-4" />
          This song was changed on another device while you were editing.
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (!query.data) return;
                dirtyRef.current = false;
                clearTimeout(timerRef.current);
                applyServer(query.data);
                editorRef.current?.setContent(query.data.content);
                setStatus("saved");
                setRemoteChanged(false);
              }}
            >
              Load latest
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setRemoteChanged(false);
                knownUpdatedAt.current = Date.now();
                markDirty();
              }}
            >
              Keep mine
            </Button>
          </div>
        </div>
      )}

      <input
        value={meta.title}
        onChange={(e) => updateMeta({ title: e.target.value })}
        placeholder="Song title"
        aria-label="Song title"
        className="w-full bg-transparent text-3xl font-bold tracking-tight placeholder:text-slate-300 focus:outline-none"
      />
      <input
        value={meta.artist}
        onChange={(e) => updateMeta({ artist: e.target.value })}
        placeholder="Artist / composer"
        aria-label="Artist"
        className="mt-1 w-full bg-transparent text-base text-slate-500 placeholder:text-slate-300 focus:outline-none"
      />

      <div className="mt-5 mb-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">Key</span>
          <KeySelect value={meta.key} onChange={onKeyChange} className="h-9 w-24 font-semibold" />
        </label>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">Transpose</span>
          <div className="flex h-9 items-center rounded-lg bg-surface shadow-sm ring-1 ring-slate-200">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-l-lg hover:bg-slate-50" title="Down a semitone" onClick={() => transposeBy(-1)}>
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-px self-stretch bg-slate-200" />
            <button type="button" className="grid h-9 w-9 place-items-center rounded-r-lg hover:bg-slate-50" title="Up a semitone" onClick={() => transposeBy(1)}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">Tempo (BPM)</span>
          <Input
            inputMode="numeric"
            value={meta.tempo}
            onChange={(e) => updateMeta({ tempo: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            className="h-9 w-24"
            placeholder="—"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">Time</span>
          <Select value={meta.timeSignature} onChange={(e) => updateMeta({ timeSignature: e.target.value })} className="h-9 w-24">
            {TIME_SIGNATURES.map((t) => (
              <option key={t} value={t}>
                {t || "—"}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {pendingKey && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-200">
          <span>
            Changing key from <b>{pendingKey.from}</b> to <b>{pendingKey.to}</b>. Move the existing chords too?
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPendingKey(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                updateMeta({ key: pendingKey.to });
                setPendingKey(null);
              }}
            >
              Just change key
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                transposeBy(semitonesBetween(pendingKey.from, pendingKey.to), pendingKey.to);
                setPendingKey(null);
              }}
            >
              Transpose chords
            </Button>
          </div>
        </div>
      )}

      <SongEditor ref={editorRef} initialContent={initialContent} musicKey={meta.key} onChange={markDirty} />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(text, replace) => {
          const result = importText(text);
          const editor = editorRef.current;
          if (!editor) return;
          const current = editor.getJSON();
          const doc: DocNode = replace
            ? result.doc
            : { type: "doc", content: [...(current.content ?? []), { type: "paragraph" }, ...(result.doc.content ?? [])] };
          editor.setContent(doc);
          const patch: Partial<Meta> = {};
          if (result.title && (!meta.title.trim() || meta.title === "Untitled song")) patch.title = result.title;
          if (result.artist && !meta.artist) patch.artist = result.artist;
          if (result.key) patch.key = result.key;
          updateMeta(patch);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  return (
    <span className={cn("mr-1 flex items-center gap-1.5 text-xs", status === "error" ? "text-red-600" : "text-slate-400")} title={error ?? undefined}>
      {status === "saving" && (
        <>
          <Spinner className="h-3 w-3" /> Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5" /> Saved
        </>
      )}
      {status === "dirty" && "Unsaved changes"}
      {status === "error" && (
        <>
          <CloudOff className="h-3.5 w-3.5" /> {error ?? "Save failed"}
        </>
      )}
    </span>
  );
}

const SAMPLE = `Verse 1
G           C          G
Amazing grace, how sweet the sound
G                    D
That saved a wretch like me

or ChordPro:  [G]Amazing [C]grace, how [G]sweet the sound`;

export function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string, replace: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(true);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import lyrics & chords"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => onImport(text, replace)}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Paste a chord sheet. Chords written above the lyrics, ChordPro <code className="rounded bg-slate-100 px-1">[G]</code> brackets and section
          names like “Chorus” are recognised automatically.
        </p>
        <Field label="Text">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder={SAMPLE} className="font-mono text-[13px]" autoFocus />
        </Field>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={replace} onChange={() => setReplace(true)} /> Replace current content
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!replace} onChange={() => setReplace(false)} /> Append to the end
          </label>
        </div>
      </div>
    </Modal>
  );
}
