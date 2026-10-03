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

/* Sign-up is restricted to the campus.
 *
 * This check is for the MESSAGE, not the rule. Anyone can post straight to
 * /auth/v1/signup with the anon key, which ships in this bundle, so a browser
 * check cannot be the enforcement — and the confirmation email that used to be
 * the second layer stopped existing when confirmations were turned off so
 * reviewers could get in. db/019 is the enforcement: a BEFORE INSERT trigger on
 * auth.users that every path into the table goes through.
 *
 * It is still not the security boundary. That is RLS (db/015), which does not
 * care which domain anyone signed up from. */
export const CAMPUS_DOMAIN = "dubai.bits-pilani.ac.in";

export function isCampusEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CAMPUS_DOMAIN}`);
}

/* Turn what was typed into an address, for a field that accepts either a roll
 * number or a whole email.
 *
 * The naive version was `local.includes("@") ? local : local + "@" + DOMAIN`,
 * which produces "f20240000@@dubai…" from a trailing @, "f2024 0000@dubai…"
 * from a pasted address with a space in it, and an address with a non-campus
 * domain whenever someone types their personal email — each of which then
 * failed at the server with a message about the wrong thing.
 *
 * Returns null when there is nothing usable yet, so the caller can keep the
 * submit button disabled rather than guess. */
export function campusEmail(typed: string): string | null {
  const v = typed.trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return null;
  const at = v.indexOf("@");
  /* No @ at all: a roll number, so give it the campus domain. */
  if (at === -1) return LOCAL_PART.test(v) ? `${v}@${CAMPUS_DOMAIN}` : null;
  /* Exactly one @, and something on both sides of it. */
  if (at !== v.lastIndexOf("@") || at === 0 || at === v.length - 1) return null;
  const [local, domain] = [v.slice(0, at), v.slice(at + 1)];
  if (!LOCAL_PART.test(local) || !DOMAIN.test(domain)) return null;
  return `${local}@${domain}`;
}

/* Deliberately narrower than RFC 5322: campus addresses are roll numbers and
 * names, and accepting quoted strings or comments here would only widen what
 * can reach the server without helping a single real student. */
const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
