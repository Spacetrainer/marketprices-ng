# MARKETPRICES — DESIGN & SYSTEM ARCHITECTURE
### One system: the public platform at marketprices.ng and the Content Engine that feeds it
### Merged edition — supersedes `marketprices-design-and-system-architecture.md` (v1) and `content-engine-spec-v2.md`

> **What this document is.** The single description of the whole product: what the reader
> sees, what the operator sees, what the machine does between them, and what every value in
> the system means. It absorbs both prior documents in full. Where they disagreed, §0.5
> names the conflict and the decision — there are fourteen of them and each one is a place
> where building from the old pair of documents would have produced two of something.
>
> **Its companions.** `marketprices-build-plan.md` says what you type and in what order.
> `marketprices-build-protocol.md` says what the system will refuse to do. Where this
> document and the protocol disagree, **the protocol wins** — it exists precisely to
> outrank a good idea you have at 11pm. Where this document is silent on a measurement
> (radii, scrim gradients, grid maths), `design-architecture-spec.md` still applies.

---

# PART A — THE PRODUCT

## 0. WHAT WE ARE BUILDING

### 0.1 In one paragraph

MarketPrices is a food intelligence platform for Nigeria and the wider African continent.
It has two halves that share one database and one login. The **public platform** at
marketprices.ng publishes editorial content across seven beats — Prices, Production,
Technology, Markets, Government, Interviews, Africa — alongside **commodity price data**
collected weekly from physical Lagos markets, including the Lagos Food Basket Index. The
**Content Engine** is the backend that produces that content: it continuously reads the web
and reads your own price series, fuses the two into insights, and produces each insight as
either a **written article with a designed graphical header** or a **video** — then
schedules it, publishes it to the public platform, and dispatches it to social forty-five
minutes later. Both halves are reached through one admin login and one sidebar.

### 0.2 The first inversion — data over editorial

The reference template this design descends from is **editorial-first with a data garnish**.
The league table sits in a 276px sidebar; it is flavour. Remove it and the site still works.

MarketPrices is the opposite. **The price data is the product.** The articles are context,
credibility, and the reason people return between price checks. If someone lands on the
homepage and cannot see a food price within one screen, the site has failed at its job.

| Reference behaviour | MarketPrices behaviour | Why |
|---|---|---|
| Score rail is one strip inside one section | Price rail appears in the hero zone, above the fold | Prices are the reason people came |
| League table lives only in the sidebar | Price table lives in the sidebar **on every page**, plus a full page of its own | Price lookup is a recurring task, not a one-off read |
| Red = the only action colour | Red = falling price. Action colour moves to amber | You cannot have "price fell" and "click here" be the same colour |
| Blue = "a number that matters" | Green/red = direction of change | Direction is the meaning, not mere emphasis |
| 2 topical sections on the homepage | 7 topical sections | More beats, so they cannot all get identical weight |
| Every article is text | Articles are text, video, or data-led | The YouTube channel is an existing asset |

### 0.3 The second inversion — the backend is a factory, not a CMS

This is what the merge adds, and it is the larger of the two.

A conventional CMS is a room where a human writes and a machine stores. The Content Engine
inverts that: **the machine finds, judges, drafts and renders; the human approves, edits and
releases.** There are exactly two human transitions in the entire pipeline — **promote**
(this is worth publishing, in this format) and **schedule** (release it then). Everything
else is machine state.

The consequence for the design is specific and load-bearing: the backend is not styled like
a writing tool, it is styled like a **control room**. Dense tables, status pills, count
badges, queues that empty. Its first screen answers *what needs a human right now*, not
*what would you like to write today*.

### 0.4 The rule that makes it trustworthy

> **The language model never writes a figure.**

Every number — in prose, in a headline, in the text burned onto a graphical header, in an
on-screen video caption — is injected from the database as a bound data block. The model
writes around `{{block_id}}` placeholders and never sees the values. A figure appearing in
model output that is not a placeholder token is a hard rejection with no override path.

This is the anti-hallucination spine. It does not bend for any format, any deadline, or any
future version. It is protocol **P14.1**.

### 0.5 THE FOURTEEN MERGE DECISIONS

The two source documents were written months apart and each assumed it was describing the
whole system. Fourteen places where they conflict, and what wins. **Read this table before
building anything.** Each row is a place where following the old documents literally would
have produced duplicated, contradictory, or unbuildable work.

| # | The conflict | Decision |
|---|---|---|
| **M1** | Both specced a Dashboard — the admin backend's stat screen and the engine's control board | **One screen.** The engine's four-zone Dashboard *is* the admin Dashboard module. There is no second analytics screen anywhere |
| **M2** | Both specced an article editor — the admin's two-pane editor and the engine's Draft studio | **One editor component.** Route `/admin/editor/[id]`, opened from Draft studio (pre-schedule) and Publish queue (scheduled via the calendar, published via the list view — *revised R1*). One live card preview, one set of character limits |
| **M3** | Price grain: daily prices across many markets vs. one weekly price per commodity | **Weekly and univariate wins.** One market visit per week sets that week's Lagos price. Mile 12 and Ile-Epo are used interchangeably as collection sites; meat comes from the abattoir. **There is no market-versus-market comparison anywhere in this product** |
| **M4** | Published price table named `prices` vs `price_observations` | **`price_observations`**, keyed `UNIQUE (commodity_id, iso_year, iso_week, tier)`. `price_submissions` survives unchanged as the only door in — provenance is not negotiable, only the grain changed |
| **M5** | `agent_items` / `agent_clusters` / `agent_drafts` vs `signals` / `content_items` | **`signals` and `content_items`.** The `agent_*` tables are deleted from the plan before they are built. Clustering collapses into write-time dedup plus fusion |
| **M6** | Parent's three-column agent desk (Feed/Draft/Meta) vs the engine's six screens | **The six screens.** The three-column desk is not built |
| **M7** | "Nothing auto-publishes" vs a cron that publishes on a schedule | **Both hold.** The human review *is* the schedule action. `scheduled_by` and `scheduled_for` are `NOT NULL` before an item can enter `scheduled`; the cron only executes an already-approved decision. Written into the disclosure page in those words |
| **M8** | Freshness in hours (72h fresh, 30d max) vs a weekly series | **Weeks.** Current ISO week is fresh; one week behind is labelled; older than two weeks leaves the ticker and the homepage entirely, remaining available and dated in `/prices` |
| **M9** | Master data (commodities, sites, basket) in Settings vs in a Prices module | **Everything configurable lives in Settings** — entities (commodities, aliases, collection sites, collectors) in groups 5–6 alongside the rules. *Revised at prototype review (R1): the standalone Prices module was cut, so its master-data half moved here and its approval half moved to the Price radar* |
| **M10** | Can a human write an article outside the engine? | **Yes, but through the same spine.** A manual article is a `content_items` row with `source_screen = 'manual'`. Every published article traces to a content item, exactly as every published price traces to a submission |
| **M11** | Parent's 17 stages vs the engine's 12 phases | **One 23-stage sequence** in the build plan, with the engine's hand-publish gate preserved as stage 11 |
| **M12** | Agent jobs on Supabase Edge Functions vs Next.js route handlers | **Route handlers on Vercel Cron.** One runtime, one language, one deploy, one log stream |
| **M13** | Social distribution existed only in the engine document | **Kept as layer L6.** It reuses the live Agent 3 / Metricool pipeline and the existing `social_content_queue` table — one migration, not a rebuild |
| **M14** | Header rendering introduces Canva MCP, absent from the parent stack | **Added.** Canva MCP renders headers (four sizes) and video cuts against a registered brand kit. It is the only new external dependency the merge introduces |
| **M15 (R1)** | The first high-fidelity prototype rendered control-room screens in the public site's navigation | **The public/admin boundary is now a named protocol (P12.5).** No control-room screen, link, nav item or component ever renders in public chrome. The only route in is the small footer Admin entry, which leads to a login. Every generative design prompt states this prohibition explicitly |
| **M16 (R1)** | The merged nine-surface sidebar vs the engine's original six screens | **Six surfaces win: Dashboard, Signal feed, Price radar, Draft studio, Publish queue, Settings.** The three library/data screens the merge had added are dissolved, not deleted: the price submission queue and observations explorer fold into **Price radar**; the published-article library folds into **Publish queue** (list view); media upload and alt-text enforcement fold into **the editor**; YouTube import folds into **Draft studio**; commodity/site/collector/basket master data folds into **Settings** groups 5–6 |
| **M17 (R2)** | Nothing in the old documents *guaranteed* that engine output lands on a public surface — it was implied by construction (every item gets its own page; section is required) but never stated as a rule | **The allocation rule (§8.15a, protocol P15.7): no content in isolation.** Every content item that publishes must resolve to a public page and appear on its section page, the search index, the sitemap and the feed within one revalidation cycle. Publication *fails* — the item goes to `failed`, not `published` — if any allocation field is missing. The engine cannot produce content the public site cannot reach |

Two further consequences worth stating in their own right, because they are subtractions and
subtractions are easy to forget:

- **M3 deletes public copy.** Coverage strings of the shape *"14 markets, 9 states"* are
  gone — the honest equivalent is *"Lagos · week 31 · Ile-Epo"*. The `/prices` table loses
  its Market and State comparison columns and gains time columns (Δ WoW, Δ MoM, Δ YoY).
- **M3 changes what an average is.** There is no cross-market average to compute. The only
  aggregate in the system is the **Lagos Food Basket Index**, which is a cost of a frozen
  basket, not a mean — and it carries its own completeness rule (§6.4, protocol P2.10).

### 0.6 What stays exactly the same

Do not touch these. They are the identity and they transfer through the merge unmodified:

- The two-navy system (royal navy chrome, deep navy content bands)
- Full-bleed alternating light/dark bands as the page's rhythm
- Uppercase section headers with a hairline rule to the container edge
- Seamless zero-gap image mosaics against a 24px-gap card grid elsewhere
- Bottom-anchored gradient scrims on every photo carrying text
- Pastel category chips as the only colour in white sections
- Small radii, 1px hairlines, near-zero shadows
- 1272/1280px container, 972px grid + 276px rail
- Two-line clamps on every headline and excerpt

---

## 1. CONTENT ARCHITECTURE

### 1.1 The seven sections

| # | Section | Covers | Homepage weight |
|---|---|---|---|
| 1 | **Prices** | Commodity price movements, market reports, cost-of-food analysis | **Flagship** — full treatment |
| 2 | **Production** | Farming, harvests, yields, inputs, processing, storage, logistics | Standard |
| 3 | **Technology** | Agritech, agri-fintech, machinery, cold chain, data & platforms | Compact |
| 4 | **Markets** | Trade, exports/imports, supply chains, FX effects, commodity boards | Standard |
| 5 | **Government** | Policy, regulation, subsidies, budgets, agencies, taxes, border rules | Compact |
| 6 | **Interviews** | Farmers, traders, executives, policymakers, analysts | Dark band, portrait |
| 7 | **Africa** | Continental coverage beyond Nigeria | Mosaic |

### 1.2 One primary section, many secondary signals

The seven headers mix three axes — topic (Prices, Production, Technology, Markets,
Government), format (Interviews) and geography (Africa). That is not a flaw, but it creates
ambiguity: an interview with a Ghanaian agritech founder about subsidies qualifies for four
sections at once. The resolution:

- Every article has **exactly one `section`**. This determines its nav page, its chip
  colour and its homepage block. Required; publishing is blocked without it.
- Every article has **free `tags`** (`maize`, `Ghana`, `subsidy`, `cold-chain`). Tags power
  related-article modules, search and topic landing pages.
- Two flags sit outside `section`:
  - **`type`** — `standard | video | data`. Format, not topic. A video interview is
    `section: Interviews, type: video`.
  - **`country`** — geography, not topic. Nigeria is the default. **The Africa page is every
    article where `country != 'Nigeria'`**, whatever its section.

That last rule is the important one: the Africa page is a *view*, not a bucket someone has
to remember to file into. A Kenyan maize-policy story is filed under Government, tagged
`Kenya`, and appears on both pages automatically.

### 1.3 Article types

| Type | Card treatment | Body |
|---|---|---|
| `standard` | Header graphic or photo, chip, headline, excerpt | Rich text with embedded data blocks |
| `video` | 16:9 thumbnail + play glyph + duration chip | Player + **written summary ≥150 words** |
| `data` | Chart or table preview instead of a photo | Rich text + embedded price widget |

The ≥150-word summary on a video article is a hard publish gate, not a guideline (P14.5).
Three practical reasons: much of the audience is on metered mobile data and will not always
play video, Google cannot index speech, and a video-only page renders empty when an embed
fails.

### 1.4 Every article has a designed header

This is the merge's largest change to the public surface. In the old public spec, an article
had a **hero image** — a photograph. In the engine spec, a graphic was a third publishable
format that shipped alone.

Both are now one thing: **every content item carries a designed graphical header, rendered
from a template against bound data, in four sizes.**

