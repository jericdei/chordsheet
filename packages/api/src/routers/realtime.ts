import { createRealtimeToken } from "@chordsheet/realtime";
import { protectedProcedure, router } from "../trpc";

export const realtimeRouter = router({
  /** Short-lived credentials for the browser to open the realtime websocket. */
  connection: protectedProcedure.query(({ ctx }) => {
    const url = process.env.REALTIME_PUBLIC_URL;
    if (!url || !process.env.REALTIME_SECRET) return null;
    return { url, token: createRealtimeToken(ctx.user.id) };
  }),
});
