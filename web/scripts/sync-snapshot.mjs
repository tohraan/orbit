#!/usr/bin/env node
/* Refresh web/data/opportunities.json from ../ui/opportunities.json.
 *
 * The snapshot is the app's offline fallback: when Supabase is unreachable (or
 * SUPABASE_SERVICE_KEY is not configured, as in a demo checkout) the API routes
 * serve this file instead of failing. Regenerate the upstream file first:
 *
 *   node ../scripts/build-ui-data.mjs && npm run sync-data
 */
import { copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "../../ui/opportunities.json");
const to = join(here, "../data/opportunities.json");
copyFileSync(from, to);
const kb = (statSync(to).size / 1024).toFixed(0);
console.log(`synced snapshot -> web/data/opportunities.json (${kb} kB)`);