| Size | Used for |
|---|---|
| 16:9 | The article page hero, link cards, X |
| 4:5 | Instagram and Facebook feed, posted natively |
| 1:1 | LinkedIn, posted natively |
| 9:16 | Stories and Reels |

Photography does not disappear — archetype T7 (Editorial) is a headline over a branded
photographic band, and that is the right header for a story with no single dominant figure.
But the default is a rendered header, and the reason is reach: the 4:5 and 9:16 renders post
**natively** to social with the article link in the caption or first comment. You keep the
native-format reach mechanic without pretending the image is a publication. Every item has a
destination by construction — its own page — so the whole `destination_url` apparatus that
plagued the old graphics format disappears.

The seven header templates are specified in §8.5.

### 1.5 How the homepage fills itself

Each homepage section block is **automatic by default, editorially overridable**:

```
Default:
  SELECT * FROM articles
  WHERE section = <block> AND status = 'published'
  ORDER BY published_at DESC
  LIMIT <block slot count>

Override:
  homepage_pins holds up to N article IDs per section.
  Pinned articles occupy the first slots in order; recency fills the remainder.
  Pins auto-expire after a configurable window (default 72h).
```

The hero is the exception — `hero_lead`, `hero_secondary_1` and `hero_secondary_2` are
manually curated, falling back to most-recent-across-all-sections if an editor has not set
them in 24 hours. A front page should never be fully automatic; it should also never be
blank because someone went on leave.

---

## 2. DESIGN SYSTEM

### 2.1 The colour problem, and its solution

The reference template gets its energy from red used for exactly one thing — the action
button — at roughly 2% of the page. Scarcity is what makes it read as "click". MarketPrices
needs red for **falling prices**, where it appears dozens of times per screen. Red therefore
stops being scarce and stops meaning action.

**The solution: retire red from actions and give the action slot to amber**, with a deep-navy
label rather than white.

| | Value | Contrast | Reasoning |
|---|---|---|---|
| Action fill | `#F59E0B` | — | Far from green and red in hue; unmistakable |
| Action label | `#0A1E42` @ 700 | **9.1:1** | Passes AAA; white on amber would fail |
| Action hover | `#D97706` | 6.2:1 with navy label | Darkens, no lift |

Amber and not blue because the template's energy depends on a **hot** accent detonating
against navy bands — a blue button on deep navy disappears. Amber also carries the right
associations for a food platform (grain, harvest, sun, market awnings) without being literal.

**This decision now applies to two surfaces.** The public site and the Content Engine use the
same amber, the same rise/fall greens and reds, and the same tokens. A tool that colours
movements opposite to the site it publishes to will produce a mis-set headline within a
month. The tokens are named by **direction**, not sentiment — so if you later decide a rising
food price should read red, you change two token values in one file and both surfaces flip
together. Do not fork this decision per surface.

### 2.2 Core palette

| Token | Hex | Role |
|---|---|---|
| `--navy-deep` | `#0A1E42` | Content bands, hero panel, photo scrims, engine sidebar, CRITICAL severity |
| `--navy-brand` | `#123C74` | Main nav bar, footer, HIGH severity, bar-chart fill |
| `--amber-action` | `#F59E0B` | **Every button.** Label always `--navy-deep` |
| `--amber-hover` | `#D97706` | Button hover |
| `--rise` | `#15803D` | Price up — text, arrows, bars |
| `--rise-bg` | `#DCFCE7` | Price-up pill, Ready status pill |
| `--fall` | `#B91C1C` | Price down — text, arrows, bars; destructive actions |
| `--fall-bg` | `#FEE2E2` | Price-down pill, Needs-work status pill |
| `--flat` | `#6B7280` | No change |
| `--ink-900` | `#16181D` | Headlines, prices |
| `--ink-500` | `#6B7280` | Body, excerpts |
| `--ink-400` | `#5A6474` | Meta, timestamps — darkened from the reference for AA |
| `--line-200` | `#E5E8EE` | Borders, hairlines, dividers |
| `--surface-0` | `#FFFFFF` | Page and cards |
| `--surface-50` | `#F7F8FA` | Row hover, engine content background |
| `--on-dark` | `#FFFFFF` | Text on navy |
| `--on-dark-muted` | `#B8C3D6` | Sub-copy on navy |

**Contrast check:** `#15803D` on white = 4.9:1 ✓. `#B91C1C` on white = 6.4:1 ✓. Both pass AA
at 13px. The brighter `#16A34A` / `#DC2626` fail at small sizes — use them only on the 3px
direction bars, where contrast rules do not apply.

### 2.3 Section chip palette

Seven sections, seven pastels. No yellow (protects amber), no saturated green or red
(protects price semantics).

| Section | Background | Label |
|---|---|---|
| PRICES | `#D5EAFA` sky | `#14456F` |
| PRODUCTION | `#F0E7D6` sand | `#6B5533` |
| TECHNOLOGY | `#E4E2FB` periwinkle | `#3B357A` |
| MARKETS | `#D6EFEC` teal | `#155E56` |
| GOVERNMENT | `#E3E7EE` slate | `#39445A` |
| INTERVIEWS | `#FADCE6` rose | `#7A2540` |
| AFRICA | `#FBDDCF` clay | `#7A3A1C` |

All seven pairings clear 7:1. On photography, chips switch to `rgba(255,255,255,0.92)` fill
with the same label colour. **Secondary chips** (country, commodity) use a neutral outline —
`1px #D9DEE7`, transparent, label `--ink-500` — so a card never carries two filled chips.

The engine's **format chips** reuse two of these pairings rather than introducing new colour:
Article takes the Prices sky pairing, Video takes the Interviews rose pairing (§8.9).

### 2.4 Colour ratio target

- ~60% white · ~22% navy · ~10% photography · ~5% pastel chips · ~2% amber (buttons only)
- **~1% green/red — a ceiling, not a target**

If half your price table is red, the page reads as an emergency. Direction colour goes on the
**change value and its arrow only** — never the price, never the commodity name, never a row
background.

### 2.5 Typography

Two-family system: Manrope / Plus Jakarta Sans for UI, a wide display face for the logotype
and one CTA headline per page. Two requirements the merge does not relax:

**A. The naira glyph.** Every font in the stack must render **₦ (U+20A6)**. Many display
faces and several popular sans faces do not, and the fallback glyph is visibly wrong in a
price table. Render `₦95,000` at 13px, 18px and 30px in every weight you intend to ship
before committing. Display face failing is acceptable (₦ never appears in display type); UI
face failing is not.

**B. Tabular numerals.** Every price, percentage and table figure sets:
```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1;
```
Without this a column of prices will not align. This is the single most visible difference
between a real data product and a template with numbers pasted in — and it now applies to the
engine's tables too, where every screen is numbers.

### 2.6 Number and time formatting

| Value | Format | Example |
|---|---|---|
| Price ≥ ₦1,000 | Symbol, thousands separator, no decimals | `₦95,000` |
| Price < ₦1,000 | Symbol, no decimals | `₦850` |
| Percentage change | Signed, 1 decimal, arrow glyph | `▲ 2.4%` / `▼ 1.1%` |
| Absolute change | Signed, no decimals | `+₦2,300` |
| No change | Em dash, `--flat` | `—` |
| Missing week | Diagonal-hatched cell or gap marker, never zero | *(see §6.3)* |
| Non-Nigerian prices | Local currency + ₦ equivalent in 11px beneath | `KES 4,200` / `≈ ₦48,900` |
| Article timestamp | Relative under 24h, absolute over | `3 hrs ago` / `12 Jul 2026` |
| **Price period** | **Always an ISO week, never relative** | `Week 31 · 28 Jul – 3 Aug 2026` |
| **Collection provenance** | Absolute date + site, stated once | `Collected 30 Jul 2026 · Ile-Epo` |

The last two rows are credibility rules, not formatting ones. "5 hrs ago" on a price implies
a freshness that weekly field collection cannot deliver. Give the week and the collection
date.

**Naira first, percentages second** in prose: *"₦62,000, up 38%"* — not *"up 38% to
₦62,000"*. The reader is buying food, not trading a spread.

---

## 3. HOMEPAGE COMPOSITION

### 3.1 Four density tiers

Seven sections cannot all receive the full treatment (filter pills + data rail + 3×3 grid +
sidebar). Seven identical blocks produce a page that is exhausting, monotonous and roughly
9,000px tall.

| Tier | Layout | Used by |
|---|---|---|
| **Flagship** | Filter pills → price rail → 3×3 grid + right rail → See All | Prices |
| **Standard** | Section header → 3×2 grid + right rail → See All | Markets, Production |
| **Compact** | Section header → single 3-card row → See All | Technology, Government |
| **Feature** | Full-bleed dark band or mosaic | Interviews, Video, Africa |

### 3.2 Section order and band alternation

| # | Section | Band | Layout | Notes |
|---|---|---|---|---|
| 1 | Utility bar | White | Social + search | Admin link is **not** here |
| 2 | Navigation | `--navy-brand` | Logo + 7 links | Sticky on scroll |
| 3 | **Price ticker** | `--navy-deep` | Horizontal strip, 44px | Current ISO week only |
| 4 | TOP STORIES | White | Hero mosaic (lead + 2 stacked + LATEST panel) | |
| 5 | **FOOD PRICES** | White | Flagship tier | The marquee section |
| 6 | PRODUCTION | White | Standard tier | |
| 7 | INTERVIEWS | `--navy-deep` | 3 portrait cards | |
| 8 | MARKETS | White | Standard tier | |
| 9 | TECHNOLOGY | White | Compact tier | |
| 10 | **WATCH** | `--navy-deep` | 1 large + 3 small video tiles | YouTube + engine video |
| 11 | GOVERNMENT | White | Compact tier | |
| 12 | AFRICA | White | 5-tile mosaic | |
| 13 | Newsletter + Social CTA | `--navy-deep` | Display headline + email capture + handle pills | |
| 14 | Footer | `--navy-brand` | Logo, links, pills, legal, **admin link** | |

Rhythm: `dark → white ×3 → dark → white ×3 → dark → white ×2 → dark → navy`. Three dark
bands, evenly spaced. The page breathes.

**Band alternation is computed from rendered bands, not a static index.** A section with no
published articles is omitted from the DOM entirely (protocol P4.3), so `SectionBlock` must
work out its light/dark treatment at request time from the list of bands that actually
rendered. Build this in when you build `SectionBlock` or you will retrofit it during
hardening.

### 3.3 Why the price ticker sits above the hero

A returning user's most common intent is *what does rice cost this week*. Making them scroll
past a hero mosaic to find out is hostile. A 44px ticker directly under the nav answers the
question before the page finishes loading, costs almost nothing vertically, and — because it
is deep navy — reads as an extension of the nav bar rather than a new section. It also
double-thickens the navy chrome at the top of the page, strengthening the two-navy identity.

**Under the weekly model the ticker carries the current ISO week's prices and nothing else.**
If only four commodities have been priced this week, the ticker shows four items and scrolls
short. It never backfills with last week's figures to look full (P2.4).

---

## 4. PUBLIC COMPONENTS

### 4.1 Price ticker

| Property | Value |
|---|---|
| Height | 44px, full-bleed `--navy-deep` |
| Item | `COMMODITY · ₦PRICE · ▲2.4%` — 13/600 white, glyph and change in `--rise` / `--fall` |
| Separator | 1px `rgba(255,255,255,0.14)`, 24px each side |
| Motion | Marquee, ~40s loop, pauses on hover, **static and horizontally scrollable under `prefers-reduced-motion`** |
| Content | Current ISO week only. Never last week's figures |
| Empty | Renders nothing. The band collapses to zero height rather than sitting empty and navy |
| Tooltip | Commodity, unit, week label, collection date and site |

### 4.2 Price card rail

Replaces the reference's score rail. Horizontally scrollable row of 236 × 96px cards with a
fade mask at the right edge and a chevron control.

| Zone | Content |
|---|---|
| Top | Commodity name 13/700 `--ink-900`, unit 11/500 `--ink-400` |
| Middle | Price 20/700 tabular `--ink-900` |
| Bottom | `▲ 2.4%` change pill, then week label 11/400 `--ink-400` |
| Left edge | 3px direction bar — `--rise-bar` / `--fall-bar` / `--flat` |

Below 768px the rail stays horizontally scrollable; it does not wrap.

### 4.3 Price table card (rail version)

The 276px sidebar version of the price table, present on every public page. Commodity, price,
Δ WoW. Six rows plus a "See all prices" amber link. Header states the week: *"Week 31"*.

### 4.4 Movers board

Replaces "top players". Gainers / fallers toggle, five rows each, commodity + change. Requires
**at least three commodities with a computable change** or the card is omitted entirely — a
"top movers" list of one is not a ranking.

### 4.5 Video card

16:9 thumbnail, centred play glyph, duration chip bottom-right, headline two-line clamp
beneath. **Zero iframes in initial HTML** — the thumbnail is an `<img>`, and the player loads
on click into a modal from `youtube-nocookie.com`. This is a build requirement with a
Playwright test behind it, not a performance suggestion.

### 4.6 WATCH band

