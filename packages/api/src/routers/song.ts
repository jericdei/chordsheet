import { z } from "zod";
import type { Prisma } from "@chordsheet/db";
import { emptyDoc, formatKey, isDocNode, isValidKey, type DocNode } from "@chordsheet/music";
import { notFound, protectedProcedure, router } from "../trpc";

export const keySchema = z
  .string()
  .trim()
  .refine(isValidKey, "Invalid key")
  .transform((k) => formatKey(k));

const docSchema = z.custom<DocNode>((v) => isDocNode(v) && v.type === "doc", "Invalid song content");

const songFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  artist: z.string().trim().max(200).nullish(),
  key: keySchema,
  tempo: z.number().int().min(20).max(400).nullish(),
  timeSignature: z.string().trim().max(10).nullish(),
  content: docSchema,
};

const listSelect = {
  id: true,
  title: true,
  artist: true,
  key: true,
  updatedAt: true,
} satisfies Prisma.SongSelect;

export const songRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().trim().max(200).optional() }).optional())
    .query(({ ctx, input }) => {
      const search = input?.search;
      return ctx.db.song.findMany({
        where: {
          userId: ctx.user.id,
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" } },
                  { artist: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        select: listSelect,
      });
    }),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const song = await ctx.db.song.findFirst({ where: { id: input.id, userId: ctx.user.id } });
    if (!song) notFound("Song");
    return { ...song, content: song.content as unknown as DocNode };
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: songFields.title,
        artist: songFields.artist,
        key: songFields.key.default("C"),
        content: songFields.content.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const song = await ctx.db.song.create({
        data: {
          userId: ctx.user.id,
          title: input.title,
          artist: input.artist || null,
          key: input.key,
          content: (input.content ?? emptyDoc()) as unknown as Prisma.InputJsonValue,
        },
        select: listSelect,
      });
      ctx.notify("song", song.id);
      return song;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: songFields.title.optional(),
        artist: songFields.artist,
        key: songFields.key.optional(),
        tempo: songFields.tempo,
        timeSignature: songFields.timeSignature,
        content: songFields.content.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, content, ...rest } = input;
      const owned = await ctx.db.song.findFirst({ where: { id, userId: ctx.user.id }, select: { id: true } });
      if (!owned) notFound("Song");
      const song = await ctx.db.song.update({
        where: { id },
        data: {
          ...rest,
          ...(content ? { content: content as unknown as Prisma.InputJsonValue } : {}),
        },
        select: { ...listSelect, tempo: true, timeSignature: true },
      });
      ctx.notify("song", id);
      return song;
    }),

  duplicate: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const song = await ctx.db.song.findFirst({ where: { id: input.id, userId: ctx.user.id } });
    if (!song) notFound("Song");
    const copy = await ctx.db.song.create({
      data: {
        userId: ctx.user.id,
        title: `${song.title} (copy)`,
        artist: song.artist,
        key: song.key,
        tempo: song.tempo,
        timeSignature: song.timeSignature,
        content: song.content as Prisma.InputJsonValue,
      },
      select: listSelect,
    });
    ctx.notify("song", copy.id);
    return copy;
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.song.deleteMany({ where: { id: input.id, userId: ctx.user.id } });
    if (!count) notFound("Song");
    ctx.notify("song", input.id);
    // Setlists referencing the song changed too (their slot is now empty).
    ctx.notify("setlist");
    return { ok: true };
  }),
});
