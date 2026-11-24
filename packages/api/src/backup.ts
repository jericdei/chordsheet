import { z } from "zod";
import { db, type Prisma } from "@chordsheet/db";
import { isDocNode, isValidKey, formatKey, type DocNode } from "@chordsheet/music";

/**
 * Portable backup of one user's songs, templates and setlists. IDs inside the file are only
 * used to link records together; importing creates fresh records for the importing user.
 */
export const BACKUP_FORMAT = "chordsheet-backup";
export const BACKUP_VERSION = 1;

const keySchema = z
  .string()
  .trim()
  .refine(isValidKey, "Invalid key")
  .transform((k) => formatKey(k));

const docSchema = z.custom<DocNode>((v) => isDocNode(v) && v.type === "doc", "Invalid song content");

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  songs: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1).max(200),
        artist: z.string().max(200).nullable(),
        key: keySchema,
        tempo: z.number().int().min(20).max(400).nullable(),
        timeSignature: z.string().max(10).nullable(),
        content: docSchema,
      }),
    )
    .max(10_000),
  templates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500).nullable(),
        slots: z.array(z.string().trim().min(1).max(100)).max(100),
      }),
    )
    .max(1_000),
  setlists: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(200),
        date: z.string().datetime().nullable(),
        notes: z.string().max(5000).nullable(),
        templateId: z.string().nullable(),
        items: z
          .array(
            z.object({
              label: z.string().max(100).nullable(),
              songId: z.string().nullable(),
              key: keySchema.nullable(),
              notes: z.string().max(2000).nullable(),
            }),
          )
          .max(500),
      }),
    )
    .max(5_000),
});

export type Backup = z.infer<typeof backupSchema>;

export async function buildBackup(userId: string): Promise<Backup> {
  const [songs, templates, setlists] = await Promise.all([
    db.song.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.setlistTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { slots: { orderBy: { position: "asc" } } },
    }),
    db.setlist.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { position: "asc" } } },
    }),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    songs: songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      timeSignature: s.timeSignature,
      content: s.content as unknown as DocNode,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      slots: t.slots.map((s) => s.label),
    })),
    setlists: setlists.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date ? s.date.toISOString() : null,
      notes: s.notes,
      templateId: s.templateId,
      items: s.items.map((i) => ({ label: i.label, songId: i.songId, key: i.key, notes: i.notes })),
    })),
  };
}

export interface ImportSummary {
  songs: { created: number; skipped: number };
  templates: { created: number; skipped: number };
  setlists: { created: number; skipped: number };
}

// Fingerprints identify records that were already in the account before the import, so
// importing the same file twice doesn't duplicate anything. Identical copies inside one
// backup are all restored, so the account ends up exactly like the one that was exported.
const songPrint = (s: { title: string; artist: string | null; key: string; content: unknown }) =>
  JSON.stringify([s.title.trim(), s.artist ?? "", s.key, s.content]);
const templatePrint = (t: { name: string; slots: string[] }) => JSON.stringify([t.name.trim(), t.slots]);
const setlistPrint = (s: { name: string; date: string | null; items: Array<{ label: string | null; songId: string | null; key: string | null }> }) =>
  JSON.stringify([s.name.trim(), s.date, s.items.map((i) => [i.label ?? "", i.songId ?? "", i.key ?? ""])]);

export async function importBackup(userId: string, backup: Backup): Promise<ImportSummary> {
  const summary: ImportSummary = {
    songs: { created: 0, skipped: 0 },
    templates: { created: 0, skipped: 0 },
    setlists: { created: 0, skipped: 0 },
  };

  await db.$transaction(
    async (tx) => {
      // ---- songs ----
      const existingSongs = await tx.song.findMany({ where: { userId }, select: { id: true, title: true, artist: true, key: true, content: true } });
      const songByPrint = new Map(existingSongs.map((s) => [songPrint(s), s.id]));
      const songIdMap = new Map<string, string>();
      for (const song of backup.songs) {
        const print = songPrint(song);
        const existing = songByPrint.get(print);
        if (existing) {
          songIdMap.set(song.id, existing);
          summary.songs.skipped++;
          continue;
        }
        const created = await tx.song.create({
          data: {
            userId,
            title: song.title,
            artist: song.artist || null,
            key: song.key,
            tempo: song.tempo,
            timeSignature: song.timeSignature || null,
            content: song.content as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        songIdMap.set(song.id, created.id);
        summary.songs.created++;
      }

      // ---- templates ----
      const existingTemplates = await tx.setlistTemplate.findMany({
        where: { userId },
        include: { slots: { orderBy: { position: "asc" } } },
      });
      const templateByPrint = new Map(existingTemplates.map((t) => [templatePrint({ name: t.name, slots: t.slots.map((s) => s.label) }), t.id]));
      const templateIdMap = new Map<string, string>();
      for (const template of backup.templates) {
        const print = templatePrint(template);
        const existing = templateByPrint.get(print);
        if (existing) {
          templateIdMap.set(template.id, existing);
          summary.templates.skipped++;
          continue;
        }
        const created = await tx.setlistTemplate.create({
          data: {
            userId,
            name: template.name,
            description: template.description || null,
            slots: { create: template.slots.map((label, position) => ({ label, position })) },
          },
          select: { id: true },
        });
        templateIdMap.set(template.id, created.id);
        summary.templates.created++;
      }

      // ---- setlists ----
      const existingSetlists = await tx.setlist.findMany({
        where: { userId },
        include: { items: { orderBy: { position: "asc" } } },
      });
      const setlistPrints = new Set(
        existingSetlists.map((s) => setlistPrint({ name: s.name, date: s.date ? s.date.toISOString() : null, items: s.items })),
      );
      for (const setlist of backup.setlists) {
        const items = setlist.items.map((i) => ({ ...i, songId: i.songId ? (songIdMap.get(i.songId) ?? null) : null }));
        const print = setlistPrint({ name: setlist.name, date: setlist.date, items });
        if (setlistPrints.has(print)) {
          summary.setlists.skipped++;
          continue;
        }
        await tx.setlist.create({
          data: {
            userId,
            name: setlist.name,
            date: setlist.date ? new Date(setlist.date) : null,
            notes: setlist.notes || null,
            templateId: setlist.templateId ? (templateIdMap.get(setlist.templateId) ?? null) : null,
            items: {
              create: items.map((item, position) => ({
                position,
                label: item.label || null,
                songId: item.songId,
                key: item.key,
                notes: item.notes || null,
              })),
            },
          },
        });
        summary.setlists.created++;
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return summary;
}