Full-bleed `--navy-deep`. One large tile (628px) plus three stacked small tiles. Carries both
YouTube-synced videos and engine-produced videos — they are the same `articles` rows with
`type = 'video'` and differ only in provenance.

### 4.7 Buttons

Amber fill `--amber-action`, label `--navy-deep` 14/700, padding 10px 24px, radius 6px, hover
darkens to `--amber-hover` with no lift. Never red. Never white text. One variant works on
both light and dark bands, which is the whole reason amber was chosen.

### 4.8 Navigation

72px `--navy-brand`. Logo left, seven links at 36px spacing, amber dot marking Prices, search
icon right. **Collapses to a hamburger at 992px**, earlier than the reference, because seven
links do not survive 1024px. Sticky on scroll.

### 4.9 Section header

Uppercase 28/700 title with a hairline rule running to the container edge, plus an optional
13/400 descriptor line beneath. Unchanged from the reference.

---

## 5. PUBLIC PAGE TEMPLATES

### 5.1 `/prices` — the flagship page

**This template changes materially under M3.** The old design compared markets; the new one
compares weeks.

**Band 1 — header.** `--navy-deep`. H1 "Food prices", descriptor line, and the coverage
statement — which is now *"Lagos · Week 31 · collected 30 Jul at Ile-Epo"*, computed live,
never a string literal.

**Band 2 — the Lagos Food Basket Index.** The index value, its WoW delta, four sub-index
deltas (staples, protein, vegetables, oils & condiments) and a 26-week path. This is the
number the platform owns and it goes above the table.

**Band 3 — sticky controls.** Commodity category filter pills, tier toggle (retail /
wholesale), week selector, search.

**Band 4 — the table + 276px rail.**

| Column | Notes |
|---|---|
| Commodity | Name 14/700, unit 11/400 beneath |
| This week | Tabular, `--ink-900` |
| Last week | Tabular, `--ink-400` |
| Δ WoW | Arrow glyph + colour, on the change value only |
| Δ MoM | Trailing 4-week means |
| Δ YoY | Same ISO week last year |
| 26-week sparkline | Inline SVG, `aria-label` stating range and direction, **visible gap markers** |
| Collected | Absolute date + site |

Real `<table>` markup, `<th scope>`, `<caption>`, `aria-sort`. Row click expands to a 26-week
chart, the last five recorded weeks, and a "Report an error" link.

**Below 768px the table becomes a stacked card list**, one commodity per card — commodity and
unit on line one, price and change pill on line two, week and site on line three. Do not
scroll it horizontally and do not shrink the type. This is the make-or-break responsive
detail on the whole site.

**Band 5 — price analysis.** Latest articles from the Prices section.

**Band 6 — methodology.** A permanent block stating how prices are collected, linked to
`/methodology`. Written by a human, never generated (P14.8).

ISR revalidation: 60s.

### 5.2 Section pages — Production, Technology, Markets, Government

One template, four sections. Page header band, 2-up featured mosaic, sub-topic pills, grid +
rail, load more. Each carries a section-specific rail widget: Production → seasonal calendar;
Technology → latest video; Markets → basket index card; Government → recent policy items.

### 5.3 `/interviews`

The entire page on `--navy-deep`. Portrait grid, 8px gaps, white type. Unchanged from the
reference and the strongest single band in the design.

### 5.4 `/africa`

Country pill row, 5-tile mosaic, then a grid. A derived view: `country != 'Nigeria'`. Every
card carries a country outline chip.

### 5.5 `/videos`

Grid of video cards, newest first, filterable by section. Zero iframes until clicked.

### 5.6 Article page — `/[section]/[slug]`

720px measure, 17/1.7 body, sticky 276px rail. Header graphic at 16:9 as the hero. Byline,
section chip, absolute date. A **Sources block** listing every source URL with its publication
date — present on every engine-produced article, permanently. `agent_assisted` articles carry
a one-line disclosure linking to `/how-we-use-ai`.

Data blocks render inline as real components: `stat`, `price_table`, `sparkline`,
`comparison_bar`, `timeline`, `index_card`. They are bound to live data, so an article
published in week 31 that references the week-31 rice price keeps showing the week-31 figure
— the block stores its resolved values at publish time and does not silently re-resolve.

Video variant renders the player **and** the ≥150-word written summary. Both, always.

JSON-LD: `NewsArticle`, plus `VideoObject` on video articles.

### 5.7 `/search`

Commodities group first — deep-linking into `/prices` rows — then articles. `pg_trgm` for
fuzzy matching.

### 5.8 Trust pages

`/methodology` (how prices are collected, the weekly cadence, the site-switch policy, the
gap policy) and `/how-we-use-ai` (what the engine does, what a human does, and the sentence
from M7 about scheduling being the human decision). Both are written by hand and both must
be live before the engine drafts its first item (P5.7).

---

# PART B — THE PRICE SPINE

## 6. PRICE DATA

The price data is the product and its provenance is the product's only defence. This section
is the merged, weekly model — read §0.5 M3 and M4 first if you have not.

### 6.1 The collection model

**One market visit per week sets that week's Lagos price.** General food comes from Mile 12
or Ile-Epo, used interchangeably; meat comes from the main abattoir. The series is
**univariate**: one price per commodity per ISO week per tier.

```
Field collector fills Google Form (mobile, offline-tolerant)
        ↓
Google Sheet row appended
        ↓
Apps Script onFormSubmit trigger
        ↓
POST /api/ingest/price  (bearer token)
        ↓
price_submissions (status: 'pending')
        ↓
Validation: seasonality-aware anomaly check + duplicate check
        ↓
Review queue on the Price radar  →  approve
        ↓
Approve → row written into price_observations → public site reads from there
```

**Why not read the Sheet directly.** No history, no validation, no audit trail, no way to
correct an entry without editing the source, and a hard dependency on Google's availability
for the core product. Supabase is the store of record; the Sheet is an intake device only.

**Form fields:** `collector_name` · `collector_phone` · `collection_site` · `commodity` ·
`variety` · `tier` · `unit` · `price` · `currency` · `collected_on` · `photo` (proof,
optional) · `notes`.

Dropdowns, not free text, for site, commodity, tier and unit — regenerated from the database
by `scripts/generate-form-options.ts` so the form and the database cannot drift. Free text
produces "Rice", "rice", "Local Rice" and "Ric" inside a week and no backend cleanup recovers
from it.

**Collection sites are provenance, never a comparison dimension.** `collected_at_site_id` is
stored on every observation and displayed with every price. It is not a filter, not a column
to compare across, and not a series to chart against another site. This is M3 stated as a
data rule.

### 6.2 Site-switch variance

When the site changes from the prior week, the comparison gets noisier and the system must
say so rather than pretend otherwise:

- Raise the flagging threshold: +4pp on the WoW band, and `|z| ≥ 1.5` instead of 1.2 for
  `moderate`
- Set `site_switch_flag` on the anomaly, and surface it in the radar row and the article brief
- Run a **calibration week twice a year**, pricing both sites in the same week, and store
  per-commodity offsets on `commodities.site_offset_pct`. Once real offsets exist, use them
  instead of the blunt threshold bump

### 6.3 Gaps are real

**Never interpolate a missing week.** A fabricated point eventually gets published as a fact.

- WoW across a gap becomes a **labelled two-week change**, not a WoW
- z-scores skip missing weeks rather than treating them as zero
- Every chart and sparkline shows a **visible gap marker**; the heatmap renders a missing
  week as a diagonal-hatched grey cell with no number
- A sparkline with fewer than three real points renders `—`, not a flat line. A flat line is
  a claim of stability

### 6.4 Price intelligence

**Deltas** per commodity against its own series: `wow`, `mom` (trailing 4-week means), `yoy`
(same ISO week last year), `ytd`.

**Anomaly detection:** `z = (price − trailing_12wk_mean) / trailing_12wk_stddev`.

| Severity | Condition | Editorial meaning |
|---|---|---|
| `critical` | \|z\| ≥ 2.5 or \|WoW\| ≥ 25% | Publish this week |
| `high` | \|z\| ≥ 1.8 or \|WoW\| ≥ 15% | Front-page candidate |
| `moderate` | \|z\| ≥ 1.2 or \|WoW\| ≥ 8% | Supporting data point |
| `normal` | below | Weekly report material |

All four thresholds are versioned settings, not constants in code.

**Seasonality check runs before flagging**, against `commodities.seasonality_profile`. A 20%
tomato rise in September is normal; the same rise in February is a story. Every anomaly
carries `baseline_expected` so the editor sees what was expected alongside what happened.

**The Lagos Food Basket Index.** A frozen basket of commodities and quantities, priced
weekly, indexed to 100 at a base week, with sub-indices for staples, protein, vegetables, and
oils & condiments.

```
basket_index = (cost_this_week / cost_base_week) × 100
```

This is the recurring, quotable, ownable number and the most syndicatable output in the
system. Two rules protect it:

1. **The definition is versioned.** Changing a live basket destroys comparability, so a
   change creates a new version with an `active_from` week rather than mutating history. The
   Settings screen warns loudly before saving one.
2. **An incomplete week is not published.** If any commodity in the active basket has no
   observation for a week, that week's index is **not computed and not displayed** — it is
   marked incomplete with the missing commodities named. A basket silently missing its beef
   line is a cheaper basket, and it would read as deflation that never happened. This is
   protocol **P2.10** and it is the single easiest way to publish a false trend.

### 6.5 YouTube sync

A scheduled job every 6 hours calls the YouTube Data API v3 for the channel and upserts into
`videos`: `youtube_id`, `title`, `description`, `thumbnail_url`, `duration`, `published_at`,
`view_count`.

In **Draft studio**, an Import control lists synced videos with an **Import as content item**
action **[R1 — formerly a Media-library tab]**, which creates a `content_items` row with `format = 'video'`, `source_screen = 'manual'`, the
YouTube title as a draft headline and the thumbnail as a starting header. **Never
auto-publish a synced video** — YouTube titles are optimised for YouTube's algorithm and will
break the card layout and the editorial voice.

Engine-produced videos travel the other way: rendered by the video chain, uploaded to
YouTube, and the resulting `youtube_id` written back onto the content item. Same table, same
card, different provenance.

---

# PART C — THE CONTROL ROOM

## 7. THE ADMIN BACKEND

One login. One sidebar. Nine surfaces and no more.

### 7.1 Access and roles

| Role | Can |
|---|---|
| **Admin** | Everything, including users, settings groups 1/6/12, and deletion |
| **Editor** | Publish, edit any item, approve prices, promote, schedule, settings groups 2–5 and 7–11 |
| **Contributor** | Create and edit own drafts, promote, submit for review. Cannot schedule or publish |
| **Analyst** | Read-only Dashboard. Nothing actionable, no Settings. This is the only screen an Analyst sees, and that is the point of the role |

Supabase Auth, email + password, **mandatory TOTP 2FA for Admin and Editor**, 12-hour session
timeout, rate-limited login. RLS on every table. `/admin` is `noindex, nofollow` and linked
only from the small footer entry.

Full audit log of every publish, edit, delete, price approval, settings change and role
change — actor, timestamp, and a before/after diff.

### 7.2 The role matrix

| | Admin | Editor | Contributor | Analyst |
|---|---|---|---|---|
| View feed, radar, studio, queue | ✓ | ✓ | ✓ | — |
| View Dashboard | ✓ | ✓ | ✓ | ✓ |
| Promote / approve an insight | ✓ | ✓ | ✓ | — |
| Edit a draft | ✓ | ✓ | own only | — |
| Schedule / publish | ✓ | ✓ | — | — |
| Reschedule or recall | ✓ | ✓ | — | — |
| Approve a price submission | ✓ | ✓ | — | — |
| Settings groups 2–5, 7–11 | ✓ | ✓ | — | — |
| Settings groups 1, 6, 12 | ✓ | — | — | — |
| View audit log | ✓ | ✓ | — | ✓ |

### 7.3 Backend design language

**Related, not identical.** The public site is an editorial product; the backend is a tool.
Recognisably the same brand, unmistakably a different mode.

| Property | Public site | Control room |
|---|---|---|
| Base background | `#FFFFFF` | `--surface-50` `#F7F8FA` |
| Sidebar | — | `--navy-deep`, 240px fixed, full height |
| Content | Cards on white | White cards on `--surface-50`, `1px --line-200`, radius 8px |
| Base type | 13–16px | **13px**, line-height 1.4 |
| Photography | Everywhere | Only in card previews and the editor's image picker |
| Density | Generous | Compact — 32px table rows, 40px where a row carries two lines |
| Radius | 8/12px | 6px buttons, 8px cards, 4px chips |
| Primary action | Amber | Amber, label `--navy-deep` 700 |
| Secondary action | Outline | White, `1px #D9DEE7`, label `--ink-900` |
| Destructive | — | `--fall` |

Reuse every token. Change only density and background. Numbers are `tabular-nums` everywhere
and ₦ must render in every shipped weight.

### 7.4 Severity is not direction

The single most important visual rule in the control room, and one the public site never
needs.

