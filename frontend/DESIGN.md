---
name: AXIOM CRM
description: Light, cool operations workspace for a rotating-portfolio CRM; one Axiom blue accent and the ghost track for every measured quantity.
colors:
  background: "#f4f6fa"
  foreground: "#101828"
  card: "#ffffff"
  card-foreground: "#101828"
  muted: "#eef1f6"
  muted-foreground: "#5a6478"
  border: "#e4e8f0"
  input: "#d6dce7"
  ring: "#2a62f2"
  primary: "#2a62f2"
  primary-foreground: "#ffffff"
  accent: "#ecf2ff"
  accent-foreground: "#1d4ed0"
  destructive: "#d93a40"
  destructive-foreground: "#ffffff"
  success: "#12875a"
  warning: "#b86e05"
  sidebar: "#fbfcfe"
  sidebar-foreground: "#1b2433"
  sidebar-muted: "#5a6478"
  sidebar-accent: "#ffffff"
  sidebar-border: "#e6eaf1"
  track: "#edf2ff"
  fill: "#3b74ff"
  fill-soft: "#9fbcff"
  wash: "#e6eeff"
  scrim: "#0b1220"
  chart-2: "oklch(0.66 0.17 55)"
  chart-3: "oklch(0.58 0.12 190)"
  chart-4: "oklch(0.55 0.2 340)"
  chart-5: "oklch(0.7 0.15 100)"
  chart-6: "oklch(0.55 0.03 260)"
  dark-background: "#0c111d"
  dark-foreground: "#e7ebf3"
  dark-card: "#131a2a"
  dark-muted: "#1a2133"
  dark-muted-foreground: "#9aa4b8"
  dark-border: "#232b3e"
  dark-input: "#2d3650"
  dark-ring: "#6b95ff"
  dark-primary: "#5b8bff"
  dark-primary-foreground: "#0a0f1c"
  dark-accent: "#172343"
  dark-accent-foreground: "#b8cbff"
  dark-destructive: "#f0656a"
  dark-success: "#3ccf8e"
  dark-warning: "#f2b544"
  dark-sidebar: "#0f1524"
  dark-sidebar-accent: "#1a2236"
  dark-sidebar-border: "#1f2738"
  dark-track: "#18213a"
  dark-fill: "#5b8bff"
  dark-fill-soft: "#2c4a9a"
  dark-wash: "#121c36"
typography:
  brand-display:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.16em"
  headline:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
    fontFeature: "\"cv11\", \"ss01\""
  figure:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"cv11\", \"ss01\""
  title-lg:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"cv11\", \"ss01\""
  label:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  card: "20px"
  cell-x: "16px"
  cell-y: "12px"
  stack: "16px"
  section: "24px"
  header-gap: "28px"
  rail: "256px"
  rail-collapsed: "72px"
  topbar: "64px"
  content-max: "90rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-ghost:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "20px"
  dialog:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.2xl}"
    padding: "24px"
    width: "32rem"
  popover:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "8px"
  tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
  badge:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  badge-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  nav-item:
    textColor: "{colors.sidebar-muted}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-foreground}"
  pagination-page:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    size: "36px"
  pagination-page-current:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  meter-track:
    backgroundColor: "{colors.track}"
    rounded: "{rounded.full}"
    height: "8px"
  meter-fill:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.full}"
  meter-fill-complete:
    backgroundColor: "{colors.success}"
  cycle-day:
    backgroundColor: "{colors.track}"
    height: "80px"
---

# Design System: AXIOM CRM

## Overview

**Creative North Star: "The Lit Ledger"**

AXIOM CRM is a working ledger held up to daylight. The ground is a cool, pale blue-grey (Background), work happens on white sheets (Card) separated by hairlines, and a single electric blue taken from the logo's glow marks what is actionable or what is moving. Everything that can be counted is counted in tabular figures, and everything that has a target is drawn on the ghost track: a pale lane the full length of the goal, with a blue fill that fades toward its origin. The ejecutivo reads quota and cycle state before anything else, then finds a company, then pages through the rest.

Density is that of an operations tool used all day on a laptop or monitor: 14px body, 36px controls, 20px card padding, tables with 12px row rhythm. The shell is quiet (a light rail, a translucent topbar, a faint blue wash at the top of the workspace) so that data carries the colour. Dark mode is not a different world; it is the same ledger at night on #0C111D with every role mirrored.

