# Opportunities Portal — Design System & UI Specification

> **Status:** Implementation-ready design specification  
> **Purpose:** Single source of truth for the visual system, responsive behavior, component anatomy, screen hierarchy, interaction states, and UI rules for an opportunities management portal covering scholarships, fellowships, grants, internships, competitions, programs, and similar opportunities.
>
> **Primary reference:** The supplied visual reference establishes the intended visual direction: a polished, spacious productivity SaaS interface built from a restrained neutral foundation, rounded bento surfaces, compact navigation, clear hierarchy, and selective pastel accent colors.
>
> **Core principle:** The interface must feel like a premium opportunity-management product, not a directory or generic job board. Information density must be high enough to be useful, but every screen must retain generous whitespace and clear visual grouping.

---

# 1. Product Design Direction

## 1.1 Design objective

The portal should help a student or opportunity seeker answer four questions immediately:

1. **What opportunities are relevant to me?**
2. **What do I need to know before I apply?**
3. **What deadlines require attention?**
4. **Which opportunities should I save, compare, or act on?**

The UI therefore prioritizes:

- opportunity discovery
- filtering
- deadline visibility
- funding visibility
- eligibility clarity
- comparison
- saving/bookmarking
- application tracking
- concise opportunity summaries
- consistent metadata presentation

The product must **not** resemble a dense spreadsheet by default.

Tables may exist as an optional secondary view, but the primary discovery experience is a **consistent card grid**.

---

# 2. Visual Reference Interpretation

The supplied reference uses:

- warm/off-white application surfaces
- dark navy/charcoal typography
- rounded containers
- bento-style content blocks
- restrained pastel accents
- compact left navigation
- strong section headings
- cards with consistent geometry
- small metadata labels
- large whitespace around major sections
- subtle borders instead of heavy shadows
- rounded controls
- clear visual grouping rather than excessive dividers

### Adaptation for the Opportunities Portal

The reference's visual language should be retained, but the product should be calmer and more information-oriented.

Do **not** copy the reference literally.

Instead:

- use the same spatial confidence
- use the same rounded-card language
- use the same bento composition
- use the same visual hierarchy
- use the same restrained accent philosophy
- adapt all content and interaction patterns to opportunity discovery

The result should feel like:

> **A premium academic opportunity OS, not a colorful scholarship directory.**

---

# 3. Non-Negotiable Design Rules

## 3.1 Card consistency

All opportunity cards in a grid must have:

- identical width within the same breakpoint
- identical height within the same grid row
- identical internal padding
- identical metadata placement
- identical action placement
- identical title area height
- identical footer alignment

Do not allow one card to become significantly taller because its description happens to be longer.

Long content must be truncated according to defined rules.

---

## 3.2 Breathable layouts

Every major screen must have visible negative space.

Avoid:

- stacking too many badges
- putting every piece of metadata into the first viewport
- oversized card borders
- unnecessary separators
- tiny text used to fit more information
- five or six actions beside one another
- nested cards inside cards without a clear reason

The design should feel **spacious even when information-rich**.

---

## 3.3 No visual noise

Do not use:

- gradients as backgrounds
- glowing cards
- neon effects
- glassmorphism
- decorative blobs
- excessive shadows
- animated backgrounds
- unnecessary illustrations
- excessive pill-shaped containers
- rainbow category colors

Accent colors communicate product states, not decoration.

---

## 3.4 One visual hierarchy

Every screen must have:

1. page title
2. contextual explanation or primary metric
3. primary action
4. content area
5. secondary controls

Do not make every section compete for attention.

---

# 4. Design Tokens

All implementation must use tokens.

Do not introduce arbitrary one-off colors, spacing values, radii, shadows, or font sizes inside individual components.

---

# 5. Color System

## 5.1 Base palette

```css
:root {
  --background: #F7F7F4;
  --surface: #FFFFFF;
  --surface-soft: #F2F2EE;
  --surface-muted: #ECECE7;

  --foreground: #17191C;
  --foreground-secondary: #4F5358;
  --foreground-muted: #7C8085;
  --foreground-disabled: #A7AAAD;

  --border: #E3E3DE;
  --border-strong: #D3D3CC;

  --primary: #171C24;
  --primary-foreground: #FFFFFF;

  --accent-yellow: #D7DF55;
  --accent-pink: #E7A9D7;
  --accent-green: #B9D55A;
  --accent-lilac: #C8B9E8;
  --accent-blue: #AFCFE4;

  --success: #4D8A61;
  --warning: #A87924;
  --danger: #B95656;
  --info: #4C7294;
}
```

### Important

Pastel accents are **supporting surfaces**, not primary UI colors.

Do not create an interface where every card has a different pastel background.

Use accent surfaces selectively for:

- deadline urgency
- funding
- progress
- featured opportunities
- saved states
- dashboard metrics
- comparison highlights

---

# 6. Semantic Color Tokens

```css
--color-bg: var(--background);

--color-surface: var(--surface);
--color-surface-secondary: var(--surface-soft);

--color-text-primary: var(--foreground);
--color-text-secondary: var(--foreground-secondary);
--color-text-muted: var(--foreground-muted);

--color-border: var(--border);
--color-border-hover: var(--border-strong);

--color-action: var(--primary);
--color-action-text: var(--primary-foreground);

--color-success: var(--success);
--color-warning: var(--warning);
--color-danger: var(--danger);
--color-info: var(--info);
```

