# Source registry — evidence

Every row was probed live. `scripts/probe-sources.sh` reproduces the accepted
set and exits non-zero if a tier-1 source is down.

**Last full probe: 2026-10-01 — 15/15 accepted sources returned items** (not just
200: the probe now asserts the body carries records, see below).

Of those 15: **14 are enabled** (`opportunity_desk` is off, db/012) and **10 feed
the student finder** — the other 4 are registers of already-awarded grants. See
*Audience fit* below.

Tiers: **1** primary funder (authoritative), **2** government / national scheme,
**3** aggregator blog (broad and fast, but must be verified before students see it).

---

## Accepted

| Tier | slug | kind | Verb + endpoint | Auth | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | `grants_gov` | post_api | `POST api.grants.gov/v1/api/search2` | none | `200`, `hitCount: 200` for keyword `fellowship` |
| 1 | `nih_reporter` | post_api | `POST api.reporter.nih.gov/v2/projects/search` | none | `200`, 14 kB for `fiscal_years:[2026]` |
| 1 | `nsf_awards` | json_api | `GET api.nsf.gov/services/v1/awards.json` | none | `200`, 8.4 kB |
| 1 | `nsf_funding` | rss | `GET nsf.gov/rss/rss_www_funding_upcoming.xml` | none | `200 application/rss+xml` |
| 1 | `ukri_opportunities` | rss | `GET ukri.org/opportunity/feed/` | none | `200 application/rss+xml`, 20.8 kB |
| 1 | `erasmus_plus` | rss | `GET erasmus-plus.ec.europa.eu/rss.xml` | none | `200 application/rss+xml`, 171 kB |
| 1 | `msca` | rss | `GET marie-sklodowska-curie-actions.ec.europa.eu/rss.xml` | none | `200 application/rss+xml` |
| 1 | `erc` | rss | `GET erc.europa.eu/rss.xml` | none | `200 application/rss+xml` |
| 1 | `cordis` | json_api | `GET cordis.europa.eu/api/search/results` | none | `200` with `q=contenttype='project'&format=json` |
| 1 | `openaire` | json_api | `GET api.openaire.eu/graph/v1/projects` | none | `200`, 1.2 kB |
| 2 | `commonwealth_cscuk` | rss | `GET cscuk.fcdo.gov.uk/feed/` | none | `200 application/rss+xml` |
| 2 | `daad_programmes` | json_api | `GET www2.daad.de/…/international-programmes/api/solr/en/search.json` | none | `200`, 23.8 kB |
| 3 | `opportunities_circle` | wp_rest | `GET www.opportunitiescircle.com/wp-json/wp/v2/posts` | none | `200`; see the deep-dive below |
| 3 | ~~`opportunity_desk`~~ | wp_rest | `GET opportunitydesk.org/wp-json/wp/v2/posts` | none | `200`, 7 kB — **disabled, db/012**, see below |
| 3 | `scholars4dev` | rss | `GET scholars4dev.com/feed/` | none | `200 application/rss+xml` |

### Why these, over a paid scholarship API

The brief says *publicly accessible sources* and *minimise manual collection*.
Tier 1 gives authoritative, structured, licence-clean data with stable contracts
and no key — which is strictly better than scraping an aggregator that is itself
scraping them. The aggregators stay in for breadth and speed of new listings;
their `authority_tier = 3` and `trust_score ≈ 0.6` mean a tier-1 record wins on
conflict. That layering *is* the answer to "how do we present the best
opportunities".

---

## Rejected, with reasons

| Candidate | Probe result | Verdict |
| --- | --- | --- |
| `findaphd.com` | `403` | **Excluded on ToS grounds**, not merely technical: its terms forbid automated collection. Do not route around this. |
| `jobs.ac.uk` | `/jobs/rss` → `200 text/html` | No real feed; the path serves a normal HTML page. |
| `nature.com/naturecareers` | `301` → `200 text/html` | Same. |
| `euraxess.ec.europa.eu` | `/jsonapi` 404, `?_format=json` 406, `/jobs/rss` 404 | No public API or feed found. High-value if one is ever exposed — EU research jobs + hosting offers. |
| `grants.nih.gov` guide RSS | `403` | Edge WAF blocks non-browser clients. Covered by `grants_gov` + `nih_reporter`. |
| `api.tech.ec.europa.eu` (EU F&T / "SEDIA") | `405` on GET, `500` on the documented multipart POST | Biggest remaining coverage gap. Worth one time-boxed retry; ERC + MSCA + CORDIS overlap much of it. |
| `youthop.com` | connect failure | Host unreachable from this network. |
| `etap.nsf.gov` (REU search) | `302` | Session-gated; would need browser automation. REU sites are partly reachable via `nsf_awards`. |
| `chevening.org` | connect failure | Blocked from this network. Retry from another. |

