# The opportunity landscape — who students use, and where those sites get data

Written 2026-10-01, after `db/013` cut the finder to 431 rows and made coverage —
not noise — the limiting problem. Every endpoint claim below was probed live on
that date; the probe command and response are shown rather than asserted.

Companion to `docs/sources.md`, which records what we *accepted*. This records
what exists, so the next `INSERT into sources` is an informed one.

---

## 1. The supply chain has four layers, and the money flows against the data

This is the single most useful thing to understand, and it explains why our
tier-1 sources are machine-readable and our student-relevant ones are not.

```
L1  FUNDERS                    own the data · publish it free & structured
    NIH, NSF, UKRI, EU, DAAD,  · no interest in students specifically
    Wellcome, DFG, universities

        │ (scraped, or re-keyed by hand)
        ▼
L2  OFFICIAL AGGREGATORS       mandated to collect · usually NO public API
    EURAXESS, NSF ETAP,        · institutions self-post into them
    Zintellect/ORISE, CORDIS

        │
        ▼
L3  COMMERCIAL BOARDS          employers PAY to be listed
    jobs.ac.uk, Nature Careers,· so an API would cannibalise the product
    FindAPhD, Studyportals,    · hard paywalls / anti-bot / restrictive ToS
    Academic Positions

        │
        ▼
L4  EDITORIAL BLOGS            humans read L1-L3 and rewrite
    OpportunityDesk,           · SEO-funded, zero provenance, no API
    Opportunities Circle,      · fastest to publish, least reliable
    Scholars4dev, ScholarshipsAds
```

**The consequence.** The sites students actually use (L3 and L4) are precisely
the ones that cannot or will not expose data, because being the only copy *is*
their business. The sites that publish clean machine-readable data (L1) do not
organise it around a student. Any aggregator worth building therefore sits at
L1 and does the student-facing work itself — which is what we are doing, and
also why `opportunities_circle` (L4) is currently carrying 50% of our finder:
it is the only layer that has already done the student framing for us.

---

## 2. What students actually use, by vertical

### 2.1 PhD / postdoc / research positions (Europe + global)

| Site | Who runs it | Where its data comes from | Machine-readable? |
| --- | --- | --- | --- |
| **EURAXESS** | European Commission | institutions self-post; national EURAXESS nodes feed in | **No.** 6,460 live offers; the search page exposes no rss/api/feed/export link. Probed 2026-10-01. Our earlier probes: `/jsonapi` 404, `?_format=json` 406, `/jobs/rss` 404 |
| **jobs.ac.uk** | University of Warwick (its business division, since 1998) | employers pay to advertise — from **£279** per post | No. `/jobs/rss` serves `200 text/html`, i.e. a normal page |
| **Nature Careers** | Springer Nature | employers pay — **£1,290+** per post | No. `/naturecareers/jobs/rss` → `301`, no feed behind it |
| **FindAPhD** | FindAUniversity Ltd (Sheffield), acquired Feb 2021 by Keystone Academic Solutions | universities pay to advertise projects | **Excluded on ToS grounds** — its terms forbid automated collection, and it returns `403`. Do not route around this |
| **Academic Positions** | Nordic commercial board | employer-paid | No. `403` behind Cloudflare |

**Verdict:** the whole vertical is advertiser-funded, so none of it is open.
EURAXESS is the only non-commercial one and is the single biggest gap we have.

### 2.2 Undergraduate research placements (the vertical we are weakest in)

| Site | Who runs it | Data source | Notes |
| --- | --- | --- | --- |
| **NSF ETAP** | NSF, first-party | NSF-funded REU sites post directly | Session-gated (`302`); would need browser automation. **REU is US citizen / permanent resident only by statute** — useless for our students regardless |
| **Zintellect** | ORAU / ORISE, first-party | US national labs and federal agencies post directly | Authoritative, but overwhelmingly US-citizenship-gated |
| **PathwaysToScience** | Institute for Broadening Participation, NSF-funded | hand-curated by staff | US-focused |

**Verdict:** the English-language undergrad-research web is almost entirely
US-domestic and citizenship-locked. This is *why* we have 2 rows typed
`research_internship` — not a parser bug.

### 2.3 Scholarships for international students

| Site | Who runs it | Data source |
| --- | --- | --- |
| **Studyportals** (Mastersportal / Bachelorsportal / Scholarshipportal) | Studyportals BV, Eindhoven | universities and scholarship providers **submit** listings; 3,600+ verified universities; paid placement |
| **Scholars4dev** | small independent publisher | undisclosed — the About page states no sourcing method at all, only that it is "not affiliated with any of the scholarship providers". Editorially rewritten from funder sites |
| **ScholarshipsAds / Fully Scholarships / ScholarshipRoar** | SEO publishers | same: humans rewriting funder pages |
| **Fastweb / Scholarships.com / Bold.org / Going Merry** | US commercial | **US students only** — not applicable to us |
| **IEFA** | commercial, curated | international-student oriented |

### 2.4 Fellowships

| Site | Who runs it | Data source |
| --- | --- | --- |
| **ProFellow** | Dr Vicki Johnson's team | hand-curated, 2,800+ programmes. Inclusion rule is explicit: a programme is added if it is **open to US citizens or residents** — so it systematically under-covers us |
| Funder sites directly | Fulbright/IIE, Chevening (FCDO), Commonwealth (CSC), Schwarzman, Rhodes, Gates Cambridge | first-party, authoritative, mostly one page each |

