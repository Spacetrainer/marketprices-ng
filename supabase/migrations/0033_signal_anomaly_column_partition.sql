-- ============================================================================
-- 0033_signal_anomaly_column_partition.sql
-- The machine/decision column partition on signals and price_anomalies.
--
-- 0017 and 0011 each end with a printed contract addressed to whoever writes
-- the job that fills the table, and each admits in the same breath that the
-- contract is unenforceable:
--
--   0017, THE RESCORE CONTRACT: "Upsert on raw_item_id. On conflict, update
--   ONLY the machine columns -- category, category_weight, geo_scope,
--   geo_score, decision_utility, utility_breakdown, recency_score,
--   novelty_score, commodity_match, signal_score, commodities, entities,
--   scored_at -- and never state, dismiss_reason, dismissed_by or
--   dismissed_at. This is a contract on the job's write, not something the
--   schema enforces: the job runs under service-role and RLS does not
--   constrain it."
--
--   0011, THE RECOMPUTE CONTRACT: "Upsert on price_anomalies_ledger_key. On
--   conflict, update ONLY the computed columns -- pct_change, z_score,
--   baseline_expected, direction, severity, site_switch_flag, gap_weeks,
--   detected_at -- and never state, dismiss_reason, dismissed_by or
--   dismissed_at. This is a contract on the cron's write, not something the
--   schema enforces."
--
-- This migration makes both of them something the schema enforces. It is the
-- same rule twice, so the design is explained once here and then applied to
-- each table in its own section.
--
-- WHY IT MATTERS, in the words both migrations use: a retuning or a correction
-- upstream can re-rate an item an editor has already dismissed, and a rescore
-- that reset state "would resurrect it with its dismissal reason still
-- attached, describing a decision no longer in force."
--
-- ============================================================================
-- THE PARTITION IS THREE-WAY, NOT TWO-WAY, AND THAT IS A DEPARTURE
-- ============================================================================
--
-- Both printed contracts are two-way: machine columns on one side, decision
-- columns on the other. Neither says anything about the columns that are
-- neither -- signals' id, raw_item_id and created_at, and price_anomalies' id
-- plus its whole ledger key (commodity_id, tier, iso_year, iso_week,
-- comparison_window). A guard built literally from the contract text would
-- leave those writable by the very job the guard exists to constrain.
--
-- On price_anomalies that is the most dangerous gap of the three, not the
-- least: the ledger key IS the identity of a rating and IS the upsert target.
-- Rewriting it does not corrupt a number, it silently re-points a severity
-- rating at a different commodity or a different week, and
-- price_anomalies_ledger_key only notices if the new key happens to collide.
--
-- So the guard freezes a third set against BOTH writers:
--
--   IDENTITY  -- what the row IS. Fixed at first insert, never rewritten, not
--                by the job and not by a person. Enumerated per table below.
--   DECISION  -- what a human concluded. state, dismiss_reason, dismissed_by,
--                dismissed_at, on both tables. Moves only through the two
--                SECURITY DEFINER functions, and only along a legal
--                transition.
--   MACHINE   -- everything else. The job's to rewrite freely on every
--                rescore or recompute, and unreachable from a decision.
--
-- MACHINE IS DEFINED AS THE REMAINDER, and that is a deliberate choice with a
-- cost. IDENTITY and DECISION are enumerated; MACHINE is "every column that is
-- neither". The benefit is that a column added by a later migration is
-- writable by the job the day it is added, so the recompute does not break the
-- first time the schema grows. The cost is the mirror image: if a future column
-- is genuinely a SECOND DECISION FIELD, it lands in MACHINE by default and the
-- job may write it. Anything added to the decision block must therefore be
-- added to the enumerated decision list in its own migration, and this
-- paragraph is the reason that requirement exists. (0025 made the opposite
-- call on price_observations -- whole row minus one carve-out column -- because
-- that table has ONE legitimate writer. These two have two.)
--
-- ============================================================================
-- THE RULE
-- ============================================================================
--
-- On UPDATE, exactly one of these is true or the write is refused:
--
--   A PURE RESCORE   -- the decision slice is byte-identical. Machine columns
--                       may move however the job likes. Permitted, without
--                       asking who is calling.
--   A PURE DECISION  -- the machine slice is byte-identical AND the state move
--                       is legal: new -> promoted writes state alone, and
--                       new -> dismissed writes exactly the four decision
--                       columns with a non-blank reason and a named dismisser.
--                       A settled row is final in both directions.
--
-- A write that touches both slices is refused, and that is the whole point:
-- the rescore that resets state and the promotion that quietly re-scores are
-- the same statement, and neither is legitimate.
--
-- IDENTITY is checked before either classification, so an identity rewrite is
-- refused whether it arrives alone or bundled with a legal-looking rescore.
--
-- ON INSERT, state must be 'new' and the three dismissal columns must be null.
-- This is slightly wider than "column partition" and is included on purpose:
-- with DELETE blocked, fabricating a decision by inserting a row that is
-- already 'promoted' or 'dismissed' would otherwise be the one remaining way
-- for a service-role job to author an editorial conclusion. Both tables'
-- migrations state that rows are "computed, never authored" and "scored, never
-- authored"; this is that sentence applied to the decision block at insert
-- time. Neither job is affected -- state defaults to 'new'.
--
-- ============================================================================
-- UNCONDITIONAL, AND THAT IS WHAT BINDS THE FOUR FUNCTIONS
-- ============================================================================
--
-- Neither guard returns early when auth.uid() is null. Same posture as
-- protect_audit_log() (0021), protect_price_observation() (0025) and 0030's
-- three: those guards exist to constrain the bypassing role, so "no identified
-- user" is precisely the case that must still be blocked, not waved through.
-- This is the direct opposite of protect_content_status() and
-- protect_weight_proposal(), which no-op on a null uid because they exist to
-- constrain confused humans.
--
-- The consequence is the reason this migration was asked for in its strict
-- form. promote_signal(), dismiss_signal(), promote_price_anomaly() and
-- dismiss_price_anomaly() are SECURITY DEFINER, which carries them past a
-- REVOKE because they run as owner -- but NOT past a trigger. Triggers fire for
-- the owner and for superusers alike and there is no definer exemption. So the
-- partition binds those four functions as a property of existing, not as a
-- favour they are currently doing:
--
--   - Today each writes exactly within its footprint. promote writes state
--     alone; dismiss writes the four decision columns; both gate on
--     state = 'new'.
--   - If any of them is EDITED LATER to also touch a machine column -- to
--     "helpfully" bump scored_at on dismissal, or zero a signal_score on
--     promotion -- the guard refuses the write. The function is the door; the
--     trigger is the law.
--   - A fifth function added later, or a hand-written UPDATE from a psql
--     session, is bound identically without anyone remembering to think about
--     it.
--
-- The verification for this migration proves that claim directly rather than
-- by reasoning: it replaces each of the four functions, inside a rolled-back
-- transaction, with a version that reaches past its footprint, calls it, and
-- confirms the guard rejects the write.
--
-- ============================================================================
-- WHY TWO FUNCTIONS RATHER THAN ONE GENERIC ONE
-- ============================================================================
--
-- The rule is identical; the column lists are not. A single function
-- parameterised by TG_ARGV would express "the same rule twice" more literally,
-- and was considered and declined: every other guard in this build is a plain
-- per-table function (protect_audit_log, protect_price_observation,
-- protect_content_revision, protect_editorial_rule, protect_site_event), a
-- reader debugging a rejection should not have to resolve trigger arguments to
-- find out which columns were in which set, and a parsing bug in a generic
-- guard is a silent hole in two tables at once rather than a loud failure in
-- one. The duplication is about forty lines and each half is independently
-- readable.
--
-- DELETE AND TRUNCATE ARE REFUSED ON BOTH TABLES, matching what both
-- migrations already say in prose. 0011: "No delete policy: a recompute is an
-- upsert on the ledger key, never a delete-and-reinsert." 0017: "No delete
-- policy, ever. A dismissed signal is a record of a decision not to cover
-- something, which is exactly the record that disappears first if deletion is
-- available (P1.4)."
--
-- WHAT THIS MIGRATION DOES NOT DO: it does not touch grants, policies, or the
-- four functions themselves. service_role keeps INSERT and UPDATE on both
-- tables because it is the legitimate writer of the machine slice -- the
-- partition constrains WHAT it may write, not WHETHER it may write, which is
-- the distinction 0031's header drew and this migration inherits.
-- ============================================================================


