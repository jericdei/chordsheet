import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PrismaClient } from "@chordsheet/db";
import { notFound, protectedProcedure, router } from "../trpc";
import { keySchema } from "./song";

async function assertSetlist(db: PrismaClient, userId: string, id: string) {
  const setlist = await db.setlist.findFirst({ where: { id, userId }, select: { id: true } });
  if (!setlist) notFound("Setlist");
  return setlist;
}

async function assertItem(db: PrismaClient, userId: string, id: string) {
  const item = await db.setlistItem.findFirst({
    where: { id, setlist: { userId } },
    select: { id: true, setlistId: true },
  });
  if (!item) notFound("Setlist item");
  return item;
}

async function assertSong(db: PrismaClient, userId: string, songId: string | null | undefined) {
  if (!songId) return;
  const song = await db.song.findFirst({ where: { id: songId, userId }, select: { id: true } });
  if (!song) notFound("Song");
}

const touch = (db: PrismaClient, id: string) => db.setlist.update({ where: { id }, data: { updatedAt: new Date() } });

export const setlistRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.setlist.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ date: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        date: true,
        updatedAt: true,
        template: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const setlist = await ctx.db.setlist.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      include: {
        template: { select: { id: true, name: true } },
        items: {
          orderBy: { position: "asc" },
          include: { song: { select: { id: true, title: true, artist: true, key: true } } },
        },
      },
    });
    if (!setlist) notFound("Setlist");
    return setlist;
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        date: z.date().nullish(),
        templateId: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let slots: string[] = [];
      if (input.templateId) {
        const template = await ctx.db.setlistTemplate.findFirst({
          where: { id: input.templateId, userId: ctx.user.id },
          include: { slots: { orderBy: { position: "asc" } } },
        });
        if (!template) notFound("Template");
        slots = template.slots.map((s) => s.label);
      }
      const setlist = await ctx.db.setlist.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          date: input.date ?? null,
          templateId: input.templateId ?? null,
          items: { create: slots.map((label, position) => ({ label, position })) },
        },
      });
      ctx.notify("setlist", setlist.id);
      return setlist;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(200).optional(),
        date: z.date().nullish(),
        notes: z.string().max(5000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertSetlist(ctx.db, ctx.user.id, id);
      const setlist = await ctx.db.setlist.update({ where: { id }, data });
      ctx.notify("setlist", id);
      return setlist;
    }),

  duplicate: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const source = await ctx.db.setlist.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!source) notFound("Setlist");
    const copy = await ctx.db.setlist.create({
      data: {
        userId: ctx.user.id,
        name: `${source.name} (copy)`,
        date: source.date,
        notes: source.notes,
        templateId: source.templateId,
        items: {
          create: source.items.map((i) => ({
            position: i.position,
            label: i.label,
            songId: i.songId,
            key: i.key,
            notes: i.notes,
          })),
        },
      },
    });
    ctx.notify("setlist", copy.id);
    return copy;
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.setlist.deleteMany({ where: { id: input.id, userId: ctx.user.id } });
    if (!count) notFound("Setlist");
    ctx.notify("setlist", input.id);
    return { ok: true };
  }),

  addItem: protectedProcedure
    .input(
      z.object({
        setlistId: z.string(),
        label: z.string().trim().max(100).nullish(),
        songId: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertSetlist(ctx.db, ctx.user.id, input.setlistId);
      await assertSong(ctx.db, ctx.user.id, input.songId);
      const last = await ctx.db.setlistItem.aggregate({
        where: { setlistId: input.setlistId },
        _max: { position: true },
      });
      const item = await ctx.db.setlistItem.create({
        data: {
          setlistId: input.setlistId,
          label: input.label || null,
          songId: input.songId ?? null,
          position: (last._max.position ?? -1) + 1,
        },
      });
      await touch(ctx.db, input.setlistId);
      ctx.notify("setlist", input.setlistId);
      return item;
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().trim().max(100).nullish(),
        songId: z.string().nullish(),
        key: keySchema.nullish(),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const item = await assertItem(ctx.db, ctx.user.id, id);
      await assertSong(ctx.db, ctx.user.id, data.songId);
      // Picking a different song resets the performance key override.
      const patch = data.songId !== undefined && data.key === undefined ? { ...data, key: null } : data;
      const updated = await ctx.db.setlistItem.update({ where: { id }, data: patch });
      await touch(ctx.db, item.setlistId);
      ctx.notify("setlist", item.setlistId);
      return updated;
    }),

  removeItem: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const item = await assertItem(ctx.db, ctx.user.id, input.id);
    await ctx.db.setlistItem.delete({ where: { id: input.id } });
    await touch(ctx.db, item.setlistId);
    ctx.notify("setlist", item.setlistId);
    return { ok: true };
  }),

  reorder: protectedProcedure
    .input(z.object({ setlistId: z.string(), itemIds: z.array(z.string()).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await assertSetlist(ctx.db, ctx.user.id, input.setlistId);
      const items = await ctx.db.setlistItem.findMany({ where: { setlistId: input.setlistId }, select: { id: true } });
      const existing = new Set(items.map((i) => i.id));
      if (existing.size !== input.itemIds.length || !input.itemIds.every((id) => existing.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Item list is out of date, please refresh" });
      }
      await ctx.db.$transaction(
        input.itemIds.map((id, position) => ctx.db.setlistItem.update({ where: { id }, data: { position } })),
      );
      await touch(ctx.db, input.setlistId);
      ctx.notify("setlist", input.setlistId);
      return { ok: true };
    }),
});