Components should consume semantic tokens rather than raw hex values.

---

# 7. Accent Usage Rules

## Yellow / lime

Use for:

- funding
- highlighted opportunity attributes
- positive progress
- featured cards

## Pink

Use for:

- saved states
- personal collections
- application activity
- secondary dashboard metrics

## Lilac

Use for:

- informational modules
- comparison context
- academic categories

## Blue

Use for:

- informational states
- external-source indicators
- neutral system information

### Hard rule

Never use an accent color merely because an area looks empty.

Every accent must have semantic meaning.

---

# 8. Typography

## 8.1 Font

Primary typeface:

**Geist**

Fallback:

```css
font-family:
  Geist,
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

---

## 8.2 Type scale

### Display

```text
48px / 52px / 600
```

Used only for major dashboard statements.

### Page title

```text
32px / 38px / 600
```

### Section title

```text
20px / 26px / 600
```

### Card title

```text
16px / 21px / 600
```

### Body

```text
14px / 21px / 400
```

### Secondary body

```text
13px / 19px / 400
```

### Metadata

```text
12px / 17px / 500
```

### Micro label

```text
11px / 15px / 600
```

Use sparingly.

---

# 9. Typography Rules

Titles must be visually dominant.

Do not:

- use bold text everywhere
- use all-caps section headings
- use tiny metadata to compensate for insufficient card space
- use more than three hierarchy levels within a single card

Use weight before color when establishing hierarchy.

---

# 10. Spacing System

Use a 4px base system.

```text
4px
8px
12px
16px
20px
24px
28px
32px
40px
48px
56px
64px
80px
96px
```

### Default component spacing

| Purpose | Spacing |
|---|---:|
| Icon → text | 8px |
| Metadata gap | 8px |
| Card internal gap | 16px |
| Card section gap | 20px |
| Form field gap | 16px |
| Related sections | 24px |
| Major sections | 32–40px |
| Page top spacing | 32–48px |
| Desktop page side padding | 32–48px |
| Mobile page side padding | 16px |

---

# 11. Radius System

```text
--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-xl: 20px
--radius-2xl: 24px
--radius-pill: 999px
```

### Usage

- buttons: 10–12px
- inputs: 10–12px
- standard cards: 16px
- large bento cards: 20–24px
- modal: 20–24px
- avatar: 999px
- badges: pill only when semantically appropriate

Do not make every element pill-shaped.

---

# 12. Borders

Default:

```css
border: 1px solid #E3E3DE;
```

Hover:

```css
border-color: #D3D3CC;
```

Active:

```css
border-color: #171C24;
```

Avoid heavy 2px borders unless communicating an active selection.

---

# 13. Shadows

The product should rely primarily on borders and surface contrast.

Default card:

```css
box-shadow: 0 1px 2px rgba(20, 22, 25, 0.04);
```

Elevated modal:

```css
box-shadow:
  0 20px 50px rgba(20, 22, 25, 0.12);
```

No glowing shadows.

No colored shadows.

---

# 14. Application Shell

## Desktop

Target:

```text
1440 × 900
```

Minimum supported desktop layout:

```text
1280 × 800
```

Structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Top Header                                         │
│         ├─────────────────────────────────────────────────────┤
│         │                                                     │
│         │ Main Content                                       │
│         │                                                     │
│         │                                                     │
└──────────────────────────────────────────────────────────────┘
```

### Sidebar

Width:

```text
232px
```

Collapsed:

```text
72px
```

The sidebar remains visually quiet.

It should not compete with the opportunity content.

---

# 15. Sidebar

## Primary navigation

```text
Home
Explore
Saved
Applications
Deadlines
```

## Secondary navigation

```text
Collections
Compare
Preferences
```

## Bottom

```text
Help
Profile
```

### Sidebar anatomy

```text
[Logo]

Home
Explore
Saved
Applications
Deadlines

────────────

Collections
Compare

────────────

Help
Profile
```

---

# 16. Sidebar States

### Default

Neutral text, no background.

### Hover

```text
background: #F0F0EC
```

### Active

```text
background: #171C24
color: #FFFFFF
```

Use the dark active state from the visual reference.

### Collapsed

Only icons.

Tooltips appear on hover.

---

# 17. Desktop Header

Height:

```text
64px
```

Contains:

- contextual page title or breadcrumb
- global search
- optional notifications
- profile/avatar

The header must remain visually lightweight.

Avoid a second heavy navigation bar.

---

# 18. Global Search

Search should be accessible from every major screen.

Desktop:

```text
width: 320–400px
height: 40px
```

Placeholder:

```text
Search opportunities...
```

Search can surface:

- opportunity title
- organization
- category
- country
- keyword
- field of study

Search results should appear in a compact command-style dropdown.

---

# 19. Mobile Shell

Target:

```text
390 × 844
```

Supported:

```text
360px minimum content width
430px optimized width
```

The desktop sidebar becomes a bottom navigation.

### Mobile bottom navigation

```text
Home
Explore
Saved
Applications
Profile
```

Height:

```text
64–72px
```

Use safe-area padding on supported devices.

