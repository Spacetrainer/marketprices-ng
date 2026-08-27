-- 0019_content_performance.sql
-- MarketPrices — Stage 2, migration batch 8
--
-- content_performance (§9.4): what happened to a piece after it went out. One
-- row per content item, per platform, per day described, per reporting source.
-- The Dashboard's Zone 3 (website engagement) and Zone 4 (the feedback loop)
-- are both built on this table and on nothing else.
--
-- DELIBERATELY SPLIT FROM THE social_content_queue CHANGE. The build plan
-- groups both into one `0017_distribution.sql`. P10.8 says a migration on a
-- live table "is its own PR", and in this repo a migration file IS the PR unit
-- — one file, one commit, one deploy, one rollback. Bundling a new empty table
-- with a change to a table a production consumer reads would give the risky
-- half no independent rollback and would force the safe half to inherit the
-- risky half's deploy gate for nothing.
--
-- THE QUEUE CHANGE IS ALSO BLOCKED, which is why it is not merely in another
-- file but absent from the chain entirely: social_content_queue DOES NOT EXIST
-- in this project. Verified three ways — types/database.ts after 0018 lists 25
-- tables and it is not among them; a catalogue listing of the public schema
-- returns the same 25, all of them from migrations 0002–0018; and a re-check
-- across nine further candidate schemas finds nothing. The rebuild started on
-- a Supabase project created 2026-08-13 and the live Agent 3 pipeline is
-- somewhere else. §9.4's "EXISTING LIVE TABLE... do not recreate" and
-- CLAUDE.md's "LIVE table used by Agent 3 in production" were both written
-- before that move. Recorded in docs/exceptions.md; nothing is drafted or
-- numbered for that table until it is resolved.
--
-- P11 AND P18 ARE THE WHOLE DESIGN OF THIS TABLE, not decoration on it:
--
--   P11.1 — metrics are real or absent. No seeded, inflated or estimated
--           figures, ever. That is why every metric column below is nullable
--           with NO DEFAULT.
--   P11.3 — zero is displayed as zero. That is why null and 0 are different
--           facts here and neither may stand in for the other.
--   P18.1 — never sum a metric across platforms. `platform` is a hard
--           partition, part of the uniqueness key, never a column to aggregate
--           away. No "total reach" figure exists anywhere in this product.
--   P18.4 — metric lag is displayed. Search Console lags 2–3 days, Metricool
--           up to 24h, and collected_for_date is what makes that expressible.
--
-- NOTHING HERE IS PUBLIC. No anon policy, no public read path. Engagement data
-- is an internal instrument.