Severity is **magnitude**; direction is **up or down**. If both use red, the price radar
becomes unreadable within a week. So they get different visual channels entirely:

- **Direction** = the `▲ ▼ —` glyph plus `--rise` / `--fall` colour, applied to the change
  value only. Never to the price, never to the commodity name, never as a row background.
- **Severity** = a labelled pill on a **navy weight ramp**, which appears nowhere else and
  cannot be confused with either direction or the amber action colour:

| Severity | Pill |
|---|---|
| CRITICAL | Solid `--navy-deep`, white 11/700 uppercase |
| HIGH | Solid `--navy-brand`, white 11/700 uppercase |
| MODERATE | Transparent, `1px --navy-brand`, label `--navy-brand` |
| NORMAL | No pill — `--ink-400` text |

The heat on the row comes from the number, which is where it belongs.

### 7.5 The six surfaces **[R1]**

Exactly six. The prototype review (M16) dissolved the three library/data screens the merge had
introduced; their functions survive inside these six, and the table names where each one went.

| # | Surface | Holds | Absorbs (R1) | Primary action |
|---|---|---|---|---|
| 1 | **Dashboard** | Action queues, engine health, engagement, attribution | — | Go to what needs a human |
| 2 | **Signal feed** | Scored external news | — | Promote → choose format |
| 3 | **Price radar** | Basket index, heatmap, anomaly table, **this week's submission queue, observations explorer** | The old Prices module's approval and history halves | Approve the week's sheet · Promote an insight |
| 4 | **Draft studio** | Every item from `queued` to `ready` | **YouTube import** (creates a manual content item) | Produce, edit, verify, schedule |
| 5 | **Publish queue** | Calendar **and list** of `scheduled` and `published` | The old Articles library — published items open in the editor from the list view | Reschedule, recall, update, monitor dispatch |
| 6 | **Settings** | Versioned rules **and master data** | The old Prices module's masters (commodities, aliases, sites, collectors, basket) into groups 5–6; the old Media library's alt-text enforcement moves to the editor's upload control | Adjust, with an audit trail |

The **editor** at `/admin/editor/[id]` is a route, not a sidebar item — it is always opened
from Draft studio or Publish queue, never navigated to bare.

Sidebar: `--navy-deep`, 240px, wordmark block at top, count badges on Signal feed, Price radar
(badge fill `--fall` — anomalies are urgent), Draft studio and Publish queue. Active item
carries a 3px amber left border, a slightly lighter navy background and a white label;
inactive labels are `#8A9AB6`. A bottom status block reads *"Last sync 14 min ago"* with a
small pulsing amber dot, and beneath it *"Next price sync 06:00"*.

### 7.5a The access boundary **[R1 — this is what the prototype got wrong]**

Every one of the six surfaces, and the editor, lives under `/admin` behind Supabase Auth with
mandatory 2FA for Admin and Editor. **Nothing from the control room ever renders in public
chrome**: no nav item, no link, no tab, no component, no route segment. The public site's
navigation carries the seven editorial sections and nothing else. The single way in is the
small **Admin** entry in the footer legal row, which leads to `/admin/login`.

A prototype or design tool that places Dashboard, Price radar, Signal feed or the editor in a
public navigation bar has made an error, even as a demo convenience — because demo
conveniences get copied into builds. This is protocol **P12.5**, it is tested (a Playwright
assertion that no public page's DOM contains a link matching `/admin` outside the footer, and
that every `/admin/*` route redirects a signed-out visitor to login), and it is stated by name
in every generative design prompt via the standing prohibition block.

### 7.6 Surfaces that must not exist

State this negatively or it comes back. A newsroom tool has a strong gravity towards an idea
queue, and any generative design tool given the word "lead" as a noun will build one.

- **No lead desk.** There is no screen between the two intake screens and Draft studio.
  Promotion is approval; a promoted item lands in Draft studio and nowhere else
- **No content desk.** Superseded by Draft studio plus Publish queue
- **No kanban board.** Status changes happen through actions, never by dragging a card
  between columns. The only drag in the product is a calendar chip to a new time
- **No separate approval screen.** The two human transitions are promote and schedule
- **No inbox, triage, ideas or backlog screen** under any name
- **No second dashboard and no separate analytics screen.** The Dashboard is the only one
- **No second article editor.** One editor component, opened from Draft studio and Publish
  queue (M2, revised R1)
- **No agent desk.** The parent architecture's three-column Feed/Draft/Meta screen is
  superseded by surfaces 2–5 and is not built (M6)
- **No standalone Articles, Media or Prices screens. [R1]** Their functions live inside the
  six surfaces per §7.5. A session that recreates one of them as a sidebar item has broken
  P12.1
- **No control-room surface in public chrome. [R1]** See §7.5a and P12.5

For the same reason, the status formerly called `lead` is **`queued`** and `lead_type` is
**`insight_type`**. The rename costs nothing and removes the noun that invites the screen.

### 7.7 The one editor, two entry points **[R1]**

Route: `/admin/editor/[content_item_id]`. Opened from **Draft studio** (items before a date
is set) and from **Publish queue** (scheduled items via the calendar, published items via the
list view). Two panes.

**Left — the form.**
- Headline: hard limit **72 characters**, live counter, amber warning at 60. Typing character
  73 is impossible
- Dek/excerpt: hard limit **150 characters**, live counter, warning at 130
- Slug: auto-suggested into an editable field, validated against `RESERVED_SLUGS`
- Body: TipTap rich text plus data-block insertion
- Header: template, bound variables, four rendered sizes, **alt text required**
- Section: required single-select. Tags: multi-select. Country: defaults to Nigeria
- Format: article | video. Video reveals script, scene list, runtime and the summary field
- SEO title, SEO description, canonical URL
- Sources list with per-source "opened and verified" checkboxes

**Right — live preview.** Renders the **actual** `NewsCard`, `HeroTile` and `MosaicTile`
components at real pixel size with current form values. Not an approximation — import the
real components. A 71-character headline must visibly wrap to exactly two lines here.

**Controls.** Save · Send back for work · Schedule · Recall (scheduled items) · Update
(published items).

The entry points differ only in which controls are enabled and which status the item is in.
That is the whole trick: one component cannot drift from itself.

**Media handling lives here [R1].** There is no separate media library screen. The header and
inline-image upload controls in this form are where images enter the system, and **alt text is
enforced at this upload control** — an image cannot be attached without it (P7.2 unchanged in
substance, relocated in surface).

---

## 8. THE CONTENT ENGINE

The Content Engine is not a second CMS and not a bolt-on. It **is** the production layer of
the platform — the thing that turns two intake streams into everything that appears on
marketprices.ng or on any channel pointing back to it.

Two intake doors, one workbench, one exit.

| | Intake | What arrives | Who else has it |
|---|---|---|---|
| **Signal feed** | The web — Nigerian and African publications, agencies, institutions | What is happening | Everyone |
| **Price radar** | Your own weekly market sheet | What the naira price actually did, week by week | **Only you** |

Both doors produce the same object: a **content item** that becomes either a written article
with a designed header, or a video with a header and a written summary. Both land on
marketprices.ng. Social is downstream of publication, never a separate destination. The exit
is a calendar with dates and times, editable up to the moment of release.

### 8.1 Layer stack

```
L0  Foundations      Next.js App Router · Supabase Postgres · Vercel · Canva MCP
L1  Ingestion        RSS pollers + category sweeps + weekly price sheet sync
L2  Classification   25 categories · decision-utility rubric · geo · dedup
L2b Price intelligence  Delta engine · anomaly detection · basket index      (§6.4)
L3  Fusion           Insight generation + format fit assessment
L4  Production       Article chain (8 passes) · Video chain (7 steps) · Header render
L5  Workspace        The five control-room screens + Settings                (§7.5)
L6  Distribution     Publish to marketprices.ng → social dispatch at +45 min
L7  Feedback         Engagement data retunes scoring — surfaced on the Dashboard,
                     applied only in Settings, never automatically
```

### 8.2 L1 — Ingestion

**News harvesters.** RSS pollers every 30 minutes across a fixed trusted list — Nairametrics,
BusinessDay, Punch Business, ThisDay, Premium Times, The Cable; NBS, CBN, NiMet, Federal
Ministry of Agriculture; AFEX, Reuters Africa, Bloomberg Africa, FAO GIEWS. Category sweeps
twice daily, one templated query per category with a Nigeria/Africa qualifier.

Dedup at **write time** on `url_hash` plus a normalised-title fingerprint. There is no
separate clustering stage and no `agent_clusters` table (M5) — grouping happens here, and
relating a story to a price move happens in fusion.

Source list, cadence and trust tiers are editable in Settings group 2, with last-polled and
last-error columns visible so a dead feed is obvious rather than silent.

**Price sheet sync.** The weekly observation pipeline in §6.1. One market visit per week.

### 8.3 L2 — Classification and scoring

Twenty-five categories, each with a weight 1–10 and a per-category decay half-life (food
safety 12h; research reports two weeks). Seed values in Appendix A.

**Relevance means decision utility.** The scoring goal is content that helps a household make
better buying decisions — so that is what carries the most weight, rather than proxies for
newsworthiness:

```
signal_score =
    0.30 × decision_utility
  + 0.25 × (category_weight / 10)
  + 0.15 × commodity_match
  + 0.15 × geo_score
  + 0.10 × recency_decay
  + 0.05 × novelty
```

`decision_utility` is scored 0–1 by the classifier against a fixed five-point rubric, and all
five sub-scores are stored so a bad score can be diagnosed rather than argued with:

| Sub-score | Question |
|---|---|
| Actionability | Is there something a buyer can do differently because of this? |
| Horizon | Does it bite this week, this month, or next season? Nearer scores higher |
| Breadth | How many Lagos households does it touch? |
| Magnitude | How much naira does it move in a household's weekly spend? |
| Substitutability | Is there an alternative the reader could switch to? A story with an answer beats a story with only a problem |

Remaining terms: `recency_decay = exp(-hours/48)`; `commodity_match` = 1.0 when a tracked
commodity is named, else 0.3; `geo_score` = 1.0 Nigeria / 0.7 West Africa / 0.5 Africa / 0.35
globally relevant; `novelty` = 1 − similarity to the top item of the last 72 hours.

Bands: **≥70 hot** · 40–69 standard · **<40 archived but searchable, never deleted**.

All six coefficients and all five sub-weights are versioned settings with a live sum-to-1.0
check.

### 8.4 L3 — Fusion and insights

Fusion runs after L2 and L2b complete, matching signals to anomalies on a shared
`commodity_id`, a shared entity, or a known causal link — diesel → all transported goods, FX
→ all imported goods, flooding in a state → commodities sourced from it.

The output is an **insight**: a brief, not a draft. Six types:

| `insight_type` | Trigger | Confidence |
|---|---|---|
| `explained_move` | Anomaly + matched signal | Highest — the flagship |
| `unexplained_move` | Anomaly, no matching news | High — you noticed before anyone reported it |
| `predicted_move` | Strong signal, no anomaly yet | Medium — forward-looking, most useful to a reader |
| `index_move` | Basket index or sub-index moves beyond threshold | High — pure proprietary data |
| `scheduled_report` | Calendar-driven weekly or monthly | Guaranteed baseline output |
| `evergreen` | Buying guides, storage, nutrition-per-naira | Low urgency, high SEO value |

```
priority = signal_score × severity_multiplier × type_multiplier
```

`explained_move` is the flagship because it is the one nobody else can produce: it needs both
the news and the price series, and only one organisation has the second half.

### 8.5 Format fit and the header library

Four observable properties, scored 0–10 and stored so the recommendation is auditable rather
than a black box:

| Property | Question |
|---|---|
| `punch` | Is there ONE striking number a stranger reacts to? |
| `explanation_load` | How much causal reasoning is needed? |
| `progression` | Is there a trend or before/after over time? |
| `stakes` | Does it change what a household does this week? |

```
video_fit = (progression × 0.35) + (punch × 0.30) + (stakes × 0.25) + (recency × 0.10)

if video_fit ≥ 75 and progression ≥ 6 and weekly video cap not reached  → video
else                                                                    → article

header_archetype = f(punch, insight_type)   -- chosen independently of format
```

Every item gets a header regardless of format, so the header templates are a library both
chains share:

| # | Header template | Source | Variables |
|---|---|---|---|
| T1 | Price card | One anomaly | Commodity, unit, this week, last week, signed delta, week label, sparkline |
| T2 | Basket index card | Weekly index | Index value, WoW delta, four sub-index deltas, 26-week path |
| T3 | Movers board | Weekly anomaly set | Top five risers, top three fallers |
| T4 | Then vs now | One commodity, two dates | Old price + date, new price + date, % change |
| T5 | News explainer | High-scoring signal | Headline, what-it-means line, affected commodities, source |
| T6 | Policy card | Policy signal | The decision, who decided, expected effect, timeframe |
| T7 | Editorial | Anything without a single dominant figure | Headline over a branded photographic band |

