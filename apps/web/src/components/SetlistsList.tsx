"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, LayoutTemplate, ListMusic, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatDate, fromDateInput } from "@/lib/dates";
import { useTRPC } from "@/lib/trpc";
import { Button, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, errorMessage } from "./ui";

export function SetlistsList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const setlists = useQuery(trpc.setlist.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.setlist.list.queryKey() });
  const duplicate = useMutation(trpc.setlist.duplicate.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.setlist.delete.mutationOptions({ onSuccess: invalidate }));

  return (
    <>
      <PageHeader
        title="Setlists"
        description="Plan the music for each service or gig."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New setlist
          </Button>
        }
      />
      {setlists.isLoading ? (
        <LoadingBlock />
      ) : !setlists.data?.length ? (
        <EmptyState
          icon={<ListMusic className="h-6 w-6" />}
          title="No setlists yet"
          description="Start from a template like “Catholic Mass” to get every part of the celebration laid out for you."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create a setlist
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {setlists.data.map((s) => (
            <div key={s.id} className="group relative rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-200">
              <Link href={`/setlists/${s.id}`} className="absolute inset-0 rounded-2xl" aria-label={s.name} />
              <h3 className="pr-16 font-semibold">{s.name}</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                {s.date && (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(s.date)}
                  </div>
                )}
                {s.template && (
                  <div className="flex items-center gap-1.5">
                    <LayoutTemplate className="h-3.5 w-3.5" /> {s.template.name}
                  </div>
                )}
                <div>{s._count.items} {s._count.items === 1 ? "item" : "items"}</div>
              </div>
              <div className="absolute top-3 right-3 z-10 flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate.mutate({ id: s.id })}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Delete" onClick={() => confirm(`Delete "${s.name}"?`) && remove.mutate({ id: s.id })}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <NewSetlistModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewSetlistModal({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const templates = useQuery(trpc.template.list.queryOptions());
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const create = useMutation(trpc.setlist.create.mutationOptions({ onSuccess: (s) => router.push(`/setlists/${s.id}`) }));

  // Default to the first template once loaded.
  const effectiveTemplate = templateId ?? templates.data?.[0]?.id ?? "";
  const selected = templates.data?.find((t) => t.id === effectiveTemplate);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      name: name.trim() || [selected?.name, date].filter(Boolean).join(" – ") || "New setlist",
      date: fromDateInput(date),
      templateId: effectiveTemplate || null,
    });
  };

  return (
    <Modal open onClose={onClose} title="New setlist">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday 9AM Mass" autoFocus />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Template">
          <Select value={effectiveTemplate} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Blank setlist</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slots.length} parts)
              </option>
            ))}
          </Select>
        </Field>
        {selected && selected.slots.length > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-3">
            {selected.slots.map((s, i) => (
              <span key={s.id} className="rounded-md bg-surface px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
        )}
        {create.error && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create setlist
          </Button>
        </div>
      </form>
    </Modal>
  );
}
