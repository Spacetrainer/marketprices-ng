-- ============================================================================
-- 0030_append_only_locks.sql
-- The append-only locks on content_revisions, editorial_rules and site_events.
--
-- Three tables that each say, in their own migration's prose, that they are
-- append-only, and none of which has ever had the lock that makes it so. Each
-- one today carries the full default grant set for all three Supabase roles --
-- {anon,authenticated,service_role}=arwdDxtm -- so RLS is the only thing
-- holding, and RLS does not constrain service_role.
--
-- WHAT WAS EXPOSED, read from the live catalogue on 2026-09-01:
--   content_revisions  relacl full arwdDxtm x3, one policy (select_staff),
--                      zero triggers.
--   editorial_rules    relacl full arwdDxtm x3, one policy (select_staff),
--                      zero triggers.
--   site_events        relacl full arwdDxtm x3, ZERO policies, zero triggers.
-- All three tables are empty at the time of writing, so nothing here can
-- damage existing rows and no backfill is required.
--
-- THE SAME THREE LAYERS as audit_log (0021) and price_observations (0025):
--   Layer 1 (RLS)     -- already present: no INSERT/UPDATE/DELETE policy on
--                        any of the three.
--   Layer 2 (REVOKE)  -- below: stops service_role, which bypasses RLS.
--   Layer 3 (TRIGGER) -- below: stops the owner and any SECURITY DEFINER
--                        path, and is the only layer that reaches TRUNCATE
--                        for an owner session at all.
--
-- ALL THREE GUARDS ARE UNCONDITIONAL. None returns early when auth.uid() is
-- null. That is the audit_log/price_observations posture, not the
-- content_items/weight_proposals one: those two guards exist to constrain a
-- confused human and wave the machine through, whereas here the bypassing
-- role IS the threat, so "no identified user" is precisely the case that must
-- still be blocked.
--
-- WHERE service_role KEEPS A GRANT, AND WHY IT DIFFERS PER TABLE. This is the
-- one place this migration is not simply 0025 applied three times:
--
--   content_revisions -- KEEPS INSERT. The chain runner writes one row per
--     pass under service-role and is the table's ONLY writer (0018: "Chain
--     passes write under service-role, which bypasses RLS and is not a grant
--     made here"). Revoking its INSERT the way 0025 revoked
--     price_observations' would leave the table with no writer at all.
--
--   editorial_rules -- KEEPS NOTHING. set_editorial_rule() (0021, hardened in
--     0027) is SECURITY DEFINER, so it runs as owner and passes the REVOKE
--     without needing a service_role grant. No job writes this table. This is
--     the exact shape of price_observations/supersede_price_observation().
--
--   site_events -- KEEPS INSERT AND SELECT. The beacon route inserts under
--     service-role (0020 rejects an anon INSERT policy explicitly: "an open
--     insert endpoint is an invitation to fabricate [metrics] at scale"), and
--     /api/cron/rollups must READ the table to aggregate it into
--     daily_rollups. Revoking service_role's SELECT would break the only
--     sanctioned reader.
--
-- SELECT IS OTHERWISE LEFT ALONE on content_revisions and editorial_rules:
-- both carry a `select ... using (is_staff(auth.uid()))` policy and RLS needs
-- the underlying grant. site_events is the deliberate exception -- see its
-- section below.
--
-- WHAT THIS FORECLOSES ON site_events, stated because it is a real cost and
-- 0020 left the question open on purpose. 0020's "WHAT THIS MIGRATION
-- DELIBERATELY DOES NOT DO" names retention as its one unanswered question and
-- lists four candidate answers -- "drop after 90 days, partition by month,
-- roll up and truncate, keep everything". Layer 3 below blocks DELETE and
-- TRUNCATE for every role including the owner, so it forecloses three of those
-- four at the trigger layer. When retention is settled it will need its own
-- migration that replaces protect_site_event() with a carve-out shaped like
-- the retention rule (e.g. permit DELETE where created_at < now() - interval),
-- because a SECURITY DEFINER function CANNOT escape a trigger the way it
-- escapes a REVOKE. That is the intended sequence: the log is sealed until a
-- policy exists, and the policy arrives as a reviewed change to this guard
-- rather than as an unreviewed capability that was always sitting there.
-- ============================================================================


-- ============================================================================
-- 1. content_revisions -- the chain's audit trail (0018 §9.3)
-- ============================================================================
--
-- 0018's CONTRACT item 3: "THE CHAIN RUNNER WRITES ONE content_revisions ROW
-- PER PASS, and never rewrites one. A re-run of a pass appends; it does not
-- replace. The table has no update policy, so this binds anything using a
-- session -- but the runner uses service-role, where it is a contract and not
-- a constraint." This makes it a constraint.
--
-- There is no legitimate update of any shape, so unlike editorial_rules below
-- this guard needs no carve-out and raises on everything.

revoke insert on content_revisions
  from anon, authenticated;

revoke update, delete, truncate on content_revisions
  from anon, authenticated, service_role;

create or replace function protect_content_revision()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'content_revisions is append-only: % is not permitted. A re-run of a pass appends a new row, it never replaces one.',
    tg_op;
end;
$$;

comment on function protect_content_revision() is
  'Layer 3 of the content_revisions append-only lock (0018 CONTRACT 3). '
  'Refuses every UPDATE, DELETE and TRUNCATE unconditionally, for every role '
  'including service_role and the table owner. The chain runner appends and '
  'nothing else touches the table.';

create trigger content_revisions_append_only
  before update or delete on content_revisions
  for each row execute function protect_content_revision();

-- Row triggers never fire for TRUNCATE, so it needs its own statement trigger.
create trigger content_revisions_no_truncate
  before truncate on content_revisions
  for each statement execute function protect_content_revision();


-- ============================================================================
-- 2. editorial_rules -- the versioned settings ledger (0021 §9.5, P16.2)
-- ============================================================================
--
-- The one table here with a legitimate update, and it is the same situation
-- 0025 met on price_observations: a versioned ledger whose only mutation is
-- the retirement stamp its own SECURITY DEFINER writer applies.
-- set_editorial_rule() retires the active row (`set is_active = false`),
-- inserts the next version, and writes the audit entry, as one transaction.
--
-- THE CARVE-OUT IS COLUMN-SHAPED, NOT IDENTITY-SHAPED, for the reasons 0025
-- gives at length: there is no session flag to forge and no `current_user =
-- owner` test that would whitelist the very role being locked out, and it
-- constrains set_editorial_rule() itself rather than trusting it. The function
-- is the door; the trigger is the law.
--
-- WHOLE-ROW COMPARISON, NOT A COLUMN LIST. Branch 5 compares
-- to_jsonb(new) - 'is_active' against to_jsonb(old) - 'is_active' rather than
-- naming the eight frozen columns, so a column added by a later migration is
-- protected the day it is added rather than the day someone remembers to edit
-- this function.
--
-- BRANCH 3 ALSO SWALLOWS THE UN-RETIRE (false -> true), which is correct twice
-- over: a retired version is a historical fact, and re-activating one would
-- put two live rows on one (scope, key) against editorial_rules_active_uidx.
--
-- NOTE ON INSERT: revoked from all three roles. set_editorial_rule() is
-- SECURITY DEFINER and runs as owner, so it is unaffected. There is no other
-- writer -- a setting change is a human act (P16.2), and after this migration
-- there is no service-role path to one at all.

revoke insert, update, delete, truncate on editorial_rules
  from anon, authenticated, service_role;

create or replace function protect_editorial_rule()
returns trigger
language plpgsql
as $$
declare
  v_old_body jsonb;
  v_new_body jsonb;
  v_changed  text;
begin
  if tg_op = 'DELETE' then
    raise exception
      'editorial_rules is append-only: a settings version is never deleted (P16.2)';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'editorial_rules is append-only: TRUNCATE is not permitted (P16.2)';
  end if;

  if not old.is_active then
    raise exception
      'editorial rule %/% version % is already retired; a retired version is final (P16.2)',
      old.scope, old.key, old.version;
  end if;

  if new.is_active then
    raise exception
      'the only permitted update to an editorial rule is retiring it: is_active must go true -> false (P16.2)';
  end if;

  v_old_body := to_jsonb(old) - 'is_active';
  v_new_body := to_jsonb(new) - 'is_active';

  if v_new_body is distinct from v_old_body then
    select string_agg(e.key, ', ' order by e.key)
      into v_changed
      from jsonb_each(v_new_body) e
     where e.value is distinct from (v_old_body -> e.key);

    raise exception
      'a settings version is never edited; a change is a new version (P16.2). Changed: %',
      coalesce(v_changed, '(column set differs)');
  end if;

  return new;
end;
$$;

comment on function protect_editorial_rule() is
  'Layer 3 of the editorial_rules append-only lock (P16.2). Permits exactly '
  'one update shape -- is_active true -> false with every other column '
  'unchanged, the retirement stamp written by set_editorial_rule() -- and '
  'refuses every DELETE and TRUNCATE. Unconditional: it binds service_role '
  'and the table owner as well as signed-in staff.';

create trigger editorial_rules_append_only
  before update or delete on editorial_rules
  for each row execute function protect_editorial_rule();

create trigger editorial_rules_no_truncate
  before truncate on editorial_rules
  for each statement execute function protect_editorial_rule();


-- ============================================================================
-- 3. site_events -- the first-party engagement log (0020 §9.4, P8.7, P11.1)
-- ============================================================================
--
-- 0020: "No update or delete policy, ever. A log is append-only or it is not a
-- log." It had neither -- and no policies of any kind -- but it also had the
-- full default grant set, so service_role could rewrite or drop the table the
-- Dashboard's every figure derives from. P11.1 says metrics are real or
-- absent; a mutable event log cannot promise that.
--
-- SELECT IS REVOKED FROM anon AND authenticated, and this goes one step beyond
-- the append-only lock, deliberately. 0020 withholds a SELECT policy on
-- purpose as the structural enforcement of P8.7 ("the Dashboard NEVER scans
-- site_events... so the screen physically cannot read it through a user
-- session"). RLS already denies by default with zero policies, so the grant is
-- inert today -- but it is a live grant sitting under a table whose whole
-- defence is that the wrong query is impossible rather than discouraged, and
-- one future `create policy` away from mattering. Revoking it makes the two
-- layers agree.
--
-- service_role keeps SELECT and INSERT, which is exactly the access 0020
-- describes and prices: the beacon route writes, /api/cron/rollups reads, and
-- "an operator debugging the beacon... must use a service-role connection.
-- That is a fair cost."
--
-- See the header for what the DELETE/TRUNCATE block forecloses on retention,
-- which is the one genuinely open question this table carries.

revoke select, insert on site_events
  from anon, authenticated;

revoke update, delete, truncate on site_events
  from anon, authenticated, service_role;

create or replace function protect_site_event()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'site_events is append-only: % is not permitted. A metric that can be rewritten is not a measurement (P11.1).',
    tg_op;
end;
$$;

comment on function protect_site_event() is
  'Layer 3 of the site_events append-only lock (P11.1). Refuses every UPDATE, '
  'DELETE and TRUNCATE unconditionally, for every role including service_role '
  'and the table owner. The beacon route appends; nothing modifies. A '
  'retention policy, when one is settled, replaces this function with a '
  'carve-out -- SECURITY DEFINER does not escape a trigger.';

create trigger site_events_append_only
  before update or delete on site_events
  for each row execute function protect_site_event();

create trigger site_events_no_truncate
  before truncate on site_events
  for each statement execute function protect_site_event();