This system replaces a dark-navy-sidebar admin shell and refuses the grey-card SaaS kit: surfaces are white on cool ground, not grey on grey, and the rail is light.

**Key Characteristics:**
- Cool light ground, white surfaces, hairline borders, one blue accent.
- Onest Variable throughout, with tabular numerals for every figure.
- Gently rounded, softly lifted surfaces (14px cards, cool-tinted layered shadows).
- The ghost track for quota, coverage, funnels, charts and the 21-day cycle.
- Every list is paged; every catalog is searchable.

## Colors

A cool, low-chroma blue-grey neutral family carrying one saturated Axiom blue; other hues exist only to encode data or state.

### Primary
- **Axiom Blue** (primary, ring): the logo's glow. Primary buttons, the current page in pagination, focus rings, the active nav icon, the today marker on the cycle strip, the caret and (at 22%) text selection.
- **Glow Fill** (fill) fading to **Soft Fill** (fill-soft): the ghost-track fill. A horizontal gradient from Soft to Glow on meters, vertical from Glow (bottom) to Soft on cycle days and chart bars. In sparkbars, the current week is solid Glow and past weeks Soft.
- **Pale Lane** (track): the full-length lane under every fill.
- **Blue Mist** (accent) with **Deep Blue Ink** (accent-foreground): secondary buttons, default badges, highlighted menu and combobox rows, empty-state icon tiles, avatar initials, conversion chips, row hover at 40%.
- **Morning Wash** (wash): the radial glow at the top-right of the workspace (`bg-workspace`).

### Neutral
- **Cool Ground** (background): app ground behind everything.
- **Sheet White** (card, sidebar-accent): cards, inputs, popovers, dialogs, the raised active nav pill.
- **Rail White** (sidebar): the left rail, a hair cooler than Sheet White.
- **Night Ink** (foreground): primary text; inverted as the tooltip surface.
- **Slate Mute** (muted-foreground, sidebar-muted): secondary text, table headers, inactive nav, axis ticks.
- **Fog** (muted): table header band at 45%, skeletons, ghost-button hover.
- **Hairline** (border, sidebar-border): every divider and card edge; set globally on `*`.
- **Field Line** (input): input and select strokes, the off state of the theme switch, scrollbar thumbs.
- **Scrim** (scrim): the overlay behind dialogs and the mobile drawer at 35% (black at 60% in dark).

### State and data
- **Signal Red** (destructive), **Ledger Green** (success), **Amber** (warning): destructive actions, invalid fields, goal reached (a complete meter turns solid green), warnings.
- **Pipeline status hues**: eight stages map to Tailwind's slate, sky, amber, teal, violet, indigo, emerald and rose (100 background / 800 text / 200 border in light; 500 at 15% / 300 text in dark), with a solid 400/500 dot. Defined once in the shared pipeline-status map and reused by badges, kanban column heads and the funnel.
- **Chart series** (chart-2 to chart-6, chart-1 = fill): categorical palette for multi-series charts, mid-lightness in light mode and lighter in dark.

### Named Rules
**The One Blue Rule.** Axiom Blue is the only interface accent. Any other hue on screen must encode data (pipeline stage, chart series) or state (destructive, success, warning); none is used for decoration or chrome.

**The Mirror Rule.** Every light token has a dark twin under `.dark`; components reference roles, never literal hex, so both themes come from one component tree.

## Typography

**Display Font:** Onest Variable (with ui-sans-serif, system-ui, Segoe UI, Roboto)
**Body Font:** Onest Variable
**Label/Mono Font:** none distinct; figures use Onest with tabular numerals.

**Character:** one geometric-humanist grotesk at every size, with the `cv11` and `ss01` alternates enabled globally. Hierarchy comes from weight (400/500/600) and size, never from a second family.

