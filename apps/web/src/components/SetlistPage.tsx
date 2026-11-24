"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, FileDown, FileText, Tablet, GripVertical, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fromDateInput, toDateInput } from "@/lib/dates";
import { useTRPC } from "@/lib/trpc";
import { KeySelect } from "./KeySelect";
import { SongPicker } from "./SongPicker";
import { Button, EmptyState, Field, Input, LoadingBlock, Modal, cn, errorMessage } from "./ui";

type SetlistData = NonNullable<ReturnType<typeof useSetlist>["data"]>;
type Item = SetlistData["items"][number];

function useSetlist(id: string) {
  const trpc = useTRPC();
  return useQuery(trpc.setlist.byId.queryOptions({ id }));
}

export function SetlistPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setlist = useSetlist(id);
  const [order, setOrder] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ itemId?: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.setlist.pathKey() });
  const update = useMutation(trpc.setlist.update.mutationOptions({ onSuccess: invalidate }));
  const addItem = useMutation(trpc.setlist.addItem.mutationOptions({ onSuccess: invalidate }));
  const updateItem = useMutation(trpc.setlist.updateItem.mutationOptions({ onSuccess: invalidate }));
  const removeItem = useMutation(trpc.setlist.removeItem.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.setlist.reorder.mutationOptions({ onSettled: invalidate }));
  const duplicate = useMutation(trpc.setlist.duplicate.mutationOptions({ onSuccess: (s) => router.push(`/setlists/${s.id}`) }));
  const remove = useMutation(
    trpc.setlist.delete.mutationOptions({
      onSuccess: () => {
        void invalidate();
        router.push("/setlists");
      },
    }),
  );

  useEffect(() => {
    if (setlist.data && !reorder.isPending) setOrder(setlist.data.items.map((i) => i.id));
  }, [setlist.data, reorder.isPending]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (setlist.error) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-600">{errorMessage(setlist.error)}</p>
        <Link href="/setlists" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to setlists
        </Link>
      </div>
    );
  }
  if (!setlist.data) return <LoadingBlock />;
  const data = setlist.data;
  const itemsById = new Map(data.items.map((i) => [i.id, i]));
  const items = order.map((itemId) => itemsById.get(itemId)).filter((i): i is Item => Boolean(i));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    reorder.mutate({ setlistId: id, itemIds: next });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/setlists" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Setlists
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="primary" onClick={() => setExportOpen(true)}>
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
          <Button size="sm" onClick={() => setTemplateOpen(true)} title="Save these sections as a reusable template">
            <LayoutTemplate className="h-4 w-4" /> Save as template
          </Button>
          <Button size="icon" variant="ghost" title="Duplicate setlist" onClick={() => duplicate.mutate({ id })}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Delete setlist" onClick={() => confirm(`Delete "${data.name}"?`) && remove.mutate({ id })}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      <InlineInput
        value={data.name}
        onSave={(name) => name.trim() && update.mutate({ id, name })}
        className="w-full bg-transparent text-3xl font-bold tracking-tight focus:outline-none"
        ariaLabel="Setlist name"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <Input
          type="date"
          value={toDateInput(data.date)}
          onChange={(e) => update.mutate({ id, date: fromDateInput(e.target.value) })}
          className="h-8 w-auto"
          aria-label="Date"
        />
        {data.template && (
          <span className="flex items-center gap-1.5">
            <LayoutTemplate className="h-4 w-4" /> From “{data.template.name}”
          </span>
        )}
      </div>
      <InlineTextarea
        value={data.notes ?? ""}
        onSave={(notes) => update.mutate({ id, notes: notes || null })}
        placeholder="Notes for the band (optional)…"
      />

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="This setlist is empty"
            description="Add songs from your library, or empty slots you can fill later."
            action={
              <Button variant="primary" onClick={() => setPicker({})}>
                <Plus className="h-4 w-4" /> Add a song
              </Button>
            }
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {items.map((item, index) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    index={index}
                    onLabel={(label) => updateItem.mutate({ id: item.id, label: label || null })}
                    onKey={(key) => updateItem.mutate({ id: item.id, key: key || null })}
                    onChooseSong={() => setPicker({ itemId: item.id })}
                    onClearSong={() => updateItem.mutate({ id: item.id, songId: null })}
                    onRemove={() => removeItem.mutate({ id: item.id })}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        {items.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setPicker({})}>
              <Plus className="h-4 w-4" /> Add song
            </Button>
            <Button variant="ghost" onClick={() => addItem.mutate({ setlistId: id, label: "New section" })}>
              <Plus className="h-4 w-4" /> Add empty slot
            </Button>
          </div>
        )}
      </div>

      {picker && (
        <SongPicker
          title={picker.itemId ? "Choose a song for this slot" : "Add a song"}
          allowEmpty={!picker.itemId}
          onClose={() => setPicker(null)}
          onPick={(songId) => {
            if (picker.itemId) updateItem.mutate({ id: picker.itemId, songId });
            else addItem.mutate({ setlistId: id, songId });
            setPicker(null);
          }}
        />
      )}
      {exportOpen && <ExportModal setlistId={id} onClose={() => setExportOpen(false)} />}
      {templateOpen && <SaveTemplateModal setlistId={id} defaultName={`${data.name} template`} onClose={() => setTemplateOpen(false)} />}
    </div>
  );
}

