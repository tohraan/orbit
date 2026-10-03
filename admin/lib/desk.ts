"use client";

/* The desk's client. One place that knows the session is sent as a bearer
 * token, so no screen can forget to send it and silently read as signed out. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (client) return client;
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      /* A DIFFERENT key from the portal's "orbit.auth". The two apps are
       * separate origins so their storage never actually meets, but naming
       * them apart means a staff member signed into both does not have one
       * sign-out appear to log them out of the other during local development,
       * where both run on localhost and DO share an origin. */
      storageKey: "orbit.desk.auth",
    },
  });
  return client;
}

export const AUTH_CONFIGURED = Boolean(url && anon);
export const CAMPUS_DOMAIN = "dubai.bits-pilani.ac.in";

export type DeskError = { code: string; message: string };

/** Call a desk route with the caller's session attached.
 *
 *  Returns the parsed body on success and a DeskError otherwise, rather than
 *  throwing: every caller here renders the failure, and an exception would just
 *  be caught and converted at each site. */
export async function desk<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: DeskError }> {
  const sb = supabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  if (!token) return { ok: false, error: { code: "unauthorised", message: "Sign in to use the desk." } };

  let res: Response;
  try {
    res = await fetch(`/api/desk/${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: { code: "offline", message: "Could not reach the desk. Check your connection." } };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* A non-JSON body on a failure is a proxy or a platform error page; the
     * status is the only honest thing to report. */
  }
  if (!res.ok) {
    const e = (body ?? {}) as { code?: string; message?: string; error?: DeskError };
    return {
      ok: false,
      error: {
        code: e.error?.code ?? e.code ?? String(res.status),
        message: e.error?.message ?? e.message ?? `The desk returned ${res.status}.`,
      },
    };
  }
  return { ok: true, data: body as T };
}
