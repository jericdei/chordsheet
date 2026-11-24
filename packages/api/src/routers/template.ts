import { z } from "zod";
import { notFound, protectedProcedure, router } from "../trpc";

const slotsSchema = z.array(z.string().trim().min(1).max(100)).max(100);

export const templateRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.setlistTemplate.findMany({
      where: { userId: ctx.user.id },
      orderBy: { name: "asc" },
      include: { slots: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
    }),
  ),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const template = await ctx.db.setlistTemplate.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      include: { slots: { orderBy: { position: "asc" } } },
    });
    if (!template) notFound("Template");
    return template;
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullish(),
        slots: slotsSchema.default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.setlistTemplate.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          slots: { create: input.slots.map((label, position) => ({ label, position })) },
        },
      });
      ctx.notify("template", template.id);
      return template;
    }),

  /** Saves name, description and the full ordered list of slots. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullish(),
        slots: slotsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.setlistTemplate.findFirst({ where: { id: input.id, userId: ctx.user.id } });
      if (!owned) notFound("Template");
      await ctx.db.$transaction([
        ctx.db.templateSlot.deleteMany({ where: { templateId: input.id } }),
        ctx.db.setlistTemplate.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description || null,
            slots: { create: input.slots.map((label, position) => ({ label, position })) },
          },
        }),
      ]);
      ctx.notify("template", input.id);
      return { ok: true };
    }),

  /** Create a template from an existing setlist's sections. */
  fromSetlist: protectedProcedure
    .input(z.object({ setlistId: z.string(), name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const setlist = await ctx.db.setlist.findFirst({
        where: { id: input.setlistId, userId: ctx.user.id },
        include: { items: { orderBy: { position: "asc" }, include: { song: { select: { title: true } } } } },
      });
      if (!setlist) notFound("Setlist");
      const template = await ctx.db.setlistTemplate.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          slots: {
            create: setlist.items.map((item, position) => ({
              label: item.label || item.song?.title || `Song ${position + 1}`,
              position,
            })),
          },
        },
      });
      ctx.notify("template", template.id);
      return template;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.setlistTemplate.deleteMany({ where: { id: input.id, userId: ctx.user.id } });
    if (!count) notFound("Template");
    ctx.notify("template", input.id);
    return { ok: true };
  }),
});