---

# 20. Mobile Header

Height:

```text
56–64px
```

Recommended structure:

```text
[Menu/Profile]    Opportunities    [Search]
```

Do not reproduce the desktop header on mobile.

---

# 21. Responsive Breakpoints

```text
Mobile:   < 640px
Tablet:   640–1023px
Desktop:  ≥ 1024px
Large:    ≥ 1280px
```

### Desktop

Full sidebar + multi-column grids.

### Tablet

Compact sidebar or navigation rail.

### Mobile

Bottom navigation + single-column content.

---

# 22. Container Rules

Desktop maximum content width:

```text
1440px
```

Recommended content width:

```text
1180–1280px
```

For very wide screens, do not stretch cards indefinitely.

Use:

```css
max-width: 1280px;
margin-inline: auto;
```

---

# 23. Dashboard / Home

The home screen should behave like a personal opportunity command center.

## Desktop hierarchy

```text
Greeting / context

[Saved] [Applications] [Deadlines] [Recommended]

Upcoming deadlines
[Opportunity] [Opportunity] [Opportunity]

Recommended for you
[Card] [Card] [Card]

Recently viewed / saved
[Card] [Card] [Card]
```

The dashboard must not become a wall of statistics.

Use metrics only when they lead to an action.

---

# 24. Dashboard Bento Layout

Recommended desktop structure:

```text
┌───────────────────────────┬──────────────────────┐
│ Greeting + quick action   │ Deadline summary     │
│                           │                      │
├───────────────────┬───────┴──────────────────────┤
│ Saved opportunities│ Applications                │
├───────────────────┴───────────────────────────────┤
│ Recommended opportunities                          │
│ [Card] [Card] [Card]                               │
└────────────────────────────────────────────────────┘
```

Do not create equal-sized boxes simply to fill space.

Bento sizing should follow content importance.

---

# 25. Opportunity Discovery Screen

This is the most important screen in the product.

## Desktop structure

```text
Page title
Description / result count

[Search]

[Filter controls]

[Active filters]

────────────────────────────

Recommended / All Opportunities

┌────────┐ ┌────────┐ ┌────────┐
│ Card   │ │ Card   │ │ Card   │
│        │ │        │ │        │
└────────┘ └────────┘ └────────┘

┌────────┐ ┌────────┐ ┌────────┐
│ Card   │ │ Card   │ │ Card   │
│        │ │        │ │        │
└────────┘ └────────┘ └────────┘
```

---

# 26. Opportunity Grid

## Desktop

Use:

```text
3 columns
```

for the primary discovery layout.

At very wide screens:

```text
4 columns
```

may be used only when card content remains readable.

### Card dimensions

Recommended:

```text
min-width: 280px
height: 330–360px
```

Cards in the same grid must have the same height.

### Grid gap

```text
20–24px
```

---

# 27. Tablet Opportunity Grid

Use:

```text
2 columns
```

with:

```text
16–20px
```

gap.

Cards retain consistent height.

---

# 28. Mobile Opportunity Grid

Use:

```text
1 column
```

Do not squeeze two cards into a 360–430px viewport.

Mobile cards should become:

```text
width: 100%;
min-height: 300px;
```

---

# 29. Opportunity Card Anatomy

Every opportunity card follows this structure:

```text
┌─────────────────────────────────┐
│ Category                  [♡]   │
│                                 │
│ Opportunity title               │
│ Organization                   │
│                                 │
│ Short description               │
│                                 │
│ ┌────────┐ ┌────────┐           │
│ │Funding │ │Country │           │
│ └────────┘ └────────┘           │
│                                 │
│ Deadline                        │
│                                 │
│ [Compare]          [View →]     │
└─────────────────────────────────┘
```

---

# 30. Opportunity Card Content Hierarchy

### Level 1

Opportunity title.

### Level 2

Organization/provider.

### Level 3

Short description.

### Level 4

Important metadata:

- category
- country
- funding
- deadline

### Level 5

Actions:

- Save
- Compare
- View

Do not display every available database field on the card.

---

# 31. Opportunity Card Title Rules

Maximum:

```text
2 lines
```

If longer:

```text
line-clamp: 2
```

Do not shrink typography to fit.

---

# 32. Opportunity Card Description

Maximum:

```text
2–3 lines
```

Use a deterministic line clamp.

The card must remain visually consistent regardless of description length.

---

# 33. Deadline Treatment

Deadline is one of the most important fields.

Use clear language:

```text
Deadline
Oct 18, 2026
```

For urgency:

```text
3 days left
```

### Deadline states

Normal:

```text
Oct 18
```

Upcoming:

```text
12 days left
```

Urgent:

```text
3 days left
```

Expired:

```text
Expired
```

Do not use red simply because a date is approaching.

Use danger styling only for genuinely urgent/expired states.

---

# 34. Funding Treatment

Funding should be immediately scannable.

Examples:

```text
Fully funded
Partially funded
Tuition covered
Stipend
Unfunded
```

Funding information may use the yellow/lime accent surface.

Do not turn every funding label into a bright badge.

---

# 35. Country / Location

Display as compact metadata.

Examples:

```text
United States
Germany
Remote
Multiple countries
```

If there is insufficient space, use a concise location label.

---

# 36. Category Labels

