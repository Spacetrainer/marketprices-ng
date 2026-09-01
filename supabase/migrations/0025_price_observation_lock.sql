-- ============================================================================
-- 0025_price_observation_lock.sql
-- The price_observations append-only lock, promised by 0010 and never built.
--
-- 0010_price_observations.sql says, in its header: "The rest of the append-only
-- lock -- the REVOKE and the BEFORE UPDATE OR DELETE trigger that holds when
-- RLS is bypassed -- lands in 0021_triggers.sql as one reviewed batch, not
-- here. Until 0021 is applied, a role that bypasses RLS (service-role, psql)
-- is NOT yet blocked from editing a row." That migration number went to
-- governance instead, and the lock was never written. This is it.
--
-- WHAT IS ACTUALLY EXPOSED TODAY, read from the live catalogue on 2026-08-31:
-- relacl on price_observations is {postgres=arwdDxtm/postgres,
-- anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
-- service_role=arwdDxtm/postgres} -- the full default set, nothing revoked.
-- The table carries two policies (select_public, insert_staff), no UPDATE or
-- DELETE policy, and ZERO triggers. So a policy-bound session is already
-- default-denied by RLS, and the real hole is exactly the one 0010 named:
-- service-role and any owner/psql session may edit or delete a published price
-- freely. P1.3 and P1.4 are, at this moment, a convention rather than a lock.
--
-- THREE LAYERS, the same shape as audit_log's lock in 0021:
--   Layer 1 (RLS)     -- already present since 0010: no UPDATE/DELETE policy.
--   Layer 2 (REVOKE)  -- below: stops service_role, which bypasses RLS.
--   Layer 3 (TRIGGER) -- below: stops the owner and any SECURITY DEFINER path,
--                        and is the only layer that reaches TRUNCATE for an
--                        owner session at all.
--
-- UNCONDITIONAL. Unlike protect_content_status() and protect_weight_proposal(),
-- which return early when auth.uid() is null because they exist to constrain
-- confused humans, this guard has NO null-uid escape. The bypassing role IS
-- the threat here, so "no identified user" is precisely the case that must
-- still be blocked. Same call protect_audit_log() made, for the same reason.
--
-- WHERE THIS DIFFERS FROM audit_log: audit_log has zero legitimate updates, so
-- its guard raises unconditionally. price_observations has exactly one -- the
-- retirement stamp written by supersede_price_observation() (0010), the
-- SECURITY DEFINER path named in P1.3. SECURITY DEFINER carries that function
-- past the REVOKE, because it runs as owner, but NOT past a trigger: triggers
-- fire for the owner and for superusers alike and there is no definer
-- exemption. An unconditional raise would therefore break the only price
-- correction path in the product on the first correction.
--
-- THE CARVE-OUT IS COLUMN-SHAPED, NOT IDENTITY-SHAPED. The trigger permits an
-- UPDATE only when superseded_at goes null -> non-null and every other column
-- is byte-identical. It never asks who is calling. That is deliberate:
--   - There is no session flag to forge and no `current_user = owner` test,
--     which would whitelist the exact role being locked out.
--   - It constrains supersede_price_observation() itself. If that function is
--     later edited to do more, or a second function is added, the trigger
--     still holds. The function is the door; the trigger is the law.
--   - It blocks un-superseding (non-null -> null), which would resurrect a
--     retired figure and put two live rows on one series key against
--     price_observations_live_series_key.
--
-- WHOLE-ROW COMPARISON, NOT A COLUMN LIST. Branch 5 compares
-- to_jsonb(new) - 'superseded_at' against to_jsonb(old) - 'superseded_at'
-- rather than enumerating the seventeen frozen columns. An enumerated list
-- silently stops protecting any column a future migration adds until someone
-- remembers to edit this function; the jsonb form protects a new column the
-- day it is added. The differing key names are computed for the error message
-- so the rejection stays specific.
--
-- WHAT THIS DELIBERATELY FORECLOSES:
--   - Backfilling fx_rate/fx_fetched_at onto an existing observation. Per
--     0010 those are stamped together at conversion time; a backfill is a new
--     row, not an edit.
--   - A row whose published_at is in the future can never be retired
--     (branch 6). Nothing sets published_at explicitly today; it defaults to
--     now().
--   - INSERT is revoked from service_role, so no machine path can write a
--     price observation. That is P5.2-aligned (the engine has zero write
--     access to price data) and no current job does it, but a future
--     submission-approval cron would have to be a SECURITY DEFINER function
--     rather than a service-role INSERT.
--
-- THE AUDIT ENTRY CANNOT NAME THE REPLACEMENT FIGURE. 0010's mandated call
-- order supersedes FIRST and inserts the correction SECOND, so the correction
-- row does not exist when this entry is written. The record says what was
-- retired and when, not what replaced it. write_audit_entry() raises on
-- failure, so the retirement and its log are one transaction: there is no
-- superseded row without an audit entry.
--
-- 0010 IS NOT EDITED. It is applied. supersede_price_observation() is replaced
-- here by CREATE OR REPLACE at the same signature, so no DROP is needed and no
-- dependency moves.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Layer 2 -- the REVOKE
--
-- Two statements, and authenticated's INSERT is never touched rather than
-- revoked and re-granted: price_observations_insert_staff is `to
-- authenticated` and RLS needs the grant underneath it. Re-issuing it would
-- replace the original grant with this migration's for no benefit.
--
-- Roles are named explicitly. PUBLIC holds nothing on this table -- relacl has
-- no `=.../postgres` entry -- so these three are the complete set. (On
-- FUNCTIONS the opposite is true and PUBLIC must be named; see 0024.)
--
-- select is left alone for all three: the public reads the whole series,
-- superseded rows included, per 0010. references/trigger/maintain are left
-- alone too, matching what audit_log looks like after 0021.
-- ----------------------------------------------------------------------------

