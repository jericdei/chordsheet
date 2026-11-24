import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE } from "@chordsheet/api";

export const getCurrentUser = cache(async () => {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
});
