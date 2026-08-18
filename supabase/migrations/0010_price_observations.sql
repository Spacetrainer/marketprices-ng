-- 0010_price_observations.sql
-- MarketPrices — Stage 2, migration batch 3
--
-- price_observations (§9.2): THE PUBLISHED SERIES. One price per commodity,
-- per ISO week, per tier (P1.7) — univariate by construction. This is the
-- only price table the public site, the ticker, the basket and the engine
-- ever read, and the engine reads it SELECT-only (P5.2).
--
-- Append-only (P1.3): no UPDATE policy and no DELETE policy exist, so both
-- are default-denied for every signed-in role. A correction is a NEW row
-- carrying corrects_id, never an edit.
--
-- The rest of the append-only lock — the REVOKE and the BEFORE UPDATE OR
-- DELETE trigger that holds when RLS is bypassed — lands in 0021_triggers
-- .sql as one reviewed batch, not here. Until 0021 is applied, a role that
-- bypasses RLS (service-role, psql) is NOT yet blocked from editing a row.
--
-- Every row traces to an approved price_submissions row (P1.1). Manual and
-- phone-in entry is not an exception — it arrives as a submission with
-- source = 'manual' and is approved like any other.
--
-- No created_at/updated_at pair, same call as 0009: published_at (when this
-- row entered the series) and superseded_at (when a correction retired it)
-- are this row's only two moments, and the second is the only write that
-- ever touches an existing row.

create table price_observations (
  id                    uuid primary key default extensions.uuid_generate_v4(),

  commodity_id          uuid not null references commodities (id) on delete restrict,
  unit_id               uuid not null references units (id) on delete restrict,

  tier                  text not null check (tier in ('retail', 'wholesale')),

  -- Absolute ISO period, never relative (P2.7). Carried across from the
  -- submission, which derived it once from collected_on via lib/weeks.ts.
  iso_year              integer not null check (iso_year >= 2020),
  iso_week              smallint not null check (iso_week between 1 and 53),

  -- The Monday of (iso_year, iso_week), computed by lib/weeks.ts and stored
  -- so the week label renders without arithmetic at read time. The three
  -- checks below make it a VERIFIABLE derivation rather than a stored
  -- assumption (P0.2/P2.2): the database re-derives the ISO year, the ISO
  -- week and the weekday from the date itself and rejects any row where the
  -- stored week and the stored date disagree. This is the one place ISO week
  -- arithmetic is allowed to exist outside lib/weeks.ts, and it only ever
  -- checks — it never computes a value anything reads.
  week_start_date       date not null,
  check (extract(isodow  from week_start_date) = 1),
  check (extract(isoyear from week_start_date) = iso_year),
  check (extract(week    from week_start_date) = iso_week),

  -- 0 is a legitimate published price (given away, promotional) and is kept;
  -- a negative price is a data-entry error and is blocked outright. Same
  -- call as price_submissions.price.
  price                 numeric not null check (price >= 0),

  currency              text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),

  -- PROVENANCE ONLY (P1.8). This column may be displayed on every price, at
  -- every breakpoint (P1.6). It may NOT become a filter dimension, a chart
  -- series, a compared table column or an input to any aggregate. There is
  -- no market-versus-market comparison in this product.
  collected_at_site_id  uuid not null references collection_sites (id) on delete restrict,

  -- The date the collector actually stood in the market. Must fall inside
  -- the ISO week this row is filed under — a price collected on the Tuesday
  -- cannot be published as the previous week's figure.
  collected_on          date not null,
  check (collected_on between week_start_date and week_start_date + 6),

  -- P1.1: the one door in. NOT NULL with a foreign key — there is no path
  -- into the published series that does not pass through a submission.
  --
  -- UNIQUE, deliberately: a submission is spent the moment it becomes an
  -- observation. No submission may ever back more than one row here — not a
  -- second original, and not a later correction of the first. Every
  -- correction requires its own fresh price_submissions row, reviewed and
  -- approved like any other entry, so that a corrected figure has exactly
  -- as much provenance as the figure it replaces.
  submission_id         uuid not null unique references price_submissions (id) on delete restrict,

  published_at          timestamptz not null default now(),

  -- Which channel the underlying submission arrived through. Mirrors
  -- price_submissions.source; drives provenance copy, nothing else.
  source                text not null default 'form' check (source in ('form', 'manual')),

  -- Correction chain (P1.3). A correction points at the row it replaces;
  -- the replaced row carries superseded_at. Null corrects_id = an original
  -- observation. Null superseded_at = this row is the live figure for its
  -- series key.
  --
  -- UNIQUE: a given row is corrected at most once. A correction of a
  -- correction points at the correction, forming a chain, never a fan-out —
  -- two rows both claiming to correct the same original would leave the
  -- public row-expansion history unable to say which figure replaced which.
  -- (Nulls are distinct in Postgres, so this does not limit originals.)
  --
  -- on delete restrict, like every FK here: nothing is ever deleted from
  -- this table (P1.4), and the chain must stay resolvable regardless.
  corrects_id           uuid unique references price_observations (id) on delete restrict,
  check (corrects_id is distinct from id),

  superseded_at         timestamptz,

  -- P2.5: FX is a quoted fact, not a background conversion. Both columns
  -- are stamped together at conversion time or neither is set — a rate
  -- without its timestamp is unciteable, and a timestamp without its rate
  -- is nothing. Same both-or-neither pattern as reviewed_by/reviewed_at in
  -- 0009. Never convert at render time using today's rate.
  fx_rate               numeric check (fx_rate > 0),
  fx_fetched_at         timestamptz,
  check ((fx_rate is null) = (fx_fetched_at is null))
);

