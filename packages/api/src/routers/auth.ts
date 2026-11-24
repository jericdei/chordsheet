import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  isSecureRequest,
  sessionCookie,
  verifyPassword,
} from "../auth";
import { seedDefaultTemplates } from "../defaults";
import { publicProcedure, router } from "../trpc";

const email = z.email("Enter a valid email").transform((e) => e.trim().toLowerCase());

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().trim().max(100).optional(),
        email,
        password: z.string().min(8, "Password must be at least 8 characters").max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });

      const passwordHash = await hashPassword(input.password);
      const user = await ctx.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: input.email, name: input.name || null, passwordHash },
        });
        await seedDefaultTemplates(tx, created.id);
        return created;
      });

      const session = await createSession(user.id);
      ctx.resHeaders.append("set-cookie", sessionCookie(session.token, session.expiresAt, isSecureRequest(ctx.req)));
      return { id: user.id, email: user.email, name: user.name };
    }),

  login: publicProcedure
    .input(z.object({ email, password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { email: input.email } });
      const ok = user ? await verifyPassword(input.password, user.passwordHash) : false;
      if (!user || !ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

      const session = await createSession(user.id);
      ctx.resHeaders.append("set-cookie", sessionCookie(session.token, session.expiresAt, isSecureRequest(ctx.req)));
      return { id: user.id, email: user.email, name: user.name };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await deleteSession(ctx.sessionToken);
    ctx.resHeaders.append("set-cookie", clearSessionCookie(isSecureRequest(ctx.req)));
    return { ok: true };
  }),
});