**The compression test applies to headers.** If a claim cannot survive being cut to eight
words without becoming misleading, it does not go on the header — the header carries the
commodity and the figure, the headline carries the nuance. A header gets screenshotted and
travels without its article, so a header that overstates is worse than one that
underdelivers.

**Video capacity — read before enabling more than one archetype.** One person across several
products will produce three good videos in week one and none in week three. The sustainable
mix is roughly **two articles and one video a week**. Build **V1 only** — the recurring weekly
price update, which never needs a new idea, only new numbers — and run it unbroken for a month
before adding V2. The weekly cap is a setting and defaults to 1.

### 8.6 L4 — The article chain, eight passes

| Pass | Name | Output | Model sees numbers? |
|---|---|---|---|
| 0 | Brief assembly | Insight + signals + anomalies → context packet, every figure tagged `{{block_id}}` | Deterministic, no model |
| 1 | Outline | Section headings + one-line intent each, from the archetype skeleton | No |
| 2 | Data binding | Typed blocks assigned to sections | Deterministic, no model |
| 3 | Draft | Prose with `{{block_id}}` tokens in place of every figure | **No — placeholders only** |
| 4 | Verification | Unsupported claims, orphan placeholders, uncited assertions, two-source check | Yes, read-only |
| 5 | Voice | Rewritten in the MarketPrices voice | No |
| 6 | Packaging | Headline options (≤72), dek (≤150), slug, meta description, section, tags, internal links | No |
| 7 | Header render | Template variables bound; Canva MCP renders four sizes against the brand kit | No model |

**Pass 3 is the gate.** If a figure appears in model output that is not a `{{block_id}}`
token, Pass 4 rejects and returns it to Pass 3. Hard stop, no override, no configuration flag.

**Pass 6 enforces the public site's CMS constraints at generation time**, not at render time:
72-character headline, 150-character dek, exactly one required section, alt text on the
header. An item that cannot satisfy those does not reach Draft studio.

**Article archetypes:**

| # | Archetype | Skeleton |
|---|---|---|
| 1 | Price move explainer | Data lede → what changed → why → who it hits → what next → what to do |
| 2 | Weekly market report | Index headline → movers up → movers down → full table → outlook |
| 3 | Supply shock alert | What happened → affected commodities → lag to shelf → early guidance |
| 4 | Policy impact analysis | The policy → mechanism → precedent → forecast → who wins and loses |
| 5 | Buyer's timing guide | The question → seasonal data → best window → substitutions |
| 6 | Naira nutrition | The need → cost per gram of protein → cheapest options now → recipes |
| 7 | Basket index report | The index → what moved it → sub-indices → 12-week trend → household budget |
| 8 | Seasonal forecast | What is coming → historical pattern → this year's variables → prepare now |
| 9 | Brand autopsy | Company, product, pricing strategy, verdict |
| 10 | Market staples deep dive | The commodity, grades, price bands, how not to be cheated |

### 8.7 L4 — The video chain, seven steps

| Step | Name | Output | Model writes numbers? |
|---|---|---|---|
| 0 | Brief assembly | Insight + bound data blocks | Deterministic, no model |
| 1 | Template select | Archetype and scene count fixed | Deterministic, no model |
| 2 | Script | Per-scene caption ≤12 words, voiceover ≤20, figures as placeholders | **No — placeholders only** |
| 3 | Written summary | ≥150-word article body for the page | **No — placeholders only** |
| 4 | Verification | Every variable resolved, runtime in band, summary present and ≥150 words | Read-only |
| 5 | Render | Canva MCP renders 9:16 plus a 1:1 cut, plus the header in four sizes | No model |
| 6 | Captions | Burned in, generated **from the script text**, never by transcribing audio | No model |

Captions come from the script because a transcription can mishear a naira figure and the
script already holds the correct one.

**Video archetypes:** V1 weekly price update (30–40s: hook, index number, three movers, CTA)
— build this one. Then V2 one-number explainer, V3 trend animation, V4 news in 30, V5 then vs
now, V6 buyer's tip.

**A video item is not done when the MP4 renders.** It is done when the MP4 renders *and* a
≥150-word written summary exists *and* both pass verification. That is a hard gate in the
chain, not a reminder.

### 8.8 Data blocks and voice

**Block types:** `stat` · `price_table` · `sparkline` · `comparison_bar` · `timeline` ·
`index_card`. Each is a typed object with resolved values, a source reference and a period
label. They render as real components on the article page and as bound variables in a header
or a video scene.

**Voice** — a blend of the personal-brand style guide (warmth, directness) and the African
tech/business journalism style guide (authority):

- Second person for consumer guidance, third person for market analysis
- **Naira first, percentages second:** "₦62,000, up 38%"
- Anchor every price to a week. Name the collection site once, low in the piece, as
  provenance: *"prices recorded at Ile-Epo in the week of 28 July."* Never as a comparison
- Every article ends with something the reader can do this week
- No hedging stacks — pick "likely" or "may", never "may likely possibly"
- Header ≤8 words. Video captions ≤12 words per scene, voiceover ≤20, lead with the number in
  scene one, never open with a greeting or a channel intro

### 8.9 The status spine

One table, one status field. The five control-room screens are **filtered views, not separate
systems**.

| Status | Set by | Meaning | Lives on |
|---|---|---|---|
| `queued` | **You**, on promote/approve | Format chosen, production not started | Draft studio |
| `producing` | Machine | Chain running, transient | Draft studio |
| `ready` | Machine | Artefact complete, verification passed | Draft studio |
| `needs_work` | Machine | Verification rejected | Draft studio |
| `scheduled` | **You** | Approved, date and time set | Publish queue |
| `published` | Machine | Live on marketprices.ng | Publish queue |
| `dispatching` | Machine | Social posts in flight | Publish queue |
| `failed` | Machine | Publish or dispatch error | Publish queue |

Only two transitions need a human: **promote** and **schedule**.

**Status pills.** Queued — outline, `--ink-500`. Producing — `--surface-50` fill with a 12px
spinner. Ready — `--rise-bg` fill, `--rise` label. Needs work — `--fall-bg` fill, `--fall`
label. Scheduled — `#D5EAFA` fill, `#14456F` label. Published — `--surface-50` fill,
`--ink-400` label with a check. Failed — solid `--fall`, white label.

### 8.10 Screen 1 — Dashboard

An analytics screen built without a job becomes a vanity mirror: a place you go instead of
working, where a rising number feels like progress. Give it a job and it becomes the most
useful screen in the product. The job is two questions in a fixed order:

1. **What needs a human right now?** Answerable in two seconds, above the fold.
2. **Is what we published actually working?** Answerable in two minutes, beneath.

Action above analytics, always. If the top of this screen is empty, you have earned the right
to look at the charts.

**Zone 1 — What needs you.** Six count cards in one row. Each: a number, a one-line label, and
a click straight into the filtered screen behind it. A 3px amber left border where the count
is non-zero and time-sensitive.

| Card | Counts | Goes to |
|---|---|---|
| Ready to schedule | `status = ready` | Draft studio, filtered Ready |
| Needs work | `status = needs_work` | Draft studio, filtered Needs work |
| Going out today | `scheduled_for` within today | Publish queue, day view |
| Dispatch failures | `social_content_queue.status = failed` after three attempts | Publish queue, filtered |
| Hot signals unactioned | `signal_score ≥ 70`, older than 24h, not promoted or dismissed | Signal feed |
| Critical anomalies unactioned | `severity = critical`, not promoted or dismissed | Price radar |

**When every count is zero the zone collapses to one line: "Nothing needs you right now."**
Reward the empty state rather than leaving six grey zeroes on screen — a dashboard that looks
identical whether or not there is work to do has told you nothing.

The last two cards are the ones that change behaviour. A hot signal sitting unactioned for 24
hours is the real failure mode of a system like this: not bad content, but good signals
quietly ageing out while you were busy elsewhere.

**Zone 2 — Engine health.** One horizontal strip, six readouts, no charts:

- **Last news sync** — relative time, amber dot over 90 minutes
- **Last price sync** — week number and collection site, e.g. *"Week 31 · Ile-Epo"*
- **Items ingested, 24h** — with the share scoring ≥70
- **Verification pass rate, 30d** — first-pass percentage. A falling number means the
  production chain is drifting, and it shows here before it shows in the output
- **Promote to publish, median hours** — cycle time, the best single measure of whether the
  workflow actually works
- **This week's mix** — "2 articles · 1 video" against the Settings targets, amber when over
  or under

**Zone 3 — Website engagement.** Date range at the top of the zone: 24 hours · 7 days
(default) · 30 days · 90 days · custom, with a compare-to-previous-period toggle.

Four KPI cards, each with figure, 30-point sparkline and a signed delta:

| KPI | Definition |
|---|---|
| Sessions | Distinct visits, 30-minute inactivity window |
| Page views | Total content page loads |
| Average read time | Load to last scroll event, capped at 10 minutes so an abandoned tab cannot inflate it |
| Newsletter subscribers | Net new in the period |

Then four modules: **traffic by section** (horizontal bars across the seven public sections,
so you can see whether output distribution matches where readers are); **top content** (table:
headline, format chip, published date, sessions, average read time, read completion at 80%
depth, search impressions, social clicks); **price page activity** (`/prices` sessions,
most-searched commodities ranked, basket index page views, "Report an error" submissions —
this is where you learn which commodities people actually care about, and it should feed the
tracked-commodity list); and **video** (views, watch-through, follows gained, per platform,
never summed).

**Zone 4 — The feedback loop.** The zone that justifies the screen and that a generic
analytics tool cannot give you.

- **Does decision utility predict engagement?** A binned bar chart: items grouped by their
  `decision_utility` at promotion (0–2, 2–4, 4–6, 6–8, 8–10) against median read completion.
  If the bars rise left to right, the rubric measures the right thing. If they are flat, it
  does not, and the weights in Settings are decoration
- **Format performance on separate scoreboards** — never one table ranking all three, or
  articles win every time and you wrongly conclude video does not work
- **Proposed adjustments** — a card listing weight and threshold changes the system would
  suggest from the last 50 published items: *"Category weight for Weather & climate is
  outperforming its 9; suggest 10."* It **never auto-applies.** It links into Settings →
  Scoring where the replay preview shows what the change would have done. Proposals here,
  decisions there, audit log records who decided

**Metric sources and their honest limits:**

| Metric | Source | Refresh | Limit |
|---|---|---|---|
| Sessions, page views, read time, scroll depth | First-party `site_events` + Vercel Analytics | Hourly | — |
| Search impressions and position | Google Search Console API | Daily | Lags 2–3 days |
| Social impressions, clicks, saves | Metricool | Daily | Lags up to 24h |
| Video views, watch-through | YouTube Data API + platform data via Metricool | Daily | Each platform defines a "view" differently |
| Newsletter | Resend | Hourly | — |

Three rules keep this screen honest, and they are protocol **P18**:

- **Never sum a metric across platforms.** A three-second Facebook view and a YouTube view
  are not the same unit. Compare each platform to itself over time and nothing else
- **Suppress trend arrows below a data floor.** Under 30 days of history, or under 50
  sessions in a period, show the figure and hide the delta. "+480%" from a base of five is
  noise dressed as insight, and it will make you change strategy for no reason
- **Attribution requires `utm_medium` = format.** Without it every social click is just
  "social" and Zone 4 cannot be built at all

### 8.11 Screen 2 — Signal feed

Scored external news, newest and highest first. Each signal card carries a **score bar** — a
3px vertical bar at the left edge, full height, `--navy-deep` at ≥70, `--navy-brand` at 40–69,
`--line-200` below — plus the headline, source and trust tier, category chip, matched
commodities, first-seen time, and the decision-utility breakdown on expand.

Filters: score band, category, geography, commodity, date, actioned/unactioned.

Actions: **Dismiss** (with a reason, retained not deleted) and **Promote**.

**The promote split button** is amber with a navy 700 label and a 1px navy-at-20% divider
before the caret. The menu lists Article and Video, one marked **Recommended** with its
`video_fit` figure, and beneath it a muted line reading `Punch 9 · Explanation 6 · Progression
8 · Stakes 9` — so the reasoning is visible rather than hidden behind one number. Overriding
the recommendation requires a reason and writes a `format_overrides` row, which is how the
heuristics get corrected over time.

### 8.12 Screen 3 — Price radar

Four stacked regions **[R1 — the radar is now also the price intake screen]**:

0. **This week's submissions** — the review queue, shown only while `pending` rows exist for
   the current ISO week and collapsed to a single line otherwise. Each row: submitted price
   against the last three recorded weeks, flags (`outlier`, `new_series`, `duplicate`,
   `site_switch`), Approve · Edit & approve · Reject with reason. Approval writes the
   observation through the one door (P1.1) and triggers the intelligence run. A **History**
   link opens the observations explorer (full series, filter, chart, CSV export) as a
   drawer on this screen — not a separate sidebar surface.

Then the three analytical regions:

1. **Basket index panel** — current index, WoW delta, four sub-index deltas, 26-week path.
   Marked **incomplete** with the missing commodities named where §6.4 rule 2 applies