-- ============================================================================
-- 1. signals (0017 §9.3)
--
--   IDENTITY  id, raw_item_id, created_at
--   DECISION  state, dismiss_reason, dismissed_by, dismissed_at
--   MACHINE   the remaining thirteen -- category, category_weight, geo_scope,
--             geo_score, decision_utility, utility_breakdown, recency_score,
--             novelty_score, commodity_match, signal_score, commodities,
--             entities, scored_at -- matching the rescore contract exactly.
-- ============================================================================

create or replace function protect_signal_partition()
returns trigger
language plpgsql
as $$
declare
  c_identity constant text[] := array['id', 'raw_item_id', 'created_at'];
  c_decision constant text[] := array['state', 'dismiss_reason', 'dismissed_by', 'dismissed_at'];
  v_old              jsonb;
  v_new              jsonb;
  v_identity_changed text;
  v_decision_changed text;
  v_machine_changed  boolean;
begin
  if tg_op = 'DELETE' then
    raise exception
      'signals is not deletable: a dismissed signal is the record of a decision not to cover something, and that is the record that disappears first if deletion is available (P1.4)';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'signals is not truncatable (P1.4)';
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'new' then
      raise exception
        'a signal is scored, never authored: a new row starts at state ''new'', not ''%''. A decision is recorded by promote_signal() or dismiss_signal(), never at insert',
        new.state;
    end if;

    if new.dismiss_reason is not null
       or new.dismissed_by is not null
       or new.dismissed_at is not null then
      raise exception
        'a newly scored signal carries no dismissal: dismiss_reason, dismissed_by and dismissed_at must be null at insert (P5.9)';
    end if;

    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Layer 1 of the rule: identity is frozen against BOTH writers, and is
  -- checked before the write is classified so that an identity rewrite cannot
  -- ride along with an otherwise-legal rescore.
  select string_agg(k, ', ' order by k)
    into v_identity_changed
    from unnest(c_identity) k
   where v_new -> k is distinct from v_old -> k;

  if v_identity_changed is not null then
    raise exception
      'a signal''s identity is fixed when it is first scored; % may never be rewritten, by the scoring job or by a person',
      v_identity_changed;
  end if;

  select string_agg(k, ', ' order by k)
    into v_decision_changed
    from unnest(c_decision) k
   where v_new -> k is distinct from v_old -> k;

  v_machine_changed := (v_new - c_identity - c_decision)
                is distinct from (v_old - c_identity - c_decision);

  -- Layer 2: one write is a rescore or a decision, never both.
  if v_decision_changed is not null and v_machine_changed then
    raise exception
      'one write may not be both a rescore and a decision: this statement changed % alongside machine columns. The scoring job rewrites machine columns; promote_signal() and dismiss_signal() move the decision. Never in the same statement',
      v_decision_changed;
  end if;

  -- A pure rescore, or a no-op re-write of identical values. Permitted without
  -- asking who is calling: this is the scoring job's own contract, now enforced.
  if v_decision_changed is null then
    return new;
  end if;

  -- Layer 3: a pure decision, which must be a legal transition.
  if old.state <> 'new' then
    raise exception
      'signal % is already %; a promotion or dismissal is settled and its record is never rewritten',
      old.id, old.state;
  end if;

  if new.state = old.state then
    raise exception
      'the decision columns move only as part of a state transition; % changed while state stayed ''%''',
      v_decision_changed, old.state;
  end if;

  if new.state = 'promoted' then
    if new.dismiss_reason is not null
       or new.dismissed_by is not null
       or new.dismissed_at is not null then
      raise exception
        'a promotion records no dismissal: dismiss_reason, dismissed_by and dismissed_at stay null (promote_signal() writes state alone)';
    end if;

    return new;
  end if;

  if new.state = 'dismissed' then
    if new.dismiss_reason is null or btrim(new.dismiss_reason) = '' then
      raise exception
        'a dismissal requires a reason (P5.9)';
    end if;

    if new.dismissed_by is null or new.dismissed_at is null then
      raise exception
        'a dismissal records who and when: dismissed_by and dismissed_at are both required (P5.9)';
    end if;

    return new;
  end if;

  raise exception
    'a signal moves from ''new'' to ''promoted'' or ''dismissed'' only; ''%'' is not a decision a person may record',
    new.state;
