-- 0011_price_anomalies.sql
-- MarketPrices — Stage 2, migration batch 3
--
-- price_anomalies (§9.2): THE WEEKLY LEDGER. One row per tracked commodity,
-- per tier, per ISO week, per comparison window — including the weeks where
-- nothing happened. A `normal` row is not a failed anomaly, it is the record
-- that the week was rated and found unremarkable (§6.4, "weekly report
-- material"). The radar's anomaly table and the Dashboard's critical count
-- are both filtered views of this one ledger.
--
-- DERIVED DATA, unlike everything else in the price spine. Every figure here
-- is computed by /api/cron/price-intel from price_observations — on price
-- approval and on a nightly sweep — and recomputed whenever the underlying
-- observations change (a correction under P1.3 can re-rate a settled week).
-- That is why this table is absent from P1.4's no-hard-delete list: it holds
-- no human input that could be lost. The ONE exception is the state block at
-- the bottom of the column list, which is a human decision and survives
-- every recompute — see the upsert contract below.
--
-- NO THRESHOLD APPEARS IN THIS FILE. The z and WoW bands that decide which
-- severity label a row gets are versioned settings in editorial_rules (P16.1)
-- and are read by lib/anomalies.ts at compute time. The only severity rule
-- here is the vocabulary — which four words are legal — so that changing a
-- band never touches this migration and never touches a deployment.
--
-- Renamed from §9.2's printed column list: `window` → `comparison_window`.
-- WINDOW is a reserved keyword in Postgres and cannot be an unquoted column
-- name; quoting it forever, in every query and in generated types, is worse
-- than a one-word rename recorded here.

create table price_anomalies (
  id                  uuid primary key default extensions.uuid_generate_v4(),

  commodity_id        uuid not null references commodities (id) on delete restrict,

  tier                text not null check (tier in ('retail', 'wholesale')),

  -- The ISO period this rating covers. No week_start_date here, unlike
  -- price_observations: this row is computed FROM observations that already
  -- carry a verified week, so there is no second date to cross-check it
  -- against and nothing for a derivation check to bite on.
  iso_year            integer not null check (iso_year >= 2020),
  iso_week            smallint not null check (iso_week between 1 and 53),

  -- Which delta pct_change is a change OVER (§6.4: wow, mom, yoy, ytd).
  -- Part of the uniqueness key, because a wow-based rating and a yoy-based
  -- rating of the same commodity-week are two legitimate findings, not a
  -- collision. Also what makes the gap label work: comparison_window = 'wow'
  -- with gap_weeks = 1 is what the radar renders as a two-week change rather
  -- than a week-on-week change it is not.
  comparison_window   text not null check (comparison_window in ('wow', 'mom', 'yoy', 'ytd')),

  -- Nullable, and null means null (P2.1) — never 0.
  --
  -- pct_change: null when there is no prior figure to compare against at all
  -- (a brand-new series). NOT the gap case — a change across a gap is still
  -- computed, and disclosed through gap_weeks.
  --
  -- z_score: null when the trailing window holds too little history, or its
  -- standard deviation is zero. Writing 0 would assert "exactly average",
  -- which is a claim, not an absence.
  --
  -- baseline_expected: the seasonality-adjusted figure the editor sees
  -- alongside what actually happened (§6.4). Null when the commodity has no
  -- seasonality_profile — that column is nullable in 0006 and a false
  -- expectation is worse than a stated absence (P0.2).
  pct_change          numeric,
  z_score             numeric,
  baseline_expected   numeric,

  -- Up or down only (§7.4, P6.5). There is deliberately no flat value here,
  -- unlike price display elsewhere: a week that did not move is recorded by
  -- pct_change = 0 with NO direction, not by a third direction word.
  direction           text check (direction in ('up', 'down')),

  -- Direction is a reading of pct_change and may never disagree with it, or
  -- outrun it. Strict on both ends: when there is no change to describe
  -- (null) or no movement to describe (zero), direction is null — an `up`
  -- sitting beside a 0.00 is a claim with nothing behind it.
  check (
    (pct_change is null and direction is null)
    or (pct_change = 0 and direction is null)
    or (pct_change > 0 and direction = 'up')
    or (pct_change < 0 and direction = 'down')
  ),

  -- The LABEL only. The bands behind it live in editorial_rules (P16.1).
  -- Severity is not direction (P6.5): it renders on the navy weight ramp and
  -- never on --rise/--fall, and nothing in this table couples the two.
  severity            text not null check (severity in ('critical', 'high', 'moderate', 'normal')),

  -- P2.9 — a site switch is disclosed, not absorbed. Set when the week's
  -- collection site differs from the prior week's; lib/anomalies.ts raises
  -- the flagging threshold per §6.2 when it is true, and the radar row and
  -- the article brief both have to say so.
  site_switch_flag    boolean not null default false,

  -- P2.8 — a gap is drawn as a gap, never interpolated. Counts the weeks
  -- skipped inside this comparison. 0 is the normal, honest case: nothing
  -- was missing. A non-zero value is what turns a "week-on-week" label into
  -- a "two-week change" label downstream.
  gap_weeks           integer not null default 0 check (gap_weeks >= 0),

  -- When these figures were produced. Updated on every recompute, not held
  -- at first detection: the row's numbers can change when a correction lands
  -- upstream, and a re-rated week carrying its original timestamp would
  -- present fresh figures as old ones.
  detected_at         timestamptz not null default now(),

  -- The human decision block. Everything above this line is machine output
  -- and is overwritten freely by the cron; everything from here down is
  -- written only by a person, only through the two functions at the bottom
  -- of this file, and survives every recompute.
  --
  -- 'new' is what the Dashboard's "Critical anomalies unactioned" card counts
  -- (§11 Zone 1: severity = critical, not promoted or dismissed).
  state               text not null default 'new'
                       check (state in ('new', 'promoted', 'dismissed')),

  -- P5.9 — dismissal requires a reason and sets state; it never deletes.
  --
  -- These three columns are NOT in §9.2's printed column list. They are
  -- added deliberately to close a gap between three sections of the spec:
  -- §8.12 gives the anomaly table only a Promote action, §11 counts
  -- anomalies "not promoted or dismissed", and §9.2 gives dismissal nowhere
  -- to live. Recorded here rather than resolved silently.
  --
  -- No promoted_by/promoted_at counterpart, and the asymmetry is intended:
  -- a promotion's provenance is the content_items row it creates (its
  -- created_by, its created_at, its anomaly_ids). A dismissal creates
  -- nothing, so if it is not recorded here it is not recorded anywhere.
  dismiss_reason      text,

  -- set null on delete, same pattern as price_submissions.reviewed_by and
  -- entitlements.granted_by. NOTE the interaction with the companion check
  -- below: while a dismissed row exists, that check requires dismissed_by to
  -- be present, so deleting the dismissing profile is refused rather than
  -- silently nulled. Deactivate the account (profiles.is_active) instead —
  -- which is what this build does everywhere anyway.
  dismissed_by        uuid references profiles (id) on delete set null,
  dismissed_at        timestamptz,

  -- A dismissal carries its reason, its author and its moment, together —
  -- and the reason has to say something. Without the trim, an empty string
  -- satisfies "a reason is required" and P5.9 is enforced in name only.
  check (
    state <> 'dismissed'
    or (dismiss_reason is not null
        and btrim(dismiss_reason) <> ''
        and dismissed_by is not null
        and dismissed_at is not null)
  )
);

