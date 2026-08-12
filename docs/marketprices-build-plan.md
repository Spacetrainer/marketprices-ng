# MARKETPRICES — BUILD ARCHITECTURE & EXECUTION PLAN
### The public platform and the Content Engine, as one build
### Building with Claude Code in a GitHub Codespaces terminal
### Merged edition — supersedes the separate public build plan and the engine's phase list

> **What this document is for.** The architecture document says *what* to build and what it
> looks like. The protocol says what the system will refuse to do. This one says *what you
> type, in what order, and how you know each piece is finished*. Every stage is a
> self-contained Claude Code session with a prompt you can paste and a checklist that has to
> pass before you move on.
>
> **The single most important rule in this document:** never open one Claude Code session and
> ask it to "build MarketPrices." Build one page or one component group per session. Context
> degrades badly on long sessions, and a model that has forgotten your design tokens will
> invent new ones.
>
> **The second most important rule:** stage 11 is a three-week stage with no code in it. It is
> a gate, not a pause, and skipping it is the most expensive mistake available in this plan.

---

## PART 1 — THE COMPLETE TECHNOLOGY INVENTORY

### 1.1 Languages you will actually write

| Language | Where it is used | Roughly how much |
|---|---|---|
| **TypeScript** | Application logic, data access, validation, API routes, cron handlers, the production chains, tests | ~65% |
| **TSX** | Every React component, every page, every control-room screen | ~20% |
| **SQL (PostgreSQL)** | Schema migrations, indexes, views, RLS policies | ~6% |
| **PL/pgSQL** | Triggers (`updated_at`, audit log, append-only, publish guard), the z-score and basket functions | ~2% |
| **CSS** | `tokens.css`, global resets, ticker keyframes, scrim gradient, heatmap hatch | ~3% |
| **Google Apps Script (JS, V8)** | The `onFormSubmit` trigger pushing weekly price rows to the ingest endpoint | ~1% — one file, ~60 lines |
| **Bash** | Codespaces lifecycle, seed scripts, CI steps | ~2% |
| **Markdown** | `CLAUDE.md`, `/docs`, the production-chain prompt templates | ~1% |

The production-chain prompts are markdown files under `docs/prompts/` and they are **source
code**. They are reviewed, versioned and diffed like anything else — a prompt change that
loosens the placeholder rule is a protocol violation whether or not it is written in TypeScript.

### 1.2 Data, config and markup formats

| Format | Files |
|---|---|
| **JSON** | `package.json`, `tsconfig.json`, `.devcontainer/devcontainer.json`, `.mcp.json`, `.claude/settings.json`, `vercel.json` |
| **TOML** | `supabase/config.toml` |
| **YAML** | `.github/workflows/*.yml` — CI, Lighthouse budget |
| **dotenv** | `.env.local`, `.env.example` |
| **XML** | `sitemap.xml`, `feed.xml` (RSS 2.0), `news-sitemap.xml` |
| **JSON-LD** | `NewsArticle`, `VideoObject`, `BreadcrumbList`, `Organization`, `Dataset` (the price series) |
| **CSV** | Price export from the observations explorer |
| **HTML** | Transactional email templates (or TSX with React Email) |

### 1.3 Mini-languages and DSLs

Tailwind utility syntax · PostgREST filter syntax · cron expressions (`vercel.json`) · Zod
schema DSL · regex (slugs, redirects, reserved routes, YouTube IDs, **the placeholder gate**) ·
Git · CSS media queries · Playwright selectors · SQL RLS policy expressions · **ISO week
arithmetic** (`date-fns` `getISOWeek` / `startOfISOWeek` — never hand-rolled).

### 1.4 Runtimes and tooling

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Required by the Claude Code npm package, comfortable for Next.js |
| Package manager | **pnpm** | Faster installs in Codespaces, strict resolution |
| Framework | **Next.js 15, App Router** | Server Components, ISR, route handlers |
| UI | **React 19** | |
| Styling | **Tailwind CSS v4** + CSS custom properties | Tokens in CSS variables; Tailwind reads them. This is what keeps the spec and the code in sync |
| Database | **PostgreSQL 15+ via Supabase** | |
| Auth | **Supabase Auth** | Email/password + TOTP 2FA for Admin and Editor |
| Storage | **Supabase Storage** | Header renders, proof photos, media |
| Hosting | **Vercel** | ISR, cron, edge network |
| Version control | **GitHub** + Codespaces | |

### 1.5 Libraries you will install

| Package | Purpose | Stage |
|---|---|---|
| `@supabase/supabase-js`, `@supabase/ssr` | DB and auth client, cookie sessions | 2 |
| `zod` | Validation at every boundary | 2 |
| `date-fns` + `date-fns-tz` | Dates, **ISO weeks**, and WAT handling — your entire series is meaningless without correct week boundaries | 3 |
| `@tanstack/react-table` | The price table and the control room's dense tables | 5 |
| `@tiptap/react` + extensions | Rich-text body in the editor | 8 |
| `slugify` | URL slugs | 8 |
| `@anthropic-ai/sdk` | The production chains | 15 |
| `resend` + `react-email` | Newsletter, submission alerts | 16 |
| `rss` or hand-rolled | Feed generation | 21 |
| `vitest`, `@testing-library/react` | Unit and component tests | throughout |
| `@playwright/test` | E2E and visual regression | throughout |
| `@axe-core/playwright` | Automated accessibility checks | 21 |
| `@lhci/cli` | Lighthouse CI against the budget | 21 |
| `eslint`, `prettier`, `typescript` | Quality gates | 0 |

**Deliberately not installed:** any charting library. Recharts, Chart.js and D3 each cost
50–200KB gzipped against a 200KB total budget. Sparklines, the 26-week chart, the radar
heatmap and the dashboard bar rows are **hand-written inline SVG** — roughly 40 lines mapping
an array of numbers to a `<polyline points="...">`. Also not installed: any drag-and-drop
library beyond what the calendar needs; the calendar chip is the only drag in the product
(P12.2) and HTML5 drag events plus keyboard handlers cover it.

### 1.6 Every scheduled job is a route handler

The engine spec put jobs on Supabase Edge Functions. Those run on Deno — a second runtime, a
second import style, a second deployment pipeline, a second set of environment variables.

**Run every scheduled job as a Next.js route handler triggered by Vercel Cron** (merge
decision M12). One runtime, one language, one deploy, one log stream. You lose nothing that
matters at this scale and you drop an entire language from the project.

| Route | Cron |
|---|---|
| `/api/cron/agent-ingest` | `*/30 * * * *` |
| `/api/cron/agent-sweep` | `0 7,15 * * *` |
| `/api/cron/agent-score` | `*/30 * * * *` (offset) |
| `/api/cron/agent-fuse` | `0 * * * *` |
| `/api/cron/price-intel` | `0 5 * * *` + on approval |
| **`/api/cron/publish`** | **`*/5 * * * *`** |
| `/api/cron/dispatch-check` | `*/10 * * * *` |
| `/api/cron/youtube-sync` | `0 */6 * * *` |
| `/api/cron/fx-rates` | `0 6 * * *` |
| `/api/cron/rollups` | `0 * * * *` |
| `/api/cron/performance-sync` | `0 8 * * *` |

Every one of them verifies `CRON_SECRET` before doing anything (P9.7).

### 1.7 External services and the credentials each needs