-- P1.7 — one price per commodity, per ISO week, per tier. Partial, because
-- a superseded row keeps its series key forever: the constraint is that at
-- most one LIVE row exists per key, which is exactly what the reader sees.
-- A second observation for the same key is a correction (P1.3), not an
-- additional data point, and the system offers no way to average two.
create unique index price_observations_live_series_key
  on price_observations (commodity_id, iso_year, iso_week, tier)
  where superseded_at is null;

-- §9.6 — every lookup and every sparkline. Commodity + tier narrows to a
-- series, then the ISO period walks it backwards.
create index price_observations_series_lookup
  on price_observations (commodity_id, tier, iso_year, iso_week desc);

alter table price_observations enable row level security;

-- price_observations_select_public: anyone, signed in or not, can read the
-- whole table — superseded rows included (P9.1). The public row-expansion
-- history shows corrections AS corrections, which requires that the retired
-- figure stay readable. A price platform that quietly drops what it used to
-- say cannot be audited. Collector PII is not reachable from here: this
-- table carries no collector_id, only the submission it came from (P9.2).
create policy price_observations_select_public
  on price_observations
  for select
  to anon, authenticated
  using (true);

-- price_observations_insert_staff: an admin or editor publishes an approved
-- submission into the series, and inserts corrections. This is the only
-- write any signed-in role has on this table.
create policy price_observations_insert_staff
  on price_observations
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- No update policy and no delete policy: RLS enabled + zero matching
-- policies = default deny (P1.3, P1.4). Prices are append-only. The single
-- legitimate write to an existing row — stamping superseded_at — goes
-- through supersede_price_observation() below, which is security definer
-- and therefore not governed by these policies. The database-level lock
-- against a bypassing role arrives in 0021_triggers.sql.

-- supersede_price_observation() — the SECURITY DEFINER path named in P1.3,
-- and the only way superseded_at is ever set. Single-purpose on purpose: it
-- retires a row and computes nothing. It does NOT derive a week, a date or
-- a price, because ISO week arithmetic lives in lib/weeks.ts or nowhere.
--
-- CALL ORDER, and it is not optional: supersede the original FIRST, then
-- insert the correction, both inside ONE transaction. The live-series
-- unique index above refuses a second un-superseded row for the same
-- commodity/week/tier, so inserting the correction first cannot work; and a
-- supersede that is not followed by an insert leaves the series with a hole
-- rather than a correction, which is why the transaction is mandatory.
--
-- Restricted to admin and editor: security definer means this function runs
-- past RLS, so it checks the caller itself rather than trusting the grant.
create function supersede_price_observation(observation_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_editor(auth.uid()) then
    raise exception 'only an admin or editor may supersede a price observation';
  end if;

  update price_observations
     set superseded_at = now()
   where id = observation_id
     and superseded_at is null;

  if not found then
    raise exception 'price observation % does not exist or is already superseded', observation_id;
  end if;
end;
$$;
