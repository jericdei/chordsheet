# Chordsheet

Write songs with chords, build setlists from templates (e.g. **Catholic Mass**), and export them to a printable PDF.

- **Song editor:** a rich-text editor (bold, italic, underline, section labels). Switch to **Chords** mode, click any syllable, and pick a chord from the song's key. Press `1`–`7` for the diatonic chords, or type any chord. You can also select a chord in the *Quick chords* bar and click lyrics to place it repeatedly. In Lyrics mode, `⌘/Ctrl+K` adds a chord at the cursor.
- **Moving chords:** drag a chord name onto any other syllable, on the same line or another one. This works with mouse or touch, in either mode. To fine-tune, click the chord and use the ◀ ▶ buttons (or `Alt+←/→`) to move it one letter at a time.
- **Intro and instrumental chord lines:** use the *Chord line* toolbar button to add a line of chords with no lyrics. Click it in Chords mode (or press `⌘K`) to add chords; they print inline, separated by dashes (`G - D - Em - C`). The dashes are ordinary text, so you can write `|` or `x2` instead. Lyrics-only PDFs leave these lines out.
- **Duplicate sections:** hover over a section heading (Verse, Chorus…) and click *Duplicate section*, or use the toolbar button for the section the cursor is in. This copies everything from that heading down to the next one.
- **No overlapping chords:** when chords sit on syllables too close together, the editor and the PDF space the lyric out so each chord has room. A hyphen is added where a word gets split (`Hal - le - lu - jah`). This only affects the display; the saved lyrics are unchanged.
- **Dark mode:** choose Light, Dark or System in the top bar. The choice is remembered per browser. PDFs always print light.
- **Keys:** each song has a key, and the chord picker suggests that key's chords (triads, sevenths, common borrowed and slash chords). Use **Transpose −/+** to move all chords. Changing the key asks whether to move the chords too.
- **Import:** paste a chord sheet and it is converted. This works with chords written above the lyrics, ChordPro (`[G]Amazing [C]grace`, `{title:}`, `{key:}`), section names like *Verse 1* or *[Chorus]*, intro lines like `Intro: G D Em C` (which become chord lines), bass-only slash chords (`Am  /G` becomes Am/G), and chords joined on one held note (`Gsus-G7`).
- **Setlists and templates:** a new setlist built from a template gets one slot per part. Fill the slots with songs, drag to reorder, and set a per-performance key. The PDF is transposed to that key.
- **PDF export:** choose between *Printable pages* (Letter size: an order-of-service page, one song per page) and *One long page*. One long page puts every song on a single scrolling page for tablets; setlists longer than about 200 inches continue onto a second long page. Options: chords on or off (a lyrics-only copy for singers), text size, and page breaks.
- **Realtime:** changes sync live across all of your open tabs and devices.
- **Auth:** register and log in with email and password. Sessions are stored in the database.

## Stack

| Piece | Tech |
| --- | --- |
| Monorepo | Bun workspaces + Turborepo |
| Web | Next.js 16 (App Router), Tailwind v4, Tiptap 3, dnd-kit |
| API | tRPC 11 + TanStack Query, Zod, superjson |
| DB | PostgreSQL + Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| Realtime | Bun `Bun.serve` WebSockets with pub/sub |
| PDF | Headless Chromium (`playwright-core`) printing the same Tiptap rendering as the editor |

```
apps/
  web/            Next.js app (UI, /api/trpc, PDF routes)
  realtime/       Bun WebSocket server
packages/
  api/            tRPC routers, auth (scrypt + DB sessions), PDF data loaders
  db/             Prisma schema, migrations, client
  music/          Music theory, transposition, document helpers, text import (unit-tested)
  realtime/       Shared event types, signed WS tokens, publish helper
```

### How realtime works

1. Every tRPC mutation calls `ctx.notify(entity, id)`. This POSTs to the realtime server's internal `/publish` endpoint, authenticated with `REALTIME_SECRET`.
2. The browser asks tRPC (`realtime.connection`) for a short-lived HMAC-signed token, then connects to `/ws?token=…`. The server subscribes the socket to the `user:<id>` channel.
3. When an event arrives, the client invalidates the matching TanStack Query caches. Each event carries an `origin` tab id, so a tab ignores its own changes.
4. If someone edits a song on another device while you have unsaved changes, the editor offers *Load latest* or *Keep mine* and does not overwrite your work.

## Local development

```bash
bun install
cp .env.example .env          # defaults work with the dev database below
bun run db:up                 # Postgres 17 in Docker on :5433
bun run db:migrate            # apply migrations
bun run dev                   # web on :3000, realtime on :3001
```

PDF export in development uses your installed Google Chrome. To use a different Chromium-based browser, set `CHROMIUM_PATH`.

Other commands: `bun run typecheck`, `bun run test`, `bun run db:migrate -- --name <change>` (create a migration after editing the schema).

Each new account starts with the **Catholic Mass** and **Worship Service** templates. You can edit them freely.

## Deploying to Dokploy

The repo ships a multi-target `Dockerfile` (`web`, `realtime`, `migrate`) and a production `docker-compose.yml`.

1. In Dokploy, create a **Compose** service that points at this repo and uses `docker-compose.yml`.
2. Under **Environment**, set:
   ```
   POSTGRES_PASSWORD=<strong password>
   REALTIME_SECRET=<random string, 32+ chars>     # e.g. openssl rand -hex 32
   ```
   Optional: `POSTGRES_USER`, `POSTGRES_DB`, and `REALTIME_PUBLIC_URL` (default `/ws`).
3. Under **Domains**, add two entries on the same host:
   - `app.example.com` → service **web**, port **3000**, path `/`
   - `app.example.com` → service **realtime**, port **3001**, path `/ws` (leave *Strip path* off)

   Because `REALTIME_PUBLIC_URL` defaults to the relative path `/ws`, the browser connects to `wss://app.example.com/ws` automatically. To use a separate subdomain instead, set `REALTIME_PUBLIC_URL=wss://rt.example.com/ws`.
4. Deploy. The `migrate` container runs `prisma migrate deploy` and exits. `web` starts only after migrations succeed.

Notes:
- The web image is a Next.js standalone build. It is built with Bun and served by Node. The realtime server runs on Bun.
- PDFs are made by headless Chromium, which is installed in the web image (about 300 MB extra) and uses about 150–250 MB of RAM while exporting. It loads the app's own `/print/...` page, which renders songs with the editor's Tiptap extensions and CSS, so the PDF matches the editor. Chromium reaches the app at `http://127.0.0.1:$PORT`; set `INTERNAL_APP_URL` if that won't work in your setup.
- Session cookies get the `Secure` flag automatically when the request arrives over HTTPS (Traefik sets `X-Forwarded-Proto`).
- Postgres data lives in the `pgdata` volume.
