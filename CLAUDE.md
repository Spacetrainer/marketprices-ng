# MarketPrices — Working Agreement

> The build protocol at `docs/build-protocol.md` is the source of truth for this project.
> Read it before any task touching data or content. This file is its doorway and its
> day-to-day working agreement — not a replacement for it.

## What this is
A food intelligence platform for Nigeria and Africa, plus the Content Engine that produces
its content. Next.js 15 App Router, Supabase, Tailwind v4, TypeScript strict, on Vercel.
Public site + a six-surface admin control room (Dashboard, Signal feed, Price radar, Draft
studio, Publish queue, Settings) plus one article editor, one login.

## Build protocol — read `docs/build-protocol.md` before any task touching data or content

Three rules override everything else in this file:

1. **No pre-written content (P0.1).** Never create sample articles, demo prices, placeholder
   authors, fake signals or lorem ipsum — not in code, not in seeds, not "temporarily to show
   the layout." If a surface has no data, build its empty state instead. `seed.sql` may
   contain reference data only (sections, commodities, units, collection sites, sources,
   templates, seed rules). Never content.

2. **Nothing is assumed (P0.2).** Every displayed value came from human input or is a labelled
   derivation of it. Never carry a price forward, never interpolate a missing week, never
   render null as 0, never auto-write into a saved field, and never copy an example value out
   of the spec documents into code. The specs contain illustrative numbers (₦95,000, "Week 31",
   "47") — those are drawings, not data. No price, date, week, count, commodity name, site name
   or percentage may appear as a string literal in `app/`, `components/` or `lib/`.

3. **The model never writes a figure (P0.3, P14.1).** Every number is a `{{block_id}}`
   placeholder bound from the database. If model output contains a digit outside a token, the
   verification pass rejects it. There is no override and no config flag.

Also always:
- Prices are weekly and univariate: one price per commodity, per ISO week, per tier (P1.7).
  There is NO market-versus-market comparison in this product (P1.8). Collection sites are
  provenance only.
- Prices are append-only and always trace to a submission and a named collector (P1).
- Every published article traces to a content item, including manually written ones (P1.9).
- The engine has zero write access to price data (P5.2). Nothing reaches a reader without a
  human choosing the piece, the format and the release time (P5.1).
- Missing weeks are drawn as gaps, never interpolated (P2.8). An incomplete basket week has no
  index value (P2.10).
- Price periods are absolute ISO weeks, never relative (P2.7). Stale prices are labelled stale.
- There are exactly six admin surfaces and one article editor (P12.1, P3.7): Dashboard,
  Signal feed, Price radar, Draft studio, Publish queue, Settings. Do NOT build a lead desk,
  content desk, kanban board, inbox, triage view, backlog, approval screen, second dashboard,
  separate analytics screen, or a standalone Articles, Media or Prices screen. The status is
  `queued`, never `lead` (P12.3).
- The control room is invisible to the public (P12.5). No admin link, nav item or component
  ever renders in public chrome except the single footer Admin entry.
- No content in isolation (P15.7). Everything that publishes lands on its own page, its
  section page, search, the sitemap and the feed — the publish job FAILS an item missing its
  allocation fields rather than publishing an orphan. Never build a format or archetype whose
  output has no public page.

When a task appears to require breaking one of these, stop and ask. Do not work around it.

## Design system — NEVER invent values
All colour, type, spacing, radius and layout values live in `styles/tokens.css` as CSS
custom properties. Read that file before writing any component. If a value you need is not
there, STOP and ask — do not add one and do not use a raw hex code. This applies to the
control room exactly as it applies to the public site: one palette, no forks.

Full specifications: `docs/marketprices-design-and-system-architecture.md`.

Non-negotiable:
- Buttons are amber `--amber-action` with a `--navy-deep` label. Never red. Never white text.
- `--rise` means a rising price. `--fall` means a falling price. Nothing else.
- Severity uses the navy weight ramp and NEVER green or red. Severity is not direction.
- Every price change carries an arrow glyph (▲ ▼ —) as well as colour. Colour alone is a bug.
- Every price displays its ISO week and collection date. A price without provenance does not ship.
- Every number uses `font-variant-numeric: tabular-nums`.
- Headlines and excerpts clamp to exactly two lines.
- Container 1280px, grid 972px, rail 276px, gutter 24px, sidebar 240px.