create table content_performance (
  id                  uuid primary key default extensions.uuid_generate_v4(),

  -- on delete restrict, consistent with every other reference to this table.
  -- A performance row whose content item vanished is a measurement of nothing.
  content_item_id     uuid not null references content_items (id) on delete restrict,

  -- A FROZEN COPY of content_items.format, denormalised on purpose. P18.3
  -- requires three separate scoreboards — articles on sessions, read time and
  -- search impressions; video on views, watch-through and follows; headers on
  -- impressions, saves and shares — so every Dashboard read filters on format,
  -- and without the copy every one of them joins.
  --
  -- Checked against the same two values as content_items.format and
  -- articles.type: that vocabulary is closed, unlike platform and
  -- source_system below.
  --
  -- CONTRACT: the collector copies this from the parent at collection time and
  -- it must agree with it. Drift is possible in principle and near-impossible
  -- in practice, because an item's format is settled before it can have any
  -- performance to measure at all.
  format              text not null check (format in ('article', 'video')),

  -- NO CHECK, deliberately, and this is the signals.category precedent rather
  -- than the sources.trust_tier one. §8.15 names four social platforms today
  -- (LinkedIn, X, Facebook, Instagram) alongside the site itself and YouTube,
  -- and that list GROWS: adding TikTok is a business decision, not a schema
  -- event. A check here would make the fifth platform a migration and a
  -- deployment.
  --
  -- Non-blank only. '' is not a platform, and a row that cannot say where it
  -- was measured cannot be compared to anything — which under P18.1 is the
  -- only thing a metric is ever allowed to do.
  platform            text not null,
  check (btrim(platform) <> ''),

  -- Which reporting system produced this row (§8.10's metric-sources table:
  -- first-party site_events plus Vercel Analytics, Google Search Console,
  -- Metricool, the YouTube Data API). NO CHECK, for the same reason as
  -- platform: swapping a provider is an operational decision.
  --
  -- It is part of the uniqueness key below rather than an attribute, because
  -- two sources legitimately report the same item, platform and day
  -- differently — §8.10 notes each platform defines a "view" differently, and
  -- YouTube and Metricool both cover the same video. Collapsing them would let
  -- one silently overwrite the other, which is P18.1's error in a second form:
  -- conflating measurements that are not the same unit.
  source_system       text not null,
  check (btrim(source_system) <> ''),

  -- THE DAY THE METRIC DESCRIBES, never the day it was fetched. The two differ
  -- by exactly the lag in §8.10's table: a Search Console row written today
  -- describes a day two or three days ago. Recording the fetch day here
  -- instead would make every lagging source look like it reported late rather
  -- than reporting about earlier — and would make P18.4's freshness statement
  -- unbuildable.
  --
  -- NO CHECK THAT THIS IS NOT IN THE FUTURE, and not for want of wanting one:
  -- CHECK expressions must be IMMUTABLE and current_date is STABLE, so
  -- Postgres refuses `check (collected_for_date <= current_date)` outright.
  -- Recorded so the absence reads as a limit of the tool rather than an
  -- oversight, and so nobody tries it and concludes the database is broken.
  -- The rule belongs in the collector.
  collected_for_date  date not null,

  -- THE COMPANION TO collected_for_date, and the pair is the point: one says
  -- which day the figure describes, the other says when we last went and
  -- asked. Not in §9.4's printed column list, added on the same reasoning that
  -- gives sources.last_polled_at and last_error their place in 0017 — without
  -- it, a source that is genuinely lagging and a collector that has silently
  -- stopped running look identical from the data.
  --
  -- Both failures present the same way: the newest row for a source describes
  -- three days ago. With only collected_for_date, that reads as "Search
  -- Console lags three days", which is true and expected (§8.10) — and it
  -- reads exactly the same way when the job has been dead for three days.
  -- P18.4 requires each module to state its own freshness, and freshness is
  -- answerable from collected_for_date alone; DISTINGUISHING LAG FROM FAILURE
  -- is not, and that is the one this column buys.
  --
  -- CONTRACT, and it is the same shape as 0017's poller contract: the
  -- collector writes this on EVERY successful fetch, including a fetch that
  -- revises nothing. "We asked and the numbers had not changed" is information;
  -- a collected_at that only moves when a value moves cannot distinguish a
  -- quiet day from a dead job, which is the failure this column exists to
  -- prevent, reintroduced one layer up.
  --
  -- DELIBERATELY NOT IN THE UNIQUENESS KEY BELOW. It changes on every refresh,
  -- so including it would make every re-fetch a new row and defeat the key
  -- entirely — the exact duplicate-accumulation the key exists to stop.
  collected_at        timestamptz not null default now(),

  -- ---- the metrics ----
  --
  -- ALL NULLABLE, ALL WITHOUT DEFAULTS, and that is P11.1 expressed in DDL:
  -- "view counts, subscriber counts, read times and engagement figures are
  -- real or absent."
  --
  -- NULL AND ZERO ARE DIFFERENT FACTS HERE AND NEITHER MAY STAND IN FOR THE
  -- OTHER. This is the single rule that matters most in this table:
  --
  --   null = this source did not report this metric for this row.
  --   0    = this source reported it and the answer was genuinely zero,
  --          which P11.3 requires be displayed as zero rather than hidden.
  --
  -- A default of 0 would convert every unreported metric into a claim that
  -- nothing happened, which is the exact failure P11.1 names. A NOT NULL would
  -- force the collector to invent one.
  --
  -- MOST COLUMNS ARE NULL ON ANY GIVEN ROW, BY DESIGN AND NOT BY GAP. A
  -- Search Console row populates search_impressions and nothing else. A
  -- Metricool row populates impressions, clicks, saves and shares. A row with
  -- one populated column is a complete row, not a partial one.
  --
  -- Lower bound only on the counts. There is no upper bound to assert: these
  -- are counts of real events and any ceiling would be invented.
  impressions         integer check (impressions >= 0),
  views               integer check (views >= 0),
  sessions            integer check (sessions >= 0),
  saves               integer check (saves >= 0),
  shares              integer check (shares >= 0),
  clicks              integer check (clicks >= 0),
  search_impressions  integer check (search_impressions >= 0),
  follows             integer check (follows >= 0),

  -- Renamed from §9.4's printed `avg_time`, the same call and the same
  -- reasoning as 0016's `duration` → `duration_seconds`: the spec gives a bare
  -- untyped name, which is exactly how an untyped average time becomes seconds
  -- in one reader's head, minutes in another's and a Postgres interval in a
  -- third's. Naming the unit ends the ambiguity once, at the schema, and the
  -- conversion happens at the collector boundary.
  --
  -- SECONDS. §8.10 caps average read time at ten minutes "so an abandoned tab
  -- cannot inflate it" — that cap is a collector rule and a versioned setting,
  -- NOT a constraint here, so the raw figure stays representable.
  avg_time_seconds    numeric check (avg_time_seconds >= 0),

  -- FRACTIONS, 0–1, not percentages. 0.8 means eighty per cent.
  --
  -- Stated here because §8.10 writes "read completion at 80% depth", which
  -- reads as a percentage, and the build has already had one scale ambiguity
  -- logged over decision_utility. The 0–1 form matches the existing score
  -- family across signals, and the formatting layer multiplies for display —
  -- the same direction of conversion used everywhere else in this schema.
  --
  -- NO CROSS-CHECK against format, deliberately. It is tempting to require
  -- watch_through null on articles and read_completion null on video, and it
  -- would be wrong: §8.7 requires every video item to carry a >=150-word
  -- written summary on its own page, so a video item has real read-completion
  -- data for that page as well as watch-through for the clip. Both columns are
  -- legitimately populated on one video row.
  read_completion     numeric check (read_completion between 0 and 1),
  watch_through       numeric check (watch_through between 0 and 1)
);

