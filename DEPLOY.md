# Deploying

Two Vercel projects from one repository, plus the hosted Supabase that already
exists. npm workspaces at the repo root is what lets both share
`packages/core` and `packages/server`, so the two deployments can never serve
different shapes of the same record.

```
                     ┌──────────────────────────┐
  browser ──────────▶│  web   (Vercel project)  │  pages, no credentials
                     └──────────────────────────┘
       │
       │  NEXT_PUBLIC_API_BASE
       ▼
  ┌──────────────────────────┐        ┌──────────────────┐
  │  api   (Vercel project)  │───────▶│  Supabase        │
  │  SUPABASE_SERVICE_KEY    │        │  (already hosted)│
  └──────────────────────────┘        └──────────────────┘
```

## A note on what the split does and does not buy

It does **not** shorten the request path. The browser makes one hop either
way — to `web/api/*` or to the API project — and Next route handlers already
run in the same region as the page that calls them. What actually made the
first load fast is in the app, not the topology: the index is cached in
process for five minutes, the grid loads twelve cards at a time instead of all
431 (~740 kB), and the opening screen is a single `/api/feed` round trip
rather than four.

What the split genuinely gives you:

- **`SUPABASE_SERVICE_KEY` lives on one project.** The frontend deployment
  holds no credential that can read the database. That is the real win.
- **Independent scale and cold starts.** The data service has no React, no
  client bundle and no pages, so its functions are small and start fast, and a
  traffic spike on the UI does not resize the thing holding the database key.
- **Region control.** Put the API project in the region the Supabase project
  is in. That is the one deployment choice that measurably cuts latency,
  because it shortens the hop this app cannot cache away.

If you would rather run one deployment, leave `NEXT_PUBLIC_API_BASE` unset:
`web` then serves the same handlers at its own `/api/*` and everything works.

## 1 · Supabase

Already provisioned. Nothing to deploy. Note the project's **region** — you
want the API project in the same one.

The frontend never talks to it. Row-level security is not what protects it
here: the service key bypasses RLS, which is exactly why it is confined to one
deployment and read only by `packages/server/src/source.ts`, a module marked
`server-only` so the build fails rather than leaking it into a bundle.

## 2 · The API project

| Setting | Value |
|---|---|
| Root Directory | `api` |
| Framework | Next.js (detected) |
| Install Command | `npm install --workspaces --include-workspace-root` |
| Region | the same one as Supabase |

Environment variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the service role key |
| `ALLOWED_ORIGINS` | the frontend's origin, comma-separated, no trailing slash |

`ALLOWED_ORIGINS` is the CORS allowlist and is enforced in `api/proxy.ts`. In
production it is the *whole* list — localhost is only added in development. A
Vercel preview deployment has a different hostname on every build, so either
add the preview URL or point previews of the frontend at the production API.

Smoke test once it is up:

```bash
curl https://<api>.vercel.app/
# {"status":"ok","origin":"live","openCalls":431,...}
```

`origin` is the thing to read. `live` means it is reading Supabase; `snapshot`
means it fell back to the committed file, which is what you will see if the
credentials are wrong — the service degrades instead of erroring, so check
this rather than assuming a 200 means the database is connected.

## 3 · The frontend project

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework | Next.js (detected) |
| Install Command | `npm install --workspaces --include-workspace-root` |

Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://<api>.vercel.app` |

That is the only one. No Supabase credentials belong on this project.

`NEXT_PUBLIC_` is correct here and nowhere else: it is a public URL the
browser has to know. It also widens the Content-Security-Policy's
`connect-src` (`web/proxy.ts` parses the origin out of it), so a change to this
variable needs a redeploy, not just a restart.

## 4 · After deploying

```bash
curl -I https://<frontend>.vercel.app/explore | grep -i content-security-policy
```

The policy must contain `'nonce-…'` **and** the API origin in `connect-src`.
If the nonce is missing, every script on the page is blocked by
`strict-dynamic` and the app renders as a static shell that never loads data —
it looks exactly like a broken backend. The two things that prevent it are
already in place and are easy to undo by accident:

- `web/proxy.ts` sets the policy on the **request** headers as well as the
  response; Next reads the nonce from the request to stamp its script tags.
- `web/app/layout.tsx` sets `export const dynamic = "force-dynamic"`; a
  prerendered page has no request to take a nonce from.

## 5 · Refreshing the data

The scraper is unchanged and still writes to Supabase. The API reads it live
and caches for five minutes, so a new scrape appears on its own.

The committed snapshot is only the offline fallback. Refresh it when you want
the no-credentials path to be current:

```bash
node scripts/build-ui-data.mjs          # Supabase -> ui/opportunities.json
cd web && npm run sync-data             # -> web/data/opportunities.json
cp ui/opportunities.json api/data/      # -> the API's fallback
```
