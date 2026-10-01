# Screens, features and the user cycle

What was asked for, where each thing lives, and what state it is in. No design
content — this is the functional spec.

Published at the artifact URL in `CONTEXT.md`. Data file built by
`scripts/build-ui-data.mjs`; runtime storage is the artifact `db` capability.

---

## 1. The fourteen requested features, mapped

| # | Requested | Screen it lives on | State |
| --- | --- | --- | --- |
| 1 | Chatbot that digs into preferences, then suggests | **Advisor** (drawer, reachable from every screen) | Built. Grounded — recommends only from a 28-row shortlist passed in the prompt |
| 2 | Proper discard of stale opportunities | Ingest + **Discover** | Built at both ends: rejected at ingest, and anything past its date is dropped at load and counted in the footer |
| 3 | Opportunity information, then in-depth detail from the source | **Discover → Details** | Built. Deep fields exist for 155 of 431 rows; the rest show a stated "not collected" panel, never a blank |
| 4 | Public comments from people who were enrolled | **Discover → Details → Experiences** | Mechanism built on shared storage. **Zero real entries** — ships empty with a composer. Nothing fabricated |
| 5 | Historical data about past years and rounds | **Discover → Details → Earlier rounds** | Panel built, **data-blocked**: 0 title-stem matches across the corpus, the index is one month old. Shows what is true (indexed-from date) and says the rest will fill as later rounds arrive |
| 6 | Saved opportunities and deadline reminders | **Saved** | Built. Saves persist per person; reminders are real calendar events (.ics, alarms at 7 days and 1 day) rather than a notification the page cannot send |
| 7 | Kanban application status tracker | **Tracker** | Built. Five stages, drag between columns or arrow buttons on touch |
| 8 | Sidebar filter | **Discover** | Built. Seven filter groups plus search, sort and clear-all |
| 9 | Timeline based on urgency | **Timeline** | Built. Six urgency bands with counts and proportion bars |
| 10 | Source domain and posted timestamp | **Discover** card + Details | Built. Domain, tier, source-published date and first-indexed date |
| 11 | Compare opportunities | **Compare** | Built. Up to three side by side, twelve attributes, best amount and latest deadline marked |
| 12 | Student profile page | **Profile** | Built. Stored privately per person; drives the fit score and briefs the advisor |
| 13 | Loading screen and empty states | every screen | Built. Skeleton on load; a distinct, worded empty state per screen; a stated failure state if the data file does not load |
| 14 | Currency to AED converter with a switch | masthead switch, applied everywhere | Built. **Fixed table, dated, not live** — the page cannot reach an FX service. USD is the exact central-bank peg (3.6725); others are labelled indicative |

---

## 2. Screens

Six tabbed screens plus one drawer. Every screen is reachable from every other.

### Discover
The default. Filter rail (degree level, type, funding, closing window, source
tier, detail available, country) + search + sort (deadline both ways, best fit,
recently posted, title, source). Cards carry: type, deadline chip coloured by
urgency, degree levels, funding kind, fit %, title linking to the source,
summary, clamped eligibility, what it covers, then the provenance line —
source name, tier, **domain**, **posted date**, country, duration, amount.
Four actions per card: Details, Save, Compare, Track.

**Details** expands in place: eligibility, what it covers, how to apply,
documents needed, every figure published on the page (with the dirham
conversion), earlier rounds, where this came from, and experiences.

### Timeline
Everything open, grouped by urgency: This week, Next 30 days, Next 90 days,
Later this year, Next year onward, Rolling or undated. Each band shows its
count and its share of the whole.

### Compare
Up to three picked opportunities side by side across twelve attributes. The
largest amount (compared in dirhams) and the latest deadline are marked.

### Tracker
Kanban: Interested → Preparing → Submitted → Interview → Decided. Cards carry
the deadline chip so urgency stays visible while tracking. Drag, or arrows.

### Saved
Saved opportunities ordered by deadline, each with a live countdown, plus
"add every deadline to my calendar" as one .ics file.

### Profile
Degree level, fields, countries, nationality, funding need, expected
graduation. States plainly what it changes and how fit is scored.

### Advisor (drawer)
Chat. Reachable from everywhere. See §4.

---

## 3. The user cycle

```
  open
    │
    ▼
  DISCOVER ──────── filter / search / sort ────────┐
    │                                              │
    │ (first visit, nothing matches well)          │
    ▼                                              │
  PROFILE  level · fields · countries · funding     │
    │  ↳ fit % now on every card                    │
    │  ↳ "Best fit" sort unlocked                   │
    │  ↳ advisor is briefed                         │
    └──────────────► back to DISCOVER ◄─────────────┘
                         │
        ┌────────────────┼─────────────────┬──────────────┐
        ▼                ▼                 ▼              ▼
     DETAILS          COMPARE           ADVISOR        TIMELINE
   read eligibility  2-3 side by side  ask in words   what closes when
   how to apply                        get #refs      
   past rounds                         click → card   
   experiences                                        
        │                │                 │              │
        └────────────────┴────────┬────────┴──────────────┘
                                  ▼
                               SAVE  ──► SAVED ──► calendar reminder (.ics)
                                  │
                                  ▼
                              TRACK ──► TRACKER
                                        Interested → Preparing → Submitted
                                        → Interview → Decided
                                                        │
                                                        ▼
                                           share an experience back
                                           (DETAILS → Experiences)
                                                        │
                                                        ▼
                                           the next student reads it
```

The loop closes at the bottom: someone who applied writes up what the process
was actually like, and that text appears on the opportunity for whoever looks
at it next. That is the only way the experience data will ever exist — it is
not scraped and will not be invented.

---

## 4. The advisor, precisely

1. The student types a question.
2. The page scores every open opportunity: profile fit + keyword overlap with
   the question + small bonuses for having a deadline and eligibility text.
3. The top 28 are compacted to one line each (`id | title | type | levels |
   deadline | funding | amount | country | source`).
4. Those lines, the profile, standing instructions and the last few turns are
   sent to Claude. The shortlist is the only thing it may recommend from.
5. Replies refer to opportunities by `#id`; the page turns each into a chip
   that jumps to that card with its details open.

Standing instructions it is held to: recommend only from the shortlist; never
invent a programme, deadline, amount or URL; say so when the index cannot
answer; call an unpublished field unpublished rather than guessing; flag that a
programme may require enrolment at an institution **in India**, which a Dubai
campus can fail; never promise eligibility.

Cost note: the call runs on the viewer's own Claude account and asks their
permission the first time. Without permission every other screen still works.

---

## 5. Where state lives

| State | Where | Who sees it |
| --- | --- | --- |
| Profile | `data/users/<id>/profile` | That person only — private even from whoever published the page |
| Saved | `data/users/<id>/saved` | That person only |
| Tracker stages | `data/users/<id>/tracker` | That person only |
| Experiences | `experiences/<id>` | Everyone who can open the page; each person can only write their own document |
| Current view, filters, compare picks | in the page | Nobody; survives a republish, not a reload |

A view without storage (signed out, or a public link) still filters, searches,
compares, reads details and uses the timeline. Saving, tracking, the profile
and experiences go quiet rather than erroring.

---

## 6. Known gaps

1. **No experience data.** The feature is a mechanism, not content.
2. **No historical rounds.** Needs the index to run across more than one cycle.
3. **Deep detail on 155 of 431.** The rest need the detail queue drained.
4. **FX is a fixed table**, dated, with only USD exact.
5. **431 rows, ~50% from one tier-3 aggregator.** A product problem, not a UI
   one — see `docs/opportunity-landscape.md`.