| Service | Used for | Credential |
|---|---|---|
| Supabase | DB, auth, storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| Vercel | Hosting, cron, analytics | `VERCEL_TOKEN` (CI only) |
| Anthropic API | The production chains | `ANTHROPIC_API_KEY` |
| **Canva** | Header and video rendering via MCP | `CANVA_*` per the connector |
| **Metricool** | Social dispatch (via existing Agent 3) | Existing credentials — do not rotate mid-build |
| YouTube Data API v3 | Channel sync | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` |
| **Google Search Console API** | Search impressions in Dashboard Zone 3 | Service account JSON |
| Google Apps Script | Form → ingest bridge | `PRICE_INGEST_SECRET` |
| Resend | Email | `RESEND_API_KEY` |
| FX rate provider | Non-naira conversion | `FX_API_KEY` |
| Vercel Cron | Job auth | `CRON_SECRET` |
| Claude Code | The build itself | `CLAUDE_CODE_OAUTH_TOKEN` |

---

## PART 2 — REPOSITORY ARCHITECTURE

```
marketprices/
├── .devcontainer/devcontainer.json
├── .github/workflows/
│   ├── ci.yml                     # typecheck, lint, test, seed audit, route inventory, "lead" grep
│   └── lighthouse.yml
├── .claude/
│   ├── settings.json
│   ├── commands/
│   │   ├── new-component.md
│   │   ├── audit-a11y.md
│   │   ├── audit-responsive.md
│   │   ├── audit-protocol.md      # ← new: checks a diff against the protocol
│   │   └── audit-surfaces.md      # ← new: checks nothing grew a tenth screen
│   └── agents/
│       ├── design-reviewer.md
│       └── sql-reviewer.md
├── .mcp.json                      # Supabase + Vercel + Canva, project scope
├── CLAUDE.md                      # THE CONTRACT — see §3.5
├── docs/
│   ├── marketprices-design-and-system-architecture.md
│   ├── marketprices-build-plan.md          # this document
│   ├── build-protocol.md
│   ├── design-architecture-spec.md
│   ├── exceptions.md
│   ├── gate-notes.md                       # written during stage 11
│   └── prompts/                            # ← production chain prompts ARE source code
│       ├── classify.md
│       ├── utility-rubric.md
│       ├── fuse.md
│       ├── article-01-outline.md
│       ├── article-03-draft.md
│       ├── article-04-verify.md
│       ├── article-05-voice.md
│       ├── article-06-package.md
│       ├── video-02-script.md
│       └── video-03-summary.md
│
├── app/
│   ├── (site)/                              # public — shares nav/ticker/footer
│   │   ├── layout.tsx
│   │   ├── page.tsx                         # /
│   │   ├── prices/
│   │   │   ├── page.tsx
│   │   │   └── commodity/[slug]/page.tsx
│   │   ├── interviews/{page.tsx,[slug]/page.tsx}
│   │   ├── africa/page.tsx
│   │   ├── videos/page.tsx
│   │   ├── search/page.tsx
│   │   ├── tag/[slug]/page.tsx
│   │   ├── author/[slug]/page.tsx
│   │   ├── methodology/page.tsx
│   │   ├── how-we-use-ai/page.tsx
│   │   └── [section]/{page.tsx,[slug]/page.tsx}
│   │
│   ├── (admin)/admin/                       # ← EXACTLY SIX SURFACES (P12.1) — all behind auth (P12.5)
│   │   ├── layout.tsx                       # sidebar shell, auth guard, redirect-to-login
│   │   ├── login/page.tsx
│   │   ├── page.tsx                         # 1. Dashboard
│   │   ├── signals/page.tsx                 # 2. Signal feed
│   │   ├── radar/page.tsx                   # 3. Price radar — incl. submission queue
│   │   │                                    #    + observations explorer drawer
│   │   ├── studio/page.tsx                  # 4. Draft studio — incl. YouTube import
│   │   ├── queue/page.tsx                   # 5. Publish queue — calendar + published list
│   │   ├── settings/[group]/page.tsx        # 6. Settings — rules AND master data
│   │   └── editor/[id]/page.tsx             # THE ONE EDITOR (P3.7) — not a sidebar item
│   │
│   ├── api/
│   │   ├── ingest/price/route.ts            # ← Apps Script POSTs here
│   │   ├── cron/                            # every job from §1.6
│   │   ├── events/route.ts                  # analytics beacon
│   │   ├── newsletter/route.ts
│   │   └── revalidate/route.ts
│   ├── sitemap.ts · robots.ts · feed.xml/route.ts · globals.css · not-found.tsx
│
├── components/
│   ├── primitives/   Button · Chip · Pill · SectionHeader · Scrim · Container
│   ├── layout/       UtilityBar · Nav · PriceTicker · Footer · Rail
│   ├── cards/        NewsCard · VideoCard · HeroTile · InterviewCard · MosaicTile
│   ├── price/        PriceCard · PriceCardRail · PriceTable · PriceTableCard
│   │                 MoversBoard · Sparkline · ChangePill · DirectionBar · BasketPanel
│   ├── article/      Body · Byline · SourcesBlock · TagRow · RelatedGrid · DataBlock
│   ├── home/         HeroMosaic · LatestPanel · SectionBlock · WatchBand
│   └── engine/       Sidebar · FormatChip · StatusPill · SeverityPill · ScoreBar
│                     PromoteButton · HeatmapCell · CalendarChip · KpiCard
│                     ActionQueueCard · BarRow · VerificationPanel · EditorPane
│
├── lib/
│   ├── supabase/     client.ts · server.ts · admin.ts · middleware.ts
│   ├── queries/      articles.ts · prices.ts · basket.ts · signals.ts
│   │                 content.ts · dashboard.ts · settings.ts
│   ├── engine/       classify.ts · score.ts · fuse.ts · formatFit.ts
│   │                 chain/article.ts · chain/video.ts · blocks.ts
│   │                 placeholderGate.ts   ← P14.1 lives here, ~30 lines, heavily tested
│   │                 render/canva.ts · distribute.ts
│   ├── format.ts     formatNaira · formatChange · formatWeek · formatCollectedAt
│   ├── weeks.ts      ISO week arithmetic — one module, nothing else does week maths
│   ├── validation/   article.ts · priceSubmission.ts · ingest.ts · modelOutput.ts
│   ├── anomalies.ts · basket.ts · youtube.ts
│   └── constants.ts  RESERVED_SLUGS · SECTIONS · PRICE_FRESH_WEEKS · ADMIN_ROUTES
│
├── styles/tokens.css                        ← the design system, single source of truth
├── supabase/{config.toml,migrations/,seed.sql}
├── apps-script/onFormSubmit.gs
├── scripts/{postCreate.sh,generate-form-options.ts,check-seed.sh,check-routes.ts}
├── types/database.ts                        ← generated, never hand-edited
└── tests/{unit,e2e,visual,fixtures}
```

**Two routing decisions that will bite you if you skip them.**

`/[section]/[slug]` is a catch-all. Without a guard, an article slugged `commodity` would
shadow `/prices/commodity/...`. Put `RESERVED_SLUGS` in `lib/constants.ts` (`admin`, `api`,
`search`, `tag`, `author`, `videos`, `commodity`, `methodology`, `how-we-use-ai`, `feed`,
`sitemap`) and reject them in the slug validator on day one.

`ADMIN_ROUTES` in the same file is the allowlist behind the route-inventory CI check (P12.1).
Adding a route means editing that constant, which means the reviewer sees it — which is the
whole point.

---

## PART 3 — STAGE 0: THE ENVIRONMENT

### 3.1 Repository and codespace

```bash
# On GitHub: create a private repo `marketprices`
# Then: Code → Codespaces → Create codespace on main
# Machine type: 4-core / 8GB minimum. 2-core will make Next.js dev builds painful.
```

### 3.2 `.devcontainer/devcontainer.json`

```json
{
  "name": "MarketPrices",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1.0": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "mounts": [
    "source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume"
  ],
  "forwardPorts": [3000, 54323],
  "portsAttributes": {
    "3000": { "label": "Next.js", "onAutoForward": "notify" }
  },
  "postCreateCommand": "bash scripts/postCreate.sh",
  "remoteUser": "node",
  "customizations": {
    "vscode": {
      "extensions": [
        "bradlc.vscode-tailwindcss",
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "supabase.postgrestools"
      ]
    }
  }
}
```

Two details that matter and are easy to miss. **The volume mount:** in Codespaces `~/.claude`
survives stop/start but is wiped on a container rebuild — without the mount you re-authenticate
after every rebuild and lose your session history. **Port 3000 visibility:** set the forwarded
port to Public and open the URL on your actual phone over mobile data. DevTools emulation will
not tell you the truth about your performance budget; a real mid-range Android on a real
network will.

### 3.3 `scripts/postCreate.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

corepack enable && corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
npm install -g supabase
pnpm exec playwright install --with-deps chromium
git config --global core.editor "code --wait"
echo "Ready. Run 'claude' to start."
```

### 3.4 Codespaces secrets

Set under **GitHub → Settings → Codespaces → Secrets**, never in a committed `.env`:

```
CLAUDE_CODE_OAUTH_TOKEN     # generate on your laptop: claude setup-token
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_PROJECT_ID         # used by `pnpm db:types`
DATABASE_URL                # used by `pnpm db:seed` — embeds the database password
ANTHROPIC_API_KEY
YOUTUBE_API_KEY
YOUTUBE_CHANNEL_ID
GSC_SERVICE_ACCOUNT_JSON
RESEND_API_KEY
PRICE_INGEST_SECRET
CRON_SECRET
FX_API_KEY
```

Commit a `.env.example` listing every key with empty values, and put `.env*.local` in
`.gitignore` in the first commit.

These are Supabase's current key names. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (prefix
`sb_publishable_`) is public by design and ships in the client bundle. `SUPABASE_SECRET_KEY`
(prefix `sb_secret_`) is server-only and is what P9.3's bundle grep hunts for. `DATABASE_URL`
embeds the database password, so it is a Codespaces secret like the rest and never a committed
value.

### 3.5 `CLAUDE.md` — the highest-leverage file in this build

Claude Code reads this at the start of every session. It is the reason your fortieth component
still matches your first. Write it before you write any code. Start with the protocol block
from **Appendix A of `build-protocol.md`**, then add:

```markdown
# MarketPrices — Working Agreement

