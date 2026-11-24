"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { RealtimeEvent } from "@chordsheet/realtime";
import { clientId, useTRPC, useTRPCClient } from "./trpc";

export type RealtimeStatus = "connecting" | "online" | "offline" | "disabled";

const StatusContext = createContext<RealtimeStatus>("connecting");
export const useRealtimeStatus = () => useContext(StatusContext);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let connectedBefore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (stopped) return;
      setStatus("offline");
      const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500;
      timer = setTimeout(connect, delay);
    };

    const handle = (event: RealtimeEvent) => {
      if (event.origin === clientId) return; // our own change
      switch (event.entity) {
        case "song":
          void queryClient.invalidateQueries({ queryKey: trpc.song.pathKey() });
          void queryClient.invalidateQueries({ queryKey: trpc.setlist.pathKey() });
          break;
        case "setlist":
          void queryClient.invalidateQueries({ queryKey: trpc.setlist.pathKey() });
          break;
        case "template":
          void queryClient.invalidateQueries({ queryKey: trpc.template.pathKey() });
          break;
      }
    };

    async function connect() {
      let conn: { url: string; token: string } | null;
      try {
        conn = await trpcClient.realtime.connection.query();
      } catch {
        scheduleReconnect();
        return;
      }
      if (stopped) return;
      if (!conn) {
        setStatus("disabled");
        return;
      }
      const url = new URL(conn.url, window.location.href);
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol === "https:") url.protocol = "wss:";
      url.searchParams.set("token", conn.token);
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        setStatus("online");
        // Catch up on anything missed while disconnected.
        if (connectedBefore) void queryClient.invalidateQueries();
        connectedBefore = true;
      };
      ws.onmessage = (msg) => {
        if (typeof msg.data !== "string" || msg.data === "pong") return;
        try {
          const event = JSON.parse(msg.data) as RealtimeEvent | { type: "hello" };
          if (event.type === "invalidate") handle(event);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        ws = null;
        scheduleReconnect();
      };
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [queryClient, trpc, trpcClient]);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}