end;
$$;

comment on function protect_signal_partition() is
  'Enforces 0017''s rescore contract as a constraint (§9.3). Three-way column '
  'partition: identity (id, raw_item_id, created_at) is frozen against every '
  'writer; the decision block (state, dismiss_reason, dismissed_by, '
  'dismissed_at) moves only along a legal transition; everything else is the '
  'scoring job''s. One write is a rescore or a decision, never both. '
  'Unconditional, so it binds service_role, the table owner, and '
  'promote_signal() and dismiss_signal() themselves -- including any future '
  'edit to those functions that reaches past their current footprint.';

create trigger signals_column_partition
  before insert or update or delete on signals
  for each row execute function protect_signal_partition();

-- Row triggers never fire for TRUNCATE; it needs its own statement trigger.
create trigger signals_no_truncate
  before truncate on signals
  for each statement execute function protect_signal_partition();


-- ============================================================================
-- 2. price_anomalies (0011 §9.2)
--
--   IDENTITY  id, plus the whole ledger key: commodity_id, tier, iso_year,
--             iso_week, comparison_window. 0011 is explicit that the
--             comparison window "is part of the identity of a rating, not an
--             attribute of it", which is exactly why it is frozen here rather
--             than treated as a machine column.
--   DECISION  state, dismiss_reason, dismissed_by, dismissed_at
--   MACHINE   the remaining eight -- pct_change, z_score, baseline_expected,
--             direction, severity, site_switch_flag, gap_weeks, detected_at --
--             matching the recompute contract exactly.
-- ============================================================================