Examples:

```text
Scholarship
Fellowship
Grant
Internship
Competition
Program
Research
```

Category is a classification, not a decorative badge.

Use a subtle label.

---

# 37. Compare Interaction

Every opportunity card must have a visible:

```text
Compare
```

control.

When selected:

- card receives a stronger border
- compare control becomes active
- selection count appears in a persistent compare tray

Maximum comparison selection:

```text
2 opportunities
```

The UI should not allow a third selection if comparison is limited to two.

---

# 38. Compare Tray

When one item is selected:

```text
┌─────────────────────────────────────────────┐
│ 1 selected                       [Compare]   │
└─────────────────────────────────────────────┘
```

When two are selected:

```text
┌─────────────────────────────────────────────┐
│ 2 selected        [Clear]     [Compare]     │
└─────────────────────────────────────────────┘
```

Desktop:

- sticky bottom center
- max-width around 600px

Mobile:

- fixed above bottom navigation
- full width minus 16px margins

---

# 39. Comparison Screen

Comparison should compare only information that is common and meaningful across both opportunities.

## Desktop

```text
Compare opportunities

┌──────────────────┬──────────────────┬──────────────────┐
│ Attribute        │ Opportunity A    │ Opportunity B    │
├──────────────────┼──────────────────┼──────────────────┤
│ Category         │ Scholarship      │ Fellowship       │
│ Country          │ Germany          │ USA              │
│ Funding          │ Fully funded     │ Partial          │
│ Deadline         │ Oct 18           │ Nov 02           │
│ Eligibility      │ ...              │ ...              │
└──────────────────┴──────────────────┴──────────────────┘
```

The comparison view should not visually declare a winner.

Use neutral side-by-side presentation.

---

# 40. Comparison Mobile

Convert the table into stacked attribute groups.

```text
Funding

Opportunity A
Fully funded

Opportunity B
Partial

────────────

Deadline

Opportunity A
Oct 18

Opportunity B
Nov 02
```

Keep the two opportunities visually identifiable throughout the page.

---

# 41. Filters

Primary filters:

```text
Category
Country
Funding
Deadline
Eligibility
Field / Area
```

Additional filters should remain secondary.

Do not expose 15 filters simultaneously.

---

# 42. Filter UI — Desktop

Use a horizontal control row:

```text
[Category ▾]
[Country ▾]
[Funding ▾]
[Deadline ▾]
[More filters ▾]
```

Selected filters appear below:

```text
Category: Scholarship ×
Funding: Fully funded ×
Country: Germany ×
```

---

# 43. Filter UI — Mobile

Use:

```text
[Filter] [Sort]
```

Opening Filter launches a bottom sheet.

The bottom sheet contains:

- filter groups
- selected state
- Clear all
- Apply filters

The sheet should not become a full-screen form unless necessary.

---

# 44. Sort

Supported sorting patterns:

```text
Recommended
Deadline soonest
Newest
Recently updated
```

Keep sorting separate from filtering.

---

# 45. Empty States

## No opportunities

```text
No opportunities found

Try removing a filter or changing your search.

[Clear filters]
```

Do not use giant illustrations.

---

# 46. No Saved Opportunities

```text
Your saved opportunities will appear here.

Save opportunities while browsing so you can return to them later.

[Explore opportunities]
```

---

# 47. Loading State

Use skeletons that preserve the final layout.

Opportunity card skeleton:

```text
████████████
████████████████

████████████████
████████████

████████  ███████

████████████
```

Never use a full-page spinner when the structure can be shown immediately.

---

# 48. Opportunity Detail Screen

The detail screen is the conversion point from discovery to application.

## Desktop

```text
Breadcrumb

┌───────────────────────────────────────────────┐
│ Category                              [Save] │
│                                               │
│ Opportunity title                            │
│ Organization                                 │
│                                               │
│ Description                                  │
│                                               │
│ [Apply / Visit official page]                │
└───────────────────────────────────────────────┘

┌───────────────────────┐  ┌───────────────────┐
│ Overview              │  │ Key information   │
│                       │  │ Deadline          │
│ Eligibility           │  │ Funding           │
│ Requirements          │  │ Country           │
│                       │  │ Category          │
└───────────────────────┘  └───────────────────┘
```

---

# 49. Detail Page Hero

The hero should contain:

- category
- title
- organization
- concise description
- deadline
- funding
- save action
- primary external application action

The user should understand the opportunity within 5–10 seconds.

---

# 50. Detail Page CTA

Primary CTA:

```text
Apply / Visit opportunity
```

Secondary:

```text
Save
Compare
```

The external application CTA should be visually dominant.

Do not create multiple competing primary buttons.

---

# 51. Detail Page Content Sections

Recommended order:

1. Overview
2. Eligibility
3. Requirements
4. Funding
5. Important dates
6. Application information
7. Source / official link

Keep the order predictable.

---

# 52. Saved Screen

Saved opportunities should prioritize action.

Header:

```text
Saved opportunities
```

Controls:

```text
All
Scholarships
Fellowships
Internships
```

Cards should retain the same opportunity card component used elsewhere.

Do not create a completely different card design for Saved.

---

# 53. Application Tracking

If application tracking exists, use a simple status model:

```text
Interested
Planning
Applied
Interview / Next step
Accepted
Rejected
Archived
```

The status must be visually secondary to the opportunity itself.

---

# 54. Deadlines Screen

This screen should provide a calendar/list hybrid.

Desktop:

```text
Upcoming deadlines

October 2026

[Date] [Opportunity] [Funding] [Status]
[Date] [Opportunity] [Funding] [Status]
```

A calendar view can be provided as a secondary mode.

The default should remain highly scannable.

---

# 55. Application Status Colors

Use semantic colors sparingly:

```text
Interested → neutral
Planning → blue
Applied → lilac
Next step → yellow
Accepted → green
Rejected → muted red
Archived → gray
```

Never use saturated colors for every row.

---

# 56. Profile / Preferences

Preference fields should support relevance without making the product feel like a form-heavy onboarding system.

Possible preference groups:

```text
Academic interests
Countries
Opportunity types
Funding preference
Deadline preference
```

Use progressive disclosure.

---

# 57. Buttons

## Primary

```text
height: 40px
padding-inline: 16px
radius: 10px
background: #171C24
color: white
```

## Secondary

```text
background: white
border: 1px solid #E3E3DE
color: #17191C
```

## Ghost

No border.

Use only where visual weight must remain low.

---

# 58. Button Sizes

```text
Small: 32px
Medium: 40px
Large: 48px
```

Default application buttons:

```text
40px
```

Mobile touch targets should be at least:

```text
44 × 44px
```

---

# 59. Iconography

Use a consistent outline icon system.

Preferred visual characteristics:

- 1.5–2px stroke
- rounded joins
- minimal detail
- 16–20px default size

Do not mix filled and outlined icon styles arbitrarily.

Icons should clarify actions rather than decorate empty space.

---

# 60. Avatars

Use avatars only when there is an actual person/entity relationship.

For organization logos:

```text
32 × 32px
```

For user avatar:

```text
32–36px
```

Do not create fake avatars or decorative faces.

---

# 61. Search Results

Search results must preserve the same opportunity card component.

Do not create a different visual language for search.

Search result states:

```text
Searching...
No results
Results found
```

Show result count where useful.

---

# 62. Data Density

The product should feel information-rich without feeling crowded.

Target card content:

```text
1 category
1 title
1 organization
1 short description
2–4 metadata fields
1 deadline
2–3 actions
```

Anything beyond this belongs on the detail page.

---

# 63. Desktop Density Rules

At 1440px:

- 3-column opportunity grid is preferred
- 4 columns only when content remains comfortable
- page side padding: 32–48px
- grid gap: 20–24px
- card padding: 20px
- section gap: 32–40px

---

# 64. Mobile Density Rules

At 390px:

- one opportunity per row
- 16px page padding
- 16px card padding
- 16px card gap
- minimum 44px touch target
- metadata may wrap to two rows
- actions remain accessible without horizontal scrolling

Never horizontally scroll an opportunity card.

---

# 65. Responsive Card Behavior

### Desktop

```text
[Title]                       [Save]
Organization
Description

Metadata row

Deadline

[Compare]                 [View]
```

### Mobile

```text
[Save]

Category
Title
Organization
Description

Funding
Country
Deadline

[Compare]     [View]
```

The content order remains identical.

Only layout changes.

---

# 66. Responsive Dashboard

Desktop:

Bento grid.

Tablet:

Two-column layout.

Mobile:

Single-column vertical stack.

Do not shrink desktop bento cards until text becomes unreadable.

Reflow them.

---

# 67. Responsive Navigation

Desktop:

```text
Sidebar + header
```

Tablet:

```text
Compact rail + header
```

Mobile:

```text
Header + bottom navigation
```

Never use both a full sidebar and bottom navigation simultaneously.

---

# 68. Modals

Modal width:

```text
480–640px
```

Large comparison/filter interfaces:

```text
720–900px
```

Modal radius:

```text
20px
```

Use modals for:

- destructive confirmation
- focused configuration
- small decision flows

Do not put the entire opportunity detail page inside a modal.

---

# 69. Bottom Sheets

Mobile filters, sorting, and quick actions should use bottom sheets.

Structure:

```text
Handle

Title

Content

────────────

[Clear] [Apply]
```

The primary action remains visible.

---

# 70. Toasts

Use toasts for short-lived confirmation.

Examples:

```text
Opportunity saved
Removed from saved opportunities
Added to comparison
Application status updated
```

Do not use toasts for critical information that must remain visible.

---

# 71. Error States

Errors must explain:

1. what happened
2. what the user can do

Example:

```text
Couldn't load opportunities

The opportunity list couldn't be loaded right now.

[Try again]
```

Do not show raw API errors.

---

# 72. Data Freshness

Where opportunity data can change, show freshness subtly.

Example:

```text
Updated 2 days ago
```

Do not place timestamps everywhere.

Use them when freshness affects decision-making.

---

# 73. External Source Indicator

If an opportunity links to an external application/source:

```text
Official source ↗
```

The icon communicates that the user is leaving the portal.

Do not disguise external navigation as an internal action.

---

# 74. Accessibility

Minimum requirements:

- WCAG AA contrast targets
- keyboard navigation
- visible focus state
- semantic headings
- semantic buttons
- accessible labels for icon-only controls
- no color-only status communication
- 44px mobile touch targets
- logical tab order