-- The ledger key, and the target of the cron's upsert. Five columns: the
-- comparison window is part of the identity of a rating, not an attribute of
-- it. Not partial, unlike 0010's live-series key — nothing here is ever
-- superseded, only recomputed in place.
create unique index price_anomalies_ledger_key
  on price_anomalies (commodity_id, tier, iso_year, iso_week, comparison_window);

-- §9.6 lists no index for this table. This one is required by the full-ledger
-- design rather than by the spec: both hot reads are week-first — the radar
-- loads one week's ratings, the Dashboard counts unactioned criticals — and
-- neither can use the ledger key above, which leads with commodity_id.
create index price_anomalies_week_severity
  on price_anomalies (iso_year, iso_week desc, severity);

alter table price_anomalies enable row level security;

-- can_promote() — the §7.2 role matrix, expressed once. Promote is Admin,
-- Editor AND Contributor; Analyst is excluded, which is the entire point of
-- that role (read-only Dashboard, nothing actionable).
--
-- Deliberately NOT is_admin_or_editor(): reusing that helper would lock
-- contributors out of a transition the matrix grants them. Deliberately not
-- is_staff() either: that would hand the action to Analyst. This is a third
-- predicate because the product genuinely has a third audience.
create function can_promote(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and is_active and role in ('admin', 'editor', 'contributor')
  );