## What this is
A food intelligence platform for Nigeria and Africa, plus the Content Engine that produces
its content. Next.js 15 App Router, Supabase, Tailwind v4, TypeScript strict, on Vercel.
Public site + a nine-surface admin control room, one login.

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
```

### 3.6 `.mcp.json` — project-scope MCP servers

```json
{
  "mcpServers": {
    "supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp" },
    "vercel":   { "type": "http", "url": "https://mcp.vercel.com" },
    "canva":    { "type": "http", "url": "https://mcp.canva.com/mcp" }
  }
}
```

Configure the Supabase MCP server in **read-only mode** for day-to-day work. Let Claude Code
inspect your schema and query data freely; make schema changes only through reviewed migration
files. Wide read, narrow write — the right default for a production database.

Canva is added at stage 14, not stage 0, but defining it here means it travels with the repo.

### 3.7 `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(supabase gen types *)",
      "Read(**)",
      "Edit(app/**)",
      "Edit(components/**)",
      "Edit(lib/**)",
      "Edit(styles/**)",
      "Edit(tests/**)",
      "Edit(docs/prompts/**)"
    ],
    "deny": [
      "Read(.env*)",
      "Edit(.env*)",
      "Edit(supabase/migrations/**)",
      "Bash(rm -rf *)",
      "Bash(git push --force*)"
    ]
  }
}
```

Migrations are in the deny list deliberately. Claude Code may *draft* one into the chat for you
to review and write yourself; a wrong RLS policy is a data breach, not a bug.

### 3.8 Custom slash commands

`.claude/commands/audit-protocol.md`:
```markdown
Audit the files I name, or the current diff, against docs/build-protocol.md.

Check specifically:
- P0.2(g): any string literal that is a price, week, count, commodity name or percentage
- P0.3 / P14.1: any path where a figure could reach model output outside a {{block_id}}
- P1.6: week label and collection date present in every price-bearing view
- P2.1: null rendered as — and never as 0 or 0.0%
- P2.8: missing weeks drawn as gaps, never interpolated or zeroed
- P6.1: raw hex codes
- P6.5: --rise or --fall used for severity

Report findings as a list, each citing its protocol number. Fix only what I approve.
```

`.claude/commands/audit-surfaces.md`:
```markdown
List every route under app/(admin)/ and compare it to ADMIN_ROUTES in lib/constants.ts.

Report any route not in the allowlist, and any occurrence of the word "lead" as a noun in
app/, components/, lib/ or docs/prompts/ (allow "leading" and the CSS property).

This enforces P12.1 and P12.3. Report only; do not fix without approval.
```

`.claude/commands/audit-responsive.md` and `audit-a11y.md` carry over unchanged from the
pre-merge plan, with the a11y one extended to check severity pills carry text labels and
heatmap cells carry accessible names.

### 3.9 Stage 0 verification

```bash
claude --version && claude doctor
node -v          # v22.x
pnpm -v && supabase --version
git status
```

**Done when:** all five commands succeed, `CLAUDE.md` contains the protocol block, `.mcp.json`
resolves, and `docs/` holds all four specification documents.

---

## PART 4 — HOW TO DRIVE CLAUDE CODE ON THIS BUILD

### 4.1 The session pattern

**One page or one component group per session.** When it is done, commit, then `/clear` before
starting the next. A session that has built four pages has a context window full of four pages'
worth of detail and will start drifting from the spec.

**Always start in plan mode.** `Shift+Tab` twice, describe the work, let it produce a plan,
read the plan, correct it, *then* execute. Roughly 80% of the mistakes you would otherwise
spend an hour undoing are visible in the plan for free.

**The prompt skeleton that works for this project:**

```
Read CLAUDE.md, docs/build-protocol.md and styles/tokens.css first.

Build: [exactly one thing]

Spec: docs/marketprices-design-and-system-architecture.md §[section number]

Files to create:
- [explicit list]

Data: [which query in lib/queries, or "no data yet — build the empty state"]

Protocol gates: [the 2–3 numbers most likely to be broken here]

Done when:
- [checklist]

Do not touch any file not in the list above.
```

Naming the section number matters. "Build the price card" produces an invented card. "Build
the price card per §4.2" produces the 236 × 96px card with the 3px direction bar.

### 4.2 Getting files into the editor

Multi-line files come back as **raw file content**, not wrapped in a `cat >` heredoc. In a
browser-based Codespace the heredoc method repeatedly leaks the `cat >` line and the
terminator into the saved file. The reliable loop:

1. Open the target file in the VS Code editor
2. `Ctrl+A` to select all, paste to fully replace
3. `Ctrl+S`
4. Look at the file visually, then check the editor's error count in the status bar
5. Only then run it

Ask for raw content explicitly if a session starts producing terminal heredocs.

### 4.3 What to never delegate

| Task | Why you do it yourself |
|---|---|
| Writing `tokens.css` | It is the contract. Type it by hand from §13, once |
| Reviewing SQL migrations | A wrong RLS policy is a data breach, not a bug |
| Writing `lib/engine/placeholderGate.ts` | It is thirty lines and it is the reason the product can be trusted |
| The basket definition and base week | An editorial decision with permanent consequences |
| Approving `pnpm add` | Bundle size is a product requirement here |
| Any secret value | Never paste one into a session |
| The methodology and AI disclosure copy | Editorial promises about how you work (P14.8) |

### 4.4 Git discipline

Branch per stage, conventional commits, squash-merge to `main`:

```bash
git switch -c stage-05-prices-page
# ... work ...
git add -A && git commit -m "feat(prices): weekly price table with WoW/MoM/YoY and gap markers"
gh pr create --fill
```

Vercel preview deployments on every PR give you a real URL to open on your phone. That is your
responsive test, and it is far more reliable than a simulator.

---

## PART 5 — THE BUILD STAGES

| # | Stage | Depends on | Output |
|---|---|---|---|
| 0 | Environment | — | Codespace, Claude Code, CLAUDE.md, docs, MCP |
| 1 | Design foundations | 0 | Tokens, primitives, nav, ticker, footer |
| 2 | Database & auth | 0 | Full schema, RLS, types, seed, login |
| 3 | Weekly price intake | 2 | Form → Apps Script → API → submission queue |
| 4 | Price intelligence | 3 | Deltas, anomalies, seasonality, basket index |
| 5 | `/prices` | 1, 4 | The flagship public page |
| 6 | Control room shell | 2, 4 | Sidebar, guard, Dashboard zones 1–2 |
| 7 | Price radar | 6 | Basket panel, heatmap, anomaly table, Promote |
| 8 | **The one editor** | 6 | `content_items` spine + `/admin/editor/[id]` (no Articles/Media screens) |
| 9 | Article page | 1, 8 | `/[section]/[slug]` + data blocks |
| 10 | Section, Interviews, Africa, Search | 9 | The remaining public editorial pages |
| 11 | **THE HAND-PUBLISH GATE** | 7, 10 | **Three weeks. No code. `docs/gate-notes.md`** |
| 12 | Homepage | 1–10 | Composes everything |
| 13 | Draft studio | 8, 11 | Promote, format fit, status spine |
| 14 | Header render chain | 13 | Canva MCP, T1–T3, verification gate |
| 15 | Article production chain | 14 | Eight passes, placeholder gate |
| 16 | Publish queue & dispatch | 15 | Calendar, publish cron, social queue |
| 17 | Settings | 16 | Groups 2, 3, 4, 5, 7, 9 first |
| 18 | Signal feed | 17 | RSS ingest, decision-utility scoring, fusion |
| 19 | Video | 16, 18 | YouTube sync, V1 chain, WATCH band, `/videos` |
| 20 | Measurement | 12, 19 | `site_events`, rollups, Dashboard zones 3–4 |
| 21 | Hardening | all | SEO, perf, a11y, tests, security |
| 22 | Launch | 21 | Domain, SSL, monitoring, rollback rehearsal |

**Three ordering calls worth defending.**

*The price spine before the editorial shell.* The instinct is to build the pretty editorial
site first because it is more visible. Resist it — a food intelligence platform with beautiful
articles and broken prices is a blog.

*The homepage at stage 12, not stage 1.* The homepage is not a page; it is an assembly of every
card, rail, mosaic and band in the system. Building it first means building fourteen components
against invented data, then rebuilding all of them when the data model settles. This is the
single most common sequencing mistake on a project like this.

*Automation after the gate.* Stages 13–19 build a machine that produces content. Stage 11 asks
whether the raw material is worth producing. Doing them in the other order is how you end up
with an excellent factory making things nobody wanted.

---

## STAGE 1 — DESIGN FOUNDATIONS

**Goal:** every visual value in the system exists as a token, and the chrome that appears on
every page is built and correct.

### 1.1 `styles/tokens.css`
Type this by hand from §13 of the architecture document. Do not delegate it and do not let
Claude Code "improve" it. It includes the engine tokens — the control room does not get its own
palette.

### 1.2 Tailwind v4 configuration
Tailwind v4 reads CSS variables directly via `@theme`. Map every token so `bg-navy-deep` and
`text-rise` work as utilities and there is never a reason to write a hex code in a component.

### 1.3 Primitives

```
Read CLAUDE.md and styles/tokens.css.

Build these primitives in components/primitives/, one file each:

1. Button — amber fill, navy 14/700 label, 10px 24px padding, 6px radius,
   hover --amber-hover, no lift. Props: variant "primary" | "secondary" |
   "destructive", size, asChild.
2. Chip — pastel section chip. Props: section (one of the 7), onPhoto (boolean →
   rgba(255,255,255,0.92) fill). 11/700 uppercase, +0.04em, 4px radius.
3. OutlineChip — secondary chip for country/commodity. 1px #D9DEE7, transparent, --ink-500.
4. FilterPill — 34px, fully rounded, uppercase 13/500, active colour --amber-action.
5. SectionHeader — uppercase 28/700 title + hairline rule to container edge.
   Props: title, onDark, descriptor.