---

# 75. Focus State

Default:

```css
outline: 2px solid #171C24;
outline-offset: 2px;
```

Never remove focus styles.

---

# 76. Reduced Motion

Respect:

```css
prefers-reduced-motion
```

When enabled:

- remove card movement
- remove animated transitions
- reduce modal movement
- preserve functional state changes

---

# 77. Motion System

Motion should communicate state.

Default transition:

```text
150–180ms ease-out
```

Hover:

- subtle surface change
- subtle border change

Do not lift cards dramatically.

Recommended card hover:

```text
translateY(-1px)
```

Maximum.

---

# 78. Opportunity Card Interaction

### Default

White surface + neutral border.

### Hover

Slight border emphasis.

### Saved

Bookmark filled/active.

### Compared

Dark border or clearly visible selection ring.

### Disabled

Reduced opacity only when genuinely unavailable.

### Expired

Muted visual treatment but still readable.

---

# 79. Card Do / Don't

## Do

- keep cards identical in size
- use consistent metadata placement
- prioritize title and deadline
- keep actions aligned
- use whitespace
- make comparison obvious

## Don't

- allow variable-height cards
- put 10 badges on a card
- use a different card layout for every category
- put long descriptions on cards
- use giant icons
- use colored backgrounds randomly

---

# 80. Component Architecture

Recommended reusable components:

```text
AppShell
Sidebar
MobileNavigation
Header
GlobalSearch

PageHeader
SectionHeader

OpportunityCard
OpportunityGrid
OpportunityMetadata
DeadlineIndicator
FundingIndicator
CategoryLabel
SaveButton
CompareButton

FilterBar
FilterPopover
FilterSheet
SortControl
ActiveFilters

CompareTray
ComparisonTable
ComparisonMobile

OpportunityHero
OpportunityOverview
EligibilitySection
RequirementsSection
FundingSection
DeadlineSection

StatusBadge
ApplicationStatus

SkeletonCard
EmptyState
ErrorState
Toast
Modal
BottomSheet
```

---

# 81. Component Consistency Rule

If two components perform the same action, they must look and behave the same.

Examples:

- every Save button uses the same icon/state
- every Compare button uses the same selection behavior
- every deadline indicator uses the same semantic rules
- every opportunity card uses the same metadata ordering

---

# 82. Recommended Screen Map

## Primary

```text
/home
/explore
/opportunity/:id
/saved
/compare
/deadlines
/applications
/profile
```

---

# 83. Home Screen

Primary modules:

```text
Welcome / context
Quick metrics
Upcoming deadlines
Recommended opportunities
Recently saved
```

The page should remain actionable.

---

# 84. Explore Screen

Primary modules:

```text
Page header
Search
Filters
Sort
Active filters
Opportunity grid
Pagination / infinite loading
```

This is the main discovery interface.

---

# 85. Opportunity Detail

Primary modules:

```text
Breadcrumb
Hero
Primary CTA
Key information
Overview
Eligibility
Requirements
Funding
Deadline
Source
```

---

# 86. Saved Screen

Primary modules:

```text
Header
Category filters
Saved count
Opportunity grid
```

---

# 87. Compare Screen

Primary modules:

```text
Header
Opportunity identities
Common attributes
Comparison rows
External action
```

No ranking language.

No winner indicators.

---

# 88. Deadlines Screen

Primary modules:

```text
Upcoming
Date grouping
Opportunity
Deadline
Status
```

Optional calendar mode may exist.

---

# 89. Applications Screen

Primary modules:

```text
Status filters
Opportunity
Application status
Deadline
Last updated
Next action
```

Keep this workflow-oriented.

---

# 90. Mobile Screen Priority

Mobile should prioritize:

1. Search
2. Opportunity discovery
3. Save
4. Compare
5. Deadline
6. Apply

Everything else is secondary.

---

# 91. Mobile Explore Layout

```text
┌─────────────────────────────┐
│ Opportunities          🔍   │
│                             │
│ Search opportunities...     │
│                             │
│ [Filter] [Sort]             │
│                             │
│ 128 opportunities           │
│                             │
│ ┌─────────────────────────┐ │
│ │ Opportunity card        │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ Opportunity card        │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

# 92. Desktop Explore Layout

```text
┌───────────────┬─────────────────────────────────────────┐
│               │ Opportunities                           │
│               │                                         │
│ Sidebar       │ Search                                  │
│               │                                         │
│               │ Filters                                 │
│               │                                         │
│               │ 3-column opportunity grid               │
│               │                                         │
│               │                                         │
└───────────────┴─────────────────────────────────────────┘
```

---

# 93. Page Header Pattern

Every major page should use:

```text
Eyebrow / context
Page title
Short explanation
Primary action
```

Example:

```text
DISCOVER

Find opportunities that match your goals

Explore scholarships, fellowships, grants, internships,
and other programs in one place.