2. **Heatmap** — commodities down, ISO weeks across. Cell 36 × 28px, radius 4px. Rises on a
   red ramp, falls on a green ramp, flat neutral `#F1F3F6`. **A missing week renders as a
   diagonal-hatched grey square with no number** — never a zero, never interpolated
3. **Anomaly table** — commodity, tier, this week, last week, WoW, z-score, severity pill,
   seasonality expectation, site-switch flag, and Promote

The anomaly table is where `unexplained_move` insights are born, and it is the screen that
justifies the whole product: it shows you a price event before anyone has written about it.

### 8.13 Screen 4 — Draft studio

Everything from `queued` to `ready`. A filterable list on the left (status, format, insight
type, priority, assignee) opening into the one editor (§7.7) on the right.

The verification panel sits beneath the form: every claim with its source index, every
placeholder resolved, the two-source check, the edit-distance figure against the generated
draft, and the required-fields checklist. **Schedule is disabled until every checkbox is
ticked.** Friction is the feature.

### 8.14 Screen 5 — Publish queue

A calendar — week and month views — of `scheduled` and `published` items, plus a **list view
toggle [R1]** that serves as the published-article library: filterable by section, format and
date, full-text searchable, each row opening the item in the editor for post-publication
updates. Time is the organising axis of the default view because time is what you are actually
managing here; the list exists because a month grid is a poor way to find an article from
March.

**Calendar chip:** 24px tall, radius 4px, a 3px format bar at the left edge (article blue,
video rose), time in mono 11/700, a one-line clamped headline, then a status dot. Draggable
with a grab cursor — **the only drag interaction in the entire product.**

Actions: reschedule (drag or edit), recall (before dispatch), open in the editor, and inspect
dispatch status per platform with the failure badge where retries were exhausted.

### 8.15 L6 — Publishing and distribution

**The publish job.** Vercel Cron, every 5 minutes — a calendar with times on it should release
within a few minutes of them:

1. Select items where `status = 'scheduled'` and `scheduled_for <= now()`
2. Write into the public `articles` table with `type = standard | video`,
   `agent_assisted = true`, `agent_item_id` set
3. Set `status = 'published'`, stamp `published_at`, revalidate the article page, the section
   page, the homepage block and the sitemap
4. Unless `no_distribution` is set, generate per-platform copy and insert rows into the
   existing `social_content_queue` with `scheduled_for = published_at + 45 minutes`
5. Agent 3 (Metricool) dispatches as it already does

**The 45-minute delay stays.** If a bad figure hits the site and four platforms in the same
second, the correction has to be issued in five places. The delay is the window in which an
item can be recalled before anything is broadcast. It is editable in Settings with a **hard
floor of 15 minutes**. Do not shorten it to make publishing feel snappier.

**Reuse Agent 3, do not rebuild it.** MarketPrices already runs Agent 2 (Content Factory) and
Agent 3 (Auto-Poster via Metricool) against `social_content_queue`. The engine writes rows
into that queue and stops. **One migration on a live table** is required:
`social_content_queue` was built for text posts and needs `asset_url` and `asset_type` columns
so Agent 3 can upload a header image or an MP4 natively rather than posting a bare link. That
is the only change to Agent 3.

**Distribution by format:**

| Platform | Article | Video |
|---|---|---|
| LinkedIn | Hook + insight in body, **link in the first comment** (LinkedIn suppresses in-body external links). 1:1 header | 1:1 cut uploaded natively, link in first comment |
| X | Headline stat + link, under 260 characters, 16:9 header | 9:16 native, link in the post |
| Facebook | Conversational framing, link in body, 4:5 header | 9:16 Reel native, link in caption |
| Instagram | 4:5 header posted natively, link in bio reference | 9:16 Reel, link in bio reference |

Never post a link to a video hosted elsewhere — reach collapses. Captions always burned in,
because most viewing is silent.

Every link carries `?utm_source={platform}&utm_medium={format}&utm_campaign={slug}`.
`utm_medium` is the **format**, not "social" — that is what lets you tell whether video or
article headers actually send anyone to the site, and Dashboard Zone 4 cannot exist without
it.

**Failure isolation.** A failed social post must never roll back a publication. Rows retry
independently with backoff, capped at three attempts, then surface as a warning badge on the
item in the Publish queue.

### 8.15a The allocation rule — no content in isolation **[R2]**

Everything the engine produces exists to be found on marketprices.ng. A content item with no
public home is a defect, not a draft — so allocation is enforced at publish time, structurally,
rather than hoped for editorially.

**The rule.** When the publish job runs, an item must resolve to a complete set of public
placements or the publication **fails** (`status = failed`, surfaced on the Publish queue and
in Dashboard Zone 1) — it does not publish partially and it does not publish into a void.

**The placement map.** Every published item lands on all of the following that apply:

| Placement | Applies to | Mechanism |
|---|---|---|
| **Its own page** — `/[section]/[slug]` | Every item, always | `slug` + `section` are `NOT NULL` at publish; the page exists by construction (§1.4) |
| **Its section page** — `/[section]` | Every item | The section page queries published articles by `section_id`; presence is automatic once the row exists, and the publish job revalidates the section page |
| **Its homepage section block** | Every item, when the block renders | Recency fills the block (§1.5); pins can promote it. A block omitted under P4.3 (empty section) does not exempt the item — it appears the moment the block renders |
| **The Africa page** | Items where `country != 'Nigeria'` | Derived view (§1.2) — automatic, no filing decision |
| **`/videos` and WATCH-band eligibility** | `type = video` | Same `articles` rows; presence on `/videos` is automatic |
| **Tag pages** | Items carrying tags | Join-table query |
| **Search** | Every item | `pg_trgm` index over published articles |
| **Sitemap, news sitemap and RSS feed** | Every item | Regenerated in the publish job's revalidation step |
| **The social dispatch** | Every item unless `no_distribution` | Every social post links back to the item's own page (§8.15) — social is downstream of the page, never a destination of its own |

**What the mechanism actually is.** Three layers, so that no single forgetful edit can break it:

1. **Generation** — Pass 6 of the article chain and Step 4 of the video chain cannot emit an
   item without `slug`, `section_id` and a headline within limits (§8.6). An unallocatable
   item never reaches Draft studio.
2. **Scheduling** — the editor's Schedule control is disabled while any allocation field is
   missing (P3.2), so a human cannot schedule an orphan.
3. **Publication** — the publish job re-asserts `slug`, `section_id` and `published_article_id`
   linkage before writing, and its revalidation step touches the article page, the section
   page, the homepage, the sitemap and the feed in one pass. If the assertion fails, the item
   goes to `failed` with the missing field named.

**Scope.** The rule applies to **content items** — the things a reader is meant to see.
Internal objects (signals, anomalies, raw items, rejected drafts) are deliberately *not*
public and are not orphans; they are working material. The boundary is the `published` status:
crossing it means being findable, and nothing crosses it without being findable.

**Why this is a rule and not a description.** The old graphics format died precisely because
standalone artefacts had nowhere to send anyone (§1.4). R1's "every item has a page by
construction" fixed that for the formats — this rule fixes it for the *system*, so that no
future format, archetype or shortcut can reintroduce an artefact that ships without a home.
This is protocol **P15.7**, it is tested (publish an item, assert it appears on its section
page and in the sitemap within one revalidation), and it is stated in the standing prohibition
block.

**Two scoreboards.** Articles buy traffic; headers and videos buy reach. Judge them
separately or you will wrongly conclude one does not work.

| Format | Goal | Measured by |
|---|---|---|
| Article | Traffic and SEO authority | Sessions, time on page, search impressions |
| Header (native) | Reach and recall | Impressions, saves, shares |
| Video | Reach and follower growth | Views, watch-through, follows |

### 8.16 Screen 6 — Settings

**Why this screen survives the R1 cut.** Settings was reviewed for deletion and kept, for
three reasons that are worth recording since the question will recur. First, the placeholder
gate, anomaly thresholds, scoring weights and the basket definition are protocol-protected
values that must be **versioned and audited** (P16) — without a Settings surface they live
either as constants in code (a deploy to change a threshold, no audit trail) or in the raw
Supabase table editor (no versioning, no replay preview, no sum-to-1.0 guard, and one typo
away from corrupting every score). Second, R1 folded the master data — commodities, aliases,
sites, collectors, basket — into this screen, so deleting it would leave the alias table,
the single most important piece of data hygiene in the system, with no home. Third, the
locked placeholder-gate row is itself a trust statement (§P14.1) and it needs somewhere to be
visibly locked. What *was* cut is urgency: most groups are deferred to stage 17 and the
screen can start as two groups. It is the last thing built, not the first — but it is built.

Twelve groups. Every change writes to `audit_log` with actor, timestamp and a before/after
diff. Anything marked **versioned** creates a new row with an `active_from` date rather than
overwriting — because retro-editing a threshold silently rewrites the history of why
something was flagged.

| # | Group | Contains | Min. role |
|---|---|---|---|
| 1 | **Users & roles** | Invite, role assignment, 2FA enforcement, session timeout, deactivate. Role matrix visible as a grid | Admin |
| 2 | **Sources** | RSS list: name, feed URL, region, trust tier 1–3, poll cadence, active toggle, last-polled and last-error. Add, test-fetch, disable | Editor |
| 3 | **Categories & weights** | All 25 categories, weight 1–10, per-category decay half-life. **Versioned** | Editor |
| 4 | **Scoring** | Six composite coefficients with a live sum-to-1.0 check, five decision-utility sub-weights, hot/standard/archive bands, and a **replay preview**. **Versioned** | Editor |
| 5 | **Commodities, aliases & collectors** | Canonical name, alias array, group, default unit, tracked toggle, seasonality profile, site offset; collector list with trust flag and accuracy score **[R1 — absorbed from the cut Prices module]**. **The alias table is the single most important piece of data hygiene in the system** — an unresolved alias makes fusion fail silently | Editor |
| 6 | **Collection sites & basket** | Sites as provenance only. Basket definition — commodity, quantity, unit, sub-index. **Versioned, with a loud warning** | Admin |
| 7 | **Anomaly thresholds** | z and WoW bands for all four severities, site-switch adjustment, seasonality tolerance, gap handling. **Versioned** | Editor |
| 8 | **Format heuristics** | The four `video_fit` weights, video threshold, `progression` floor, weekly video cap, weekly article target, plus an **override log** of every human override with both values | Editor |
| 9 | **Publishing** | Timezone (WAT, fixed), default publish slots, max items per day, minimum gap between items, social delay (default 45 min, floor 15), recall window, default `no_distribution` | Editor |
| 10 | **Distribution** | Per-platform enable, copy templates with variable tokens, asset size mapping, UTM scheme, LinkedIn first-comment toggle, Metricool connection status | Editor |
| 11 | **Templates & brand** | Canva registry — headers T1–T7 and videos V1–V6, each with template ID, variable schema, output sizes, active toggle, last-render preview and a test-render button | Editor |
| 12 | **Verification** | Two-source rule, edit-distance warning threshold, **placeholder gate (locked on)**, required-fields checklist | Admin |

Two things worth building that are not obvious:

**A replay preview on the scoring screen.** Weights are the most consequential and least
legible setting in the system — changing 0.30 to 0.35 has no intuitive meaning. Re-score
yesterday's items under the proposed weights and show *"9 items enter hot, 4 leave, here they
are"* before saving. That converts an abstract number into a visible editorial judgement, and
it is the difference between tuning and guessing.

**A locked row.** The placeholder gate appears as a switch that is on and cannot be turned
off, with one line explaining why. Showing a control you refuse to give anyone is a stronger
statement about the system's integrity than hiding it — and it stops someone hunting for the
setting later, on a deadline.

### 8.17 Engine-only components

| Component | Specification |
|---|---|
| **Format chip** | Article — document glyph, `#D5EAFA` / `#14456F`. Video — play glyph, `#FADCE6` / `#7A2540`. Both 11/700 uppercase, radius 4px |
| **Status pill** | Per §8.9 |
| **Severity pill** | Per §7.4 — navy weight ramp, always with a text label |
| **Score bar** | 3px vertical, full card height, navy ramp by band |
| **Promote split button** | Amber fill, navy 700 label, 1px navy-20% divider before the caret, recommendation and sub-scores in the menu |
| **Heatmap cell** | 36 × 28px, radius 4px, red ramp up / green ramp down / `#F1F3F6` flat, diagonal hatch for a missing week |
| **Calendar chip** | 24px, radius 4px, 3px format bar, mono time, clamped headline, status dot, draggable |
| **KPI card** | 200 × 96px. Meta 11/600 uppercase `--ink-400`, figure 24/700 tabular, signed delta pill, 30-point sparkline across the bottom third in `--navy-brand`, no fill. Below the data floor the delta pill is replaced by an 11px `--ink-400` line reading "not enough data yet" |
| **Action queue card** | 96px. Count 28/700 tabular, label 13/500, whole card clickable with a chevron. Non-zero and time-sensitive: 3px amber left border. Zero: `--ink-400`, no border, no emphasis |
| **Bar row** | 8px tall, radius 4px, `--navy-brand` on a `#F1F3F6` track, label left 13/500, value right 13/700 tabular |

