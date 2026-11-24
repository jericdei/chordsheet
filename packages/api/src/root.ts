import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { songRouter } from "./routers/song";
import { setlistRouter } from "./routers/setlist";
import { templateRouter } from "./routers/template";
import { realtimeRouter } from "./routers/realtime";

export const appRouter = router({
  auth: authRouter,
  song: songRouter,
  setlist: setlistRouter,
  template: templateRouter,
  realtime: realtimeRouter,
});

export type AppRouter = typeof appRouter;
