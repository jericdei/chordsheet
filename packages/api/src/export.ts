import { db } from "@chordsheet/db";
import { formatKey, isValidKey, keyPrefersFlats, semitonesBetween, transposeDoc, type DocNode } from "@chordsheet/music";

export interface ExportSong {
  label: string | null;
  title: string;
  artist: string | null;
  /** Key the song is performed in (after any setlist override). */
  key: string;
  originalKey: string;
  tempo: number | null;
  timeSignature: string | null;
  notes: string | null;
  content: DocNode;
}

export interface ExportSetlist {
  name: string;
  date: Date | null;
  notes: string | null;
  items: Array<{ label: string | null; song: ExportSong | null; notes: string | null }>;
}

/** Loads a setlist with fully transposed song content, ready to render. */
export async function loadSetlistForExport(userId: string, setlistId: string): Promise<ExportSetlist | null> {
  const setlist = await db.setlist.findFirst({
    where: { id: setlistId, userId },
    include: { items: { orderBy: { position: "asc" }, include: { song: true } } },
  });
  if (!setlist) return null;
  return {
    name: setlist.name,
    date: setlist.date,
    notes: setlist.notes,
    items: setlist.items.map((item) => {
      if (!item.song) return { label: item.label, song: null, notes: item.notes };
      const song = item.song;
      const key = item.key ?? song.key;
      const shift = semitonesBetween(song.key, key);
      return {
        label: item.label,
        notes: item.notes,
        song: {
          label: item.label,
          title: song.title,
          artist: song.artist,
          key,
          originalKey: song.key,
          tempo: song.tempo,
          timeSignature: song.timeSignature,
          notes: item.notes,
          content: transposeDoc(song.content as unknown as DocNode, shift, keyPrefersFlats(key)),
        },
      };
    }),
  };
}

/** A single song wrapped as a one-item setlist, optionally transposed to `key`. */
export async function loadSongForExport(userId: string, songId: string, key?: string | null): Promise<ExportSetlist | null> {
  const song = await db.song.findFirst({ where: { id: songId, userId } });
  if (!song) return null;
  const target = key && isValidKey(key) ? formatKey(key) : song.key;
  const shift = semitonesBetween(song.key, target);
  return {
    name: song.title,
    date: null,
    notes: null,
    items: [
      {
        label: null,
        notes: null,
        song: {
          label: null,
          title: song.title,
          artist: song.artist,
          key: target,
          originalKey: song.key,
          tempo: song.tempo,
          timeSignature: song.timeSignature,
          notes: null,
          content: transposeDoc(song.content as unknown as DocNode, shift, keyPrefersFlats(target)),
        },
      },
    ],
  };
}