$$;

-- price_anomalies_select_staff: any signed-in staff member can read the
-- ledger. No anon policy — P9.1's anon-readable list covers price_observations
-- but deliberately not this table: a severity rating is an editorial judgement
-- about what is worth publishing, made before anything is published.
--
-- is_staff() and not is_admin_or_editor(), on purpose: an Analyst must be able
-- to read this table or the Dashboard's critical-anomaly card breaks for the
-- one role whose only screen is that dashboard.
create policy price_anomalies_select_staff
  on price_anomalies
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- No insert policy: rows are computed, never authored. /api/cron/price-intel
-- writes them under service-role credentials, which bypasses RLS and is not a
-- grant made here. A hand-inserted anomaly would be a fabricated finding, and
-- the one thing this table must never contain is a rating no price produced.
--
-- No update policy: every computed column above the state block is unwritable
-- by every signed-in role, from the moment this migration lands. State moves
-- only through the two security definer functions below, which cannot reach
-- pct_change, z_score, severity, baseline_expected, gap_weeks, site_switch_flag
-- or comparison_window even by accident.
--
-- No delete policy: a recompute is an upsert on the ledger key, never a
-- delete-and-reinsert.

-- promote_price_anomaly() — one of exactly two paths that may change state.
--
-- Flips state and nothing else. It does NOT create the content_items row:
-- that table does not exist until 0016, so the radar's Promote action is two
-- steps in application code until then and cannot yet be one transaction.
-- The stage-7 brief's "Promote creates exactly one queued content item" is
-- therefore half-satisfied here, on purpose and on record.
--
-- One-way from 'new': a promoted or dismissed row is settled. There is no
-- reopen path by design — re-promoting a dismissed anomaly would strand its
-- dismissal reason as a description of a decision no longer in force. If a
-- reopen is ever needed it arrives as its own migration with its own reason
-- field, fixed forward.
create function promote_price_anomaly(anomaly_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_promote(auth.uid()) then
    raise exception 'only an admin, editor or contributor may promote an anomaly';
  end if;

  update price_anomalies
     set state = 'promoted'
   where id = anomaly_id
     and state = 'new';

  if not found then
    raise exception 'price anomaly % does not exist, or is already promoted or dismissed', anomaly_id;
  end if;
end;
$$;

-- dismiss_price_anomaly() — the other of the two paths (P5.9: dismissal
-- requires a reason and sets state; it never deletes).
--
-- The blank-reason guard here is the same rule as the table check, raised
-- earlier and with a legible message: "dismissed for no stated reason" is the
-- exact record this table exists to prevent. Attribution and timestamp are
-- taken from the session, never passed in by the caller.
create function dismiss_price_anomaly(anomaly_id uuid, reason text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_promote(auth.uid()) then
    raise exception 'only an admin, editor or contributor may dismiss an anomaly';
  end if;

  if btrim(coalesce(reason, '')) = '' then
    raise exception 'a dismissal requires a reason (P5.9)';
  end if;

  update price_anomalies
     set state          = 'dismissed',
         dismiss_reason = btrim(reason),
         dismissed_by   = auth.uid(),
         dismissed_at   = now()
   where id = anomaly_id
     and state = 'new';

  if not found then
    raise exception 'price anomaly % does not exist, or is already promoted or dismissed', anomaly_id;
  end if;
end;
$$;

-- THE RECOMPUTE CONTRACT, for whoever writes /api/cron/price-intel.
--
-- Upsert on price_anomalies_ledger_key. On conflict, update ONLY the computed
-- columns — pct_change, z_score, baseline_expected, direction, severity,
-- site_switch_flag, gap_weeks, detected_at — and never state, dismiss_reason,
-- dismissed_by or dismissed_at.
--
-- This is a contract on the cron's write, not something the schema enforces:
-- the cron runs under service-role and RLS does not constrain it. It matters
-- because a correction upstream can re-rate a settled week from normal to
-- critical, and a recompute that reset state would resurrect an anomaly an
-- editor had already dismissed, with its reason still attached.
