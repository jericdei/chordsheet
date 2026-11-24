import { backupSchema, importBackup } from "../backup";
import { protectedProcedure, router } from "../trpc";

export const backupRouter = router({
  /** Restore a backup file into the signed-in account (existing identical items are skipped). */
  import: protectedProcedure.input(backupSchema).mutation(async ({ ctx, input }) => {
    const summary = await importBackup(ctx.user.id, input);
    ctx.notify("song");
    ctx.notify("template");
    ctx.notify("setlist");
    return summary;
  }),
});