6. Container — max-width 1280px, 24px gutter.
7. Scrim — the bottom gradient overlay.

Spec: docs/marketprices-design-and-system-architecture.md §2, §4.7, §4.9

Protocol gates: P6.1 (zero hex), P6.2 (no new tokens), P7.5 (focus rings).

Done when: pnpm typecheck && pnpm test pass, and no hex code appears anywhere in
components/primitives.
```

### 1.4 Layout chrome
`UtilityBar`, `Nav` (7 links, 36px spacing, amber dot on Prices, hamburger below 992px),
`PriceTicker` (44px, reduced-motion aware, **empty state = zero height**), `Footer` (including
the small Admin link).

**Done when:** a blank page renders utility bar → nav → ticker → footer correctly at 1440,
1200, 992, 768 and 375px; the ticker stops animating with reduced motion on; the ticker
collapses to nothing with no data; every interactive element has a visible focus ring.

---

## STAGE 2 — DATABASE, TYPES AND AUTH

The whole schema goes in now, including the engine tables. Building the price half first and
retrofitting the engine half means two rounds of RLS review and a migration that alters tables
you already have data in.

### 2.1 Migrations, in this order

| File | Contents |
|---|---|
| `0001_extensions.sql` | `uuid-ossp`, `pg_trgm` |
| `0002_sections.sql` | Sections table |
| `0003_profiles.sql` | Profiles keyed to `auth.users`, role enum |
| `0004_media.sql` | Media + variants JSONB |
| `0005_units_commodities.sql` | Units, commodities with aliases, seasonality, site offset |
| `0006_collection_sites.sql` | Sites — name, type, city, state, coordinates |
| `0007_collectors.sql` | Collectors, trust flag, accuracy score |
| `0008_price_submissions.sql` | Submissions, tier, ISO week, status, flags |
| `0009_price_observations.sql` | Published weekly series + **UNIQUE (commodity, year, week, tier)** |
| `0010_price_anomalies.sql` | z-score, severity, baseline, site-switch flag, gap weeks |
| `0011_basket.sql` | `basket_definition` (versioned) + `basket_snapshots` (`is_complete`) |
| `0012_articles.sql` | Articles, status enum, type enum, `content_item_id`, `agent_assisted` |
| `0013_tags.sql` | Tags + join table + `homepage_pins` |
| `0014_videos.sql` | YouTube sync table |
| `0015_engine_sources.sql` | `sources`, `raw_items` (UNIQUE `url_hash`), `signals` |
| `0016_content_items.sql` | The production spine + revisions + templates + format overrides |
| `0017_distribution.sql` | `content_performance`; **ALTER `social_content_queue` ADD `asset_url`, `asset_type`** |
| `0018_measurement.sql` | `site_events`, `daily_rollups`, `weight_proposals` |
| `0019_governance.sql` | `editorial_rules`, `audit_log` |
| `0020_functions.sql` | `iso_week_of()`, `zscore_12wk()`, `basket_cost()`, `set_updated_at()` |
| `0021_triggers.sql` | Append-only on observations and audit log; publish guard; scheduled guard |
| `0022_rls.sql` | Every policy, every table |
| `0023_indexes.sql` | The seven indexes from §9.6 |

**Three things to review line by line yourself.**

`0017` alters a **live production table** that Agent 3 reads. Additive nullable columns only,
its own PR, deployed before any code writes them (P10.8).

`0021` carries the two guards that make the protocol real:
```sql
-- P5.1 / P15.1: an item cannot enter `scheduled` without a human and a time
ALTER TABLE content_items ADD CONSTRAINT scheduled_requires_human
  CHECK (status <> 'scheduled' OR (scheduled_by IS NOT NULL AND scheduled_for IS NOT NULL));

-- P1.9: a published article traces to a content item
CREATE TRIGGER articles_require_provenance BEFORE INSERT OR UPDATE ON articles ...
  -- raises when status = 'published' and (content_item_id IS NULL OR published_by IS NULL)
