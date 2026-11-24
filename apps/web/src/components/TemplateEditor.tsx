"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button, Field, Input, LoadingBlock, Spinner, cn, errorMessage } from "./ui";

interface Slot {
  uid: string;
  label: string;
}

let uidCounter = 0;
const uid = () => `s${++uidCounter}`;

export function TemplateEditor({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const template = useQuery(trpc.template.byId.queryOptions({ id }));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newSlot, setNewSlot] = useState("");
  const newSlotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!template.data || dirty) return;
    setName(template.data.name);
    setDescription(template.data.description ?? "");
    setSlots(template.data.slots.map((s) => ({ uid: uid(), label: s.label })));
  }, [template.data, dirty]);

  const save = useMutation(
    trpc.template.update.mutationOptions({
      onSuccess: () => {
        setDirty(false);
        void queryClient.invalidateQueries({ queryKey: trpc.template.pathKey() });
      },
    }),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const change = (fn: () => void) => {
    fn();
    setDirty(true);
  };

  const addSlot = () => {
    const label = newSlot.trim();
    if (!label) return;
    change(() => setSlots((s) => [...s, { uid: uid(), label }]));
    setNewSlot("");
    newSlotRef.current?.focus();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    change(() =>
      setSlots((s) => arrayMove(s, s.findIndex((x) => x.uid === active.id), s.findIndex((x) => x.uid === over.id))),
    );
  };

  if (template.error) return <p className="py-20 text-center text-slate-600">{errorMessage(template.error)}</p>;
  if (!template.data) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/templates" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Templates
        </Link>
        <div className="flex items-center gap-3">
          {save.error && <span className="text-sm text-red-600">{errorMessage(save.error)}</span>}
          {!dirty && !save.isPending && <span className="text-xs text-slate-400">All changes saved</span>}
          <Button
            variant="primary"
            disabled={!dirty || save.isPending || !name.trim()}
            onClick={() => save.mutate({ id, name, description: description || null, slots: slots.map((s) => s.label.trim()).filter(Boolean) })}
          >
            {save.isPending && <Spinner />} Save template
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-slate-200">
        <Field label="Name">
          <Input value={name} onChange={(e) => change(() => setName(e.target.value))} />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => change(() => setDescription(e.target.value))} placeholder="Optional" />
        </Field>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">Parts</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slots.map((s) => s.uid)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {slots.map((slot, index) => (
              <SlotRow
                key={slot.uid}
                slot={slot}
                index={index}
                onChange={(label) => change(() => setSlots((s) => s.map((x) => (x.uid === slot.uid ? { ...x, label } : x))))}
                onRemove={() => change(() => setSlots((s) => s.filter((x) => x.uid !== slot.uid)))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addSlot();
        }}
      >
        <Input ref={newSlotRef} value={newSlot} onChange={(e) => setNewSlot(e.target.value)} placeholder="Add a part, e.g. Offertory" />
        <Button type="submit" disabled={!newSlot.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </div>
  );
}

function SlotRow({ slot, index, onChange, onRemove }: { slot: Slot; index: number; onChange: (v: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.uid });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-xl bg-surface py-1.5 pr-1.5 pl-1 shadow-sm ring-1 ring-slate-200", isDragging && "relative z-10 shadow-lg")}
    >
      <button type="button" className="cursor-grab touch-none p-1 text-slate-300 hover:text-slate-500" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-right text-sm font-semibold text-slate-400 tabular-nums">{index + 1}</span>
      <input
        value={slot.label}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 flex-1 rounded-md px-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
        aria-label={`Part ${index + 1}`}
      />
      <Button size="icon" variant="ghost" onClick={onRemove} title="Remove part">
        <Trash2 className="h-4 w-4 text-slate-400" />
      </Button>
    </li>
  );
}