-- THE REFRESH KEY, and the target of every collector's upsert.
--
-- Four columns, because a measurement is identified by what was measured,
-- where, for which day, and by whom. §9.4 prints no key for this table; this
-- one is required by how the collectors actually run.
--
-- The jobs are pull-based, repeating and LAGGING (§8.10): site analytics
-- hourly, Search Console daily behind 2–3 days, Metricool daily behind up to
-- 24h, video platform data daily. A lagging source re-fetches the same
-- (item, platform, day) on later runs WITH BETTER DATA. Without this key the
-- table accumulates three or four rows for one day and every read has to pick
-- "the latest" — a rule nothing enforces and every future query can get wrong.
--
-- That failure is worse here than it looks. P18.1 forbids summing across
-- platforms, and the natural bug from duplicate rows is precisely a SUM that
-- double-counts. This key makes the wrong query impossible rather than merely
-- discouraged.
--
-- format is NOT in the key: it is an attribute of the content item, not a
-- dimension of the measurement. In the key, a corrected format would produce a
-- second row for the same reading.
create unique index content_performance_measurement_key
  on content_performance (content_item_id, platform, collected_for_date, source_system);

-- No second index. §9.6 names none for this table, and the key above already
-- leads with content_item_id, which covers per-item reads. The Dashboard's
-- date-range reads would want (collected_for_date), but §9.4 puts daily_rollups
-- in the build precisely so the Dashboard "never scans" raw tables — the
-- pre-aggregation is the intended access path. If the rollup job turns out to
-- scan this table directly, that is the moment to add the index, with the read
-- that justifies it named.

alter table content_performance enable row level security;

-- content_performance_select_staff: is_staff(), the same call as every table
-- since 0011, and here it is the least optional it has ever been. The
-- Dashboard is the ONLY screen an Analyst sees (§7.2), and Zones 3 and 4 are
-- built entirely on this table — a narrower policy would empty the one screen
-- that role exists to read, silently, as zeroes rather than as an error.
--
-- No anon policy. P9.1's enumerated anon-readable list does not name this
-- table, and engagement data is an internal instrument, not a public figure.
create policy content_performance_select_staff
  on content_performance
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- NO INSERT, UPDATE OR DELETE POLICY — none, for any role, from the moment
-- this migration lands. RLS enabled with no matching policy is default deny.
--
-- Collectors write under service-role, which bypasses RLS and is not a grant
-- made here. Same posture as raw_items, signals, price_anomalies,
-- basket_snapshots and content_revisions: rows are collected, never authored.
--
-- A hand-inserted performance row would be a fabricated metric, which is the
-- one thing P11.1 forbids in the strongest terms the protocol uses. The
-- absence of an insert policy is that clause expressed as a grant.
--
-- No delete policy, ever (P1.4). A metric that turns out to be embarrassing is
-- still a metric.

-- THE REFRESH CONTRACT, for whoever writes the collectors.
--
-- Upsert on content_performance_measurement_key. On conflict, update ONLY the
-- metric columns — impressions, views, sessions, avg_time_seconds,
-- read_completion, watch_through, saves, shares, clicks, search_impressions,
-- follows — plus format and collected_at. Never insert a duplicate, never
-- delete-and-reinsert.
--
-- collected_at is stamped on EVERY successful fetch, including one that
-- revises no metric. See the contract on that column: a timestamp that moves
-- only when a value moves cannot tell a quiet day from a dead collector.
--
-- This is a contract on the collector's write, not something the schema
-- enforces: the collectors run under service-role and RLS does not constrain
-- them. It matters because the lagging sources exist specifically to revise
-- earlier days, and a collector that inserted instead of upserting would turn
-- every revision into a duplicate — the exact condition the key exists to
-- prevent, reintroduced one layer up.
--
-- ONE COLUMN PER SOURCE, NOT ONE ROW PER ITEM. A collector writes only the
-- metrics its own source actually reported and leaves every other column
-- untouched at null. Filling unreported columns with 0 to make a row look
-- complete is a P11.1 violation, and it is the most likely way this table gets
-- corrupted in practice.