[Explore]
```

Do not make every page title overly promotional.

---

# 94. Bento Usage

Bento layouts are for **information hierarchy**, not decoration.

Good:

```text
Large recommended module
Small deadline module
Small saved module
Wide opportunity section
```

Bad:

```text
12 equal boxes with unrelated statistics
```

Every box must answer a useful question.

---

# 95. Surface Hierarchy

Use only a few surface levels:

```text
Background
Surface
Surface muted
Accent surface
```

Do not create:

```text
Surface 1
Surface 2
Surface 3
Surface 4
Surface 5
```

Excessive layering makes the interface feel like a dashboard template.

---

# 96. Background Rules

Desktop application background:

```text
#F7F7F4
```

Primary content cards:

```text
#FFFFFF
```

Do not use pure white for every background layer.

The small contrast between warm background and white cards creates depth without shadows.

---

# 97. Mobile Background

Use the same semantic system.

Do not switch to a completely different theme on mobile.

Cards may remain white.

---

# 98. Form Design

Inputs:

```text
height: 40–44px
padding: 12px
radius: 10–12px
border: 1px solid #E3E3DE
```

Focus:

```text
border: #171C24
```

Labels:

```text
13px / 500
```

Help text:

```text
12px / 17px
```

---

# 99. Filter Dropdown

Dropdown width should match content.

Minimum:

```text
220px
```

Maximum:

```text
320px
```

Rows:

```text
40px minimum
```

Checkboxes/radios must have full-row click targets.

---

# 100. Tables

Tables are secondary.

Use them for:

- applications
- deadlines
- structured comparison
- administrative data

Do not use a table as the default Explore interface.

The default Explore experience is the opportunity grid.

---

# 101. Table Rules

Header:

```text
12px / 600
```

Rows:

```text
52–60px
```

Use horizontal separators lightly.

Avoid vertical borders between every column.

---

# 102. Pagination

If pagination is used:

```text
Previous
1
2
3
...
Next
```

Keep it compact.

If infinite loading is used, preserve scroll position and avoid sudden layout jumps.

---

# 103. Skeleton Dimensions

Skeletons must match final component geometry.

Opportunity skeleton:

```text
Card: 330–360px
Padding: 20px
Title: 2 lines
Description: 3 lines
Metadata: 2 rows
Footer: fixed
```

This prevents layout shift.

---

# 104. Interaction State Matrix

| Component | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Button | neutral | darker/lighter surface | outline | pressed | muted |
| Card | white | border emphasis | focus ring | selected | muted |
| Save | outline icon | filled preview | ring | filled | muted |
| Compare | neutral | subtle highlight | ring | selected | unavailable |
| Filter | white | border emphasis | ring | active | muted |
| Nav item | transparent | muted surface | ring | dark surface | muted |

---

# 105. Data Integrity UI Rules

Never visually imply data that does not exist.

Examples:

- If funding is unknown, show `Funding not specified`.
- If country is unknown, show `Location not specified`.
- If deadline is unknown, show `Deadline not specified`.
- Never invent metadata from the title.

Unknown values should be explicit but visually quiet.

---

# 106. Long Text Rules

Opportunity titles:

```text
max 2 lines
```

Descriptions:

```text
max 3 lines on cards
```

Organization names:

```text
max 1–2 lines
```

Metadata:

```text
truncate with tooltip when needed
```

Never allow one unusually long title to destroy the grid rhythm.

---

# 107. Internationalization Readiness

Do not hard-code widths based on English text.

Controls must tolerate longer translated labels.

Dates should use localized formatting.

Country names should not be manually abbreviated unless there is a defined product rule.

---

# 108. Accessibility for Color

Do not communicate:

```text
Urgent = red only
Saved = pink only
Accepted = green only
```

Always pair color with:

- text
- icon
- shape
- or explicit state

---

# 109. Visual Rhythm

The interface should alternate between:

```text
large heading
breathing room
control row
content
breathing room
next section
```

Do not place every section immediately against the previous section.

Recommended major section separation:

```text
32–40px
```

---

# 110. Desktop Card Rhythm

Cards should have:

```text
20px padding
16px internal gaps
24px grid gap
```

The eye should be able to scan:

```text
Title → Funding → Deadline → Action
```

without parsing every line.

---

# 111. Mobile Card Rhythm

Use:

```text
16px padding
12–16px internal gaps
16px between cards
```

Do not reduce typography excessively to fit more content.

---

# 112. Navigation Naming

Use simple labels.

Preferred:

```text
Home
Explore
Saved
Applications
Deadlines
Compare
```

Avoid:

```text
Opportunity Intelligence
Discovery Hub
My Opportunity Universe
Application Command Center
```

The product should feel sophisticated through execution, not naming.

---

# 113. Empty Space Rules

Empty space is intentional.

Never fill whitespace with:

- extra statistics
- decorative icons
- extra badges
- random illustrations
- unnecessary helper text

If a section has little content, reduce the section rather than filling it.

---

# 114. Anti-Patterns

Never implement:

- neon gradients
- glassmorphism
- excessive shadows
- glowing borders
- animated background gradients
- huge hero illustrations
- oversized icons
- dense filter panels
- inconsistent card heights
- random card colors
- tiny 10px body text
- excessive pill badges
- full-screen modals for simple actions
- horizontal card scrolling on mobile
- desktop UI shrunk into mobile
- five different button styles
- multiple competing primary CTAs

---

# 115. Implementation Rules

## Token-first

Create tokens before screens.

## Component-first

Build shared components before page-specific variants.

## Screen consistency

Reuse the same OpportunityCard across:

- Explore
- Home
- Saved
- Recommendations
- Search

Only the surrounding context changes.

---

# 116. Recommended CSS Architecture

```text
globals.css
├── color tokens
├── typography tokens
├── spacing tokens
├── radius tokens
├── shadow tokens
├── motion tokens
└── accessibility tokens
```

Component styles should consume these variables.

---

# 117. Suggested Tailwind Mapping

```text
bg-background
bg-surface
bg-surface-soft