### Hierarchy
- **Headline** (600, 1.65rem, 1.25, -0.02em): page title in the page header; balanced wrap.
- **Figure** (600, 1.9rem KPI / 1.75rem stat tile / 1.25rem small tile, line-height 1, -0.02em, tabular): the big number on KPI and portfolio stat tiles.
- **Title Large** (600, 1.25rem, -0.01em): section titles inside a card, such as the cycle panel.
- **Title** (600, 15px, 1.25): card titles. Dialog titles step up to 1.125rem.
- **Body** (400 or 500, 0.875rem, 1.43): table cells, form text, nav items, descriptions (descriptions capped at max-w-2xl, about 42rem).
- **Label** (500, 0.75rem; 13px for KPI labels): table headers, badges, field hints, pagination counts, sidebar group names. Sentence case, no tracking.

The wordmark "AXIOM" in the rail (600, 15px, 0.08em tracking) is part of the logo lockup, not a type role.

- **Brand Display** (700, 3.6rem desktop / 2.6rem mobile, line-height 1, 0.16em tracking with matching left padding to re-center it): the white wordmark on the login brand panel only. "CRM" sits under it at 0.875rem, 500, 0.3em tracking. Never used inside the app shell.

### Named Rules
**The Tabular Rule.** Every number a user compares (table cells, counts, ranges, pagination summaries, dates in strips, KPI values, version) is set in tabular numerals; tables inherit it globally and standalone figures add it explicitly.

## Layout

The shell is a full-height flex row: a 256px left rail (72px collapsed, icons only, labels kept for screen readers), and a column holding a 64px topbar and the scrolling main area. Main carries the Morning Wash and pads 16px on mobile, 24px from 640px, 32px from 1024px; content is centered with a 90rem maximum width. On large screens the root font size steps up (17px from 1536px, 18px from 1920px); since everything is in rem, type, spacing, cards and the content width all grow together, while phones and laptops keep 16px.

Below 768px the rail becomes a 288px drawer over a 35% scrim, opened from a menu button in the topbar, and data tables switch to stacked row cards when the screen provides them.

Each screen opens with a page header (title and description left, primary action right, bottom-aligned, 28px below), then its data. List screens are one card: a filter row (search first, then selects; 16px padding, 12px gap, hairline below), then the table or empty state, then a full pagination bar in a hairline-topped footer. Dashboard and portfolio compose cards in grids with 16px gaps and 24px between sections; stat tiles run 1, 2 and then 3 or 4 columns at 640 and 1280px.

Screens with several distinct jobs (Cartera, Tablero) split them into underline tabs under the page header instead of stacking every section; the chosen tab is remembered for the browser session. The Pipeline board shows only the six working stages as fluid columns (minimum 11rem, about 80% of the width on phones with snap scrolling); a switch reveals "Por contactar" and "Descartado", and cards carry only the company name and last contact.

The topbar holds the section path (group / page), a today's-date chip from 1024px, and the user menu with initials avatar.

### Named Rules
**The Paged-Everything Rule.** No view renders an unbounded list. Server-paged tables use the full Pagination (summary, page numbers, rows-per-page of 7/14/28/56, 7 by default); narrow places (kanban columns, combobox popovers) use the compact variant ("2 / 5"). When the API returns a complete list (kanban column cards, weekly plan, branches, executive catalogs), paging and search happen client-side through the shared client-list hook, which ignores accents and case and returns to page 1 when the query changes.

**The Find-It-Anywhere Rule.** Every list and catalog has a search field. Selects with a long or growing option set (executives, sectors, cycles) use the searchable select (combobox with search and compact paging, 7 per page); short fixed enums (role, status, currency, mode) stay native selects. Where an endpoint has no search parameter, the search filters only the loaded page, and the screen says so: a muted note under the filter row ("La búsqueda filtra ... de esta página") or a "Filtrar esta página" placeholder with a "Nada en esta página coincide" empty message.

## Elevation & Depth

A hybrid: depth is mostly tonal (white sheets on cool ground, hairline edges) with soft, layered, cool-tinted shadows that grow with how far a surface floats. The shadow colour is a token (hue 220, 40%, 20% in light; near-black in dark), so shadows stay blue-grey, never neutral black on light.

### Shadow Vocabulary
- **xs** (`0 1px 2px hsl(var(--shadow-color) / 0.05)`): inputs, outline buttons, the date chip, the current pagination page.
- **sm** (`0 1px 2px … / 0.04, 0 2px 6px -1px … / 0.06`): cards, the active nav pill, the theme-switch knob.
- **md** (`0 2px 4px … / 0.04, 0 8px 20px -4px … / 0.1`): tooltips, the login hero card.
- **lg** (`0 4px 8px … / 0.05, 0 18px 40px -8px … / 0.16`): popovers, dropdown menus, dialogs, the mobile drawer.
- **Primary lift** (`0 1px 2px hsl(225 80% 30% / 0.25), inset 0 1px 0 rgb(255 255 255 / 0.14)`): primary buttons only, a blue-tinted contact shadow with a top highlight.