## Code conventions
- TypeScript strict. No `any`. No non-null assertions without a comment explaining why.
- Server Components by default. `"use client"` only for state or event handlers.
- Data access lives in `lib/queries/`. Components never call Supabase directly.
- Validate every external input with Zod at the boundary — including model output.
- Format currency, dates and weeks only through `lib/format.ts` and `lib/weeks.ts`.
- Never hand-roll ISO week arithmetic. `lib/weeks.ts` or nothing.
- Files kebab-case, components PascalCase, one component per file.

## Database
- Every schema change is a numbered migration. Never edit an applied one.
- Regenerate `types/database.ts` after every migration. Never hand-edit it.
- Every table has RLS enabled. Public tables get an explicit anon SELECT policy.
- `social_content_queue` is a LIVE table used by Agent 3 in production. Additive,
  nullable columns only, in their own PR.

## Testing
- Every component with logic gets a Vitest test.
- Every page gets a Playwright smoke test.
- Run `pnpm typecheck && pnpm lint && pnpm test` before you tell me a stage is done.

## Rules for you
- Do not install a package without telling me first and saying why.
- Do not create files outside the structure in `docs/marketprices-build-plan.md`.
- Do not create an admin route that is not in `ADMIN_ROUTES` in `lib/constants.ts`.
- Do not touch `.env` files or print secret values.
- Do not add charting or drag-and-drop libraries.
- When a task is ambiguous, ask one question rather than guessing.
- Work on one page or component at a time. Say when you are done and what to verify.

## The standing prohibition block (P12.4) — applies to every admin surface

```
THE CONTROL ROOM IS PRIVATE. Every admin screen lives behind a login at
/admin. Do NOT place Dashboard, Signal feed, Price radar, Draft studio,
Publish queue, Settings, the editor, or ANY admin link, tab or nav item in
the public site's navigation, header or body — not even as a prototype
switcher or demo convenience. The public navigation carries the seven
editorial sections only. The ONLY admin entry point is one small "Admin"
link in the footer legal row, leading to a login screen. A public visitor
must see no evidence the control room exists.

THERE ARE EXACTLY SIX ADMIN SURFACES AND SIX SIDEBAR ITEMS:
Dashboard, Signal feed, Price radar, Draft studio, Publish queue, Settings.

Do NOT create a seventh. In particular do NOT build any of the following,
under any name:
- a lead desk, idea queue, inbox, triage view, backlog or ideas screen
- a content desk
- a kanban board or any column-based drag interface
- a separate approval screen
- a second dashboard, or an analytics screen separate from the Dashboard
- a second article editor
- a three-column agent desk
- a standalone Articles screen (the Publish queue's list view is the
  published library)
- a standalone Media screen (images upload inside the editor, with
  mandatory alt text)
- a standalone Prices screen (the submission queue and observations
  explorer live on the Price radar; commodity/site/collector/basket
  master data lives in Settings)

Promoted items go straight to Draft studio. If you find yourself wanting
somewhere to hold promoted items before production, that place is Draft
studio and it already exists.

There is exactly ONE article editor at /admin/editor/[id], opened from
Draft studio and Publish queue. It is not a sidebar item. Do not create a
second one.

There is no drag-and-drop anywhere except the calendar chip in Publish
queue. Status changes happen through buttons, never by moving a card
between columns.

NO CONTENT IN ISOLATION: every content item the engine produces publishes
to its own page on the public site and appears on its section page. Do not
design any output, format or artefact that ships without a public page —
no standalone graphics, no social-only posts, no content whose only home
is the control room. Social posts always link back to the item's page.

VOCABULARY: the status is `queued`, never `lead`. The classification field
is `insight_type`, never `lead_type`. Do not use the word "lead" as a noun
anywhere in identifiers, comments or UI copy.