"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileJson, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button, PageHeader, Spinner, errorMessage } from "./ui";

interface ParsedBackup {
  fileName: string;
  data: unknown;
  counts: { songs: number; templates: number; setlists: number };
  exportedAt?: string;
}

function parseBackup(fileName: string, text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const b = data as { format?: string; songs?: unknown[]; templates?: unknown[]; setlists?: unknown[]; exportedAt?: string };
  if (b?.format !== "chordsheet-backup") throw new Error("That isn't a Chordsheet backup file.");
  return {
    fileName,
    data,
    exportedAt: b.exportedAt,
    counts: { songs: b.songs?.length ?? 0, templates: b.templates?.length ?? 0, setlists: b.setlists?.length ?? 0 },
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function AccountPage({ email, name }: { email: string; name: string | null }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const restore = useMutation(
    trpc.backup.import.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setParsed(null);
        if (fileRef.current) fileRef.current.value = "";
      },
    }),
  );

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    restore.reset();
    setParsed(null);
    if (!file) return;
    try {
      setParsed(parseBackup(file.name, await file.text()));
    } catch (err) {
      setFileError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account & backup" description={name ? `${name} · ${email}` : email} />

      <section className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="h-4 w-4 text-brand-600" /> Download a backup
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Saves all your songs, setlists and templates to a single file. Use it to keep a copy, or to move everything to another
          Chordsheet account or server.
        </p>
        <a
          href="/api/backup"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-500"
        >
          <Download className="h-4 w-4" /> Download backup
        </a>
      </section>

      <section className="mt-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-2 font-semibold">
          <Upload className="h-4 w-4 text-brand-600" /> Import a backup
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Adds the songs, setlists and templates from a backup file to this account. Nothing here is deleted, and items you already have are skipped, so importing the same file twice is safe.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {fileError && <p className="mt-3 text-sm text-red-600">{fileError}</p>}

        {parsed && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileJson className="h-4 w-4 text-slate-400" /> {parsed.fileName}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {plural(parsed.counts.songs, "song")}, {plural(parsed.counts.setlists, "setlist")}, {plural(parsed.counts.templates, "template")}
              {parsed.exportedAt && <> · saved {new Date(parsed.exportedAt).toLocaleString()}</>}
            </p>
            <Button variant="primary" className="mt-3" disabled={restore.isPending} onClick={() => restore.mutate(parsed.data as never)}>
              {restore.isPending ? <Spinner /> : <Upload className="h-4 w-4" />}
              {restore.isPending ? "Importing…" : "Import into this account"}
            </Button>
          </div>
        )}

        {restore.error && <p className="mt-3 text-sm text-red-600">Import failed: {errorMessage(restore.error)}</p>}
        {restore.data && (
          <div className="mt-4 flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Import complete</p>
              <ul className="mt-1 text-slate-600">
                {(["songs", "setlists", "templates"] as const).map((k) => (
                  <li key={k}>
                    {plural(restore.data[k].created, k.slice(0, -1))} added
                    {restore.data[k].skipped > 0 && <span className="text-slate-400"> · {restore.data[k].skipped} already here</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
