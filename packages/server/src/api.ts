/* Shared response plumbing for the route handlers.
 *
 * Two rules it exists to enforce in one place:
 *
 *   1. A client never sees an internal error. `fail()` sends a fixed sentence
 *      and a code; the real message and stack go to the server log. A Supabase
 *      error string names tables, columns and sometimes the project ref.
 *   2. Every response says how long it may be cached, so a page reload does
 *      not re-run the whole filter pass. The index itself only changes when a
 *      scrape runs, so a minute of shared cache costs nothing.
 */

import "server-only";
import { clientKey, take } from "./rate-limit";

export const CACHE_LIST = "public, s-maxage=60, stale-while-revalidate=300";
export const CACHE_STATIC = "public, s-maxage=600, stale-while-revalidate=3600";

export function json(body: unknown, init: ResponseInit = {}, cache = CACHE_LIST): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      /* A JSON endpoint is never a document; stop a browser from being talked
       * into treating a response body as HTML. */
      "x-content-type-options": "nosniff",
      ...(init.headers ?? {}),
    },
  });
}

export function fail(status: number, code: string, message: string, cause?: unknown): Response {
  if (cause) console.error(`[api:${code}]`, cause instanceof Error ? cause.message : cause);
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Returns a 429 response when the caller is over budget, otherwise null. */
export function limited(req: Request, bucket: string, perMinute: number): Response | null {
  const v = take(`${bucket}:${clientKey(req)}`, perMinute);
  if (v.ok) return null;
  return new Response(
    JSON.stringify({
      error: { code: "rate_limited", message: "Too many requests. Try again in a moment." },
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(v.retryAfter),
        "cache-control": "no-store",
      },
    },
  );
}
