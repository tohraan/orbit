/* Per-request Content-Security-Policy.
 *
 * Named `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention and
 * warns on the old filename. The export name has to match the file, hence
 * `proxy` rather than `middleware`.
 *
 * The policy is nonce-based rather than 'unsafe-inline': Next emits a few
 * inline bootstrap scripts, and the alternative to a nonce is allowing every
 * inline script on the page, which is the thing CSP exists to stop. Next reads
 * the nonce out of this header and stamps it onto its own script tags.
 *
 * What the policy asserts about this app, all of which is true by construction:
 *   - fonts are self-hosted by next/font, so no font or style host is needed
 *   - every icon is inline SVG and no scraped image is rendered, so img-src
 *     needs only 'self' and data:
 *   - fetches go to this origin's own /api routes, the data service's origin
 *     when NEXT_PUBLIC_API_BASE names one, and Supabase's when accounts are
 *     configured -- Supabase Auth runs IN THE BROWSER and talks to the project
 *     host directly, so leaving it out blocks every sign-in and sign-up
 *   - nothing is ever framed, and the app never frames anything
 *
 * 'unsafe-inline' stays in style-src because React sets style attributes for
 * the skeleton shimmer timings; style attributes cannot carry a nonce. */

import { NextResponse, type NextRequest } from "next/server";

/* The data service is a separate deployment and therefore a separate origin,
 * so `connect-src 'self'` alone would block every fetch the app makes. Only
 * the origin is taken from the env var -- a path or a wildcard in there would
 * widen the policy further than intended, and an unparseable value is dropped
 * rather than inserted raw into a security header. */
function originOf(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

const apiOrigin = () => originOf(process.env.NEXT_PUBLIC_API_BASE);

/* Supabase Auth is a browser-side SDK: signUp/signIn/refresh all fetch
 * <project>.supabase.co straight from the page, so that origin has to be in
 * connect-src. Without it the request never leaves the browser, the SDK
 * surfaces it as a generic network failure, and the student sees "Something
 * went wrong" on a form that is filled in correctly -- which is exactly how
 * this presented. Derived from the public project URL rather than hardcoded,
 * so a different project needs no change here. */
const authOrigin = () => originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    `default-src 'self'`,
    /* 'strict-dynamic' lets Next's nonced bootstrap load its own chunks without
     * every chunk URL being listed. 'unsafe-eval' is development only -- React
     * Refresh needs it, production does not. */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}`.trim(),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${apiOrigin()} ${authOrigin()}${dev ? " ws: wss:" : ""}`.replace(/\s+/g, " ").trim(),
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  /* The policy goes on the REQUEST as well as the response. This is the part
   * that is easy to miss and fails silently: Next parses the nonce out of the
   * request's own Content-Security-Policy header to stamp onto its <script>
   * tags. With only `x-nonce` set, the response carries a nonce the scripts do
   * not have, `strict-dynamic` drops the host allowance, and the browser
   * blocks every script on the page -- the server-rendered HTML still paints,
   * so the page looks fine and simply never fetches anything. */
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  /* Skip the static asset paths: they are immutable, they carry no scripts,
   * and running middleware on every chunk request is pure latency. */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
