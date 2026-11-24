import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { songRouter } from "./routers/song";
import { setlistRouter } from "./routers/setlist";
import { templateRouter } from "./routers/template";
import { realtimeRouter } from "./routers/realtime";
import { backupRouter } from "./routers/backup";

export const appRouter = router({
  auth: authRouter,
  song: songRouter,
  setlist: setlistRouter,
  template: templateRouter,
  realtime: realtimeRouter,
  backup: backupRouter,
});

export type AppRouter = typeof appRouter;
