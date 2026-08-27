-- 0018_content_items.sql
-- MarketPrices — Stage 2, migration batch 7
--
-- THE PRODUCTION SPINE (§9.3): content_templates → content_items →
-- content_revisions, plus format_overrides. One table, one status field, and
-- the five control-room screens are filtered views of it rather than separate
-- systems (§8.9).
--
-- This migration also closes two of the four deferred content_items
-- references recorded in docs/exceptions.md — see THE THREE ALTERATIONS at the
-- foot of the file. It deliberately does NOT close the other two.
--
-- NUMBERING. The build plan calls this `0016_content_items.sql`. The plan's
-- numbering now runs TWO behind the repo (it did not account for
-- 0015_article_type_data or the article batch landing first), so this is 0018.
-- Recorded in docs/exceptions.md by widening the entry 0017 opened.
--
-- NO COEFFICIENT, NO THRESHOLD, NO WEIGHT APPEARS IN THIS FILE. The video_fit
-- formula, its 75 threshold, the weekly video cap, the severity and type
-- multipliers behind priority, and the social delay are all versioned settings
-- in editorial_rules (P16.1). This migration holds vocabulary, shape and the
-- guards that make P5.1 structural. Retuning any of the above must never touch
-- this file and never touch a deployment.
--
-- THE MODEL NEVER WRITES A FIGURE (P0.3, P14.1). Nothing in this file stores a
-- price, a percentage or a quantity. data_blocks holds bound figures keyed by
-- {{block_id}}; body_mdx and script hold tokens, never digits. That gate lives
-- in the chain at article Pass 3 and video Step 2 and is enforced by the
-- verification pass — this table is where the result lands, not where the rule
-- is applied.


-- ============================================================================
-- content_templates — the Canva registry (§9.3, §8.5)
-- ============================================================================
--
-- Every renderable template, for both chains. Seeded as reference data in
-- seed.sql (P0.1 permits templates explicitly), edited in Settings.
--
-- TWO POOLS, ONE TABLE. §8.5 makes the seven header templates "a library both
-- chains share", chosen independently of format, while §8.7's V1–V6 are video
-- scene templates belonging to one chain. Both are Canva templates and both
-- live here, which is why `format` carries a third value below.

