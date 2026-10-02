# Handover — 2 Oct 2026

Written while you were away. **Read the "Not built" section first**, because
you asked for more than an hour holds and I would rather you find the gaps here
than in a demo.

## Run it

```bash
npm install --workspaces --include-workspace-root   # repo root
cd api && npm run dev      # http://localhost:3101   data service
cd web && npm run dev      # http://localhost:3100   frontend  ← open this
```

The college desk is at `/admin`. Its token is in `api/.env.local` and
`web/.env.local` as `ADMIN_TOKEN` (both gitignored).

---

## Built and verified

### Timeline on `/deadlines`
Horizontal axis, one dot per listing, stacked where several close the same day
— which is the normal case here, not the edge: **111 dated listings sit on 43
distinct dates, and 1 Dec alone holds 11.**

Everything you chose is in: 30/90/180 range buttons that drive *both* the axis
and the list below it, every dated listing plotted with only your saved and
tracked ones labelled, uncapped vertical stacks, a card on click, labels
staggered across rows so neighbours never collide, 30-day forced on phones.

Two things I decided, since you left them to me:
- **Stacks are uncapped.** The tallest is 10 at 30 days and 11 at six months,
  so the band settles near 130px and barely moves between ranges. Capping would
  hide data to solve a problem this dataset does not have.
- **The gradient is anchored to the urgency bands, not to fixed percentages.**
  Otherwise a 30-day axis fades to neutral at its right-hand end, where
  listings are still inside the 30-day warning band — the axis would contradict
  the chips below it.

### Expired listings removed portal-wide
You said no listing past its deadline should show anywhere, so it is enforced
once, in `packages/server/src/source.ts`, not per screen. 431 → **427** rows.
Every count, facet, search and the timeline agree because they read one filtered
index. A saved item that expires is reported as "left the index" rather than
vanishing silently.

### BITS brand colour + dark theme
Palette taken from the BITS Pilani logo: Cosmic Cobalt `#2B2B88` (primary
action), Sky Blue `#5CCAE8`, UC Gold `#B78A2D` (funding/warning), Shandy
`#FFE275`, Fire Engine Red `#CF2027` (urgent).

Dark theme is a full three-state system — light, dark, follow-the-system — with
a toggle in the header. **Verified in all four combinations:** system-follow in
both directions, and an explicit choice overriding the OS both ways. Cobalt is
lifted to `#7F8CF0` on dark because `#2B2B88` on near-black is unreadable.

Every theme-blind colour literal was tokenised in the process — chip ink, the
nav hover, the modal scrim, and the skeleton shimmer, which was a white sweep
that would have flashed on dark.

### Admin desk — `/admin`
Staff add an opportunity; it gets an **"Added by college"** tag and tier-1
provenance.

The design decision worth knowing: a hand-added listing is **not a parallel
table**. `db/014` registers `college_desk` as a sixth *source* (kind `manual`,
`enabled=false` so the scraper never touches it), so a staff listing is an
ordinary `raw_items` row. It therefore inherits filtering, facets, search, the
deadline timeline, saving and comparison **with zero extra code** — which is
the property this architecture was built for.

Verified live: a test listing went in and immediately appeared in the index
(428), as its own facet bucket, tier 1, with its AED amount parsed and its
deadline counted.

Write path is hardened: bearer token compared in constant time, **refuses every
request when `ADMIN_TOKEN` is unset** rather than running open, writes pinned to
`college_desk` so it cannot forge or overwrite a scraped row, and every field
validated server-side. Confirmed rejected: `javascript:` URLs, past deadlines,
unknown types, negative amounts.

### Student onboarding — `/welcome`
Three short steps (you / your course / what you want) with a real progress
percentage counted from fields actually filled, not from the step number. Every
step is skippable because the matcher degrades honestly rather than failing.

### Matching — `/` ("Matched for you")
A transparent weighted scorer: degree level 34, field 26, funding 18, country
12, time-to-prepare 10. It shows **the reasons behind every score**, and when
the profile is thin it says what is missing *and what each gap is worth* — that
is the "minimum we need from you" prompt you asked for.

Scores below a confidence floor render drained of colour and labelled "unsure"
rather than as a recommendation.

### Infinite scroll — resolved, mostly by explaining
**Nothing in the grid was ever sample data.** All 427 cards come from the API;
"showing 12" was the first page of a paginated request and the label made it
read as static. The label is now "427 opportunities · 12 seen", the Load-more
button is a fallback that appears only if scroll-loading fails, and the batch
size stays a documented constant so every visitor hits the same cache
boundaries.

### Bugs found and fixed along the way
- `useApi` reported "not ready to fetch" as *finished with no data*, so every
  cold load flashed an empty state before the real request went out.
- The timeline's width measurement ran against the loading skeleton, which does
  not carry the ref — so `wrapW` stayed 0 and **every label was silently
  dropped**.
- CORS allowed `content-type, accept` but not `authorization`, so the admin
  desk's own fetch was blocked by preflight.
- Opportunity cards had a fixed `height`; a wrapped chip row overflowed it and
  footers landed on the card below.
- The deadline-spread bars rendered empty — the fill was an inline `<span>` in
  a non-flex track, so width and height did not apply.

---

## NOT built — and why

I am not going to dress these up.

### Document upload, parsing and achievement extraction
**Not started.** This is the largest item on your list and needs: a Supabase
Storage bucket with per-student access policies, an upload flow with real
progress, PDF **text-layer extraction** (you ruled out OCR, which is the right
call — a text layer is cheap and reliable, OCR is neither), a parser, and a way
to feed extracted facts into the scorer. It also cannot be built responsibly
before auth exists: without identity there is no way to say whose resume a file
is, and no way to stop one student reading another's.

### Email notifications
**Not started.** Needs a provider (Resend or SendGrid), a verified sending
domain, and a scheduler. The deadline data and the saved list it would read are
both already there, so this is provider-and-plumbing work, not design work.

### Push notifications
**Not started.** Needs VAPID keys, a service worker, and a subscription store —
which again means per-user records, which means auth.

### A "trained, battle-tested" matcher
**Deliberately not claimed.** There is no labelled data in this project — nobody
has recorded which students applied to what, let alone what succeeded — so there
is nothing to train on and nothing to validate against. What you have instead is
explainable and arguable, and it says so on screen. When you have outcome data,
the weights table is the thing to replace.

### Repeated profile reminder
**Plumbing only.** `PROFILE_REVIEW_DAYS` and a `needsReview` flag exist in
`web/lib/store.ts`; nothing surfaces them yet.

---

## The decision I need from you

**Auth.** It blocks documents, push, email, per-student records, and it is the
only thing standing between the admin desk and a real permission model.

The desk currently uses one shared bearer token. That keeps the write endpoint
off the open internet, but it is **not sign-in**: it cannot tell two staff
members apart and cannot be revoked for one of them. The listing payload
already carries an `added_by` field waiting for a real identity.

My recommendation: **Supabase Auth with email sign-in restricted to
`@dubai.bits-pilani.ac.in`**, a `role` column separating staff from students,
and RLS policies on the document bucket keyed to the authenticated user. That
one piece unblocks four of the five unbuilt items.