---

## Deep dive: `opportunities_circle` (WordPress + Elementor)

This was the project's original and only source, scraped by regex over listing
HTML. It has a public REST API, which changes the economics of the whole pipeline.

**What the list endpoint gives you, in one request per 100 posts:**

| Field | Where | Note |
| --- | --- | --- |
| id, slug, link | top level | `external_id` |
| title, excerpt | `.rendered` | |
| published / modified | `date_gmt`, `modified_gmt` | drives incremental fetch |
| **country** | `class_list` → `country-usa` | **not** a REST taxonomy route (`/wp/v2/country` → 404) |
| **funding type** | `class_list` → `funding_type-paid` | same |
| **degree level** | `categories` | `167` undergrad, `168` masters, `169` phd, `481` fellowships, `5`/`10610` internships, `14280` research internship, `7459` postdoc, `1194` grants |
| **expired flag** | category `2769` (`expire-opportunities`, **1,919 posts**) | exclude via `categories_exclude` |
| **deadline bucket** | `di_urgency` | `14708` ⚫ Expired (1,139), `14709` ⬜ No Deadline (424), plus 24h / 3d / 7d / 30d / 30d+ |
| image, description | `yoast_head_json`, `jetpack_featured_media_url` | |

**Incremental sync works:** `?modified_after=<ISO>&orderby=modified&order=desc`,
and the response carries `x-wp-total` / `x-wp-totalpages`. Measured **18 posts**
modified in the preceding five days — so a nightly run touches ~18 records
instead of re-crawling everything.

**What the API does *not* give you:**
- `acf` is `[]`. No custom fields. Deadline and section text are not there.
- `content.rendered` is ~7 kB with one `<h2>`, no tables and no external links —
  Elementor keeps the body in widget meta. The **rendered page** must be fetched
  for detail.
- `subject` (field of study) has 9 terms with counts of 0–2. Unusable; field of
  study is inferred by the classifier instead.

**The bug that produced empty columns.** The old parser ended a section at the
next heading *of any level*. The page renders:

```html
<h2>Eligibility Criteria :</h2>
<h3>Eligibility Criteria for Smithsonian Institution Fellowship 2027:</h3>
```

so the `<h2>`'s captured body was the whitespace before the `<h3>` — empty. That
is why `eligibility`, `benefits`, `documents` and `how_to_apply` were blank in
the original sheet export. `sections()` now ends a section at the next heading of
**equal or higher rank**, keeping nested headings as body text.

Measured after the fix, against live pages:

| Page | deadline | eligibility | benefits | how_to_apply | apply_link |
| --- | --- | --- | --- | --- | --- |
| `smithsonian-institution-fellowship` | `2026-10-15` | 1,857 ch | 1,131 ch | 2,278 ch | `fellowships.si.edu/SIFP` |
| `lester-b-pearson-scholarship-in-canada` | `2026-11-06` | 1,913 ch | 1,017 ch | 3,075 ch | `future.utoronto.ca/pearson-scholarships` |
| `daad-epos-scholarship` | `varies` | 1,616 ch | 1,583 ch | 3,107 ch | `static.daad.de/…` |

**DAAD is not a failure case.** The page states the deadline "is different for
each course and university", so the correct output is
`deadline_kind = 'varies'` with a `deadline_note` — not a silent null. This is why
`deadline_kind` exists as an enum (`fixed | rolling | varies | unknown`) rather
than the schema relying on a nullable date.

**Deadline location:** a bare Elementor text widget rendering
`Deadline: October 15, 2026`. No table, no meta tag.