revoke update, delete, truncate on price_observations
  from anon, authenticated, service_role;

revoke insert on price_observations
  from anon, service_role;

-- ----------------------------------------------------------------------------
-- 2. Layer 3 -- protect_price_observation()
--
-- Plain: not SECURITY DEFINER, no search_path pin. The body touches no table
-- and no schema-qualified object -- only OLD, NEW and jsonb operators. Same
-- posture as protect_audit_log() and protect_content_status().
--
-- Branch order is fixed and each branch has its own message, so a negative
-- test can assert the SPECIFIC rejection it expects rather than inferring one
-- from a value that did not change. Shape is checked before value: branches
-- 3, 4 and 5 establish that this is a retirement of an un-retired row that
-- touched nothing else, and only then does branch 6 judge the timestamp.
--
-- Branch 3 also swallows the un-supersede attempt (non-null -> null), which is
-- accurate: on an already-retired row, nothing is permitted.
--
-- Branch 6 compares against old.published_at, the persisted fact. Branch 5 has
-- already proven published_at unchanged, so old and new are identical there.
-- ----------------------------------------------------------------------------

create or replace function protect_price_observation()
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
      'price_observations is append-only: a published price is never deleted (P1.4)';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'price_observations is append-only: TRUNCATE is not permitted (P1.4)';
  end if;

  if old.superseded_at is not null then
    raise exception
      'price observation % is already superseded; a retired figure is final (P1.3)',
      old.id;
  end if;

  if new.superseded_at is null then
    raise exception
      'the only permitted update to a price observation is retiring it: superseded_at must be set (P1.3)';
  end if;

  v_old_body := to_jsonb(old) - 'superseded_at';
  v_new_body := to_jsonb(new) - 'superseded_at';

  if v_new_body is distinct from v_old_body then
    select string_agg(e.key, ', ' order by e.key)
      into v_changed
      from jsonb_each(v_new_body) e
     where e.value is distinct from (v_old_body -> e.key);

    raise exception
      'a published price is never edited; a correction is a new row (P1.3). Changed: %',
      coalesce(v_changed, '(column set differs)');
  end if;

  if new.superseded_at < old.published_at then
    raise exception
      'superseded_at % is earlier than published_at %; a price cannot be retired before it was published',
      new.superseded_at, old.published_at;
  end if;

  return new;
end;
$$;

comment on function protect_price_observation() is
  'Layer 3 of the price_observations append-only lock (P1.3, P1.4). Permits '
  'exactly one update shape -- superseded_at null -> non-null, no later than '
  'published_at, every other column unchanged -- and refuses every DELETE and '
  'TRUNCATE. Unconditional: it binds service_role and the table owner as well '
  'as signed-in staff, because the bypassing role is the threat this layer '
  'exists for.';

-- Row-level: catches UPDATE and DELETE.
create trigger price_observations_append_only
  before update or delete on price_observations
  for each row execute function protect_price_observation();

-- Statement-level: row triggers never fire for TRUNCATE, so it needs its own.
create trigger price_observations_no_truncate
  before truncate on price_observations
  for each statement execute function protect_price_observation();

-- ----------------------------------------------------------------------------
-- 3. supersede_price_observation() -- the one legitimate write, now logged
--
-- Same signature as 0010, so CREATE OR REPLACE genuinely replaces and 0010 is
-- left untouched. Three changes:
--
--   1. auth.uid() is read ONCE into v_actor and used for both the
--      authorisation check and the audit actor. 0010 called it inline in the
--      gate only. One read means the identity that authorises and the identity
--      that is recorded cannot diverge -- the lesson 0024 had to learn the
--      hard way on set_editorial_rule(), applied here to a function that never
--      had the bug.
--   2. `returning * into v_row`, so the audit payload comes from the row just
--      retired without a second SELECT. `if not found` still works: RETURNING
--      on a zero-row UPDATE leaves FOUND false.
--   3. The audit entry itself.
--
-- NOTE ON DOUBLE SUPERSEDE: the UPDATE's `and superseded_at is null` predicate
-- matches zero rows on an already-retired observation, so this function's own
-- error fires and branch 3 of the trigger is never reached. Both paths are
-- closed; they just report differently, which the verification pins down.
--
-- service_role calling this function raises at the gate, because auth.uid() is
-- null there and is_admin_or_editor(null) is false. Combined with the REVOKE
-- above, there is now no service-role path to superseded_at at all. A
-- correction is a human act (P1.3).
-- ----------------------------------------------------------------------------

create or replace function supersede_price_observation(observation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_row   price_observations%rowtype;
begin
  v_actor := auth.uid();

  if not is_admin_or_editor(v_actor) then
    raise exception 'only an admin or editor may supersede a price observation';
  end if;

  update price_observations
     set superseded_at = now()
   where id = observation_id
     and superseded_at is null
  returning * into v_row;

  if not found then
    raise exception 'price observation % does not exist or is already superseded', observation_id;
  end if;

  perform write_audit_entry(
    v_actor,
    'price_observation.supersede',
    'price_observations',
    observation_id,
    jsonb_build_object(
      'commodity_id',  v_row.commodity_id,
      'tier',          v_row.tier,
      'iso_year',      v_row.iso_year,
      'iso_week',      v_row.iso_week,
      'price',         v_row.price,
      'currency',      v_row.currency,
      'published_at',  v_row.published_at,
      'superseded_at', v_row.superseded_at
    )
  );
end;
$$;
