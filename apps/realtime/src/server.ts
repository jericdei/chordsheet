import {
  isAuthorizedPublisher,
  userChannel,
  verifyRealtimeToken,
  type RealtimeEvent,
} from "@chordsheet/realtime";

interface SocketData {
  userId: string;
}

const port = Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 3001);
if (!process.env.REALTIME_SECRET) {
  console.error("REALTIME_SECRET is required");
  process.exit(1);
}

let connections = 0;

const server = Bun.serve<SocketData, never>({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, connections });
    }

    // Internal endpoint: the web app tells us something changed for a user.
    if (url.pathname === "/publish" && req.method === "POST") {
      if (!isAuthorizedPublisher(req.headers.get("authorization"))) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = (await req.json().catch(() => null)) as { userId?: string; event?: RealtimeEvent } | null;
      if (!body?.userId || body.event?.type !== "invalidate") {
        return new Response("Bad request", { status: 400 });
      }
      server.publish(userChannel(body.userId), JSON.stringify(body.event));
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/ws") {
      const auth = verifyRealtimeToken(url.searchParams.get("token") ?? "");
      if (!auth) return new Response("Unauthorized", { status: 401 });
      if (server.upgrade(req, { data: { userId: auth.userId } })) return undefined;
      return new Response("Upgrade failed", { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    idleTimeout: 120,
    sendPings: true,
    open(ws) {
      connections++;
      ws.subscribe(userChannel(ws.data.userId));
      ws.send(JSON.stringify({ type: "hello" }));
    },
    message(ws, message) {
      if (message === "ping") ws.send("pong");
    },
    close() {
      connections--;
    },
  },
});

console.log(`[realtime] listening on :${server.port}`);
