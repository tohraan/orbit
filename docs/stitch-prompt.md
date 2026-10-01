# Stitch master prompt

Paste everything between the rules into Stitch as one prompt. If it truncates,
generate `GLOBAL + SCREEN 1`, then feed each later screen with the `GLOBAL`
block re-pasted above it so the system stays consistent.

Real content is used throughout on purpose — the figures and programme names
are from the live index, so the generated screens show plausible density
instead of placeholder text.

---

Design a responsive web application called **Research Opportunity Finder**.

It is the tool engineering students at BITS Pilani Dubai use to find funded
research opportunities abroad — scholarships, fellowships, research
internships, summer schools — and then to track the applications they make.
Almost every user is an Indian national on a UAE campus, aged 19–23, on a
phone about half the time. They are deciding where to spend limited application
effort, so the interface has one job: make it obvious what is worth applying to
and what closes first.

Think Linear, Vercel dashboard, Raycast. Dense, confident, quiet. Not a
marketing site and not a consumer app.

## GLOBAL — design system

**Typeface.** Geist for everything. Geist Sans for UI and body, Geist Mono for
all numerals, dates, counts, currency, domains and metadata labels. Uppercase
mono micro-labels at 10–11px with 0.12em letter-spacing. Headings use tight
tracking (-0.02em). Never mix in another family.

**Colour — dark is the primary theme, light is a full equal.**

Dark: page `#0A0E0D`, raised surface `#121917`, card `#161F1C`, hairline
`#23312D`, primary text `#E9F1EE`, secondary `#9AB0AA`, tertiary `#6B817B`.
Accent `#3DD9A4` (jade) on dark text `#06211B` for primary actions.

Light: page `#F5F8F7`, surface `#FFFFFF`, card `#FFFFFF`, hairline `#DCE5E2`,
primary text `#0B1715`, secondary `#4A605B`, tertiary `#7B908A`, accent
`#0E7A61` on white.

Semantic, separate from the accent and used only for deadline urgency:
critical `#FF6B55` (≤7 days), warning `#E0A33B` (8–30 days), steady `#3DD9A4`
(31+ days), dormant `#6B817B` (rolling or undated).

**Shape and depth.** Radius 14px on cards and panels, 10px on inputs and
buttons, 999px on chips and pills. Borders are 1px hairlines, never heavy.
Elevation comes from surface lightness and a single soft shadow, never from
thick borders. No glassmorphism, no gradient fills on cards.

**Bento grid.** The overview region of Discover and the whole Profile screen
are bento: a 12-column grid of cards at mixed spans (a 6×2 hero tile, two 3×1
stat tiles, a 4×2 tile, a 8×1 wide tile) with an even 16px gutter, all cards
flush to the same baseline grid. Bento is for summary and overview only — the
opportunity list itself is a single-column stack of equal cards, because the
user is scanning it in order.

**Motion.**
- *Shine / glare loading.* Every skeleton is a card-shaped block with a
  diagonal highlight sweeping left to right, 45°, 1.4s, infinite, easing
  linear — a soft specular band about 20% of the card width, 12% white opacity
  on dark and 55% white on light. Skeletons match the real card's silhouette
  (chip row, two title lines, three body lines, a meta row), never generic bars.
- *Glare on hover.* Primary cards and the primary button get a slow radial
  glare that follows the cursor at very low opacity. Subtle enough to read as
  material, not as a toy.
- Everything else: 120–180ms ease-out on colour and transform only. Honour
  reduced-motion by removing all of it.

**Density.** 15px body, 1.5 line height, 65ch max for any running text, 14–16px
card padding, 10px gaps between list items.

## GLOBAL — chrome, present on every screen

A sticky top bar holding, left to right: a mono eyebrow reading
`BITS PILANI DUBAI · OPEN CALLS FROM 6 PUBLIC SOURCES`, the wordmark
**Research Opportunity Finder**, then on the right a two-state segmented
control `Source | AED` for currency and a theme toggle.

Directly under it, a row of five mono stat readouts, large number over small
caption: **431** open calls · **51** within 30 days (in critical colour) ·
**95** closing by 31 Dec · **111** with a firm date · **6** sources.

Below that, a horizontal tab bar: **Discover · Timeline · Compare · Tracker ·
Saved · Profile**. The active tab carries an accent underline. Compare, Tracker
and Saved show a small mono count badge when they hold anything.

A floating pill button sits bottom-right on every screen: **Ask the advisor**
with a chat glyph.

## SCREEN 1 — Discover (default)

