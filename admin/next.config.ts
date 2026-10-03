import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* The desk's headers. Same baseline as the student portal, plus two things the
 * portal does not need:
 *
 *   - `X-Robots-Tag: noindex, nofollow`. This deployment carries the student
 *     roster. It should never appear in a search result, and "nobody knows the
 *     URL" is not a reason to let a crawler find out.
 *   - A stricter Permissions-Policy, since the desk has even less business
 *     asking for a device than the portal does.
 *
 * The Content-Security-Policy is built in proxy.ts, because it needs a
 * per-request nonce. */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const securityHeaders = [
  /* No referrer to a scraped source site. The host domain is shown on every
   * card, so a student clicking through should not also hand that site their
   * path through this app. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  /* Nothing here uses a camera, a microphone or a location. Say so, so an
   * injected iframe or script cannot ask on the page's behalf. */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  /* HSTS is inert over plain http, so it is safe to set in development too and
   * cannot be forgotten at deploy time. */
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  /* Not a secret, but not a public page either: this one lists students. */
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  /* The shared packages ship as TypeScript source and are compiled as part of
   * this app, so a change in packages/core cannot go stale behind a build
   * artefact. Tracing starts at the repo root because they live above this
   * directory. */
  transpilePackages: ["@rof/core", "@rof/server", "@rof/styles"],
  /* Both must point at the repo root, and Next requires them to agree: the
   * workspace packages this app compiles live above its own directory, and the
   * root also holds the lockfile Turbopack looks for. */
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  /* This app lives in a subdirectory of the repo, and the user's home has a
   * stray package-lock.json. Without this, Turbopack walks up past the repo
   * root looking for a lockfile and warns about the one it finds. */

  reactStrictMode: true,
  /* The framework's own version header tells an attacker which CVEs to try. */
  poweredByHeader: false,
  /* Every font is self-hosted by next/font and every icon is inline SVG, so
   * the app makes no third-party requests at all and the image optimiser has
   * no remote patterns to allow. */
  images: { remotePatterns: [] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