text-foreground
text-foreground-secondary
text-foreground-muted

border-border
border-border-strong

rounded-md
rounded-lg
rounded-xl
rounded-2xl
```

Do not use arbitrary values unless a value is genuinely component-specific and cannot be represented by a token.

---

# 118. Suggested React Component Structure

```text
components/
  layout/
    AppShell
    Sidebar
    MobileNavigation
    Header

  opportunities/
    OpportunityCard
    OpportunityGrid
    OpportunityMetadata
    OpportunityHero
    DeadlineIndicator
    FundingIndicator
    SaveButton
    CompareButton

  filters/
    FilterBar
    FilterPopover
    FilterSheet
    ActiveFilters
    SortControl

  comparison/
    CompareTray
    ComparisonTable
    ComparisonMobile

  applications/
    ApplicationStatus
    ApplicationRow

  feedback/
    EmptyState
    ErrorState
    Skeleton
    Toast
```

---

# 119. QA Checklist

Before considering a screen complete, verify:

### Layout

- [ ] Content aligns to the global container.
- [ ] No arbitrary margins create visual drift.
- [ ] Grid columns are consistent.
- [ ] Opportunity cards have consistent heights.
- [ ] Major sections have sufficient breathing room.

### Typography

- [ ] Geist is used consistently.
- [ ] Heading hierarchy is obvious.
- [ ] Body text is readable.
- [ ] No important information is below minimum readable size.

### Color

- [ ] Background is warm neutral.
- [ ] Cards are white.
- [ ] Accent colors are semantic.
- [ ] No random pastel usage.
- [ ] Contrast is sufficient.

### Components

- [ ] Buttons use shared styles.
- [ ] Save behavior is consistent.
- [ ] Compare behavior is consistent.
- [ ] Filters behave consistently.
- [ ] Cards use one canonical component.

### Responsive

- [ ] Desktop works at 1280px.
- [ ] Desktop works at 1440px.
- [ ] Tablet reflows correctly.
- [ ] Mobile works at 360px.
- [ ] Mobile works at 390px.
- [ ] Mobile works at 430px.
- [ ] No horizontal overflow.
- [ ] Bottom navigation does not cover content.

### States

- [ ] Loading
- [ ] Empty
- [ ] Error
- [ ] Hover
- [ ] Focus
- [ ] Active
- [ ] Selected
- [ ] Disabled
- [ ] Expired

---

# 120. Final Visual Target

The finished product should visually communicate:

```text
Calm
Organized
Premium
Academic
Trustworthy
Modern
Information-rich
Spacious
Action-oriented
```

It should **not** communicate:

```text
Generic job board
Government portal
Spreadsheet
AI template
Neon SaaS dashboard
Over-designed student app
```

---

# 121. Final Design Principle

The most important rule for this product is:

> **Make the interface feel simpler than the data behind it.**

The opportunity database may contain hundreds of fields and thousands of records.

The user should only see the information needed for the current decision.

Discovery should be:

```text
Search → Scan → Filter → Compare → Save → Open
```

Decision-making should be:

```text
Understand → Check eligibility → Check funding → Check deadline → Apply
```

The UI should support these flows without forcing users to understand the underlying data model.

---

# 122. Screen Priority

Implementation priority:

## P0

1. App shell
2. Explore / Opportunity Grid
3. Opportunity Card
4. Search
5. Filters
6. Opportunity Detail
7. Save
8. Compare
9. Compare Screen
10. Responsive mobile navigation

## P1

11. Home dashboard
12. Saved
13. Deadlines
14. Applications

## P2

15. Profile/preferences
16. advanced filtering
17. calendar mode
18. secondary analytics

Do not build P2 visual complexity before the P0 experience is visually coherent.

---

# 123. Definition of Done

The design system is complete only when:

- all major screens use the same visual language
- every opportunity card has consistent geometry
- desktop and mobile are intentionally designed rather than mechanically scaled
- search and filtering feel native to the product
- compare is visible and predictable
- deadlines are immediately scannable
- funding is easy to understand
- opportunity detail pages provide a clear path to application
- empty/loading/error states are designed
- typography and spacing are tokenized
- colors are semantic
- no random one-off styles exist
- the interface has generous whitespace
- the product looks cohesive when every screen is viewed together

---

# 124. Implementation Directive

Treat this document as the **single source of truth for the UI layer**.

Before implementing any screen:

1. identify the appropriate existing component
2. reuse the existing token
3. reuse the existing spacing scale
4. reuse the existing card/control pattern
5. preserve responsive behavior
6. add a new component only when the interaction is genuinely different

Do not solve visual problems by adding more colors, more borders, more cards, smaller text, or more UI.

Solve them through:

**hierarchy → spacing → typography → grouping → interaction.**

That is the visual system.