Two columns on desktop: a 240px sticky filter rail on the left, the result
column on the right. The rail folds above the list below 900px.

**Filter rail.** Seven stacked groups, each a mono uppercase heading over a
wrap of pill toggles. Degree level (Any, Bachelor's, Master's, PhD, Postdoc) ·
Opportunity type (Any, Scholarship, Fellowship, Research internship,
Internship, Grant, Summer school, Competition, Training, Exchange, Award) ·
Funding (Any, Fully funded, Partial, Stipend, Tuition, Paid) · Closing (Any,
Next 30 days, Next 90 days, By 31 Dec, Has a date, Rolling / open) · Source
tier (Any, Tier 1 funder, Tier 2 national, Tier 3 aggregator) · Detail
available (Any, Has apply link, Has eligibility, Has an amount) · Country
(Any, Germany, Usa, Uk, Canada…). A `Clear all filters` ghost button closes
the rail. Selected pills fill with the accent.

**Toolbar above the results.** A search field with a magnifier, placeholder
`Search title, field, country or source`; a sort select reading
`Deadline — soonest` with options for latest, best fit for my profile,
recently posted, title, source; and a mono result count `431 results`.

**Opportunity card.** A left edge stripe 3px wide in the urgency colour, then:

Row 1 — chips: a filled accent-tinted type chip (`INTERNSHIP`), the urgency
deadline chip (`CLOSES TODAY`, `9 DAYS LEFT`, `ROLLING`), degree level chips
(`BACHELORS`, `MASTERS`), a funding chip (`FULLY FUNDED`), and when a profile
exists a solid accent chip reading `78% FIT`.

Row 2 — title as a link: *Max Planck MTL Internship 2027 in Germany | Fully Funded*

Row 3 — one-line summary, secondary colour, clamped to two lines.

Row 4 — an inset eligibility block on the raised surface: mono micro-label
`ELIGIBILITY` above three clamped lines of real criteria text.

Row 5 — coverage chips in the steady colour: `TUITION`, `TRAVEL`, `STIPEND`.

Row 6 — the provenance meta line in mono/tertiary:
`Opportunities Circle [T3] opportunitiescircle.com · posted Sep 17, 2026 ·
Germany · 10 weeks · USD 2,000`. The tier badge is a tiny bordered square.

Row 7 — actions: `Details`, `Save`, `Compare`, `Track` as quiet bordered
buttons on the left, and an outlined accent `Apply →` button pushed right.

Use these four as the visible cards: *Gilman-McCain Scholarship 2026-27*
(award, partial funded, Usa, closes today) · *Max Planck MTL Internship 2027 in
Germany | Fully Funded* (internship, bachelors/masters, 10 weeks, USD 2,000) ·
*Doctor of Public Health Scholarships 2027-2028* (scholarship, PhD, fully
funded, Canada, 2 years) · *Harvard Law School Fellowship in USA 2027-28*
(fellowship, masters/phd/postdoc, USD 60,000, 1 year).

**Expanded detail state.** One card opened in place, pushing the rest down,
revealing a two-column block inside the card: Eligibility · What it covers ·
How to apply · Documents needed, then a row of mono amount pills showing both
currencies (`USD 2,000` beside an accent-tinted `AED 7,345`), then
`EARLIER ROUNDS` and `WHERE THIS CAME FROM` as a small mono key/value list
(Source, Domain, Posted, Indexed), then an `EXPERIENCES FROM PEOPLE WHO
APPLIED` section with a short form.

## SCREEN 2 — Timeline

A vertical stack of six urgency bands, each a card with a header row and a
list. Header: band name, a mono count, and a thin proportion bar filled in the
band's urgency colour showing its share of all open calls.

Bands: **This week** (critical) · **Next 30 days** (warning) · **Next 90 days**
(steady) · **Later this year** (steady) · **Next year onward** (dormant) ·
**Rolling or undated** (dormant).

Each row inside a band: an urgency chip with the countdown on the left at fixed
width, the title as a link, a type chip, and the source domain in mono on the
right. Rows are hairline-separated, 9px vertical padding — a dense register,
not cards.

## SCREEN 3 — Compare

Up to three opportunities side by side as a table. Row headers down the left in
mono uppercase at 128px: Deadline, Type, Degree level, Funding, Amount, Covers,
Duration, Country, Fit, Eligibility, Source, Posted. Column headers are the
programme titles with a small `Remove` button beneath each.

