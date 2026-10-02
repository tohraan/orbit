# Opportunities — frontend

The Next.js front end for the research opportunity index, built to
`~/Downloads/design-ieee.md`, which is the single source of truth for the UI
layer (§124). Section numbers in the code comments refer to it.

## Run it

```bash
npm install --workspaces --include-workspace-root   # from the repo root
cd web && npm run dev                               # http://localhost:3100
```

No credentials needed. With no `.env.local` the frontend serves its own
same-origin `/api` routes off `data/opportunities.json` — the committed
snapshot of 431 open calls — and every screen works.

To run against the standalone data service as well:

```bash
cd api && npm run dev     # http://localhost:3101
# web/.env.local:  NEXT_PUBLIC_API_BASE=http://localhost:3101
# api/.env.local:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ALLOWED_ORIGINS=http://localhost:3100
```

`DEPLOY.md` at the repo root covers the two Vercel projects.

## Layout

```
packages/core     isomorphic — types, formatting, currency, query validation,
                  the seeded ordering, the row projection
packages/server   server-only — the Supabase reader, response plumbing, the
                  rate limiter, and the five route handlers
web               this app: pages + a same-origin mount of those handlers
api               the standalone data service: the same handlers, nothing else
```

Both apps mount the *same* handlers, so `web`'s `/api` and the deployed data
service cannot drift apart.

## Data flow

```
Supabase (raw_items + sources)
   │  packages/server/src/source.ts   5-minute in-process cache,
   │                                  falls back to the committed snapshot
   ▼
packages/core/src/project.ts          row -> wire shape
   │
   ▼
/api/feed            saved + first chunk + dashboard counts, one round trip
/api/opportunities   list, filtered/sorted/paged (+ ?facets=1)
/api/opportunities/:id
/api/facets          filter options + the AED rate table
/api/stats
   │
   ▼
web/lib/useApi.ts    useApi (one shot) / useChunks (accumulating)
                     -> skeleton / empty / error on every screen
```

## Loading behaviour

The grid loads **twelve cards at a time**, appended, with an IntersectionObserver
600px ahead of the fold and a real `Load more` button for keyboard users.
Sending all 431 records (~740 kB) up front was the main thing standing between
a cold visit and a usable page.

The default order is `mixed`, not deadline: listings are bucketed into urgency
bands, each band is shuffled against a per-session seed, and the bands are
interleaved so **every chunk carries a spread of deadlines** rather than twelve
listings that all close this week. It is seeded rather than random so chunk 2
never repeats chunk 1, and it changes between visits so the same dozen are not
the only ones anyone ever sees. `packages/core/src/shuffle.ts` has the detail.

## Security

| Concern | Where |
|---|---|
| Service key never reaches the browser | `packages/server/src/source.ts` is `server-only`; no `NEXT_PUBLIC_` secret exists; with a deployed API the frontend has no credential at all |
| Internal errors never reach the browser | `packages/server/src/api.ts:fail()` — fixed sentence out, real one to the log |
| Query input | `packages/core/src/query.ts` whitelists every parameter and bounds length, count and alphabet |
| Request floods | `packages/server/src/rate-limit.ts` — per-IP fixed window, process-local (see its note on what that does and does not cover) |
| Script injection | `web/proxy.ts` — nonce CSP with `strict-dynamic`, no third-party host permitted |
| Cross-origin reads of the API | `api/proxy.ts` — explicit origin allowlist, never `*` |
| Clickjacking, sniffing, referrer leak | `web/next.config.ts` / `api/next.config.ts` headers |
| Outbound links | `rel="noopener noreferrer"` via `ExternalButton` |
| Student data | Never leaves the device; `web/lib/store.ts` validates everything it reads back |

Fonts are self-hosted by `next/font` and no scraped image is rendered, which is
what lets the CSP forbid every external host outright.

## Screens

`/` `/explore` `/opportunity/:id` `/saved` `/compare` `/deadlines`
`/applications` `/profile` — the map in design-ieee.md §82.

## Known gaps

- **No accounts.** Saved, tracked and preference state is per browser. Said
  plainly on `/profile` and `/saved` rather than implied away.
- **No field-of-study filter.** §41 lists one; no source populates
  `fields_of_study`, so the control is omitted (§105) and reappears by itself
  if a source ever fills it — the API returns the facet either way.
- **Preferences do not re-rank Explore.** Explained on `/profile`: a relevance
  score over an index with no field of study and no country on 243 of 431 rows
  would be mostly guesswork dressed as personalisation.
- **Non-USD conversions are indicative.** The dollar peg (3.6725) is exact;
  euro and pound rates are a dated table in `packages/core/src/fx.ts`, and the
  UI prefixes those with `≈`.
- **Deep detail on a subset.** 137 of 431 listings carry eligibility text and
  148 an application link; the rest say so rather than showing an empty panel.