create table content_templates (
  id                uuid primary key default extensions.uuid_generate_v4(),

  -- The stable public key of a template — T1..T7, V1..V6 — and the target of
  -- content_items.header_template's foreign key. Unique because the FK needs
  -- it to be, and because two rows claiming T3 would make "the price card
  -- template" ambiguous in a registry whose whole job is to resolve that name.
  template_code     text not null unique,
  check (btrim(template_code) <> ''),

  -- 'shared' is NOT in §9.3's printed value list, which prints no values at
  -- all. It is added because §8.5's header pool genuinely belongs to neither
  -- chain: T1–T7 are chosen by f(punch, insight_type) with format explicitly
  -- not an input. Forcing a header template to claim 'article' or 'video'
  -- would be recording a fact the spec denies.
  format            text not null check (format in ('article', 'video', 'shared')),

  canva_template_id text not null,
  check (btrim(canva_template_id) <> ''),

  -- Both NOT NULL. A registry row that does not state its variables or its
  -- render sizes cannot be used by either chain — storing one is storing a
  -- template nothing can render, which is worse than its absence because it
  -- appears in the Settings list as though it were usable.
  --
  -- No shape enforced on either. The variable set differs per template by
  -- design (§8.5's table gives each a different variable list) and a check
  -- would have to be a union broad enough to be meaningless.
  variable_schema   jsonb not null,
  output_sizes      jsonb not null,

  -- Renamed from §9.3's printed `active`, the same call and the same reasoning
  -- as sources.is_active in 0017: every other table in this build spells the
  -- flag is_active, and one table spelling it differently propagates the
  -- exception into every join and every generated type forever. Folded into
  -- the rename entry 0017 opened rather than logged again.
  is_active         boolean not null default true,

  created_at        timestamptz not null default now(),

  -- No set_updated_at trigger exists in this build yet — it arrives with the
  -- plan's functions batch — so whatever writes the row sets this. Same
  -- standing caveat as 0013, 0016 and 0017.
  updated_at        timestamptz not null default now()
);

-- No index. §9.6 names none, the registry is thirteen rows seeded once, and
-- the unique constraint on template_code already provides the only lookup
-- path that matters (the FK's).

alter table content_templates enable row level security;

-- content_templates_select_staff: is_staff() and not is_admin_or_editor(),
-- the same call made on every table in 0017 and on price_anomalies in 0011.
-- Screen access and table access are different questions.
create policy content_templates_select_staff
  on content_templates
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- The registry is Settings territory — §7.2 puts Settings groups 2–5 and 7–11
-- at Admin and Editor. is_admin_or_editor(), the existing helper, reused as-is:
-- a plain two-role case with no third audience.
create policy content_templates_insert_staff
  on content_templates
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

create policy content_templates_update_staff
  on content_templates
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy: default deny. A retired template is deactivated, never
-- deleted — content_items.header_template must keep resolving for every item
-- ever produced against it, including ones published years earlier.


-- ============================================================================
-- content_items — the spine (§9.3, §8.9)
-- ============================================================================
--
-- One row per piece of content, from promotion to publication and after it.
-- P1.9: EVERYTHING the site publishes is one of these rows, including a
-- manually written article, which is a row with source_screen = 'manual'. One
-- door in, always, so provenance, verification state and revision history
-- exist for all of it rather than only for what the engine produced.
--
-- THE ROW IS BORN AT PROMOTE. §8.9 sets `queued` on the human's promote
-- action, before the chain has run, which is why almost every column below the
-- brief is nullable: at the moment this row first exists there is no slug, no
-- headline, no header, no script and no body. The three status-conditional
-- checks near the foot of the table are what make those columns required
-- again at the point where absence would become a public defect.
--
-- FORMAT FIT HAS NO SOURCE YET — NOTED GAP, logged in docs/exceptions.md.
-- §8.11 renders punch, explanation_load, progression, stakes and video_fit on
-- the Signal feed's promote menu, before any row here exists, and §9.3 gives
-- those five figures no home outside this table. Either fusion computes them
-- on demand at feed render (the reading taken) or a store is missing from §9.3.
-- This is why promote_signal() and promote_price_anomaly() are NOT rewritten
-- in this migration to create a row here: doing so would require inventing
-- where those five numbers come from.

create table content_items (
  id                    uuid primary key default extensions.uuid_generate_v4(),

  -- Exactly two, matching articles.type in 0013. A video item is this table,
  -- this row shape, with format = 'video'.
  format                text not null check (format in ('article', 'video')),

  -- The six fusion types (§8.4). Checked, not free text: this vocabulary is
  -- fixed by what fusion can actually detect — an anomaly with a matched
  -- signal, an anomaly without one, a signal without an anomaly, an index
  -- move, the calendar, or none of those — and a seventh would have no
  -- trigger. Contrast signals.category in 0017, which carries no check
  -- precisely because that taxonomy grows.
  insight_type          text not null check (insight_type in (
                          'explained_move',
                          'unexplained_move',
                          'predicted_move',
                          'index_move',
                          'scheduled_report',
                          'evergreen'
                        )),

  -- Two arms, because the legal archetype vocabulary DEPENDS ON FORMAT: ten
  -- prose skeletons for the article chain (§8.6), six scene templates for the
  -- video chain (§8.7). A single union would let an article claim V4.
  --
  -- All six video values are permitted even though §8.5 says to build V1 only
  -- and run it a month before adding V2. That is a Settings discipline and a
  -- production decision; freezing it here would make enabling V2 a migration.
  --
  -- Unlike header_template below, this is a check and not a foreign key: the
  -- ten article archetypes are prose skeletons, not Canva templates, so they
  -- are not registry rows and there is nothing to point at.
  archetype             text not null,
  check (
    (format = 'article' and archetype in (
       'price_move_explainer',
       'weekly_market_report',
       'supply_shock_alert',
       'policy_impact_analysis',
       'buyers_timing_guide',
       'naira_nutrition',
       'basket_index_report',
       'seasonal_forecast',
       'brand_autopsy',
       'market_staples_deep_dive'
     ))
    or
    (format = 'video' and archetype in ('V1', 'V2', 'V3', 'V4', 'V5', 'V6'))
  ),

  -- A REAL FOREIGN KEY, not a hardcoded T1–T7 check list, because the template
  -- registry is a real table in this same migration and a check list would go
  -- stale the moment a template is added in Settings.
  --
  -- TWO LIMITS OF THIS FK, both accepted and neither invisible:
  --
  --   1. It does not confirm the template is still ACTIVE. is_active can be
  --      flipped false while items still reference the code, by design —
  --      retiring a template must not orphan work already in flight. Whether
  --      a template is still offered is a Settings read, not an FK.
  --
  --   2. It does not confirm the template is a HEADER template. Nothing here
  --      stops this column pointing at V3, because the registry holds both
  --      pools under one unique template_code. Making that airtight would need
  --      a composite FK against (template_code, format) plus a generated
  --      constant column on this table, which was considered and declined as
  --      more machinery than the failure justifies.
  header_template       text not null references content_templates (template_code)
                          on delete restrict,

  -- The status spine (§8.9). Eight values, and the whole product's control
  -- flow is this column: Draft studio is queued/producing/ready/needs_work,
  -- Publish queue is scheduled/published/dispatching/failed.
  --
  -- ONLY TWO TRANSITIONS ARE HUMAN: promote, which creates the row at
  -- 'queued' (enforced by the INSERT policy below), and schedule, which moves
  -- queued/ready → 'scheduled' (enforced by protect_content_status() below).
  -- Every other transition is machine, performed under service-role.
  status                text not null default 'queued'
                          check (status in (
                            'queued', 'producing', 'ready', 'needs_work',
                            'scheduled', 'published', 'dispatching', 'failed'
                          )),

  -- Which screen this came from. 'manual' is what makes P1.9 satisfiable for a
  -- hand-written article: there is no path onto the public site that does not
  -- pass through this table, so a human writing from scratch creates one of
  -- these rows first.
  source_screen         text not null check (source_screen in (
                          'signal_feed', 'price_radar', 'manual'
                        )),

  -- ---- the brief (§8.4: an insight is a brief, not a draft) ----

  -- NOT NULL and non-blank. A queued item with no stated angle is not a brief,
  -- it is a bookmark — and Draft studio's list has nothing to render for it.
  headline_hypothesis   text not null,
  check (btrim(headline_hypothesis) <> ''),

  angle_note            text,
  check (angle_note is null or btrim(angle_note) <> ''),

  -- No foreign key is possible on an array element in Postgres — the same
  -- constraint 0017 hit and recorded on signals.commodities, and the same
  -- disposition: recorded rather than worked around with a join table §9.3
  -- does not print.
  --
  -- NOT NULL default '{}', and EMPTY IS A REAL STATE, not an absence: a
  -- scheduled_report or an evergreen item legitimately descends from neither a
  -- signal nor an anomaly, and a manual item from neither by definition.
  signal_ids            uuid[] not null default '{}',
  anomaly_ids           uuid[] not null default '{}',

  -- priority = signal_score × severity_multiplier × type_multiplier (§8.4).
  --
  -- FROZEN AT CREATION, never recomputed. Both multipliers are versioned
  -- settings, so a live value would be unexplainable against the figure the
  -- editor saw at promote — the same reasoning that makes signals
  -- .category_weight a frozen copy in 0017. It also keeps Draft studio's sort
  -- order stable: a live priority means editing a multiplier in Settings
  -- silently reshuffles the work queue under whoever is reading it.
  --
  -- No priority_computed_at: the row is created at promote, so created_at IS
  -- the freeze moment and a second timestamp would agree with it forever or
  -- be wrong.
  --
  -- Lower bound only. signal_score is 0–100 but §8.4's two multipliers are
  -- unbounded, so any ceiling here would be invented rather than derived.
  --
  -- The accepted cost: a frozen priority goes stale, and an item queued three
  -- weeks ago may sort above a fresher, better one. Acceptable because
  -- priority orders an internal work queue and never appears in public, and
  -- because created_at makes the staleness visible.
  priority              numeric check (priority >= 0),

  -- ---- format fit (§8.5) ----
  --
  -- Four observable properties, "scored 0–10 and stored so the recommendation
  -- is auditable rather than a black box". Computed once, not recalculated
  -- live — see the NOTED GAP in the header about where they come from.
  punch                 smallint check (punch between 0 and 10),
  explanation_load      smallint check (explanation_load between 0 and 10),
  progression           smallint check (progression between 0 and 10),
  stakes                smallint check (stakes between 0 and 10),

  -- SCALE DISCREPANCY, logged in docs/exceptions.md rather than resolved.
  -- §8.5's formula is a weighted sum of four 0–10 inputs and cannot exceed 10;
  -- its own recommendation rule then tests video_fit >= 75. The bound here
  -- follows the THRESHOLD, because 75 is the number the rule actually compares
  -- against and a bound of 10 would refuse every value that rule accepts. If
  -- the resolution goes the other way this tightens to 10 in a later
  -- migration.
  video_fit             numeric check (video_fit between 0 and 100),

  recommended_format    text check (recommended_format in ('article', 'video')),

  format_overridden     boolean not null default false,

  -- An override always requires a typed reason. Same shape and same blank
  -- guard as the dismissal trio in 0011 and 0017: without the btrim, '' passes
  -- "a reason is required" and the rule is enforced in name only.
  override_reason       text,
  check (
    format_overridden = false
    or (override_reason is not null and btrim(override_reason) <> '')
  ),

  -- ---- shared ----

  -- Both nullable, no shape enforced. They are written by chain passes that do
  -- not exist yet, and a jsonb check now would be a guess at next quarter's
  -- structure. Contrast signals.utility_breakdown in 0017, which IS checked,
  -- because five fixed keys back five rendered bars.
  data_blocks           jsonb,
  verification_log      jsonb,

  -- P5.4 — sources is NOT NULL and carries URLs plus publication dates. "An
  -- item with no sources cannot be written to the table."
  --
  -- NOT NULL ALONE DOES NOT ENFORCE THAT. '[]'::jsonb and '{}'::jsonb both
  -- satisfy NOT NULL and both are an item with no sources. The array check is
  -- what makes P5.4 a rule rather than a description.
  --
  -- THE SHAPE, assumed and documented, deliberately NOT enforced:
  --
  --   [ { "type": "url",
  --       "url": "...", "publisher": "...", "published_at": "...ISO8601...",
  --       "title": "...", "raw_item_id": "...uuid or null..." },
  --     { "type": "price_series",
  --       "commodity_id": "...uuid...",
  --       "observation_ids": ["...uuid..."],
  --       "anomaly_id": "...uuid or null..." } ]
  --
  -- Two entry kinds because P5.4 admits two: a web citation, and the price
  -- series itself ("A price_radar-sourced item satisfies this with its anomaly
  -- and observation IDs — the price series is a source").
  --
  -- ARRAY POSITION IS THE SOURCE INDEX. P5.3 requires a claims array with a
  -- source index per claim, and those indexes point into this array. Entries
  -- are therefore append-only within an item and are NEVER reordered:
  -- reordering silently re-points every claim in verification_log at the
  -- wrong source, with nothing anywhere reporting an error.
  sources               jsonb not null,
  -- Written as a comparison against '[]' rather than with
  -- jsonb_array_length(), which RAISES on a non-array input. Postgres does
  -- not guarantee that AND short-circuits inside a CHECK — subexpression
  -- evaluation order is undefined and the planner may reorder — so
  -- `jsonb_typeof(...) = 'array' and jsonb_array_length(...) > 0` can fail
  -- with a type error instead of a clean constraint violation when the
  -- value is an object. Neither operand below can error on any input.
  check (jsonb_typeof(sources) = 'array' and sources <> '[]'::jsonb),

  scheduled_for         timestamptz,

  -- set null on delete, same pattern as 0011's dismissed_by — and note the
  -- same interaction: while a scheduled row exists the guard below requires
  -- scheduled_by to be present, so deleting the scheduling profile is refused
  -- rather than silently nulled. Deactivate the account instead, which is what
  -- this build does everywhere.
  scheduled_by          uuid references profiles (id) on delete set null,

  published_at          timestamptz,

  no_distribution       boolean not null default false,

  -- PERMANENTLY NULLABLE, and not as a deferral. articles.content_item_id
  -- points here and this points back at articles — a genuine cycle, closed at
  -- the foot of this file. One side must stay nullable for the pair to be
  -- satisfiable at all, and it is this one, because the content item exists
  -- first and the article row does not exist until publish.
  published_article_id  uuid references articles (id) on delete restrict,

  -- on delete restrict, NOT set null, unlike scheduled_by above. Authorship is
  -- this row's provenance and P1.9's trace runs through it; a nulled author
  -- leaves a published article whose origin cannot be established. Deactivate
  -- the profile, never delete it.
  created_by            uuid not null references profiles (id) on delete restrict,

  created_at            timestamptz not null default now(),

  -- ---- article + video page ----
  --
  -- ALL NULLABLE, because none of them exist at 'queued'. §8.6 produces slug,
  -- headline, dek, section and tags at Pass 6 and the header at Pass 7; §8.7
  -- produces the written summary at Step 3 and the render at Step 5. The
  -- allocation check below is what makes them required again before anything
  -- can reach a public status.

  -- No unique constraint here, deliberately. Uniqueness lives on articles.slug
  -- (0013, global). Two queued drafts may legitimately carry the same working
  -- slug while both are still being written; the collision is a publish-time
  -- failure, not a drafting-time one, and refusing the second draft would be
  -- refusing work that has not yet made any claim.
  slug                  text,
  check (slug is null or btrim(slug) <> ''),

  -- P3.1's 72-character limit, enforced here as well as in the editor, exactly
  -- as 0013 enforces it on articles.title. §8.6 Pass 6 states it as a
  -- generation-time constraint: "an item that cannot satisfy those does not
  -- reach Draft studio."
  headline              text,
  check (headline is null or (btrim(headline) <> '' and char_length(headline) <= 72)),

  dek                   text,
  check (dek is null or (btrim(dek) <> '' and char_length(dek) <= 150)),

  body_mdx              text,
  check (body_mdx is null or btrim(body_mdx) <> ''),

  section_id            uuid references sections (id) on delete restrict,

  -- The PRE-PUBLISH list. The tags/article_tags join tables from 0014 are the
  -- published truth: the publish job resolves this array into join rows.
  -- After publication this array is a historical record of what was requested,
  -- not what is live, and the two can legitimately differ if tags are edited
  -- on the article afterwards. Read the join tables, never this, for anything
  -- public-facing.
  tags                  text[],

  -- Non-blank text only, no value list. §8.15a routes items to the Africa page
  -- on country != 'Nigeria', but a country name is exactly the string literal
  -- P0.2 keeps out of code, and 0013 made the same call for the same column.
  country               text,
  check (country is null or (country = btrim(country) and country <> '')),

  seo                   jsonb,
  header_template_vars  jsonb,
  header_render_urls    jsonb,

  -- P7.2 [M] states this column is NOT NULL. IT CANNOT BE, and the conflict is
  -- logged in docs/exceptions.md rather than resolved silently.
  --
  -- P7.2 and §8.9 were written from different assumptions about when this row
  -- comes into existence. §8.9 creates it at promote, before the chain runs;
  -- the header does not exist until Pass 7 or Step 5, so at 'queued' there is
  -- no image for alt text to describe. Satisfying a literal NOT NULL would
  -- mean auto-writing placeholder text into a saved field, which P3.3 forbids
  -- outright and which would describe an image that does not exist.
  --
  -- P7.2's INTENT — no header reaches a reader without alt text, and the
  -- engine does not get to be the loophole — is preserved in full by the
  -- allocation check below, which requires it before any public status. What
  -- is given up is only the always-on column-level constraint.
  header_alt            text,
  check (header_alt is null or btrim(header_alt) <> ''),

  -- ---- video only ----

  script                jsonb,
  scene_count           smallint check (scene_count is null or scene_count > 0),
  runtime_seconds       integer  check (runtime_seconds is null or runtime_seconds > 0),
  video_urls            jsonb,

  caption_file_url      text,
  check (caption_file_url is null or btrim(caption_file_url) <> ''),

  youtube_id            text,
  check (youtube_id is null or btrim(youtube_id) <> ''),

  -- ---- the three status-conditional guards ----

  -- 1. THE SCHEDULING GUARD (P15.1, P5.1). The build plan assigns this to the
  -- triggers batch as an ALTER, which assumed content_items already existed by
  -- then. It is a column-local check on two columns this migration defines, so
  -- it belongs in the CREATE TABLE: adding it later would open a window in
  -- which rows violating P15.1 are storable, for no gain. The build plan's own
  -- auth acceptance test expects this constraint to bite well before that
  -- batch.
  check (
    status <> 'scheduled'
    or (scheduled_by is not null and scheduled_for is not null)
  ),

  -- 2. THE ALLOCATION GUARD (§8.15a, P15.7, P3.2). "A content item with no
  -- public home is a defect, not a draft."
  --
  -- §8.15a describes three enforcement layers — generation, scheduling,
  -- publish. Layers 1 and 3 are application code. THIS IS THE ONLY ONE THE
  -- DATABASE CAN HOLD, and it is the structural half of layer 2: a human
  -- cannot schedule an orphan because an orphan cannot enter 'scheduled'.
  --
  -- Also where header_alt is actually enforced, per the note on that column.
  check (
    status not in ('scheduled', 'published', 'dispatching')
    or (slug is not null
        and section_id is not null
        and headline is not null
        and header_alt is not null)
  ),

  -- 3. THE VIDEO-COMPLETENESS GUARD (§8.7). "A video item is not done when the
  -- MP4 renders. It is done when the MP4 renders and a >=150-word written
  -- summary exists and both pass verification. That is a hard gate in the
  -- chain, not a reminder."
  --
  -- Three of that gate's parts are structural and are here: the script, the
  -- runtime, and the presence of a written summary in body_mdx.
  --
  -- THE WORD COUNT IS DELIBERATELY ABSENT. It is expressible — splitting
  -- body_mdx on whitespace and counting — and it would be wrong: counting
  -- words in MDX counts syntax tokens as words, so the constraint would be
  -- approximately right in a place that reads as exactly right. The real
  -- >=150-word check belongs in the verification pass, which can parse the
  -- document properly.
  --
  -- 'needs_work' and 'failed' are outside the status list on purpose: an item
  -- that failed verification must be storable in exactly the incomplete state
  -- that failed it, or the record of the failure cannot be written down.
  check (
    format <> 'video'
    or status not in ('ready', 'scheduled', 'published', 'dispatching')
    or (script is not null
        and runtime_seconds is not null
        and body_mdx is not null)
  )
);

-- Exactly the index §9.6 names for this table, and nothing added. It serves
-- three reads: Draft studio's status filter, the Publish queue's calendar, and
-- the publish cron's sweep for status = 'scheduled' and scheduled_for <= now().
create index content_items_status_scheduled
  on content_items (status, scheduled_for);

alter table content_items enable row level security;

-- content_items_select_staff: is_staff(), the same call as every other table
-- in this batch and the two before it. §7.2 keeps Analyst off Draft studio and
-- the Publish queue at the ROUTE, when those screens are built. The TABLE
-- stays readable by all staff because the Dashboard counts items in
-- production, and a narrower policy breaks that count for the one role whose
-- only screen is the Dashboard — silently, as a zero rather than an error.
--
-- No anon policy. P9.1's enumerated anon-readable list names none of the four
-- tables in this migration, and nothing here is public: an unpublished item is
-- an editorial intention, and a published one is readable through articles.
create policy content_items_select_staff
  on content_items
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- content_items_insert_promote: AN INSERT IS A PROMOTION, ALWAYS.
--
-- Three clauses, each load-bearing:
--
--   can_promote()          — §7.2's "Promote / approve an insight" row: Admin,
--                            Editor, Contributor; Analyst excluded. NOT
--                            can_author(), despite identical membership today:
--                            0014 established the two as deliberately separate
--                            so a change to one does not silently move the
--                            other, and this is a promote action.
--
--   created_by = auth.uid()— stops a human forging authorship at insert.
--                            Nothing else enforces it, and created_by is
--                            P1.9's provenance trace.
--
--   status = 'queued'      — without it, a human could create a row already
--                            'published' and bypass the entire spine in one
--                            statement. This IS expressible in WITH CHECK
--                            because it constrains only the new row.
create policy content_items_insert_promote
  on content_items
  for insert
  to authenticated
  with check (
    can_promote(auth.uid())
    and created_by = auth.uid()
    and status = 'queued'
  );

-- content_items_update_staff.
--
-- USING encodes §7.2's "Edit a draft — own only" for Contributor: an admin or
-- editor may update any row, a contributor only rows they created.
--
-- WITH CHECK is the contributor scheduling block. Built HERE and not deferred
-- to the triggers batch, on the three-part test 0013 set out: it is same-table
-- and column-local, it depends on nothing that does not exist, and the gap it
-- closes is reachable by ordinary staff doing ordinary work rather than only
-- by roles that bypass RLS. The triggers batch exists for cross-table
-- conditions and locks against RLS-bypassing roles; this is neither.
--
-- WHAT THIS POLICY CANNOT DO, and why the trigger below exists: a WITH CHECK
-- clause validates only the NEW row and cannot reference the old one. So this
-- blocks a contributor from setting 'scheduled' and CANNOT block anyone from
-- setting 'published' directly. Broadening it is not available either —
-- §8.14 requires post-publication editing, so a human saving an edit on a
-- published item must pass a check that sees status = 'published', and the
-- policy cannot tell that from setting it.
create policy content_items_update_staff
  on content_items
  for update
  to authenticated
  using (
    is_admin_or_editor(auth.uid())
    or (can_promote(auth.uid()) and created_by = auth.uid())
  )
  with check (
    status <> 'scheduled'
    or is_admin_or_editor(auth.uid())
  );

-- No delete policy, ever. Default deny. A content item is the provenance trace
-- under every published article (P1.9) and the record of every editorial
-- decision that did not result in one. Deletion is not a feature (P1.4).

-- protect_content_status() — the half the RLS policy above structurally cannot
-- express.
--
-- Only two transitions are human (§8.9): promote, which creates the row at
-- 'queued' and is enforced by the INSERT policy, and schedule, which moves
-- queued/ready → 'scheduled'. The other six statuses are machine-only.
--
-- NO-OPS ENTIRELY UNDER SERVICE-ROLE. auth.uid() is null there, so every
-- machine transition — producing, ready, needs_work, published, dispatching,
-- failed — passes through untouched. That is the intent: this guard constrains
-- humans and leaves the chain runner and the publish cron alone. It is
-- deliberately the opposite instrument to 0013's provenance trigger, which
-- exists precisely to bind the cron.
--
-- ASSUMPTION, and it deserves an explicit test at the auth stage rather than
-- trust: that auth.uid() returns null under service-role. The whole guard
-- rests on it. An anon session cannot reach this trigger at all, having no
-- UPDATE policy on the table.
--
-- NOT the full eight-state transition graph. Refusing queued → published for
-- the MACHINE constrains service-role and needs the publish cron's real
-- behaviour to be known; that stays in the triggers batch. The HUMAN half is
-- fully specified today, so it is written today.
create function protect_content_status() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'scheduled' then
      raise exception
        'status % is set by the engine, not by a person; the only human transition is to scheduled (P5.1, §8.9)',
        new.status;
    end if;

    if old.status not in ('queued', 'ready') then
      raise exception
        'an item can only be scheduled from queued or ready, not from %', old.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger content_items_protect_status
  before update on content_items
  for each row
  execute function protect_content_status();


-- ============================================================================
-- content_revisions — the chain's audit trail (§9.3, §8.6, §8.7)
-- ============================================================================
--
-- One row per pass, per item. A pure debug and audit log: nothing downstream
-- reads this column to make a decision, and no logic branches on it. That is
-- what makes the light constraint below the right one.

create table content_revisions (
  id              uuid primary key default extensions.uuid_generate_v4(),

  content_item_id uuid not null references content_items (id) on delete restrict,

  -- The union of both chains' pass names, snake_cased from §8.6 and §8.7.
  -- Thirteen values: eight article passes plus seven video steps, less
  -- 'brief_assembly' and 'verification', which both chains genuinely share.
  --
  -- WHAT THIS CHECK DELIBERATELY DOES NOT CATCH: the legal vocabulary really
  -- depends on the parent's format — 'captions' is meaningless on an article
  -- and 'voice' is meaningless on a video — and a union permits both. Making
  -- it exact would need format denormalised onto this table plus a composite
  -- foreign key against content_items (id, format) to stop that copy drifting.
  -- That was considered and declined: the consequence of a mislabelled row is
  -- one confusing line in a log a human reads while debugging, never a wrong
  -- decision by any code, because nothing reads this column programmatically.
  -- Recorded so it is not "fixed" later by adding structure that was weighed
  -- and turned down.
  --
  -- Note 'render' (video Step 5) and 'header_render' (article Pass 7) are
  -- distinct values on purpose: the video chain renders the MP4 and the header
  -- in one step, the article chain renders only the header.
  step            text not null check (step in (
                    'brief_assembly',
                    'outline',
                    'data_binding',
                    'draft',
                    'verification',
                    'voice',
                    'packaging',
                    'header_render',
                    'template_select',
                    'script',
                    'written_summary',
                    'render',
                    'captions'
                  )),

  -- NOT NULL: a revision recording nothing is not a revision. No shape
  -- enforced — each pass emits a different structure by design.
  payload         jsonb not null,

  -- Doubles as this row's only timestamp, and chain order within a run is
  -- read from it. No step_index column: a second column that must agree with
  -- step is the drift problem one level down, and chain position is derivable
  -- from the name.
  --
  -- No updated_at. An immutable log, same posture as raw_items in 0017: a row
  -- that could be edited is a row whose relationship to the pass that produced
  -- it is no longer verifiable.
  created_at      timestamptz not null default now()
);

-- Beyond §9.6, which names no index for this table. Justified the same way
-- 0011 and 0017 justified their additions: the editor's revision panel reads
-- one item's history in order, and that read has no other access path.
create index content_revisions_item_created
  on content_revisions (content_item_id, created_at);

alter table content_revisions enable row level security;

create policy content_revisions_select_staff
  on content_revisions
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- No insert, update or delete policy at all — none, for any role. Chain passes
-- write under service-role, which bypasses RLS and is not a grant made here.
-- Same posture as raw_items, signals, price_anomalies and basket_snapshots:
-- rows are produced, never authored. A hand-written revision would be a record
-- of a pass that never ran.


-- ============================================================================
-- format_overrides — the override log (§9.3, §8.11)
-- ============================================================================
--
-- §8.11: "Overriding the recommendation requires a reason and writes a
-- format_overrides row, which is how the heuristics get corrected over time."
--
-- HOW THIS RELATES TO content_items.format_overridden / override_reason, since
-- the two look redundant and are not:
--
--   * The two COLUMNS describe the CURRENT STATE of one item: is its format an
--     override right now, and why. Cheap to filter and display in Draft studio
--     without a join.
--
--   * This TABLE is the APPEND-ONLY LOG, and it carries two facts the columns
--     structurally cannot: WHO (actor) and WHEN (created_at).
--
-- They would collapse into one only if a format were overridden at most once
-- per item and never revisited. Nothing says that: format is chosen at promote
-- (§8.11) and the item then sits in Draft studio where it can be reconsidered.
-- Under a second override this table holds two rows and the columns hold the
-- latest — a different fact, not a duplicate one. And retuning the heuristics
-- needs the whole history with attribution, which is the stated purpose above.
--
-- CONTRACT, not enforced here: a row exists in this table if and only if
-- content_items.format_overridden is true, and override_reason mirrors the
-- latest row's reason. That is a cross-table condition, which is what the
-- triggers batch is for — the same line 0013 drew between what it built
-- immediately and what it deferred.

create table format_overrides (
  id              uuid primary key default extensions.uuid_generate_v4(),

  content_item_id uuid not null references content_items (id) on delete restrict,

  recommended     text not null check (recommended in ('article', 'video')),
  chosen          text not null check (chosen in ('article', 'video')),

  -- A row where these match is not an override — it is a record of agreeing
  -- with the recommendation, which is the default and needs no row. Storing
  -- one would corrupt the retuning signal this table exists to produce, by
  -- counting a concurrence as a correction.
  check (recommended <> chosen),

  reason          text not null,
  check (btrim(reason) <> ''),

  -- on delete restrict, NOT set null — deliberately unlike 0011's dismissed_by.
  -- There, attribution accompanies the reason; here attribution IS the payload:
  -- a row with a null actor cannot inform a retuning, because "somebody
  -- overrode this" is not evidence about anybody's judgement. Deactivate the
  -- profile instead, which is what this build does everywhere.
  actor           uuid not null references profiles (id) on delete restrict,

  created_at      timestamptz not null default now()

  -- No updated_at. Append-only: a corrected override is a new row, because the
  -- fact being recorded is "this decision was made at this moment", and that
  -- never becomes untrue.
);

-- No index. §9.6 names none, and the two reads — one item's override history,
-- and a full-table scan when retuning — need nothing beyond the foreign key.

alter table format_overrides enable row level security;

create policy format_overrides_select_staff
  on format_overrides
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- can_promote(): format choice happens at promote (§8.11) and in Draft studio,
-- both of which §7.2 grants to Admin, Editor and Contributor. The same matrix
-- row as the promote functions in 0011 and 0017, so the same shared function —
-- this is the literal same permission, not a coincidentally-matching one.
create policy format_overrides_insert_promote
  on format_overrides
  for insert
  to authenticated
  with check (can_promote(auth.uid()));

-- No update policy and no delete policy. An append-only log of decisions
-- actually taken; editing one would rewrite the evidence the heuristics are
-- retuned against.


-- ============================================================================
-- THE THREE ALTERATIONS — closing two of the four deferred references
-- ============================================================================
--
-- docs/exceptions.md records four places referencing content_items without a
-- foreign key, all deferred because this table did not exist. Two close here.
-- Two do not, and the reason is recorded below rather than left as an omission.

-- (1) articles.content_item_id — the foreign key P1.9 always implied.
alter table articles
  add constraint articles_content_item_fk
  foreign key (content_item_id) references content_items (id) on delete restrict;

-- P1.9 states this column is NOT NULL outright. It is applied now because the
-- table is empty — no seed.sql exists and nothing has ever inserted into
-- articles — so the tightening is free today and gets monotonically more
-- expensive from here. It converts P1.9 from an aspiration into structure.
--
-- CONSEQUENCE FOR 0013'S TRIGGER, recorded so it is not later read as a
-- puzzle: protect_article_provenance() deliberately permits null → value on
-- this column, with a comment explaining that the allowance exists so the gap
-- could be backfilled once content_items landed. With NOT NULL applied there
-- is no null left to backfill from, so that branch is now unreachable. It is
-- harmless and stays — rewriting an applied migration's function to remove a
-- dead branch would be a larger change than the branch is worth.
alter table articles
  alter column content_item_id set not null;

-- (3) videos.imported_content_item_id — Draft studio's Import as content item.
-- 0016 already enforces one video per content item with a partial unique
-- index; this is what finally checks that the uuid resolves to anything.
alter table videos
  add constraint videos_content_item_fk
  foreign key (imported_content_item_id) references content_items (id) on delete restrict;

-- (2) and (4) — promote_price_anomaly() and promote_signal() — ARE NOT
-- REWRITTEN HERE, and this is a decision rather than an oversight.
--
-- Both would need to create a content_items row, which requires format,
-- insight_type, archetype, header_template, a non-empty sources array,
-- headline_hypothesis, and the four format-fit integers. insight_type is
-- derivable from what matched; format arrives from the split button. But
-- punch, explanation_load, progression, stakes and video_fit have no
-- established source — see the NOTED GAP in this file's header. Writing these
-- functions now would mean inventing where those five numbers come from.
--
-- The consolidated exception therefore shrinks from four items to two rather
-- than closing. Both remaining items are fixed forward in one later migration,
-- once the fusion question is settled, collapsing each promote into a single
-- transaction.


-- ============================================================================
-- CONTRACTS — stated here because the schema cannot hold them
-- ============================================================================
--
-- 1. THE PUBLISH CRON'S ORDERING, forced by the FK cycle between this table
--    and articles. In order, and it is not optional:
--
--      a. The content item already exists, published_article_id null.
--      b. Insert the articles row with content_item_id set.
--      c. Update content_items.published_article_id to point at it.
--
--    Wrong ordering deadlocks rather than failing cleanly, which is why it is
--    written down instead of left to be discovered at 3am. This is also why
--    published_article_id can never be NOT NULL.
--
--    Before any of that: the allocation assertion (P15.7, §8.15a layer 3). An
--    item missing slug, section, headline or header_alt sets status = 'failed'
--    with the missing field named, and NO articles row is written. The check
--    on this table stops such an item reaching 'scheduled' at all; the cron is
--    the last assertion, not the first.
--
-- 2. format_overrides ↔ format_overridden CONSISTENCY. A row exists in
--    format_overrides if and only if format_overridden is true, and
--    override_reason mirrors the latest row's reason. Cross-table, so it
--    belongs with the triggers batch.
--
-- 3. THE CHAIN RUNNER WRITES ONE content_revisions ROW PER PASS, and never
--    rewrites one. A re-run of a pass appends; it does not replace. The table
--    has no update policy, so this binds anything using a session — but the
--    runner uses service-role, where it is a contract and not a constraint.
--
-- 4. sources ENTRIES ARE APPEND-ONLY AND NEVER REORDERED, because array
--    position is the source index P5.3's claims array points into. Adding a
--    source appends. Removing one is not available: the claims that cite it
--    would silently re-point at whatever slid into its index.
