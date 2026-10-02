"use client";

/* The browser's Supabase client.
 *
 * It holds the ANON key, which is public by design — it ships in the bundle and
 * anyone can read it. That is safe only because row-level security is the real
 * access control: db/015 secures every student table against `auth.uid()`, so
 * a caller with the anon key and a forged request still cannot read another
 * student's row. Nothing here may ever rely on the client being honest.
 *
 * The SERVICE key is a different thing entirely and never comes near this file;
 * it lives on the API deployment, behind `server-only`.
 *
 * Returns null when the project is not configured, so the app degrades to its
 * per-browser storage rather than failing to render — which is also how the
 * offline snapshot path keeps working with no credentials at all.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (client) return client;
  client = createClient(url, anon, {
    auth: {
      /* The session lives in localStorage and is refreshed in the background,
       * so a student stays signed in across reloads and tabs. */
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "orbit.auth",
    },
  });
  return client;
}

export const AUTH_CONFIGURED = Boolean(url && anon);

/* Sign-up is restricted to the campus. Enforced here for a clear error, and
 * again by the email confirmation Supabase sends — a non-campus address never
 * receives one. It is a product rule, not a security boundary: the security
 * boundary is RLS, which does not care which domain someone signed up from. */
export const CAMPUS_DOMAIN = "dubai.bits-pilani.ac.in";

export function isCampusEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CAMPUS_DOMAIN}`);
}
