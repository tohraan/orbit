/* CORS for the standalone data service.
 *
 * The frontend is a different origin now, so the browser will not read a
 * response from here without one. It is handled in one place rather than in
 * five handlers, and it is an ALLOWLIST, never a wildcard:
 *
 *   ALLOWED_ORIGINS=https://opportunities.example.app,https://staging.example.app
 *
 * `*` would let any page on the internet read this API with the visitor's
 * browser. That matters less than usual here — every row is a public listing
 * and no credentials are involved — but it would also let anyone else's site
 * use this deployment as free infrastructure, so the allowlist stays.
 *
 * An origin that is not on the list gets the response WITHOUT the CORS header
 * rather than an error: the browser then refuses to expose it, which is the
 * correct outcome, and a server-to-server caller (curl, another service) is
 * unaffected because CORS is a browser mechanism. */

import { NextResponse, type NextRequest } from "next/server";

/* Localhost is allowed by default in development only, so the frontend can be
 * run against a deployed API without editing env files. In production the list
 * is exactly what ALLOWED_ORIGINS says. */
const DEV_ORIGINS = ["http://localhost:3100", "http://127.0.0.1:3100"];

function allowed(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return process.env.NODE_ENV === "production" ? configured : [...configured, ...DEV_ORIGINS];
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowed().includes(origin.replace(/\/+$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    /* The allowed origin varies per request, so any shared cache in front of
     * this must key on it. Without Vary, one visitor's CORS header can be
     * served to another origin. */
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    /* `authorization` is load-bearing: the college desk sends a bearer token,
     * and any request carrying that header is preflighted. Leaving it out does
     * not fail loudly — the browser simply refuses the response and the page
     * reports that it could not load the desk. */
    "Access-Control-Allow-Headers": "content-type, accept, authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function proxy(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  /* Preflight is answered here; it never needs to reach a handler. */
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
