/* Where the browser sends its data requests.
 *
 * Unset (local development, or a single-deployment setup): the frontend's own
 * same-origin /api routes answer, which mount exactly the same handlers out of
 * packages/server.
 *
 * Set to the data service's origin: requests go straight there, one hop, and
 * this deployment carries no Supabase credentials at all.
 *
 * NEXT_PUBLIC_ is correct here and only here: it is a public URL the browser
 * has to know. The Supabase key is never prefixed, lives only on the API
 * project, and `server-only` enforces that in code.
 *
 * Normalised once at module load so a trailing slash in the env var cannot
 * produce `https://api.example.app//api/feed`. */

const RAW = process.env.NEXT_PUBLIC_API_BASE ?? "";
export const API_BASE = RAW.trim().replace(/\/+$/, "");

/** `path` always starts with `/api/`. */
export function api(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