The winning cell in the Amount row and in the Deadline row gets an
accent-tinted background. A footnote in tertiary mono explains that amounts are
compared in dirhams and only the dollar rate is a fixed peg.

Horizontal scroll inside the table on narrow screens; the page itself never
scrolls sideways.

## SCREEN 4 — Tracker

A five-column kanban that scrolls horizontally on desktop and stacks on mobile:
**Interested · Preparing · Submitted · Interview · Decided**. Each column is a
raised surface panel with a mono uppercase heading and a count on the right.

Cards inside are compact: title over a row holding the urgency deadline chip
and the type chip, then a small arrow row `←  →  Remove`. Cards show a grab
cursor and a slight lift while dragging; the column under the cursor shows a
dashed accent outline.

## SCREEN 5 — Saved

A toolbar reading `12 saved · 9 with a date` on the left and a secondary button
`Add 9 deadlines to my calendar` on the right. Below, the saved opportunities
as cards ordered by deadline, each showing the urgency chip with a live
countdown, the provenance meta line, and actions `Remove`, `Track`,
`Calendar reminder`, plus `Apply →`.

## SCREEN 6 — Profile

A bento grid of two unequal cards.

Left, spanning 7 columns, **Your profile**: a short explanatory line stating
the profile is stored privately against the viewer's account and readable by no
one else, then fields — Current degree level (select) · Fields you work in
(text, placeholder `computer science, robotics, materials`) · Countries you
would go to (`Germany, Canada, UK`) · Nationality (`Indian`) · Funding (select)
· Expected graduation (`June 2028`). Each field has a mono uppercase label and
a tertiary hint beneath. A primary `Save profile` button.

Right, spanning 5 columns, **What your profile changes**: three short
paragraphs, then a stat line reading **84** open calls currently score 65% or
better for you, then a tertiary note explaining fit is a transparent sum —
degree level 40 points, field overlap 25, funding 20, country 15 — that ranks
but does not decide.

## SCREEN 7 — Advisor (overlay panel)

A right-anchored panel 420px wide, full height, that becomes a bottom sheet
under 520px. Header with the title **Advisor** and a close control.

The conversation: the assistant's messages left-aligned on the raised surface
with a 2px corner tucked toward the bottom-left; the student's messages
right-aligned, accent-tinted. Inside an assistant message, references to
opportunities render as small bordered mono chips carrying the programme name —
tappable, they jump to that card.

Opening message: *"I can only recommend from the 431 open calls in this index,
and I will name each one so you can open it. Tell me your degree level and
field, or pick a question below."*

Above the composer, three suggestion pills: `I am a third-year engineering
undergraduate — what should I apply to?` · `Fully funded summer research,
anywhere` · `What closes in the next 30 days?`

Composer: a flat auto-sizing textarea, a primary `Send` button, and a secondary
`Stop` button visible only while a reply is streaming. Show a `Thinking…`
placeholder bubble before the first text arrives.

## STATES — design all three for every screen

**Loading.** The shine-glare skeleton described above, in the exact silhouette
of whatever that screen shows: four opportunity-card skeletons on Discover, six
band skeletons on Timeline, five column skeletons on Tracker.

**Empty.** A dashed hairline container, centred, with a short bold line and one
or two sentences of real guidance — never an illustration, never an emoji:
- Discover: **Nothing matches those filters** — "Try widening the deadline
  window, clearing the degree level, or searching a field instead of a
  programme name."
- Compare: **Nothing picked to compare** — "Open Discover and press Compare on
  two or three opportunities."
- Tracker: **No applications tracked yet** — "Press Track on any opportunity
  and it lands in Interested."
- Saved: **Nothing saved yet** — "Press Save on anything worth a second look."
- Experiences: **No one has shared an experience of this opportunity yet.**

**Error.** Same container, stating what failed and what fixes it.

## RESPONSIVE

Three breakpoints. Above 1100px the full two-column Discover and the 12-column
bento. Between 900 and 1100 the rail narrows and the bento drops to 6 columns.
Below 900 everything is one column: the filter rail becomes a collapsible
section above the list, the kanban stacks, the compare table scrolls inside
itself, the advisor becomes a bottom sheet. Minimum 16px side gutter at every
width, and the page body never scrolls horizontally.

## DO NOT

No purple-to-blue gradient hero. No glassmorphism. No emoji as iconography. No
illustrations in empty states. No pricing, testimonial, logo-wall or landing
sections — this is a signed-in tool, not a marketing site. No fabricated
statistics beyond the figures given above. Do not centre body text. Do not use
a second typeface.
