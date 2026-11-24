import { createHmac, timingSafeEqual } from "node:crypto";

/** Entities whose cached data a client should refetch when they change. */
export type RealtimeEntity = "song" | "setlist" | "template";

export interface RealtimeEvent {
  type: "invalidate";
  entity: RealtimeEntity;
  id?: string;
  /** Client id of the tab that caused the change, so it can ignore its own echo. */
  origin?: string;
  at: number;
}

export const userChannel = (userId: string) => `user:${userId}`;

function getSecret(secret?: string) {
  const s = secret ?? process.env.REALTIME_SECRET;
  if (!s || s.length < 16) throw new Error("REALTIME_SECRET must be set (min 16 chars)");
  return s;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Short-lived token a browser presents when opening the websocket. */
export function createRealtimeToken(userId: string, ttlSeconds = 60 * 10, secret?: string) {
  const payload = b64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${payload}.${sign(payload, getSecret(secret))}`;
}

export function verifyRealtimeToken(token: string, secret?: string): { userId: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, getSecret(secret)));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp < Date.now() / 1000) return null;
    return { userId: data.sub };
  } catch {
    return null;
  }
}

export function isAuthorizedPublisher(header: string | null, secret?: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(getSecret(secret));
  const actual = Buffer.from(header.slice("Bearer ".length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Fire-and-forget publish from the web/API server to the realtime server.
 * Never throws: realtime is a nicety, not a requirement for mutations to succeed.
 */
export async function publish(userId: string, event: Omit<RealtimeEvent, "at">) {
  const base = process.env.REALTIME_INTERNAL_URL;
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getSecret()}` },
      body: JSON.stringify({ userId, event: { ...event, at: Date.now() } }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.warn("[realtime] publish failed:", (err as Error).message);
  }
}
