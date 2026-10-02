import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The standalone data service: route handlers only, no pages, no client
 * bundle. It is deployed as its own Vercel project with the Root Directory set
 * to `api/`, which is what lets it scale and cold-start independently of the
 * frontend — and, more usefully, means SUPABASE_SERVICE_KEY is configured on
 * this project alone. The frontend deployment never holds it. */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* The handlers live in packages/server and are shipped as TypeScript source,
   * so Next compiles them as part of this app rather than consuming a build
   * artefact that could go stale. */
  transpilePackages: ["@rof/core", "@rof/server"],
  /* Workspace packages sit above this directory, so tracing has to start at
   * the repo root or the deployed function is missing its own code. */
  /* Both must point at the repo root, and Next requires them to agree: the
   * workspace packages this app compiles live above its own directory, and the
   * root also holds the lockfile Turbopack looks for. */
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          /* A JSON API is never a document. Nothing here should be framed, and
           * no referrer should leak to it. */
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