**Apply-link extraction needs a denylist.** The page carries the site's own
funnel links (`opcircleacademy.com`, `nextgenyouthcamp.com`, `bit.ly`) plus ad and
analytics hosts. Order of preference: Elementor `button.default` widget → anchor
text matching apply/official/register → a link inside the application-process
section → last external link.

---

## Audience fit — what never reaches the finder

The platform serves BITS Pilani Dubai, where ~99% of students are Indian
nationals. Three classes of row were reaching the finder that no student there
could act on. `db/012_audience_fit.sql` closes all three.

### 1. `opportunity_desk` — disabled, not deleted

opportunitydesk.org is a Lagos-based, Africa-oriented aggregator. 132 of its
2,009 stored titles named an African country or demonym outright, and the real
figure is higher — most of its posts put the nationality restriction only in the
eligibility prose, which we had fetched for 169 of 2,009. It was also the main
producer of roundup posts (below) and is an aggregator-of-aggregators, so its
tier-1-worthy rows arrive through `grants_gov` / `ukri_opportunities` /
`daad_programmes` anyway. It was 46% of the corpus and the wrong 46%.

The registry row stays, `enabled = false`. Re-enable with one UPDATE.

### 2. Roundup posts — rejected at ingest

A listicle ("20 Hot Jobs Currently Open – April 16, 2026", "Top 15 Bachelor's
Degree Scholarships") is an *index* of opportunities, not an opportunity: no
single deadline, link or eligibility. `_lib_html.js:isRoundup()` rejects them.

The patterns are anchored so that real calls survive: NIH titles funding
announcements "Opportunities for Collaborative Research at the NIH Clinical
Center", and NSF titles REU sites "Research Opportunities for Undergraduates".
Only a *leading count* or a "Top N &lt;plural opportunity noun&gt;" counts.

### 3. Nationality locks — rejected at ingest

`_lib_html.js:geoLock()` answers one question: *does this post restrict itself
to a group that excludes a South Asian applicant?* It separates **host country**
from **nationality** — "Scholarship 2026 in UK" is open to an Indian student,
"Global British Citizens Scholarship" is not. A lock needs citizenship /
nationality / residency language, a demonym sitting directly on a people-noun
("African Women", "Chinese Students"), or a closed identity group (Indigenous,
refugee). A field of study never locks, so "African Studies" and "European
Research Council" pass.

`GEO_OPEN` overrides a lock when the post says it is open to everyone —
including the half-truncated form WordPress serves, `"open to Canadian
citizens, permanent residents, and international [&hellip;]"`.

Changing audience means editing `GEO_GROUPS`, not 15 source rows.

### 4. `record_kind` — awarded registers are a different product

`sources.config.record_kind` is `open_call` (default) or `awarded`.

| `record_kind` | sources | why |
| --- | --- | --- |
| `awarded` | `nsf_awards`, `nih_reporter`, `openaire`, `cordis` | registers of money **already granted** and projects already finished — CORDIS is mostly 2014-15 "European Researchers' Night" events. The finder was rendering them as open calls with a dollar figure and `deadline: rolling`. |
| `open_call` | the other 11 | something a student can apply to. |

Awarded rows stay ingested: a funded grant names a lab and a PI a student can
write to. They are simply a **different product** and must never sit in the
apply-now list. `scripts/build-ui-data.mjs` reads the config key — not a
hardcoded source list (CLAUDE.md rule 3).

### Reproducing / auditing

```bash
node tests/parse.test.mjs            # 54 assertions on isRoundup / geoLock, half of them "must keep"
node scripts/sweep-audience.mjs      # dry run over the live corpus
node scripts/sweep-audience.mjs --apply
node scripts/build-ui-data.mjs       # rebuild ui/opportunities.json
```

The sweep imports `_lib_html.js` rather than restating its regexes in SQL, so
the tested implementation is the only implementation.

### Effect, measured 2026-10-01

| | rows |
| --- | --- |
| before | 4,362 |
| `opportunity_desk` removed (db/012) | −2,009 |
| roundups + nationality locks swept | −80 |
| **stored** | **2,273** |
| of which `awarded` (not in the finder) | 910 |
| **open calls in the finder** | **1,363** |
| &nbsp;&nbsp;with a firm deadline | 697 |
