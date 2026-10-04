# Deploying

Three Vercel projects from one repository, plus the hosted Supabase that
already exists. npm workspaces at the repo root is what lets all three share
`packages/core`, `packages/server`, `packages/styles` and `packages/ui`, so the
deployments can never serve different shapes of the same record — or, since the
desk landed, different shapes of the same button.

```
                     ┌──────────────────────────┐
  student ──────────▶│  web   (Vercel project)  │  pages, no credentials
                     └────────────┬─────────────┘
                                  │  NEXT_PUBLIC_API_BASE
                                  ▼
                     ┌──────────────────────────┐     ┌──────────────────┐
                     │  api   (Vercel project)  │────▶│  Supabase        │
                     │  SUPABASE_SERVICE_KEY    │     │  (already hosted)│
                     └──────────────────────────┘     └──────────────────┘
                                                               ▲
                     ┌──────────────────────────┐              │
  staff ────────────▶│  admin (Vercel project)  │──────────────┘
                     │  SUPABASE_SERVICE_KEY    │   reads AND writes
                     └──────────────────────────┘
```

The desk talks to Supabase directly rather than through the API, because it is
the only thing that writes and the API is a read cache. It is also the only
deployment a student should never reach — §6 covers how that is enforced, and
it is an account check, not an unlisted URL.

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
| `OPENROUTER_API_KEY` | optional — switches Rover on (see below) |
| `ROVER_MODEL` | optional — overrides `nvidia/nemotron-3-super-120b-a12b:free` |

`ALLOWED_ORIGINS` is the CORS allowlist and is enforced in `api/proxy.ts`. In
production it is the *whole* list — localhost is only added in development. A
Vercel preview deployment has a different hostname on every build, so either
add the preview URL or point previews of the frontend at the production API.

**`OPENROUTER_API_KEY` goes on whichever project serves `/api`.** That is this
one when `NEXT_PUBLIC_API_BASE` is set, because the browser then sends every
data request — Rover's included — straight here. In a single-deployment setup
it goes on the frontend instead. It is never prefixed `NEXT_PUBLIC_`.

**A manual alias does not follow a production deploy. A project domain does.**
This cost two deploy cycles before anyone worked out which of those two things
each hostname was.

`vercel alias set <url> <host>` pins a hostname to **one specific deployment**,
for good. It is a pointer at a build, not at an environment, so the next
`--prod` leaves it exactly where it was. That is what `orbit-bits.vercel.app`
and `orbit-bits-api.vercel.app` were, and it is why the ritual of re-pointing
them after every deploy existed.

A hostname attached to the project instead — Settings → Domains, or
`POST /v10/projects/<id>/domains` — points at whatever the project's current
production deployment is, and keeps doing so. `orbit-ruby-five-16.vercel.app`
and `orbit-api-psi.vercel.app` always worked without the ritual for exactly
this reason: a project's generated domain is a project domain.

Both custom hostnames are project domains now:

| Host | Kind | Follows `--prod`? |
|---|---|---|
| `orbit-bits.vercel.app` | project domain on `orbit` | yes |
| `orbit-bits-api.vercel.app` | project domain on `orbit-api` | yes |
| `orbit-ruby-five-16.vercel.app` | generated | yes |
| `orbit-api-psi.vercel.app` | generated | yes |
| `orbit-desk-delta.vercel.app` | generated | yes |

So **there is nothing to run after a deploy.** If a hostname ever goes stale
again, the question to ask is not "did I forget the alias" but "is this a
project domain or did someone pin it with `vercel alias set`":


```bash
# lists project domains — a pinned alias will NOT appear here
curl -s "https://api.vercel.com/v9/projects/orbit/domains?teamId=$TEAM" \
  -H "Authorization: Bearer $TOKEN"
```

## Deploy the portal from the repo ROOT, with the root linked to `orbit`

The `orbit` project's Root Directory is `web`, so Vercel applies that itself.
Two ways to get this wrong, both of which stop the deploy dead:

```bash
vercel --prod --cwd web
# Error: The specified Root Directory "web" does not exist.   (web/web)

cd /Users/…/IEEE-hackathon && vercel --prod        # with no .vercel here
# Error: Project names … must be lowercase.                  (it tried to
#   CREATE a project named after the folder, and the folder has capitals)
```

The second one is the trap: the CLI does not say "this directory is not
linked", it says the name is invalid, which reads like a Vercel-side problem.
Link the root once and both go away — `.vercel/` is gitignored, so a fresh
clone has to do it again:

```bash
vercel link --yes --project orbit     # at the repo root, NOT in web/
vercel --prod --yes                   # builds web/ per the project settings
```

Smoke-test against the hostname the browser actually calls — the one in
`NEXT_PUBLIC_API_BASE` — and never only against the generated domain. The
generated one can be perfectly healthy while students see a 404, which is the
shape the Rover outage took.

`OPENROUTER_API_KEY` is set on `orbit-api` as a Secret, in Production and Preview. Preview also
needs it because `ALLOWED_ORIGINS`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
are Production-only, so a preview deployment serves the committed snapshot and
sends no CORS header — a preview can prove the route and the key, never the
whole path. Smoke-test Rover on production:

```bash
curl -s -N -X POST https://orbit-api-psi.vercel.app/api/rover \
  -H 'content-type: application/json' \
  -H 'origin: https://orbit-ruby-five-16.vercel.app' \
  -d '{"turns":[{"role":"user","text":"Fully funded master'"'"'s scholarships closing soon"}],"profile":null}'
```

Expect `status`, `cards`, then `text` frames. `GET /` on the API reports
`rover.status` and the day's remaining budget, which is the fastest check that
the key is being read at all.

Leaving it off is a supported configuration, not a broken one: `/api/rover`
answers 503 with a sentence, the Rover screen says it is not switched on, and
every other screen is unaffected. Rover is the only feature in the product that
costs money per use, so switching it on is a deliberate act.

Smoke test once it is up:

```bash
curl https://<api>.vercel.app/
# {"status":"ok","origin":"live","openCalls":431,"rover":"on",...}
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

That is the only one. No Supabase credentials belong on this project, and no
Anthropic key either — with `NEXT_PUBLIC_API_BASE` set, `/api/rover` is served
by the API project and the key lives there.

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

## 6 · The desk project

**Deployed: https://orbit-desk-delta.vercel.app** (project `orbit-desk`).

A third Vercel project from the same repository. Add it the way the other two
were added: New Project, same repo, then change the root directory.

Two things cost time the first time and will again:

- **`orbit-desk.vercel.app` is not ours.** That name belongs to an unrelated
  Vite app — the `*.vercel.app` namespace is global, not per-account. Vercel
  assigned `orbit-desk-delta.vercel.app` instead, the same way `orbit-api`
  ended up on `orbit-api-psi`. Read the project's domain back after creating
  it rather than assuming the name; `curl`ing the one you expected returns
  somebody else's 200.
- **A new project starts with SSO protection ON.** `ssoProtection` defaults to
  `all_except_custom_domains`, so every deployment URL 302s to a Vercel login
  and staff cannot reach the desk at all. `orbit` and `orbit-api` both run with
  it off. Turning it off is correct here and is not what keeps students out —
  see "Access is an account check" below.

| Setting | Value |
|---|---|
| Root Directory | `admin` |
| Framework | Next.js (detected) |
| Install Command | `npm install --workspaces --include-workspace-root` |

Environment variables:

| Name | Value | Reaches the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key | yes |
| `SUPABASE_URL` | the same URL | no |
| `SUPABASE_SERVICE_KEY` | the **service** key | no — and it must stay that way |
| `NEXT_PUBLIC_API_BASE` | `https://<api>.vercel.app` | yes |

Both halves are needed and they are not interchangeable. The two
`NEXT_PUBLIC_` Supabase values are what the browser signs in with: Supabase
Auth is a browser-side SDK, so the anon key and the project URL have to be
public, and the anon key is safe to publish because RLS is what actually
decides what it can read. The two unprefixed values are what the desk's own
`/api/desk/*` routes use to read the roster and write overrides, where RLS is
deliberately bypassed and every route re-checks `students.is_staff` itself.

**Never give the service key a `NEXT_PUBLIC_` prefix.** That prefix is not a
label, it is an instruction to inline the value into the JavaScript bundle. A
service key in a public bundle is full read and write on every table in the
project, roster included, for anyone who opens devtools.

### Access is an account check, not a secret URL

The desk is public on the internet and is supposed to be. What keeps students
out is `students.is_staff`, verified server-side on every route — 401 signed
out, 403 as a student, 200 as staff. Granting it is one statement:

```sql
update students set is_staff = true where email = 'someone@dubai.bits-pilani.ac.in';
```

Revoking it is the same statement with `false`, and it revokes for that one
person. That was the whole reason the shared `ADMIN_TOKEN` had to go: it could
not be taken away from one person without changing it for everyone, and it
recorded that "staff" did something, never who.

`X-Robots-Tag: noindex, nofollow, noarchive` is set in `admin/next.config.ts`
because this deployment lists students. It keeps the URL out of search results;
it is not what keeps people out.

### After deploying the desk

```bash
U=https://orbit-desk-delta.vercel.app
BODY=$(curl -s -D /tmp/h.txt "$U/?cb=$RANDOM")
NONCE=$(grep -i '^content-security-policy' /tmp/h.txt | grep -oE 'nonce-[A-Za-z0-9+/=]+' | cut -d- -f2-)
echo "$BODY" | grep -c "nonce=\"$NONCE\""     # must be > 0
```

**Fetch the header and the body in ONE request.** Two curls get two responses
with two different nonces, which reports 0 of 13 stamped and looks exactly
like the failure below — it is the measurement that is broken, not the app.
A cached response (`x-vercel-cache: HIT`) does the same thing for the same
reason, which is what the `?cb=` is for.

Same check as the portal, and the same failure if it is genuinely missing: the HTML
paints, `strict-dynamic` blocks every script, and the desk sits on "Checking
your session…" forever while looking like a backend problem. `admin/proxy.ts`
sets the policy on the request headers and `admin/app/layout.tsx` has
`export const dynamic = "force-dynamic"`; both are load-bearing.

Then sign in with a campus account that has `is_staff = true` and confirm the
rail, the Overview counts and one listing edit surviving on the portal.