### Named Rules
**The Float-Earns-Shadow Rule.** Shadow depth follows layer: inline controls xs, resting sheets sm, transient overlays lg. A resting card never takes md or lg.

## Shapes

Gently rounded, never pill-shaped except where the form is literally a track. Controls (buttons, inputs, selects, nav items, pagination pages, tooltips) use 10px; cards, popovers, menus, empty states and icon tiles use 14px; dialogs use 16px; badges 8px; menu and combobox rows 6px. Meters, the theme switch and the avatar are fully round. Cycle-strip day columns use a tight 5px so 21 of them read as a calendar, not as pills. Borders are 1px hairlines everywhere; empty states use a dashed hairline.

## Components

### Buttons
Confident but quiet: a single filled blue per view, everything else recedes.
- **Shape:** gently rounded (10px), 36px tall (32px small, 40px large, 36px square icon).
- **Primary:** Axiom Blue with white text and the primary lift; hover drops to 92% opacity.
- **Secondary:** Blue Mist with Deep Blue Ink; for the second action in a pair.
- **Outline:** white sheet, hairline, xs shadow; hover strengthens the border to Field Line and fills Fog at 60%. Used for pagination arrows and neutral actions.
- **Ghost:** Slate Mute text; hover fills Fog and darkens text. Used for icon buttons in the shell.
- **Destructive:** Signal Red, hover 90%.
- **Hover / Focus / Active:** colour transitions; focus shows a 2px Axiom Blue ring offset 2px from the ground; pressing nudges the button down 1px; disabled is 50% opacity with no pointer events. Icons are 16px.