**Accessibility is non-negotiable in the tool as well as on the site.** Every direction carries
an arrow glyph, not just a colour. Every severity carries a text label. Real `<table>` markup
with `<th scope>` and `aria-sort`. Visible focus rings. The whole tool must be readable in
greyscale.

---

# PART D — THE SYSTEM

## 9. UNIFIED DATA MODEL

One database. Five groups of tables. Names in **bold** are the merged decisions from §0.5 —
where a table appears under a different name in one of the source documents, the old name is
noted so you can find it.

### 9.1 Public content

```sql
sections         (id, slug, name, descriptor, chip_bg, chip_fg, nav_order, is_active)

articles         (id, slug, section_id, type, title, dek, body, header_media_id,
                  header_alt, author_id, country, status, published_at, updated_at,
                  scheduled_for, youtube_id, read_time, view_count,
                  agent_assisted, content_item_id, published_by,
                  seo_title, seo_description, canonical_url)

tags             (id, slug, name)
article_tags     (article_id, tag_id)

media            (id, url, variants jsonb, alt, caption, width, height, uploaded_by)

videos           (id, youtube_id, title, description, thumbnail_url, duration,
                  published_at, view_count, imported_content_item_id)

homepage_pins    (section_id, article_id, position, pinned_by, pinned_at, expires_at)
```

`articles.content_item_id` is the permanent link back to production (M10). `agent_assisted`
and `content_item_id` are written on publish and never cleared.

### 9.2 The price spine

```sql
commodities        (id, slug, canonical_name, aliases text[], group, category,
                    default_unit_id, icon, display_order, is_tracked, is_active,
                    seasonality_profile jsonb, site_offset_pct)

units              (id, name, abbreviation, base_multiplier)

collection_sites   (id, name, type, city, state, lat, lng, is_active)
                   -- type: produce_market | abattoir. PROVENANCE ONLY (M3)
                   -- formerly `markets`

collectors         (id, name, phone, submission_count, accuracy_score, is_trusted)

price_submissions  (id, commodity_id, variety, collection_site_id, unit_id, tier,
                    price, currency, collector_id, iso_year, iso_week,
                    collected_on, submitted_at, photo_url, notes,
                    status, flags text[], reviewed_by, reviewed_at, reject_reason)

price_observations (id, commodity_id, unit_id, tier, iso_year, iso_week,
                    week_start_date, price, currency,
                    collected_at_site_id, collected_on,
                    submission_id, published_at, source,
                    corrects_id, superseded_at,
                    fx_rate, fx_fetched_at)
                   -- formerly `prices`
                   UNIQUE (commodity_id, iso_year, iso_week, tier)

price_anomalies    (id, commodity_id, tier, iso_year, iso_week, window,
                    pct_change, z_score, direction, severity, baseline_expected,
                    site_switch_flag, gap_weeks, detected_at, state)

basket_definition  (id, version, commodity_id, quantity, unit_id, sub_index, active_from)

basket_snapshots   (id, iso_year, iso_week, basket_cost_naira, basket_index,
                    sub_index_values jsonb, wow_pct, yoy_pct,
                    is_complete, missing_commodity_ids uuid[])
```

`price_observations.submission_id` is `NOT NULL` with a foreign key — there is no path into
the published series that does not pass through a submission, and manual phone-in entry is
not an exception (P1.1). `basket_snapshots.is_complete` is what enforces §6.4 rule 2: an
incomplete week is stored so you can see the gap, and never displayed as an index value.

### 9.3 The engine

```sql
sources           (id, name, feed_url, type, region, trust_tier, cadence_minutes,
                   active, last_polled_at, last_error)
                  -- formerly `agent_sources`

raw_items         (id, source_id, url, url_hash, title, summary, body_snippet,
                   published_at, fetched_at, author)
                  -- formerly `agent_items` (raw half)

signals           (id, raw_item_id, category, category_weight, geo_scope,
                   decision_utility, utility_breakdown jsonb,
                   recency_score, novelty_score, commodity_match,
                   signal_score, commodities uuid[], entities jsonb, state)
                  -- formerly `agent_items` (scored half); migrate `food_intelligence_items`

content_items     (id, format,               -- article | video
                   insight_type, archetype, header_template, status,
                   source_screen,            -- signal_feed | price_radar | manual
                   headline_hypothesis, angle_note,
                   signal_ids uuid[], anomaly_ids uuid[], priority,

                   -- format fit
                   punch, explanation_load, progression, stakes,
                   video_fit, recommended_format, format_overridden, override_reason,

                   -- shared
                   data_blocks jsonb, sources jsonb, verification_log jsonb,
                   scheduled_for, scheduled_by, published_at, no_distribution,
                   published_article_id, created_by, created_at,

                   -- article + video page
                   slug, headline, dek, body_mdx, section_id, tags text[],
                   country, seo jsonb,
                   header_template_vars jsonb, header_render_urls jsonb, header_alt,

                   -- video only
                   script jsonb, scene_count, runtime_seconds,
                   video_urls jsonb, caption_file_url, youtube_id)
                  -- supersedes `agent_drafts` and `agent_clusters` (M5)

content_revisions (id, content_item_id, step, payload jsonb, created_at)

content_templates (id, format, template_code, canva_template_id,
                   variable_schema jsonb, output_sizes jsonb, active)

format_overrides  (id, content_item_id, recommended, chosen, reason, actor, created_at)
```

`header_alt` is required. The public site blocks publishing without alt text and the engine
does not get to be the loophole. `scheduled_by` and `scheduled_for` are both `NOT NULL` before
`status` can become `scheduled` — that pair is the mechanism behind M7.

### 9.4 Distribution and measurement

```sql
social_content_queue (id, content_item_id, platform, body, link_with_utm,
                      first_comment, asset_url, asset_type,     -- ← the one migration
                      scheduled_for, dispatched_at, status, attempts, last_error)
                     -- EXISTING LIVE TABLE. Add two columns; do not recreate (M13)

content_performance  (id, content_item_id, format, platform, impressions, views,
                      sessions, avg_time, read_completion, watch_through,
                      saves, shares, clicks, search_impressions, follows,
                      collected_for_date, source_system)

site_events          (id, session_id, content_item_id, published_article_id,
                      event_type,   -- view | scroll_25 | scroll_80 | complete |
                                    -- price_search | commodity_view | error_report
                      metadata jsonb, referrer, utm_source, utm_medium,
                      utm_campaign, created_at)
                     -- formerly `events`

daily_rollups        (date, metric_key, dimension, dimension_value, value)
                     UNIQUE (date, metric_key, dimension, dimension_value)
                     -- pre-aggregated so the Dashboard never scans site_events
```

### 9.5 Governance

```sql
profiles          (id → auth.users, email, name, role, avatar_url,
                   is_2fa_enabled, last_login_at)

editorial_rules   (id, group, key, value jsonb, version, active_from,
                   changed_by, changed_at)
                  -- every versioned Setting lives here

weight_proposals  (id, scope, key, current_value, proposed_value, evidence jsonb,
                   sample_size, status, proposed_at, decided_by, decided_at)

audit_log         (id, actor_id, action, entity_type, entity_id, diff jsonb, created_at)
                  -- append-only at the database level (P1.5)
```

### 9.6 Indexes that will matter

```sql
articles           (section_id, status, published_at DESC)   -- every homepage block, every section page
price_observations (commodity_id, tier, iso_year, iso_week DESC)  -- every lookup and sparkline
price_submissions  (status, submitted_at)                    -- the review queue
signals            (signal_score DESC, state, created_at DESC)    -- the signal feed
content_items      (status, scheduled_for)                   -- Draft studio, Publish queue, publish cron
site_events        (created_at, event_type)                  -- rollup job only
raw_items          (url_hash)                                -- write-time dedup, UNIQUE
```

### 9.7 Tables deliberately not created

Naming these prevents their quiet reappearance:

| Not built | Because |
|---|---|
| `agent_clusters` | Dedup happens at write time; relation happens in fusion (M5) |
| `agent_drafts` | Superseded by `content_items` (M5) |
| `prices` | Renamed `price_observations` at a weekly grain (M4) |
| `markets` | Renamed `collection_sites`, provenance only (M3) |
| `social_posts` | The live `social_content_queue` already is this table (M13) |
| Any table holding a market-versus-market comparison | There is no such comparison in this product (M3) |

---

## 10. TECHNICAL STACK

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15, App Router** on **Vercel** | ISR gives static-speed pages that revalidate as prices and articles change |
| UI | React 19 + Tailwind v4 reading CSS custom properties | Tokens live in CSS variables; this is what keeps the spec and the code in sync |
| Database, auth, storage | **Supabase** (Postgres, Auth, Storage, RLS) | RLS handles the role model directly |
| Price intake | Google Form → Sheet → Apps Script → `/api/ingest/price` | Zero-cost collection on any phone |
| Scheduled jobs | **Next.js route handlers on Vercel Cron** | One runtime, one language, one deploy, one log stream (M12) |
| Drafting | Anthropic API via `@anthropic-ai/sdk` | Placeholders only — never sees a figure |
| Header and video render | **Canva MCP** against a registered brand kit | Four sizes per header, 9:16 + 1:1 per video (M14) |
| Social dispatch | Existing Agent 3 → Metricool, via `social_content_queue` | Already live; one migration, not a rebuild (M13) |
| Video source | YouTube Data API v3, 6-hourly sync | Existing channel is a content source |
| Email | **Resend** | Newsletter, submission alerts, digests. Reliable from Nigeria |
| Analytics | Vercel Analytics + first-party `site_events` + GSC API | Own the engagement data |
| Images | `next/image` + Supabase Storage, WebP/AVIF | Bandwidth is the constraint |

**Cron schedule:**

| Job | Cadence |
|---|---|
| `agent-ingest` (RSS pollers) | Every 30 minutes |
| `agent-sweep` (category queries) | Twice daily |
| `agent-score` | Every 30 minutes, after ingest |
| `price-intel` (deltas, anomalies, basket) | On price approval, plus a nightly sweep |
| `agent-fuse` | Hourly |
| `content-produce` | On promote (queued → producing) |
| **`publish`** | **Every 5 minutes** |
| `youtube-sync` | Every 6 hours |
| `fx-rates` | Daily |
| `rollups` | Hourly |
| `performance-sync` (Metricool, GSC) | Daily |

**A note on the static-site default.** The earlier build pattern — static export plus Supabase
for forms — is right for a brochure site and wrong here. This product has editor-managed
content, scheduled publishing, a price table that changes weekly, an authenticated control
room and a production pipeline. Use ISR with short revalidation on price pages (60s) and
longer on articles (300s), and render `/admin` client-side behind auth.

---

## 11. RESPONSIVE AND PERFORMANCE

### 11.1 Mobile-first, even though the comps are 1440

The reference screens are desktop. The audience is not. Expect the majority of traffic on
mid-range Android phones over inconsistent networks. **Design the mobile view first and treat
1440 as the enhancement.**

The control room is the exception and is allowed to be desktop-first — a calendar with
draggable chips and a nine-column anomaly table is not a phone experience. It must remain
*usable* at 768px (list views, no drag) and it must not be broken, but it is not optimised
below that.

### 11.2 Breakpoints

| Breakpoint | Changes |
|---|---|
| ≥1440 | Reference layout, 1272px container |
| 1200–1439 | Fluid, 32px gutters. Rail → 260px. Nav spacing → 28px |
| 992–1199 | **Nav collapses to hamburger** (seven links). Rail moves below the grid as a 2-up row. Hero: lead full width, two secondaries side by side, LATEST panel below |
| 768–991 | Grids → 2 columns. Interviews → 2 columns. Africa mosaic → 2 columns, centre tile spans both. WATCH → 2 columns. Control room sidebar collapses to icons |
| <768 | Single column throughout. Hero → stacked full-width cards. **Price table switches to a card list.** Ticker stays, auto-scroll off. Filter pills and price rail stay horizontally scrollable |

**The price table on mobile is the make-or-break detail.** A nine-column table cannot be made
to work below 768px. Do not scroll it horizontally and do not shrink the type. Switch to a
stacked card list: commodity + unit on line one, price and change pill on line two, week and
site on line three. Same information, readable at arm's length.

### 11.3 Performance budget — a failing check, not a target

| Metric | Target |
|---|---|
| LCP on 4G | < 2.5s |
| LCP on 3G | < 4s |
| Initial JS | < 200KB gzipped |
| Homepage total weight | < 1.2MB |
| CLS | < 0.1 |

Non-negotiables: no YouTube iframes until clicked; every image carries explicit `width` and
`height`; below-fold images lazy-loaded; the price table server-rendered so it is readable
before hydration; fonts self-hosted with `font-display: swap` and the two above-fold weights
preloaded.