```

`0022` is the data-breach surface. The public reads `price_observations`, `basket_snapshots`
where `is_complete`, `articles` where published, `sections`, `commodities`, `units` and
`collection_sites` anonymously. Everything else is authenticated-only. A missing policy on
`price_submissions` exposes collector phone numbers. The engine role gets `SELECT` on the price
tables and **no write grant anywhere near them** (P5.2).

### 2.2 Generate types
```bash
supabase gen types typescript --project-id <id> > types/database.ts
```
Add as `pnpm db:types`, run after every migration, and put it in CI so a stale type file fails
the build.

### 2.3 Seed
Reference data only, per P0.1: the seven sections; commodities with aliases, groups and default
units; units and multipliers; collection sites; the RSS source list; the 25 categories and their
seed weights into `editorial_rules`; the Canva template registry; `RESERVED_SLUGS`; your admin
user. **Read `seed.sql` line by line yourself before it runs the first time.**

### 2.4 Auth
Supabase Auth with `@supabase/ssr`, cookie sessions, middleware guarding `/admin/*`, TOTP 2FA
enrolment required for Admin and Editor, 12-hour timeout, rate-limited login.

**Done when:** you can create a user, sign in, be redirected from `/admin` when signed out, an
anon client provably cannot read `price_submissions` from the browser console, and inserting a
`content_items` row with `status = 'scheduled'` and a null `scheduled_by` fails at the database.

---

## STAGE 3 — WEEKLY PRICE INTAKE

The stage most likely to be underestimated: four moving parts across three platforms.

### 3.1 `lib/weeks.ts` first
Before anything else, the ISO week module: `isoWeekOf(date)`, `weekStart(year, week)`,
`weekLabel(year, week)`, `weeksBetween(a, b)`, `previousWeek()`. Every week boundary in the
system comes from here. Wrong week maths silently corrupts every WoW figure you will ever
publish, and it is the kind of bug that looks like a market movement.

Unit tests must cover: week 1 spanning a year boundary, week 53 years, and a Monday/Sunday
boundary in `Africa/Lagos`.

### 3.2 The Google Form
Fields per §6.1. **Dropdowns, not free text**, for site, commodity, tier and unit. Write
`scripts/generate-form-options.ts` to regenerate those lists from `commodities`,
`collection_sites` and `units` so the form can never drift from the database.

### 3.3 `apps-script/onFormSubmit.gs`
~60 lines. On submit: read the row, derive the ISO week from `collected_on`, build a JSON
payload, POST to `/api/ingest/price` with `Authorization: Bearer ${PRICE_INGEST_SECRET}`, retry
twice, and write the response status back to a column in the sheet so failed rows are visible
rather than silent.

### 3.4 `app/api/ingest/price/route.ts`
Bearer check → Zod validation → resolve commodity/site/unit/tier names to IDs (through the
alias table) → derive ISO week → insert into `price_submissions` as `pending` → run the
duplicate check → return 200 with the assigned status. **Specific error messages, never a
generic 400** — you will be debugging this over a phone call with someone standing in a market.

### 3.5 The submission queue (first slice of the Price radar) **[R1]**
A minimal review table at `/admin/radar` — the full radar arrives at stage 7 and grows around
it. Pending rows with flags, each showing the submitted price against the last three recorded
weeks, so approval is a one-second judgement. Approve · Edit & approve · Reject with reason.
Approval writes the `price_observations` row through the one door (P1.1). There is no
standalone Prices screen (P12.1); this queue lives on the radar permanently.

**Done when:** a real submission from a real phone appears in `price_submissions` within 10
seconds; a mistyped price (₦950,000 for a ₦95,000 commodity) is flagged and stays out of the
public series; a duplicate for the same commodity/week/tier is caught; and approving a
submission produces exactly one observation with a correct ISO week.

---

## STAGE 4 — PRICE INTELLIGENCE

The proprietary half. Zero AI risk, standalone useful, and it is what makes the radar possible.

**Before you start, decide the basket** (open decision 10): which commodities, what quantities,
which sub-index each belongs to, and the base week. Changing it later creates a new version and
breaks comparability with everything published before.

```
Read CLAUDE.md, docs/build-protocol.md and lib/weeks.ts.

Build lib/anomalies.ts and lib/basket.ts per §6.4 of
docs/marketprices-design-and-system-architecture.md.

lib/anomalies.ts:
- wow, mom (trailing 4-week means), yoy (same ISO week last year), ytd
- z = (price − trailing_12wk_mean) / trailing_12wk_stddev
- severity bands read from editorial_rules, NOT hardcoded
- seasonality check against commodities.seasonality_profile before flagging;
  every anomaly carries baseline_expected
- site_switch_flag when the week's site differs from the prior week's, with the
  raised threshold from §6.2
- gap handling: skip missing weeks in every window; a WoW across a gap is
  labelled a two-week change; gap_weeks records the count

lib/basket.ts:
- basket_cost from the ACTIVE basket_definition version for that week
- basket_index = (cost_this_week / cost_base_week) × 100
- sub-index values for staples, protein, vegetables, oils & condiments
- is_complete = false and missing_commodity_ids populated when ANY basket
  commodity has no observation for the week
- when is_complete is false, the function returns null for the index value

Protocol gates: P2.3, P2.8, P2.9, P2.10, P16.1.

Done when:
- A commodity with a missing week produces a two-week labelled change, not a WoW
- A week missing one basket commodity returns null from getBasketIndex(), and the
  snapshot row records which commodity was missing
- Every threshold comes from editorial_rules; grep confirms none in lib/constants.ts
- Unit tests cover: gap, site switch, seasonal-normal rise, year boundary
```

Then `/api/cron/price-intel` to compute anomalies and snapshots on approval and nightly.

**Done when:** the three weeks of prices you already have produce a plausible anomaly set you
can read, and the index refuses to compute for any incomplete week.

---

## STAGE 5 — `/prices`, THE FLAGSHIP PAGE

Build components first, then the page.

### 5.1 Price components
`ChangePill`, `DirectionBar`, `Sparkline` (hand-written SVG **with gap markers**),
`PriceCard` (236×96), `PriceCardRail`, `PriceTable` (TanStack for sorting only, real table
semantics), `PriceTableCard` (276px rail version), `MoversBoard`, `PriceCardList` (the
below-768px replacement), `BasketPanel`.

```
Read CLAUDE.md, styles/tokens.css, lib/format.ts and lib/weeks.ts.

Build components/price/PriceTable.tsx per §5.1 of
docs/marketprices-design-and-system-architecture.md.

Columns: Commodity (+unit beneath) · This week · Last week · Δ WoW · Δ MoM ·
Δ YoY · 26-week sparkline · Collected (date + site).

Requirements:
- Real <table> markup. <th scope="col">. aria-sort on sortable headers. A <caption>.
- Every Δ cell renders an arrow glyph AND a colour. Never colour alone.
- All numbers tabular-nums.
- Direction colour applies to the change value and arrow ONLY — never the price,
  never the commodity name, never a row background.
- A null change renders — in --flat. Never 0.0%.
- Sparkline is inline SVG with an aria-label stating range and direction, and it
  BREAKS at a missing week rather than drawing through it.
- Row click expands to a 26-week chart, the last five weeks, and a
  "Report an error" link.
- Below 768px this component is not used; PriceCardList renders instead.
- There is NO market or state column. Collection site is provenance in the
  Collected cell only. (P1.8)

Use @tanstack/react-table for sorting only. No charting library.

Protocol gates: P1.6, P1.8, P2.1, P2.7, P2.8, P6.4, P7.1, P7.3.

Done when: keyboard sortable, screen reader announces sort state, a greyscale
screenshot still communicates direction, and a series containing a missing week
renders a visible gap.
```

### 5.2 The page
Header band with live coverage line · basket index panel · sticky controls (category pills,
tier toggle, week selector, search) · table + rail · price analysis grid · methodology block.
ISR revalidate 60.

**Done when:** every price shows its ISO week and collection date; the methodology block is
present and written by you; the table sorts; filters compose; an incomplete index week shows
the incomplete state rather than a number; and below 768px it is a card list with no horizontal
scroll.

---

## STAGE 6 — CONTROL ROOM SHELL + DASHBOARD ZONES 1–2

```
Read CLAUDE.md, docs/build-protocol.md §P12, and
docs/marketprices-design-and-system-architecture.md §7 and §8.10.

Build the admin shell and the Dashboard's first two zones.

app/(admin)/admin/layout.tsx:
- 240px --navy-deep sidebar, full height, wordmark block at top
- EXACTLY SIX nav items:
  Dashboard, Signal feed, Price radar, Draft studio, Publish queue, Settings
  (Settings separated at the bottom, above the status block)
- Count badges on Signal feed, Price radar (badge fill --fall), Draft studio,
  Publish queue. Every count comes from a query in lib/queries/dashboard.ts.
- Active item: 3px amber left border, lighter navy background, white label.
  Inactive label #8A9AB6.
- Bottom status block: last sync relative time with a pulsing amber dot, and
  next price sync beneath.
- Content area --surface-50, 13px base type, line-height 1.4.
- Auth guard + role-aware nav (an Analyst sees only Dashboard).

app/(admin)/admin/page.tsx — Dashboard, zones 1 and 2 ONLY:
- Zone 1: six action queue cards per §8.10. 96px tall, count 28/700 tabular,
  label 13/500, whole card clickable with a chevron. 3px amber left border when
  non-zero and time-sensitive.
  WHEN EVERY COUNT IS ZERO, the zone collapses to one line:
  "Nothing needs you right now." Not six grey zeroes.
- Zone 2: one horizontal strip, six readouts, no charts, per §8.10.

DO NOT BUILD: zones 3 or 4 (no traffic data yet), a lead desk, a content desk,
an inbox, a triage view, a backlog, an ideas queue, an approval screen, a kanban
board, a second dashboard, a separate analytics screen, or a standalone Articles,
Media or Prices screen. There are exactly six surfaces. Promoted items go straight
to Draft studio.

THE CONTROL ROOM IS PRIVATE (P12.5): every route here is under /admin behind the
auth guard, a signed-out visitor is redirected to /admin/login, and NOTHING in the
public site links to any of it except the single footer Admin entry.

Also create lib/constants.ts → ADMIN_ROUTES with the six routes (plus login and
editor/[id]), and scripts/check-routes.ts asserting the filesystem matches it.

Protocol gates: P0.2(g), P4.4, P8.7, P9.4, P12.1, P12.3, P12.5.

Done when: the route-inventory check passes; every badge reads 0 against an empty
database; Zone 1 shows its collapsed line; an Analyst login sees one nav item; a
signed-out request to /admin/radar redirects to login; and a grep of the public
layout finds no /admin link outside the footer.
```

---

## STAGE 7 — PRICE RADAR

```
Read CLAUDE.md and docs/marketprices-design-and-system-architecture.md §8.12, §7.4.

Build app/(admin)/admin/radar/page.tsx and its components in components/engine/.

Four stacked regions. Region 0 grows the stage-3 review table in place — do not
move it to a new route:

0. This week's submissions — the pending review queue, rendered only while
   pending rows exist for the current ISO week, collapsed to one line otherwise
   ("This week's sheet is in."). Approve · Edit & approve · Reject with reason,
   writing through the one door (P1.1). A History link opens the observations
   explorer (full series, filters, chart, CSV export) as a drawer on this screen.

1. Basket index panel — current index, WoW delta, four sub-index deltas, 26-week
   path. An incomplete week renders "Week N — incomplete" and NAMES the missing
   commodities. Never a partial number.
2. Heatmap — commodities down, ISO weeks across. Cell 36 × 28px, radius 4px.
   Rises on a red ramp, falls on a green ramp, flat #F1F3F6. A MISSING WEEK is a
   diagonal-hatched grey cell with no number — never a zero, never interpolated.
   Each cell has an accessible name: commodity, week, change, or "not priced".
3. Anomaly table — commodity, tier, this week, last week, WoW, z, severity pill,
   baseline expected, site-switch flag, Promote.

SeverityPill uses the NAVY WEIGHT RAMP and never green or red:
  CRITICAL solid --navy-deep / HIGH solid --navy-brand / MODERATE outline / NORMAL none.
Direction remains --rise/--fall with a glyph, on the change value only.

The Promote split button: amber fill, navy 700 label, 1px navy-20% divider before
the caret, menu listing Article and Video with one marked Recommended and its
video_fit figure, and a muted sub-scores line beneath.
For now Promote only writes a content_items row with status 'queued' — Draft studio
arrives at stage 13.

Protocol gates: P2.8, P2.10, P6.5, P7.1, P7.3, P7.6.

Done when: greyscale screenshot distinguishes severity from direction; a missing
week is visibly hatched; and Promote creates exactly one queued content item.
```

---

## STAGE 8 — THE ONE EDITOR

**This is the stage that determines whether the design survives contact with real content.**

```
Read CLAUDE.md and docs/marketprices-design-and-system-architecture.md §7.7.

Build the single article editor at app/(admin)/admin/editor/[id]/page.tsx.
There is exactly ONE editor in this product (P3.7). It is opened from Draft studio
and Publish queue and differs only in which controls are enabled. It is NOT a
sidebar item and there is no standalone Articles or Media screen (P12.1).

LEFT PANE — form:
- Headline: hard limit 72 characters. Live counter. Amber warning at 60.
  Typing character 73 is IMPOSSIBLE, not warned.
- Dek: hard limit 150 characters. Live counter. Warning at 130.
- Slug: auto-SUGGESTED into an editable field, validated against RESERVED_SLUGS.
  Saving without touching it saves the suggestion the user can see — never a
  silent write into an untouched field (P3.3).
- Body: TipTap rich text. H2, H3, bold, italic, link, blockquote, list, image,
  plus a data-block insertion control.
- Header: template select, bound variables, four rendered sizes (placeholder
  frames for now), ALT TEXT REQUIRED — schedule is disabled without it.
- Image upload lives HERE (R1): the header and inline-image upload controls in
  this form are the only way images enter the system, and the upload control
  rejects an image with no alt text (P7.2). Do not build a media library screen.
- Section: required single-select. Tags: multi-select with create-new.
  Country: defaults to Nigeria.
- Format: article | video. Video reveals script, scenes, runtime and a summary
  field with a live word count and a hard ≥150 gate.
- SEO title, SEO description, canonical URL.

RIGHT PANE — live preview:
Renders the ACTUAL NewsCard, HeroTile and MosaicTile components at real pixel
size with current form values. Not an approximation — import the real components.

Controls: Save · Send back for work · Schedule · Recall · Update.
Schedule is DISABLED until every required field and every verification checkbox
is satisfied.

There is no separate Articles library page (R1) — the published library is the
Publish queue's list view, built at stage 16. Until then, published items are
reachable from the Dashboard's queues and by URL.

Protocol gates: P3.1–P3.7, P1.9, P7.2, P12.1.

Done when: typing a 73rd character is impossible; a 71-character headline visibly
wraps to exactly two lines in the preview card; and a manually created item lands
in content_items with source_screen = 'manual'.
```

That last line is the whole point. The character limit is not arbitrary — it is the number that
keeps a headline inside the two-line clamp at 16px in a 308px card. Enforcing it at the point
of writing is what stops the homepage breaking six months from now.

---

## STAGE 9 — THE ARTICLE PAGE

`/[section]/[slug]`: 720px measure, 17/1.7 body, sticky rail, header graphic at 16:9, byline,
Sources block, TagRow, RelatedGrid, JSON-LD `NewsArticle`.

**Build `components/article/DataBlock.tsx` in this stage.** Six block types — `stat`,
`price_table`, `sparkline`, `comparison_bar`, `timeline`, `index_card` — each rendering from
**values frozen at publish time**, not re-resolved at render (P14.3). An article published in
week 31 quoting the week-31 rice price must still show the week-31 figure in week 40.

Video variant renders the player **and** the written summary. Both, always. Zero iframes until
clicked.

**Done when:** an article with a data block renders correct frozen figures; the Sources block
lists every URL with its date; and the `agent_assisted` disclosure line links to
`/how-we-use-ai`.

---

## STAGE 10 — THE REMAINING PUBLIC PAGES

| Route | Key requirements |
|---|---|
| `/[section]` | One template, four sections. Header band, 2-up featured mosaic, sub-topic pills, grid + rail, load more, section-specific rail widget per §5.2 |
| `/interviews` | Entire page on `--navy-deep`. Portrait grid, 8px gaps |
| `/africa` | Country pill row, 5-tile mosaic, grid. Derived view `country != 'Nigeria'`. Every card carries a country outline chip |
| `/search` | Commodities group first (deep-linking into `/prices` rows), then articles. `pg_trgm` fuzzy matching |
| `/methodology`, `/how-we-use-ai` | **Written by you, by hand (P14.8).** Both must exist before stage 15 |

Build the article page (stage 9) completely before the section pages. A section page is a grid
of cards linking to article pages; if the article page does not exist you are testing against
404s.

---

## STAGE 11 — THE HAND-PUBLISH GATE

**Three weeks. No new code. This is a stage.**

You now have: a weekly price series, an anomaly engine, a basket index, a price radar, an
editor, an article page and section pages. That is everything needed to publish a real article
by hand.

**Do exactly that, every week, for three weeks.** Open the radar on the morning after the price
sync, look at what fired, decide what is worth writing, write it in the editor, publish it.

**What you are measuring** — record it in `docs/gate-notes.md` (P17.2):

| Record | Why it matters later |
|---|---|
| How many anomalies fired, by severity | Are the thresholds in the right place? |
| How many you would have published | Is the radar surfacing signal or noise? |
| How many you actually published | Your real sustainable cadence, not the aspirational one |
| Which archetype each piece was | Tells you which chains to build first in stage 15 |
| What you had to check by hand every time | **This becomes the verification checklist** |
| Which figures you reached for that the system did not have | Missing data blocks |
| How long each piece took, end to end | The number stage 13's cycle-time readout is measured against |

**Why this is worth three weeks.** Stages 13–19 build a machine to produce content from what
the radar surfaces. If the radar surfaces little worth publishing, that machine will
industrialise noise — and you will not discover it until you have spent seven stages finding
out. No amount of architecture answers this question. Three weeks of doing it does.

**Failing the gate is a permitted outcome (P17.3).** If three weeks produce nothing you would
put your name on, go back to stage 4: adjust thresholds, revisit the tracked commodity list,
reconsider the basket. That is a cheap correction here and an expensive one at stage 19.

**Done when:** `docs/gate-notes.md` exists, contains three weeks of real entries, and you can
name the three article archetypes you actually used.

---

## STAGE 12 — THE HOMEPAGE

Fourteen bands assembled from components that already exist and are already tested.

**Build order within the stage:** `LatestPanel` → `HeroMosaic` → `SectionBlock` → the Africa
mosaic → the newsletter band → the page that composes them.

`SectionBlock` is the piece worth thinking about. Rather than seven bespoke blocks, write one
component with a `density` prop. Seven near-identical implementations will drift; one component
with three modes cannot.

```
Read CLAUDE.md and docs/marketprices-design-and-system-architecture.md §3.

Build components/home/SectionBlock.tsx.

Props: section, density ("flagship" | "standard" | "compact"), showRail (boolean).

flagship  → filter pills + PriceCardRail + 3x3 NewsCard grid + rail + See All
standard  → SectionHeader + 3x2 grid + rail + See All
compact   → SectionHeader + single 3-card row + See All

Data: lib/queries/articles.ts → getSectionArticles(sectionId, limit), applying
homepage_pins first (respecting the 72h expiry) then filling by published_at DESC.

A section with no published articles renders NOTHING — the band is omitted from
the DOM entirely (P4.3). Band light/dark alternation is therefore computed at
request time from the list of RENDERED bands, never from a static index.

Then build app/(site)/page.tsx composing the 14 bands in §3.2 order, preserving
the alternation: dark → white x3 → dark → white x3 → dark → white x2 → dark → navy.

ISR revalidate: 300.

Protocol gates: P4.3, P8.1, P8.3.

Done when: /audit-responsive and /audit-a11y both pass, hiding a section's
articles leaves the alternation intact, and homepage total transfer weight is
under 1.2MB on a cold load.
```

---

## STAGE 13 — DRAFT STUDIO AND THE STATUS SPINE

The workflow backbone. No content generation yet — this stage makes the pipeline exist.

```
Read CLAUDE.md, docs/build-protocol.md §P12, and
docs/marketprices-design-and-system-architecture.md §8.9, §8.13.

Build app/(admin)/admin/studio/page.tsx.

A filterable list on the left (status, format, insight type, priority) opening the
EXISTING editor at /admin/editor/[id] on the right. Do not build a second editor.

Statuses shown here: queued, producing, ready, needs_work.
Statuses NOT shown here: scheduled, published, dispatching, failed — those live in
Publish queue. The split is by TIME, not by object: this screen is craft, that one
is traffic control.

StatusPill per §8.9. FormatChip reusing the Prices and Interviews chip pairings —
no new colour enters the system.

Also build lib/engine/formatFit.ts:
- punch, explanation_load, progression, stakes scored 0–10 and STORED
- video_fit = (progression × 0.35) + (punch × 0.30) + (stakes × 0.25) + (recency × 0.10)
- recommend video when video_fit ≥ 75 AND progression ≥ 6 AND the weekly video cap
  is not reached; otherwise article
- weights and thresholds read from editorial_rules, not hardcoded
- overriding the recommendation REQUIRES a reason and writes a format_overrides row

And the verification panel shell beneath the editor form: claims with source
indices, placeholder resolution, two-source check, edit distance, required fields.
Schedule stays DISABLED until every box is ticked (P5.6).

DO NOT BUILD a kanban board. Status changes happen through buttons. The only drag
in this product is the calendar chip in Publish queue.

Protocol gates: P5.6, P12.2, P14.7, P16.1.

Done when: promoting from the radar lands an item in Draft studio as `queued`;
overriding a format recommendation is impossible without a reason; and the
verification panel blocks Schedule with any box unticked.
```

---

## STAGE 14 — THE HEADER RENDER CHAIN

The cheapest artefact in the system, which is exactly why the pipeline gets debugged here
rather than on a 40-second video.

```
Read CLAUDE.md, docs/build-protocol.md §P14, and
docs/marketprices-design-and-system-architecture.md §8.5.

Build lib/engine/placeholderGate.ts FIRST. I will review it before anything else.
It is ~30 lines and it is the reason this product can be trusted:

  - assertNoBareFigures(text): rejects when a digit sequence appears outside a
    {{block_id}} token. Returns the offending substrings.
  - bindBlocks(text, blocks): replaces tokens with typed values, and throws on an
    unresolved token or an unused block.
  - There is NO flag, option or parameter that disables either function.

Unit tests must cover: a bare number, a number inside a token, a number in a URL,
a percentage, a naira figure, an orphan token, an unused block, and a year (which
is a figure and must also be a block).

Then lib/engine/render/canva.ts:
- Templates T1–T3 only for now (price card, basket index card, movers board)
- Template IDs and variable schemas read from content_templates, never hardcoded
- Bind variables through bindBlocks — the renderer receives VALUES, and the model
  never touched them
- Render four sizes: 16:9, 4:5, 1:1, 9:16
- Validate the Canva response with Zod; store URLs in header_render_urls
- header_alt is REQUIRED and is written by a human in the editor, not generated

Protocol gates: P14.1 (structural), P14.4, P7.2, P10.4.

Done when: assertNoBareFigures rejects every case in the test table; a T1 render
produces four correctly sized images against the brand kit; and an item whose
header_alt is empty cannot be scheduled.
```

**Do the compression test by hand on the first ten headers.** If a claim cannot survive being
cut to eight words without becoming misleading, it does not belong on the header — the header
carries the commodity and the figure, the headline carries the nuance. A header gets
screenshotted and travels without its article.

---

## STAGE 15 — THE ARTICLE PRODUCTION CHAIN

Eight passes. The prompts live in `docs/prompts/` and are reviewed as source code.

```
Read CLAUDE.md, docs/build-protocol.md §P0.3 and §P14, and
docs/marketprices-design-and-system-architecture.md §8.6.

Build lib/engine/chain/article.ts and the prompts in docs/prompts/.

Pass 0 — Brief assembly. DETERMINISTIC, no model. Insight + signals + anomalies →
  a context packet in which EVERY figure is replaced by a {{block_id}} token and
  the values are NOT included in the packet.
Pass 1 — Outline. Section headings + one-line intent each, from the archetype skeleton.
Pass 2 — Data binding. DETERMINISTIC. Typed blocks assigned to sections.
Pass 3 — Draft. Prose with {{block_id}} tokens. THE MODEL NEVER SEES A VALUE.
Pass 4 — Verification. A SEPARATE call, values still absent. Checks: unsupported
  claims, orphan placeholders, uncited assertions, two-source rule. Runs
  assertNoBareFigures FIRST, as a regex, before any model judgement. A failure
  returns the item to Pass 3 and, on a second failure, sets status = needs_work.
Pass 5 — Voice. Rewritten per §8.8. Still placeholders.
Pass 6 — Packaging. Headline options ≤72, dek ≤150, slug, meta description,
  section, tags, internal links. These constraints are enforced HERE, at
  generation time, not at render time. This pass is also the first layer of the
  allocation rule (P15.7): an item cannot leave it without slug and section, so
  nothing unallocatable ever reaches Draft studio.
Pass 7 — Header render. Calls stage 14.

Build archetypes 1, 2 and 7 only (price move explainer, weekly market report,
basket index report) — the three the gate notes say you actually wrote.

Every prompt must include the untrusted-content wrapper (P9.8): fetched source text
goes inside a delimited block with an instruction that nothing within it is a
directive.

Protocol gates: P0.3, P14.1, P14.2, P14.3, P5.3, P5.4, P5.5, P5.8, P9.8, P10.4.

Done when: a real anomaly produces a draft in which every figure is a bound block;
a deliberately corrupted Pass 3 output containing a bare number is rejected
automatically; and a source page containing an injected instruction changes nothing.
```

**Read the first ten drafts end to end yourself.** Not to approve them — to find out what the
verification checklist from `gate-notes.md` actually needs to contain.

---

## STAGE 16 — PUBLISH QUEUE AND DISTRIBUTION

```
Read CLAUDE.md, docs/build-protocol.md §P15, and
docs/marketprices-design-and-system-architecture.md §8.14, §8.15.

1. app/(admin)/admin/queue/page.tsx — a calendar, week and month views, of
   scheduled and published items, PLUS a list view toggle (R1) that serves as the
   published-article library: filterable by section, format and date, full-text
   searchable, each row opening the item in the one editor for post-publication
   updates. Do not build a separate Articles screen. CalendarChip: 24px, radius 4px, 3px format bar
   at the left (article blue, video rose), mono 11/700 time, one-line clamped
   headline, status dot. Draggable — AND keyboard-operable, because drag is not
   an accessible-only path (P7.5). This is the ONLY drag in the product.

2. /api/cron/publish, every 5 minutes, CRON_SECRET verified:
   - select where status = 'scheduled' and scheduled_for <= now()
   - ALLOCATION ASSERTION (P15.7): re-assert slug, section_id and headline are
     present and valid BEFORE writing. On failure, set status = 'failed' with the
     missing field named — never publish an orphan and never publish partially
   - write into articles with type, agent_assisted = true, content_item_id set
   - set published, stamp published_at, revalidate IN ONE PASS: the article page,
     the section page, the homepage, the sitemap, the news sitemap and the feed
   - unless no_distribution: generate per-platform copy and insert into
     social_content_queue with scheduled_for = published_at + the configured
     delay. Every social post's link points at the item's OWN page
   - a failed social insert NEVER rolls back the publication

3. lib/engine/distribute.ts — per-platform copy per §8.15, asset size mapping,
   and UTM on every link with utm_medium = FORMAT, not "social".

4. Recall: before dispatch, remove from calendar and delete unsent queue rows.
   After publication, unpublish, revalidate, mark queue rows cancelled.
   Playwright tests for BOTH paths.

The social delay defaults to 45 minutes with a HARD FLOOR of 15, enforced by a
check constraint on the setting, not by the UI.

Protocol gates: P5.1, P15.1–P15.7, P10.8, P2.6 (WAT round-trip).

Done when: an item scheduled for a WAT wall-clock time publishes within 5 minutes
of it; a forced social failure leaves the article published and shows a badge;
both recall paths pass; a published item appears on its section page and in the
sitemap within one revalidation (the P15.7 Playwright test); and an item with its
section_id deliberately nulled goes to 'failed' naming the field, not to
'published'.
```

Verify the `social_content_queue` migration went out **before** this code ships (P10.8). Agent 3
reads that table in production right now.

---

## STAGE 17 — SETTINGS

Groups 2, 3, 4, 5, 6, 7 and 9 first — sources, category weights, scoring, commodities &
aliases & collectors, sites & basket, anomaly thresholds, publishing. The rest follow when
they are needed. Since R1, groups 5–6 are also the home of the master data the cut Prices
module used to hold; until this stage, masters are maintained by careful direct edits with
the audit trigger already in place from stage 2.

```
Read CLAUDE.md, docs/build-protocol.md §P16, and
docs/marketprices-design-and-system-architecture.md §8.16.

Build app/(admin)/admin/settings/[group]/page.tsx for groups 2, 3, 4, 5, 7, 9.

Every value reads from and writes to editorial_rules. Versioned groups (3, 4, 7)
create a NEW ROW with an active_from date rather than overwriting.

Group 4 — Scoring — needs three things the others do not:
- a LIVE sum-to-1.0 check on the six coefficients, blocking save when it fails
- the five decision-utility sub-weights
- a REPLAY PREVIEW: re-score the last full day's items under the proposed weights
  and show what enters and leaves the hot band, BEFORE saving. "9 items enter hot,
  4 leave, here they are."

Group 12 (build the row now even if the rest of the group waits): the placeholder
gate appears as a switch that is ON and CANNOT be turned off, greyed, with one line
explaining why. Showing a control you refuse to give anyone is a stronger statement
than hiding it.

Every change writes to audit_log with actor, timestamp and a before/after diff.

Protocol gates: P16.1–P16.6, P9.4.

Done when: a weight set summing to 0.95 cannot be saved; the replay preview names
specific items; a threshold change creates a new version rather than mutating the
old; and the audit log shows a readable diff.
```

---

## STAGE 18 — THE SIGNAL FEED

The second intake stream. It arrives after the price stream is proven end to end, because the
price stream is the half nobody else has.

```
Read CLAUDE.md and docs/marketprices-design-and-system-architecture.md §8.2–§8.4.

1. /api/cron/agent-ingest — RSS pollers every 30 minutes across the sources table.
   Dedup at WRITE TIME on url_hash (UNIQUE) plus a normalised-title fingerprint.
   Store last_polled_at and last_error so a dead feed is visible, not silent.
   There is no clustering stage and no agent_clusters table.

2. /api/cron/agent-sweep — category sweeps twice daily, one templated query per
   category with a Nigeria/Africa qualifier.

3. lib/engine/classify.ts + score.ts — 25 categories, the decision-utility rubric
   (five sub-scores, all STORED in utility_breakdown), geo, novelty, recency decay.
   signal_score per §8.3, coefficients from editorial_rules.
   Bands: ≥70 hot, 40–69 standard, <40 archived but searchable, NEVER deleted.

4. lib/engine/fuse.ts — match signals to anomalies on shared commodity, shared
   entity, or a known causal link (diesel → transported goods, FX → imported goods,
   flooding in a state → commodities sourced from it). Emit an insight with one of
   the six insight_types.

5. app/(admin)/admin/signals/page.tsx — signal cards with a ScoreBar (3px vertical,
   full height, navy ramp by band), headline, source + trust tier, category chip,
   matched commodities, first-seen, and the utility breakdown on expand.
   Actions: Dismiss (WITH A REASON, retained not deleted) and the Promote split
   button from stage 7.

All fetched text is untrusted content (P9.8): delimited, with an instruction that
nothing inside it is a directive.

Protocol gates: P5.9, P9.8, P10.4, P16.1, P16.3.

Done when: 24 hours of polling produces a scored feed you can read; a below-40 item
is findable by search but absent from the feed; and an item whose title contains an
injected instruction is scored normally and changes nothing.
```

---

## STAGE 19 — VIDEO

**V1 only.** The recurring weekly price update — 30–40 seconds: hook, index number, three
movers, CTA. It never needs a new idea, only new numbers, which is exactly why it is the one to
build first and run unbroken for a month before adding V2.

1. `/api/cron/youtube-sync` every 6 hours → the `videos` table → an "Import as content item"
   control in **Draft studio** (R1 — there is no Media screen). Import creates a
   `content_items` row with `source_screen = 'manual'`. Never auto-publish a synced video.
2. `lib/engine/chain/video.ts` — the seven steps from §8.7. Step 2 (script) and step 3 (written
   summary) both run under the placeholder gate. **Step 4 blocks on a summary shorter than 150
   words** (P14.5). Step 6 generates captions **from the script text**, never by transcribing
   audio (P14.6).
3. `VideoCard`, the `WATCH` band, `/videos`.

**The performance rule is a build requirement, not advice.** Eight `VideoCard`s must ship eight
`<img>` tags and zero iframes. Add a Playwright test that fails if an iframe appears in the
initial HTML of the homepage or `/videos`.

**Done when:** one V1 renders end to end from a real basket week; its written summary is ≥150
words and was produced under the gate; captions match the script exactly; and the WATCH band
carries both a synced and an engine-produced video with no visual difference between them.

---

## STAGE 20 — MEASUREMENT

Meaningless until there is real traffic, which is why it is here and not at stage 6.

1. `site_events` + the beacon route: `view`, `scroll_25`, `scroll_80`, `complete`,
   `price_search`, `commodity_view`, `error_report`, with UTM capture.
2. `/api/cron/rollups` hourly into `daily_rollups`. **The Dashboard never scans `site_events`**
   (P8.7).
3. `/api/cron/performance-sync` daily from Metricool, GSC and YouTube into
   `content_performance`.
4. **Dashboard Zone 3** — four KPI cards with sparklines and deltas, traffic by section, top
   content, price page activity, video per platform.
5. **Dashboard Zone 4** — the decision-utility correlation chart, three separate scoreboards,
   and `weight_proposals` linking into Settings → Scoring.

```
Protocol gates: P18.1 (never sum across platforms), P18.2 (suppress deltas below
30 days of history or 50 sessions — show the figure, hide the arrow, and render
"not enough data yet"), P18.3 (three scoreboards, never one table), P18.4 (each
module states its own lag).

Done when: a KPI card with 12 days of history shows a figure and no arrow; no
"total reach" figure exists anywhere; and a weight proposal links into Settings
without ever applying itself.
```

Zone 4 needs roughly **50 published items** before its correlations mean anything. Build it,
then leave it alone for two months before you act on it.

---

## STAGE 21 — HARDENING

| Area | Work |
|---|---|
| SEO | `sitemap.ts`, news sitemap, `robots.ts`, `feed.xml`, JSON-LD on every template, OG images from the 16:9 header, canonical URLs. Verify the P15.7 allocation loop: every published article is in the sitemap and the feed, with a count assertion (`published articles = sitemap article entries`) |
| Performance | Lighthouse CI wired to the §11.3 budget as a **failing** PR check. Self-host fonts, preload the two above-fold weights, verify `₦` renders at 13/18/30px in every weight |
| Accessibility | `@axe-core/playwright` across every route, public and admin. Manual keyboard pass including calendar reschedule. Greyscale review of `/prices` and the radar |
| Testing | Playwright smoke test per route, visual regression on the homepage, `/prices`, the radar heatmap and a gapped sparkline |
| Security | RLS re-review, rate limits on `/api/ingest` and login, `CRON_SECRET` on every job, `noindex` on `/admin`, **the P12.5 public-boundary tests**, secret rotation, `sb_secret_` bundle grep |
| Protocol | A full P19 enforcement-table sweep — every row verified as actually wired, not just intended |
| Content | Methodology and AI disclosure pages reviewed and live |

---

## STAGE 22 — LAUNCH

Vercel project, `marketprices.ng` DNS, SSL, `www` redirect, Resend domain verification with
SPF/DKIM, cron schedules confirmed in production, Google Search Console, uptime monitor,
database backup schedule, and one rehearsed rollback.

**Launch gate (P4.5):** three consecutive weeks of real observations, at least one complete
basket week, and one published article per rendered homepage band. Point the domain last —
everything above is verifiable on the Vercel preview URL.

---

## PART 6 — WHERE THIS BUILD TYPICALLY GOES WRONG

Ten failure modes, in rough order of likelihood. The first six carried over from the public
build; the last four are what the merge and the two revision passes add.

1. **Invented design values.** A component ships with `#F5A623` because the model half-
   remembered your amber. *Mitigation:* `CLAUDE.md` forbids raw hex; a lint rule fails the
   build on any hex inside `components/`.
2. **The homepage built first.** Fourteen bands of placeholder data, then a rebuild when the
   schema settles. *Mitigation:* stage 12, not stage 1.
3. **The editor not enforcing the clamps.** Everything looks perfect until someone writes a long
   headline. *Mitigation:* stage 8's hard limits, tested against the real preview card.
4. **Colour-only price direction.** Arrow glyphs dropped as "visual noise" in a refactor.
   *Mitigation:* a Playwright test asserting the glyph is in the DOM.
5. **A charting library sneaking in.** Someone asks for a nicer chart and 180KB arrives.
   *Mitigation:* `CLAUDE.md` forbids it and the Lighthouse budget fails the PR.
6. **Google Sheets becoming the database.** Faster on day one, unrecoverable by month three.
   *Mitigation:* the Sheet is an intake device; Supabase is the store of record.
7. **A seventh screen appears.** A session builds a "leads" view, an inbox or a kanban board
   because that is what newsroom tools look like, and it quietly becomes load-bearing.
   *Mitigation:* P12, the route-inventory check, the "lead" grep, and the standing prohibition
   block in every generative prompt.
8. **A figure escapes the placeholder gate.** Someone adds a "just this once" path that lets the
   model see a number — usually to fix an awkward sentence. It works, it reads better, and six
   weeks later a hallucinated price is published under your name. *Mitigation:* `assertNoBareFigures`
   runs as a regex before any model judgement, in a separate call, with no configuration flag,
   and the switch is displayed as permanently locked so nobody goes hunting for it.

9. **A format ships without a page.** Someone proposes a "quick social-only graphic" or a
   video that posts natively with no article behind it — reintroducing the exact orphan
   problem the R1 pivot killed (§1.4). It will be framed as saving time. *Mitigation:*
   P15.7 — the publish job cannot produce an orphan, Pass 6 cannot emit one, and the
   prohibition block forbids designing one.

10. **The control room leaks into public chrome.** A design tool or a build session adds
   Dashboard / Price radar / Editor to the public navigation — as a demo switcher, a
   convenience, or because newsroom templates look like that — and it survives because it is
   useful while developing. *Mitigation:* P12.5, the public-boundary Playwright test, the
   standing prohibition block's first paragraph, and the rule that the only admin link is one
   footer word. This is not hypothetical: the first prototype did exactly this.

An eleventh, specific to this merge: **skipping stage 11 because the tooling is more
interesting than the editorial work.** It will be. Do it anyway.

---

## PART 7 — QUICK REFERENCE

### Daily loop
```bash
claude
# Shift+Tab twice → plan mode
# describe the stage, review the plan, approve

pnpm typecheck && pnpm lint && pnpm test && pnpm build

git add -A && git commit -m "feat(scope): what changed"
gh pr create --fill
# open the Vercel preview URL on your phone
```

### Package scripts to define in stage 0
```json
{
  "dev": "next dev",
  "build": "next build",
  "typecheck": "tsc --noEmit",
  "lint": "next lint",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "check:seed": "bash scripts/check-seed.sh",
  "check:routes": "tsx scripts/check-routes.ts",
  "check:vocab": "grep -rniE '\\blead(s|_type)?\\b' app components lib docs/prompts || true",
  "db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > types/database.ts",
  "db:push": "supabase db push",
  "db:seed": "psql $DATABASE_URL -f supabase/seed.sql",
  "lhci": "lhci autorun"
}
```

`check:seed`, `check:routes` and `check:vocab` all run in CI. The last one is a grep with an
allowlist for "leading" and the CSS property — it exists because vocabulary summons screens
(P12.3).

### Stage gates at a glance

| Stage | The one thing that must be true before you move on |
|---|---|
| 2 | An anon client cannot read `price_submissions`, and a scheduled item without a human fails at the database |
| 3 | A real phone submission lands correctly with the right ISO week |
| 4 | An incomplete basket week returns null, not a number |
| 5 | A greyscale screenshot of `/prices` still communicates direction |
| 6 | The route-inventory check passes with exactly six surfaces, and a signed-out `/admin/*` request redirects to login |
| 8 | Typing a 73rd headline character is impossible |
| **11** | **`docs/gate-notes.md` holds three real weeks** |
| 14 | `assertNoBareFigures` rejects every case in its test table |
| 15 | A corrupted draft containing a bare number is auto-rejected |
| 16 | Both recall paths pass, a WAT wall-clock schedule publishes on time, and a published item is on its section page and in the sitemap within one revalidation |
| 22 | Three weeks of real prices, one complete basket week, one article per band |

### The four documents

| Question | Document |
|---|---|
| What are we building and why? | `marketprices-design-and-system-architecture.md` |
| **What do I type next?** | **this document** |
| What will the system refuse to do? | `marketprices-build-protocol.md` |
| What does the reference template measure? | `design-architecture-spec.md` |