create or replace function protect_price_anomaly_partition()
returns trigger
language plpgsql
as $$
declare
  c_identity constant text[] := array['id', 'commodity_id', 'tier', 'iso_year', 'iso_week', 'comparison_window'];
  c_decision constant text[] := array['state', 'dismiss_reason', 'dismissed_by', 'dismissed_at'];
  v_old              jsonb;
  v_new              jsonb;
  v_identity_changed text;
  v_decision_changed text;
  v_machine_changed  boolean;
begin
  if tg_op = 'DELETE' then
    raise exception
      'price_anomalies is not deletable: a recompute is an upsert on the ledger key, never a delete-and-reinsert';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'price_anomalies is not truncatable';
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'new' then
      raise exception
        'an anomaly is computed, never authored: a new row starts at state ''new'', not ''%''. A decision is recorded by promote_price_anomaly() or dismiss_price_anomaly(), never at insert',
        new.state;
    end if;

    if new.dismiss_reason is not null
       or new.dismissed_by is not null
       or new.dismissed_at is not null then
      raise exception
        'a newly computed anomaly carries no dismissal: dismiss_reason, dismissed_by and dismissed_at must be null at insert (P5.9)';
    end if;

    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- The ledger key is the identity of a rating. Rewriting it does not corrupt
  -- a number, it re-points the rating at a different commodity or week, and
  -- the unique index only notices on a collision. Checked first, and against
  -- both writers.
  select string_agg(k, ', ' order by k)
    into v_identity_changed
    from unnest(c_identity) k
   where v_new -> k is distinct from v_old -> k;

  if v_identity_changed is not null then
    raise exception
      'an anomaly''s ledger key is its identity, not an attribute of it; % may never be rewritten, by the cron or by a person. A different key is a different rating, which is a new row',
      v_identity_changed;
  end if;

  select string_agg(k, ', ' order by k)
    into v_decision_changed
    from unnest(c_decision) k
   where v_new -> k is distinct from v_old -> k;

  v_machine_changed := (v_new - c_identity - c_decision)
                is distinct from (v_old - c_identity - c_decision);

  if v_decision_changed is not null and v_machine_changed then
    raise exception
      'one write may not be both a recompute and a decision: this statement changed % alongside computed columns. /api/cron/price-intel rewrites computed columns; promote_price_anomaly() and dismiss_price_anomaly() move the decision. Never in the same statement',
      v_decision_changed;
  end if;

  if v_decision_changed is null then
    return new;
  end if;

  if old.state <> 'new' then
    raise exception
      'price anomaly % is already %; a promotion or dismissal is settled and its record is never rewritten',
      old.id, old.state;
  end if;

  if new.state = old.state then
    raise exception
      'the decision columns move only as part of a state transition; % changed while state stayed ''%''',
      v_decision_changed, old.state;
  end if;

  if new.state = 'promoted' then
    if new.dismiss_reason is not null
       or new.dismissed_by is not null
       or new.dismissed_at is not null then
      raise exception
        'a promotion records no dismissal: dismiss_reason, dismissed_by and dismissed_at stay null (promote_price_anomaly() writes state alone)';
    end if;

    return new;
  end if;

  if new.state = 'dismissed' then
    if new.dismiss_reason is null or btrim(new.dismiss_reason) = '' then
      raise exception
        'a dismissal requires a reason (P5.9)';
    end if;

    if new.dismissed_by is null or new.dismissed_at is null then
      raise exception
        'a dismissal records who and when: dismissed_by and dismissed_at are both required (P5.9)';
    end if;

    return new;
  end if;

  raise exception
    'an anomaly moves from ''new'' to ''promoted'' or ''dismissed'' only; ''%'' is not a decision a person may record',
    new.state;
end;
$$;

comment on function protect_price_anomaly_partition() is
  'Enforces 0011''s recompute contract as a constraint (§9.2). Three-way '
  'column partition: identity (id and the whole ledger key) is frozen against '
  'every writer; the decision block (state, dismiss_reason, dismissed_by, '
  'dismissed_at) moves only along a legal transition; everything else is the '
  'cron''s. One write is a recompute or a decision, never both. '
  'Unconditional, so it binds service_role, the table owner, and '
  'promote_price_anomaly() and dismiss_price_anomaly() themselves -- including '
  'any future edit to those functions that reaches past their footprint.';

create trigger price_anomalies_column_partition
  before insert or update or delete on price_anomalies
  for each row execute function protect_price_anomaly_partition();

create trigger price_anomalies_no_truncate
  before truncate on price_anomalies
  for each statement execute function protect_price_anomaly_partition();