**No charting library.** Recharts, Chart.js and D3 each cost 50–200KB gzipped against a 200KB
total budget. Sparklines, the 26-week chart, the heatmap and the dashboard bar rows are
**hand-written inline SVG** — roughly 40 lines of TypeScript mapping an array of numbers to a
`<polyline points="...">`. For sparklines this is genuinely the better tool, not a compromise.

### 11.4 Mobile type adjustments

Display 54→34 · Section title 28→20 · Hero headline 30→22 · Interview headline 26→20 ·
Article body 17→16 · Price in the card rail 20→18. Body, meta and chip sizes unchanged.

**Non-negotiable at every breakpoint:** section chips, collection dates and week labels,
direction arrows, tabular numerals and the two-line clamps. They carry the identity and the
credibility.

---

## 12. ACCESSIBILITY AND TRUST

### 12.1 Accessibility, ship-blocking

1. **Meta text** uses `--ink-400` `#5A6474` (5.9:1). The reference's `#9AA3B2` fails at 2.6:1
2. **The action button** resolves at 9.1:1 with the amber/navy pairing
3. **Direction colours** `#15803D` and `#B91C1C` for text; brighter variants only on 3px bars
4. **Never colour alone.** Every price change carries an arrow glyph; every severity carries a
   text label. Test the whole product in greyscale — if you cannot read direction, it is broken
5. **Tables need semantics.** Real `<table>`, `<th scope>`, `<caption>`, `aria-sort`. A grid of
   divs holding price data is a build failure, not a style choice
6. **The ticker respects `prefers-reduced-motion`** — static and scrollable
7. **Charts need text alternatives.** Every sparkline gets an `aria-label` stating range and
   direction, generated from the data: *"Rice, 26 weeks: from ₦88,000 to ₦95,000, up 8%"*
8. **Video needs captions**, burned in from the script, plus the written summary — which is
   itself an accessibility feature

### 12.2 The trust layer

A price platform is a claim about reality. Build the receipts in from day one:

- Week label and collection date visible on every price, everywhere
- Collection site named on every price — as provenance, never as a comparison
- A `/methodology` page linked from every price module, stating the weekly cadence, the
  site-switch policy and the gap policy
- A visible corrections policy and a "Report an error" control on every price row
- Gaps drawn as gaps. Incomplete index weeks marked incomplete
- A `/how-we-use-ai` disclosure page, published **before** the engine drafts its first item
- Bylines on everything, with author pages
- Sources block on every engine-produced article, permanently

---

## 13. DESIGN TOKENS

```css
:root {
  /* Chrome */
  --navy-deep:     #0A1E42;
  --navy-brand:    #123C74;

  /* Action */
  --amber-action:  #F59E0B;
  --amber-hover:   #D97706;
  --on-action:     #0A1E42;

  /* Price semantics — named by DIRECTION, not sentiment. Both surfaces read these. */
  --rise:          #15803D;
  --rise-bg:       #DCFCE7;
  --rise-bar:      #16A34A;
  --fall:          #B91C1C;
  --fall-bg:       #FEE2E2;
  --fall-bar:      #DC2626;
  --flat:          #6B7280;
  --flat-bg:       #F1F3F6;

  /* Ink */
  --ink-900:       #16181D;
  --ink-500:       #6B7280;
  --ink-400:       #5A6474;
  --line-200:      #E5E8EE;
  --surface-0:     #FFFFFF;
  --surface-50:    #F7F8FA;
  --on-dark:       #FFFFFF;
  --on-dark-muted: #B8C3D6;

  /* Section chips */
  --chip-prices-bg:     #D5EAFA; --chip-prices-fg:     #14456F;
  --chip-production-bg: #F0E7D6; --chip-production-fg: #6B5533;
  --chip-tech-bg:       #E4E2FB; --chip-tech-fg:       #3B357A;
  --chip-markets-bg:    #D6EFEC; --chip-markets-fg:    #155E56;
  --chip-govt-bg:       #E3E7EE; --chip-govt-fg:       #39445A;
  --chip-interviews-bg: #FADCE6; --chip-interviews-fg: #7A2540;
  --chip-africa-bg:     #FBDDCF; --chip-africa-fg:     #7A3A1C;

  /* Engine surfaces (no new colour — reuses the above) */
  --chip-article-bg:   var(--chip-prices-bg);     --chip-article-fg:   var(--chip-prices-fg);
  --chip-video-bg:     var(--chip-interviews-bg); --chip-video-fg:     var(--chip-interviews-fg);
  --sev-critical:      var(--navy-deep);
  --sev-high:          var(--navy-brand);
  --sev-moderate:      var(--navy-brand);
  --sidebar-inactive:  #8A9AB6;

  /* Type */
  --font-ui:      'Manrope', 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-display: 'Bakbak One', 'Archivo Expanded', sans-serif;
  --font-mono:    ui-monospace, 'SFMono-Regular', monospace;  /* calendar chip times only */

  --fs-display:  54px;  --fs-article:  36px;  --fs-h1:       30px;
  --fs-h2:       28px;  --fs-h3:       26px;  --fs-price-lg: 20px;
  --fs-h4:       19px;  --fs-body-lg:  17px;  --fs-card:     16px;
  --fs-nav:      15px;  --fs-table:    14px;  --fs-body:     13px;
  --fs-meta:     12px;  --fs-chip:     11px;
  --fs-kpi:      24px;  --fs-queue:    28px;   /* engine dashboard figures */

  /* Space (4px base) */
  --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
  --sp-5: 20px;  --sp-6: 24px;  --sp-7: 28px;  --sp-8: 32px;
  --sp-10: 40px; --sp-12: 48px; --sp-14: 56px; --sp-16: 64px;
  --sp-18: 72px; --sp-20: 80px;

  /* Shape */
  --r-mosaic: 12px;  --r-card: 8px;  --r-btn: 6px;  --r-chip: 4px;  --r-pill: 999px;

  --border:       1px solid var(--line-200);
  --shadow-rest:  0 1px 2px rgba(16,24,40,0.04);
  --shadow-hover: 0 6px 16px rgba(16,24,40,0.08);

  /* Layout */
  --container:  1280px;
  --gutter:     24px;
  --rail:       276px;
  --ticker-h:   44px;
  --nav-h:      72px;
  --admin-side: 240px;
  --row-dense:  32px;
  --row-two-line: 40px;
  --heat-w:     36px;
  --heat-h:     28px;

  /* Motion */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dur:  180ms;
}

/* Every number in the product — public site and control room alike */
.num, table, .price, .change, .kpi, .queue-count {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

.scrim {
  background: linear-gradient(180deg,
    rgba(10,30,66,0) 0%,
    rgba(10,30,66,0.10) 40%,
    rgba(10,30,66,0.82) 100%);
}

.btn {
  background: var(--amber-action);
  color: var(--on-action);
  font: 700 14px/1 var(--font-ui);
  padding: 10px 24px;
  border-radius: var(--r-btn);
  transition: background var(--dur) var(--ease);
}
.btn:hover { background: var(--amber-hover); }

/* A missing week is drawn, never filled */
.heat-missing {
  background: repeating-linear-gradient(45deg,
    #E9ECF1 0 4px, #F7F8FA 4px 8px);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 14. BUILD SEQUENCE — SUMMARY

The full stage-by-stage plan with session prompts lives in `marketprices-build-plan.md`. The
shape of it, and why:

| Phase | Stages | Scope |
|---|---|---|
| **1. Foundations** | 0–1 | Environment, tokens, primitives, chrome |
| **2. Price spine** | 2–5 | Schema, weekly intake, delta/anomaly/basket engine, `/prices` |
| **3. Control room shell** | 6–7 | Sidebar (six items), auth, Dashboard zones 1–2, Price radar with the submission queue |
| **4. Editorial shell** | 8–10 | The one editor, `content_items` spine, article and section pages |
| **5. The hand-publish gate** | 11 | **Three weeks publishing manually off the radar. No new code** |
| **6. Homepage** | 12 | Composes everything built so far |
| **7. Production** | 13–16 | Draft studio, header render, article chain, publish queue + dispatch |
| **8. Tuning and the second stream** | 17–18 | Settings, RSS ingestion, decision-utility scoring, Signal feed |
| **9. Video** | 19 | YouTube sync, V1 chain, WATCH band, `/videos` |
| **10. Measurement** | 20 | `site_events`, rollups, Dashboard zones 3–4 |
| **11. Ship** | 21–22 | Hardening, launch |

Three ordering calls worth defending:

**The price spine before the editorial shell.** The instinct is to build the pretty editorial
site first because it is more visible. Resist it — a food intelligence platform with beautiful
articles and broken prices is a blog.

**The homepage at stage 12, not stage 1.** The homepage is not a page; it is an assembly of
every card, rail, mosaic and band in the system. Building it first means building fourteen
components against invented data, then rebuilding all of them when the data model settles.

**The hand-publish gate is not filler.** Publishing by hand off the radar for three weeks
answers a question no amount of architecture can: *does the radar actually surface things
worth publishing?* That answer should arrive before eight stages of automation are built on
top of it. It tests editorial supply, not audience demand, so it does not need the site to be
launched.

---

## 15. OPEN DECISIONS

Recommendations made here that should be consciously confirmed or overruled.

| # | Decision | Recommendation | Status |
|---|---|---|---|
| 1 | Amber as the action colour | Amber, with a navy label | Carried from v1 |
| 2 | Green = up, red = down | Keep market convention; let the headline carry the judgement. A rising food price is bad news for most readers, but inverting the convention confuses a trader and helps nobody — and the tokens are named by direction so it is a one-file change if you disagree | Carried from v1 |
| 3 | Consumer or wholesale prices | **Resolved: both, via `tier`.** It is a dimension on `price_submissions` and `price_observations`, a toggle on `/prices`, and part of the observation uniqueness key | **Closed by the merge** |
| 4 | Ticker above the hero | Keep. Fallback is directly below the hero, never removed | Carried from v1 |
| 5 | Africa as a derived view | Keep — `country != 'Nigeria'` | Carried from v1 |
| 6 | Ticker on every page or homepage only | Specced for every page. Restrict to homepage, `/prices` and section pages if it feels heavy on article pages | Open |
| 7 | Section count on the homepage | Seven is a lot. First candidates to drop to compact are Technology and Government | Open |
| 8 | FX for non-Nigerian prices | Local currency primary, naira equivalent beneath, rate and rate timestamp stored on the row at conversion time | Open — needs a provider decision |
| 9 | **Which four category weights were inferred** | Energy & utilities, Nutrition vs price, Consumer complaints and Local community reports were inferred rather than given. Confirm before seeding | **Open — confirm before stage 17** |
| 10 | **Basket composition and base week** | Needs an explicit decision before stage 4. Changing it later creates a new version and breaks comparability with everything published before | **Open — blocks stage 4** |
| 11 | **Who else gets a login** | The role model supports Contributor and Analyst. Whether anyone but you holds one changes the 2FA and invite work in stage 17 | Open |

---

## APPENDIX A — CATEGORY WEIGHTS (SEED VALUES)

| Weight | Categories |
|---|---|
| 10 | Food price movement, Supply chain disruptions |
| 9 | Government policy, Weather & climate, Harvest & farming, Market intelligence |
| 8 | Import & export, FX & macroeconomics, Transportation, Agricultural inputs, Food safety |
| 7 | Consumer buying guides, Retail promotions, International commodities, Energy & utilities |
| 6 | Consumer behaviour, Industry & company news, Research & reports, Local community reports |
| 5 | Festivals & seasonal events, Expert opinions, Consumer complaints |
| 4 | Technology & innovation, Competitor monitoring, Nutrition vs price |

Four of these — Energy & utilities, Nutrition vs price, Consumer complaints, Local community
reports — were inferred rather than given. Confirm before seeding `editorial_rules`
(open decision 9).

## APPENDIX B — REFERENCE MAPPING

| Football News template | MarketPrices |
|---|---|
| TOP NEWS hero mosaic | TOP STORIES hero mosaic |
| "ALL NEWS" dark list panel | "LATEST" panel |
| Score rail (match cards) | **Price card rail** |
| League table (rank/team/M/S) | **Price table** — commodity/unit, week, Δ WoW/MoM/YoY |
| Top players (goals) | **Movers board** — gainers/fallers toggle |
| Filter pills | Commodity category and tier filters |
| UKRAINE section | **FOOD PRICES** section (flagship) |
| WORLD section | **AFRICA** section (mosaic) |
| INTERVIEWS dark band | INTERVIEWS dark band — unchanged |
| BLOGS mosaic | AFRICA mosaic / WATCH video mosaic |
| Red "See All" | **Amber "See All"** with navy label |
| Blue data accent | **Green/red** directional accents |
| — | **Price ticker** |
| — | **Lagos Food Basket Index** |
| — | **The Content Engine and its six-surface control room** |

## APPENDIX C — THE THREE DOCUMENTS

| Question | Document |
|---|---|
| What are we building, and why does it look like this? | **this document** |
| What do I type next? | `marketprices-build-plan.md` |
| What will the system refuse to do? | `marketprices-build-protocol.md` |
| What does the reference template measure? | `design-architecture-spec.md` |