### Chips and Badges
- **Style:** 8px radius, 12px medium text, 2px by 8px padding. Default is Blue Mist; secondary (the default variant) is Fog with Slate Mute text; outline is a hairline.
- **Status badge:** outline badge in the stage's tinted colours with a 6px solid dot before the label. Always from the shared status map.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Sheet White on Cool Ground.
- **Shadow Strategy:** sm at rest (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 20px; header and content share it (content has no top padding). List cards clip their table (`overflow-hidden`) and put filters, table and pagination edge to edge.
- **Stat tile:** a card with a 14px muted label, the Figure value, and an optional meter or 12px note below.

### Inputs / Fields
- **Style:** Sheet White, 1px Field Line, 10px radius, 36px tall, 12px horizontal padding, xs shadow, Slate Mute placeholder. Hover moves the stroke toward Slate Mute at 40%.
- **Focus:** stroke turns Axiom Blue with a 3px ring of the blue at 20%.
- **Error / Disabled:** `aria-invalid` turns the stroke Signal Red; disabled is 50% with a not-allowed cursor.
- **Search input:** the same field with a 16px search icon inset left and a clear (x) button right when filled; Escape clears.
- **Select:** native select with an inset chevron. **Searchable select / combobox:** a field-styled trigger with an up-down chevron and optional clear; opens a 14px popover with a borderless search input on top, an option list (6px rows, Blue Mist highlight, check on the selected) and compact pagination in a hairline footer. The company picker is the server-searched combobox for the 127k-company catalog.

### Navigation
- **Rail:** Rail White with a hairline right edge. Logo lockup (30px mark, AXIOM / CRM) in a 64px band with a collapse button; nav groups with 12px muted group names; a footer with the dark-mode switch and the app version.
- **Items:** 14px medium, Slate Mute, 18px icons, 10px radius, 8px by 12px padding. Hover fills Sheet White at 70% and darkens text.
- **Active:** the raised white pill: Sheet White fill, hairline border, sm shadow, Night Ink text and an Axiom Blue icon.
- **Topbar:** 64px, Sheet White at 80% with a small backdrop blur and a hairline bottom.
- **Mobile:** 288px drawer with the same nav and switch, lg shadow, scrim behind.

### Tables
- Header band Fog at 45%, 40px tall, 12px medium Slate Mute labels; sortable headers show an up, down or faint up-down arrow and set `aria-sort`.
- Rows have hairline separators, 16px by 12px cells, Blue Mist at 40% on hover; clickable rows also expose a real button in the first cell for keyboard users. While refetching, the body dims to 60%.
- Loading uses a table-shaped skeleton (Fog, pulsing); below 768px, rows can render as stacked cards.

### Pagination
- Full: tabular summary ("1–25 de 1.240 empresas", announced politely), optional rows-per-page select, outline arrow buttons, page numbers with ellipsis gaps (current page filled Axiom Blue), "Página x de y" on mobile.
- Compact: arrows at 28px and a tabular "x / y" between them.

### Dialogs, Popovers, Menus, Tooltips
- Dialog: centered, up to 32rem wide and 90dvh tall, 16px radius, 24px padding, lg shadow, scrim behind, close (x) top-right; footer actions right-aligned, stacked in reverse on mobile.
- Popover and dropdown menu: Sheet White, 14px radius, lg shadow; menu rows highlight in Blue Mist.
- Tooltip: inverted (Night Ink surface, ground-coloured text), 10px radius, 12px text, md shadow, 200ms delay.

### Empty State
A dashed-hairline 14px container on Sheet White at 60%, centered: a 48px Blue Mist icon tile, a 16px semibold title, an optional muted description and action. Inside list cards it drops its border and background.

### Ghost Track (signature)
The system's signature move: a pale lane the full length of the goal, with a blue fill that fades toward its origin.
- **Meter:** round lane in Pale Lane, 6, 8 or 12px tall; fill is the Soft-to-Glow horizontal gradient with a 6px minimum when non-zero, animating its width over 700ms ease-out; at goal it turns solid Ledger Green. Always `role="progressbar"` with a label and value text.
- **21-day cycle strip:** one column per week, seven 80px-tall day columns each on Pale Lane; past days fill fully with the vertical Glow-to-Soft gradient, today fills to the fraction of the day elapsed (at least 18%) and carries a 2px Axiom Blue ring offset from the card; the current week's label darkens. Exposed as one image with a "Día n de 21" label.
- **Charts:** bar charts draw each bar on a full-height track background with the vertical gradient and 6px radius, solid Glow on hover; grid lines are dashed hairlines with no vertical lines; axis ticks are 12px Slate Mute. Sparkbars on KPI tiles show past weeks in Soft Fill and the current week in Glow. Every chart ships a visually hidden data table.
- **Funnel:** each stage on a 10px Pale Lane at full width, filled in the stage's own status hue.

### Motion
Short and functional: colour and shadow transitions on interactive elements, 200ms for rail width and the theme-switch knob, 700ms ease-out for meter and funnel fills, a 1px press on buttons, pulsing skeletons. `prefers-reduced-motion` collapses all animation and transition to near zero.

## Do's and Don'ts

### Do:
- **Do** keep Axiom Blue (#2A62F2 light, #5B8BFF dark) as the only interface accent; use one primary button per view.
- **Do** draw any value measured against a target on the ghost track: Pale Lane underneath, Soft-to-Glow fill on top, solid green only when the goal is reached.
- **Do** set every compared number in tabular numerals.
- **Do** page every list (full Pagination for tables, compact inside columns and popovers) and put a search field on every list and catalog.
- **Do** use the searchable select for long or growing option sets and the client-list hook when the API returns the whole list.
- **Do** tell the user, in a muted note or placeholder, when a search only filters the current page because the endpoint has no search parameter.
- **Do** reference colour roles (background, card, primary, track…) so light and dark stay mirrored.
- **Do** float overlays on the lg shadow and keep resting cards on sm with a hairline.

### Don't:
- **Don't** bring back the dark navy sidebar; the rail is light (Rail White) with a raised white active pill.
- **Don't** build grey cards on grey ground; surfaces are white sheets on Cool Ground separated by hairlines.
- **Don't** use a second hue for chrome or emphasis; non-blue hues are reserved for pipeline stages, chart series and destructive/success/warning state.
- **Don't** render an unbounded list or a long native select.
- **Don't** introduce a second typeface; hierarchy comes from Onest's weights and sizes.
- **Don't** use neutral black shadows in light mode; shadows take the cool shadow-colour token.