### 2.5 Institutional grants (not for students — know the boundary)

grants.gov, UKRI, EU Funding & Tenders Portal, NIH RePORTER, NSF, DFG, SNSF,
Wellcome. We already ingest four of these. `db/013` reclassified `grants_gov`
as `institutional` precisely because this vertical's applicant is an
organisation, not a person.

**EU Funding & Tenders Portal (SEDIA)** is the notable miss. The documented
endpoint `api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***`
still returns **`405` on GET** and **`500` on the documented multipart POST**
(re-probed 2026-10-01, both forms). Third-party guides describe it as working;
it does not, for us, from here.

### 2.6 Competitions, hackathons, challenges

| Site | Data source | Machine-readable? |
| --- | --- | --- |
| **Devpost** | organisers post directly; powers most of the world's hackathons | **Yes** — `GET devpost.com/api/hackathons?page=1` returns `200 application/json`, 9.9 kB, with `open_state`, deadlines and prizes. `robots.txt` is `User-agent: * / Disallow:` (everything allowed) |
| **MLH** | organiser-submitted, season-based | static site |
| **Unstop** (ex-Dare2Compete) | Indian companies post directly; ~6M users | unofficial API endpoints exist; ToS needs reading before use |
| **Internshala** | Indian employers post | ToS almost certainly forbids collection |

### 2.7 India-outbound research internships — the highest-fit vertical for BITS Dubai

These are the programmes actually designed for an Indian undergraduate to do
research abroad. None has a feed; each is one page, which is fine — a handful
of hand-maintained rows beats a thousand irrelevant ones.

| Programme | Host | Fit for a BITS Dubai B.E. student |
| --- | --- | --- |
| **Mitacs Globalink Research Internship** | 60+ Canadian universities, 12 weeks, ~CAD 4,500 | **Strong.** India is an eligible country for the 2027 cohort. Restricted to **Indian nationals**, **B.E./B.Tech**, min 70%, from an institution on Mitacs' India eligibility list — and **IIT applicants are explicitly excluded**. Summer 2027 applications have closed; next cycle TBA. *Checked against mitacs.ca 2026-10-01 — several SEO blogs claiming it is "suspended for Indian students" are wrong.* |
| **DAAD WISE** | German universities and public research institutes, 6–12 weeks, €750/month + up to €900 travel + insurance | **Strong**, engineering/science, built for students enrolled in India |
| **S.N. Bose Scholars** (IUSSTF) | top-20 US universities, 10 weeks, ~40 places | Strong, engineering and physical sciences |
| **Khorana Program** (IUSSTF) | US universities | Strong, biological sciences |
| **Charpak Lab** | France | Strong |
| **Erasmus Mundus Joint Masters** | EU consortia (EACEA) | Strong, fully funded, open to Indians |
| **TWAS / ICTP** | developing-country scientists | Strong |

**Caveat to check before promising any of these:** most require current
enrolment *in India*. BITS Pilani **Dubai** is a UAE campus, so eligibility
turns on whether the programme reads "Indian national" (fine) or "enrolled at
an institution in India" (not fine). This must be confirmed per programme
before any of them is surfaced to a student.

---

## 3. Ranked candidates for `sources`

Scored on fit × machine-readability × ToS cleanliness. Each is an `INSERT`, not
a new workflow (CLAUDE.md rule 3).

| # | Candidate | Kind | Status |
| --- | --- | --- | --- |
| 1 | **Devpost** | `json_api` | **Ready.** Probed `200 application/json`, robots allows all. Adds the competition vertical we have nothing in |
| 2 | **DAAD scholarship database** | `json_api` | **Needs discovery.** Distinct from the `international-programmes` solr API we already use — that one is the *course catalogue* behind `record_kind = 'programme'`. The scholarship DB (`/deutschland/stipendium/datenbank/`) serves HTML; guessed solr paths return `404`. Finding its real JSON endpoint converts DAAD from a catalogue into a genuine `open_call` source. **Highest value per hour of work.** |
| 3 | **India-outbound programmes** (Mitacs, WISE, S.N. Bose, Khorana, Charpak) | manual rows | ~8 rows, hand-maintained, annual cycle. Highest *fit* of anything in this document, and near-zero engineering |
| 4 | **Erasmus Mundus catalogue** | investigate | EACEA first-party, fully funded, open to Indians |
| 5 | **EURAXESS** | blocked | 6,460 offers, no machine-readable surface. Only route is HTML parsing — check ToS first, and do not assume permission |
| 6 | **EU F&T Portal (SEDIA)** | blocked | documented API returns `405`/`500`. Re-probe occasionally |
| 7 | Nature Careers, jobs.ac.uk, Academic Positions, FindAPhD | **rejected** | advertiser-funded by design; FindAPhD additionally forbids automated collection in its ToS |

---

## 4. The honest strategic read

Our architecture bets on tier-1 funders for authority. That bet is correct for
*data quality* and wrong for *audience*: tier-1 funders fund institutions and
PIs, so the better the source's authority, the less likely a BITS Dubai
undergraduate can apply to its contents. That is the whole story behind
`db/012` and `db/013`.

The 431 rows we have left are real, but ~50% come from one tier-3 aggregator,
which is a single point of failure for the product. The fix is **not** more
tier-1 grant APIs. It is (a) a handful of hand-maintained India-outbound
programme rows, which are the highest-fit opportunities that exist for this
audience, and (b) finding the DAAD scholarship endpoint. Neither needs a new
workflow.
