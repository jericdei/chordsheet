import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@chordsheet/db";
import { publish, type RealtimeEntity } from "@chordsheet/realtime";
import { getSessionUser, readCookie, SESSION_COOKIE, type SessionUser } from "./auth";

export interface CreateContextOptions {
  req: Request;
  resHeaders: Headers;
}

export async function createContext({ req, resHeaders }: CreateContextOptions) {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const user = await getSessionUser(token);
  return {
    db,
    req,
    resHeaders,
    user,
    sessionToken: token,
    clientId: req.headers.get("x-client-id") ?? undefined,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in" });
  const user: SessionUser = ctx.user;
  return next({
    ctx: {
      ...ctx,
      user,
      /** Tell this user's other tabs/devices that something changed. */
      notify: (entity: RealtimeEntity, id?: string) => {
        void publish(user.id, { type: "invalidate", entity, id, origin: ctx.clientId });
      },
    },
  });
});

export function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}