function SortableRow({
  item,
  index,
  onLabel,
  onKey,
  onChooseSong,
  onClearSong,
  onRemove,
}: {
  item: Item;
  index: number;
  onLabel: (label: string) => void;
  onKey: (key: string) => void;
  onChooseSong: () => void;
  onClearSong: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const song = item.song;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 rounded-xl bg-surface py-2 pr-2 pl-1 shadow-sm ring-1 ring-slate-200",
        isDragging && "relative z-10 shadow-lg ring-brand-300",
      )}
    >
      <button type="button" className="cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-right text-sm font-semibold text-slate-400 tabular-nums">{index + 1}</span>
      <div className="grid min-w-0 flex-1 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center">
        <InlineInput
          value={item.label ?? ""}
          onSave={onLabel}
          placeholder="Section (e.g. Entrance)"
          className="w-full rounded-md bg-transparent px-1.5 py-1 text-xs font-semibold tracking-wide text-brand-600 uppercase placeholder:font-normal placeholder:normal-case placeholder:text-slate-300 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
          ariaLabel="Section label"
        />
        {song ? (
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={onChooseSong} className="min-w-0 truncate rounded-md px-1.5 py-1 text-left font-medium hover:bg-slate-50" title="Change song">
              {song.title}
              {song.artist && <span className="ml-2 text-sm font-normal text-slate-400">{song.artist}</span>}
            </button>
            <Link href={`/songs/${song.id}`} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit lyrics & chords">
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <button type="button" onClick={onChooseSong} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-left text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
            + Choose a song
          </button>
        )}
      </div>
      {song && (
        <div className="flex items-center gap-1.5">
          <KeySelect
            value={item.key ?? ""}
            onChange={onKey}
            includeEmpty={`Original (${song.key})`}
            className={cn("h-8 w-32 text-xs", item.key && "border-orange-300 font-bold text-chord")}
            title="Performance key — the PDF is transposed to this key"
          />
        </div>
      )}
      <div className="flex">
        {song && (
          <Button size="icon" variant="ghost" title="Clear song (keep slot)" onClick={onClearSong} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" title="Remove from setlist" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
        </Button>
      </div>
    </li>
  );
}

/** Text input that keeps local state and saves on blur / Enter. */
function InlineInput({
  value,
  onSave,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return (
    <input
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() !== value) onSave(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={className}
    />
  );
}

function InlineTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return (
    <textarea
      value={draft}
      rows={Math.min(6, Math.max(1, draft.split("\n").length))}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) onSave(draft);
      }}
      className="mt-3 w-full resize-none rounded-lg bg-transparent px-0 py-1 text-sm text-slate-600 placeholder:text-slate-400 focus:bg-surface focus:px-2 focus:ring-1 focus:ring-slate-200 focus:outline-none"
    />
  );
}

function ExportModal({ setlistId, onClose }: { setlistId: string; onClose: () => void }) {
  const [chords, setChords] = useState(true);
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [breaks, setBreaks] = useState(true);
  const [cover, setCover] = useState(true);
  const [layout, setLayout] = useState<"pages" | "continuous">(() => {
    try {
      return localStorage.getItem("chordsheet-pdf-layout") === "continuous" ? "continuous" : "pages";
    } catch {
      return "pages";
    }
  });
  const chooseLayout = (value: "pages" | "continuous") => {
    setLayout(value);
    try {
      localStorage.setItem("chordsheet-pdf-layout", value);
    } catch {
      /* not persisted */
    }
  };
  const params = new URLSearchParams({ layout, chords: chords ? "1" : "0", size, breaks: breaks ? "1" : "0", cover: cover ? "1" : "0" });
  const url = `/api/setlists/${setlistId}/pdf?${params}`;
  return (
    <Modal
      open
      onClose={onClose}
      title="Export setlist to PDF"
      footer={
        <>
          <a href={`${url}&download=1`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Download
          </a>
          <a href={url} target="_blank" rel="noreferrer" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-500">
            {layout === "continuous" ? "Open" : "Open & print"}
          </a>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout">
          {(
            [
              ["pages", FileText, "Printable pages", "Letter-size pages for printing."],
              ["continuous", Tablet, "One long page", "Every song on one scrolling page, for tablets."],
            ] as const
          ).map(([value, Icon, title, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={layout === value}
              onClick={() => chooseLayout(value)}
              className={cn(
                "rounded-xl p-3 text-left ring-1 transition-colors",
                layout === value ? "bg-brand-50 ring-2 ring-brand-500" : "ring-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className={cn("mb-1.5 h-5 w-5", layout === value ? "text-brand-600" : "text-slate-400")} />
              <span className="block font-medium">{title}</span>
              <span className="block text-xs text-slate-500">{hint}</span>
            </button>
          ))}
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={chords} onChange={(e) => setChords(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">Show chords</span>
            <span className="block text-slate-500">Turn off for a lyrics-only copy for singers or the congregation.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">Include order of service</span>
            <span className="block text-slate-500">
              {layout === "continuous" ? "A list of every part, song and key at the top." : "A first page listing every part, song and key."}
            </span>
          </span>
        </label>
        {layout === "pages" && (
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Start each song on a new page</span>
              <span className="block text-slate-500">Turn off to save paper.</span>
            </span>
          </label>
        )}
        <div>
          <span className="mb-1.5 block font-medium">Text size</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {(["s", "m", "l"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={cn("rounded-md px-4 py-1.5 font-medium", size === s ? "bg-surface shadow-sm" : "text-slate-500")}
              >
                {{ s: "Small", m: "Medium", l: "Large" }[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SaveTemplateModal({ setlistId, defaultName, onClose }: { setlistId: string; defaultName: string; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName);
  const create = useMutation(
    trpc.template.fromSetlist.mutationOptions({
      onSuccess: (t) => {
        void queryClient.invalidateQueries({ queryKey: trpc.template.pathKey() });
        router.push(`/templates/${t.id}`);
      },
    }),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Save as template"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ setlistId, name })}>
            Save template
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">The section labels of this setlist become the template’s parts. Songs are not included.</p>
      <Field label="Template name" error={create.error ? errorMessage(create.error) : undefined}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
