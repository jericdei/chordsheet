"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc";
import { Button, EmptyState, LoadingBlock, PageHeader } from "./ui";

export function TemplatesList() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templates = useQuery(trpc.template.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.template.pathKey() });
  const create = useMutation(trpc.template.create.mutationOptions({ onSuccess: (t) => router.push(`/templates/${t.id}`) }));
  const remove = useMutation(trpc.template.delete.mutationOptions({ onSuccess: invalidate }));
  const fromTemplate = useMutation(trpc.setlist.create.mutationOptions({ onSuccess: (s) => router.push(`/setlists/${s.id}`) }));

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable orders of service. New setlists start with these parts already in place."
        actions={
          <Button variant="primary" onClick={() => create.mutate({ name: "New template", slots: ["Opening", "Closing"] })} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />
      {templates.isLoading ? (
        <LoadingBlock />
      ) : !templates.data?.length ? (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title="No templates"
          description="Create a template for services you lead often, e.g. Sunday Mass or a wedding."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.data.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
                </div>
                <div className="flex">
                  <Link href={`/templates/${t.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => confirm(`Delete template "${t.name}"?`) && remove.mutate({ id: t.id })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <ol className="mt-3 flex flex-wrap gap-1.5">
                {t.slots.map((s, i) => (
                  <li key={s.id} className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                    {i + 1}. {s.label}
                  </li>
                ))}
              </ol>
              <div className="mt-auto pt-4">
                <Button size="sm" onClick={() => fromTemplate.mutate({ name: t.name, templateId: t.id })} disabled={fromTemplate.isPending}>
                  <ListPlus className="h-4 w-4" /> New setlist from this
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
