-- ============================================================================
-- 0026_format_override_consistency.sql
-- The format_overrides <-> content_items.format_overridden consistency check,
-- promised by 0018 and deferred there because it is cross-table.
--
-- 0018_content_items.sql, CONTRACTS, item 2:
--
--     "format_overrides <-> format_overridden CONSISTENCY. A row exists in
--      format_overrides if and only if format_overridden is true, and
--      override_reason mirrors the latest row's reason. Cross-table, so it
--      belongs with the triggers batch."
--
-- This is that migration. It does not implement that sentence, because the
-- sentence is wrong, and the reason it is wrong is the whole design below.
--
-- WHY THE CONTRACT AS WRITTEN CANNOT HOLD. The log is append-only, its FK is
-- ON DELETE RESTRICT, and its check forbids recommended = chosen. So under the
-- printed contract the first override sets format_overridden true FOREVER:
-- there is no row to delete and no row that can be written to say the override
-- was withdrawn. The flag would come to mean "was ever overridden" rather than
-- "is overridden", and the Draft studio filter reading it would be showing a
-- fact about the past. Worse, 0018 itself contemplates reconsideration --
-- "format is chosen at promote and the item then sits in Draft studio where it
-- can be reconsidered" -- so the case is not hypothetical, it is the stated
-- workflow.
--
-- THE INVARIANT THIS MIGRATION ACTUALLY ENFORCES, replacing that sentence:
--
--     An item's format decisions are an alternating sequence of overrides and
--     withdrawals, beginning unoverridden. format_overridden is true exactly
--     when the sequence has one more override than withdrawal, and
--     override_reason is the reason of the override currently in force, or
--     null when none is. The item's format and recommended_format must agree
--     with the latest decision at commit.
--
-- Every clause is derived from the log. None of it is an input.
--
-- WHY AN EQUAL-VALUED ROW IS NOW PERMITTED, NARROWLY. 0018 forbids
-- recommended = chosen with sound reasoning: "A row where these match is not
-- an override -- it is a record of agreeing with the recommendation, which is
-- the default and needs no row. Storing one would corrupt the retuning signal
-- this table exists to produce, by counting a concurrence as a correction."
-- That is true of a concurrence AT PROMOTE and false of a WITHDRAWAL, which is
-- not agreement with the recommendation but the retraction of a disagreement.
-- P14.7 -- "an override you do not record is an experiment you ran and threw
-- away" -- applies with more force to the withdrawal than to the override,
-- because the withdrawal is that experiment's RESULT and is the single most
-- informative row the retuning could read.
--
-- The check therefore cannot survive as a CHECK, because the permission is
-- conditional on OTHER ROWS: an equal-valued row is legal only when an
-- override is currently in force for that item. A CHECK constraint cannot see
-- another row. It is dropped and the rule moves into apply_format_override(),
-- which enforces it more tightly than the check ever did -- the check allowed
-- an unlimited run of identical overrides; the trigger allows none.
--
-- ALTERNATION IS NOT AN EXTRA RULE, it is what two formats imply. recommended
-- is fixed for an item, chosen has two possible values, so "override" means
-- chosen = the other one and "withdraw" means chosen = recommended. A second
-- override with no withdrawal between records nothing that the first did not.
-- This refines 0018's note that "under a second override this table holds two
-- rows": it does, but only across a withdrawal.
--
-- THREE LAYERS, and they are not redundant -- each catches something the
-- others structurally cannot:
--
--   Layer A -- apply_format_override(), AFTER INSERT on format_overrides.
--              THE DOOR. Validates the decision and writes the derived flag
--              and reason onto the parent. The only thing in this database
--              that may set those two columns.
--   Layer B -- protect_format_override_flag(), BEFORE INSERT OR UPDATE on
--              content_items. THE LOCK. Raises when anything writes those two
--              columns to a value the log does not support. Immediate, so the
--              error names the offending write.
--   Layer C -- assert_format_override_consistent(), a DEFERRED CONSTRAINT
--              TRIGGER on content_items. THE BACKSTOP. Catches the one failure
--              A and B cannot see: a transaction that changes an item's
--              format and never logs the decision. Layer B sees nothing there
--              -- neither guarded column moved -- and Layer A never runs.
--
-- WHY LAYER C MUST BE DEFERRED, and why it re-reads the row. A legitimate
-- override is at minimum two statements (see THE CONTRACT below), and between
-- them the item is inconsistent on purpose: its format has moved and its flag
-- has not. An immediate check would reject every legitimate override at the
-- first statement. A deferred constraint trigger is the only construct that
-- checks the END of a transaction rather than the middle -- a CHECK constraint
-- cannot be deferred in Postgres at all. The function re-reads the row by id
-- instead of trusting NEW, because a deferred trigger's NEW holds the row as
-- it stood when the statement fired, which by commit may be several statements
-- stale; asserting against NEW would assert against a value that is no longer
-- in the table.
--
-- WHY ALL THREE READ THE LOG INSTEAD OF TRUSTING A MARKER. The obvious cheaper
-- design gives Layer A a transaction-local flag (set_config) or has Layer B
-- test pg_trigger_depth(), so B can tell "the door did this" from "the app did
-- this". Both were considered and refused. A session GUC is a string any
-- caller can set, so the lock would be opened by knowing its name. And
-- pg_trigger_depth() > 0 only means "some trigger is running": it is correct
-- today solely because no other trigger updates content_items, and it would
-- silently become a hole the day one does, with nothing reporting it. Reading
-- the log is state-shaped rather than identity-shaped, which is the call 0025
-- made for price_observations and made explicit: "There is no session flag to
-- forge and no `current_user = owner` test, which would whitelist the exact
-- role being locked out." A write that happens to set exactly the right values
-- by hand is permitted here, and that is not a weakness -- it agrees with the
-- truth, so it is not a lie about anything.
--
-- WHY THE GUARDS RAISE RATHER THAN CORRECT. set_updated_at() in 0022 silently
-- overwrites what a caller supplies, and the header there defends that: the
-- column is a derivation and "application code that currently sets it
-- explicitly is not broken by this; its value is simply replaced with the true
-- one". These columns are a derivation too, but the parallel stops at the
-- consequence. A wrong updated_at is noise. A wrong format_overridden means
-- code somewhere believes it can override a format without logging the
-- decision -- P14.7's exact failure -- and silently repairing the row would
-- leave that code running and unobserved, having removed the only evidence.
-- The correction is right and the silence is not, so these raise.
--
-- WHY ALL FOUR FUNCTIONS ARE SECURITY DEFINER. Layers B and C must read
-- format_overrides to derive what the flag should be. Under invoker rights
-- format_overrides_select_staff applies, and a caller who can see fewer log
-- rows than exist derives a WEAKER expectation than the truth -- the guard
-- fails OPEN, permitting a value it should have rejected, and it does so
-- silently. A guard whose strictness depends on the caller's visibility is not
-- a guard. Definer rights make all three layers read the same log the database
-- holds, which is the only reading any of them should be making. search_path
-- is pinned on all four, per this build's standing posture for definer
-- functions and 0024's remaining follow-up.
--
-- THE PERMISSION MISMATCH THIS CLOSES, which is the sharpest bug found here.
-- format_overrides_insert_promote admits ANY can_promote() user against ANY
-- item -- `with check (can_promote(auth.uid()))`, no ownership test. But
-- content_items_update_staff admits only `is_admin_or_editor(auth.uid()) OR
-- (can_promote(auth.uid()) AND created_by = auth.uid())`. So a Contributor
-- overriding an item somebody else created passes the first gate and fails the
-- second. Under invoker rights that failure is a zero-row UPDATE: no error, no
-- flag, a log row asserting a decision that was never applied, and nothing
-- anywhere reporting it. Definer rights alone would close it the WRONG WAY, by
-- letting the write through on the strength of the owner's privileges and
-- quietly widening who may edit whose items. Layer A therefore re-checks the
-- authorisation EXPLICITLY, in the same shape as content_items_update_staff,
-- and raises. The definer rights exist so the check is reached and answered
-- deliberately rather than dodged by RLS; the FOUND test after the UPDATE is
-- kept as well, so that even a future policy change cannot restore the silent
-- path.
--
-- IDENTITY IS NOT A COLUMN THE CALLER FILLS IN. format_overrides.actor is
-- `not null references profiles(id)` and its insert policy never ties it to
-- the session, so today any promoter may log an override in another staff
-- member's name -- 0024's bug exactly, in column form rather than argument
-- form, on the one table whose entire purpose is attributed evidence ("a row
-- with a null actor cannot inform a retuning, because 'somebody overrode this'
-- is not evidence about anybody's judgement" -- 0018). Layer A requires
-- actor = auth.uid() and requires auth.uid() to exist. A format choice is a
-- human act (§8.11), so there is no system actor to accommodate, and this is
-- the same posture 0024 took on set_editorial_rule().
--
-- THE LOG IS MADE GENUINELY APPEND-ONLY, and this is load-bearing rather than
-- adjacent tidying. Every layer above derives the truth from format_overrides.
-- Read from the live catalogue on 2026-09-01, relacl on that table is the
-- untouched default -- {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
-- authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres} -- so its
-- "no update policy, no delete policy" posture holds for a policy-bound
-- session and not at all for service_role or psql. A mutable log does not
-- merely lose history here: it makes the derived flag forgeable, because
-- editing the log edits what every guard believes. Same three-layer shape and
-- same reasoning as 0025.
--
-- STATUS. An override may be logged only while the item is in Draft studio.
-- §8.11 places the format decision at promote and in Draft studio; the four
-- Publish queue statuses are past the point where format is a live question,
-- and 'published' is past the point where it is answerable at all -- the
-- article exists, at a URL, in a format. protect_content_status() cannot cover
-- this, because it guards the status column and this is a write to a different
-- column that happens to be illegitimate BECAUSE of the status.
--
-- APPLIED MIGRATIONS ARE NOT EDITED. 0018 is applied. Its CONTRACTS item 2 and
-- its comment above `check (recommended <> chosen)` are both superseded here
-- and both stay on disk as written. Read them as dated statements; the durable
-- record is the [Engine] entry in docs/exceptions.md.
--
--
-- ---------------------------------------------------------------------------
-- THE CONTRACT -- what the application must now do, and it is not optional
-- ---------------------------------------------------------------------------
--
-- An override is THREE statements in ONE transaction, in this order:
--
--   1. Insert the content_items row at format = recommended_format, with an
--      archetype legal for that format. An item cannot be born overridden:
--      the format_overrides row that records the decision cannot exist before
--      the item it points at, so there is no honest way to set the flag at
--      insert. Layer B rejects it.
--   2. UPDATE format AND archetype TOGETHER. They must move in one statement.
--      content_items' archetype check is a table CHECK and therefore immediate
--      -- ten prose skeletons are legal only for 'article', V1-V6 only for
--      'video' -- so a statement moving either alone violates it. This is also
--      why Layer A does not set format itself: a trigger that moved format
--      without archetype would fail that check on every override, with an
--      error naming the archetype rather than the cause.
--   3. Insert the format_overrides row. Layer A applies the flag and reason.
--
-- Steps 2 and 3 may be given in either order -- Layer A does not compare
-- chosen against the item's current format, precisely so the order is free,
-- and Layer C makes them agree at commit either way. Step 1 is separate only
-- when the item is being created; an override in Draft studio is steps 2 and 3.
--
-- A WITHDRAWAL is the same two statements: move format and archetype back, and
-- log a row with chosen = recommended and a reason. The flag clears and
-- override_reason returns to null. The withdrawal's reason lives in the log
-- and is deliberately not copied onto the item: override_reason describes the
-- override in force, and after a withdrawal there is none.
--
-- ONE DECISION PER TRANSACTION, per item. format_overrides.created_at defaults
-- to now(), which is transaction start, so two rows written in one transaction
-- carry the same timestamp and "the latest row" stops being a question the
-- data can answer. Layer A rejects the second. This is not merely a tie-break
-- convenience: an override and its withdrawal in one transaction is not two
-- decisions, it is a change of mind that never reached the product, and
-- recording it as history would put a correction into the retuning signal that
-- no editor ever acted on.
--
-- FORECLOSED DELIBERATELY, each one a thing that currently works and will stop:
--   - Setting format_overridden or override_reason by hand, in any role,
--     including service_role and psql, to any value the log does not support.
--   - Creating a content item that is already overridden.
--   - Editing or deleting a format_overrides row. Service_role loses INSERT
--     too: a format choice is a human act and no machine path may log one.
--   - Logging an override against an item with a null recommended_format.
--     Because format-fit has no source yet (0018's NOTED GAP), that is EVERY
--     item today, so overrides are unavailable until that gap closes. This is
--     deliberate: an override of nothing is not an override, and the honest
--     posture is that the feature waits on the recommendation it corrects.
--   - Moving recommended_format after a decision has been logged against it.
--     A recommendation that shifts under a recorded correction makes the
--     correction unreadable. 0018 freezes format-fit at creation anyway; this
--     makes that freeze structural once a decision exists.
--   - Overriding a scheduled, published, dispatching or failed item.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The log becomes append-only in fact rather than by policy
--
-- Roles named explicitly. PUBLIC holds nothing on this table -- relacl carries
-- no `=.../postgres` entry -- so these three are the complete set. (On
-- FUNCTIONS the opposite is true and PUBLIC must be named; see 0024, and see
-- the revoke at the foot of this file.)
--
-- authenticated keeps INSERT: format_overrides_insert_promote is `to
-- authenticated` and RLS needs the grant underneath it. Re-issuing it would
-- replace 0018's grant with this migration's for no benefit.
--
-- SELECT is left alone for all three, matching 0018's select policy and the
-- shape price_observations was left in by 0025.
-- ----------------------------------------------------------------------------

revoke update, delete, truncate on format_overrides
  from anon, authenticated, service_role;

revoke insert on format_overrides
  from anon, service_role;


-- ----------------------------------------------------------------------------
-- 2. The two constraint changes
--
-- The DROP is the load-bearing statement. See WHY AN EQUAL-VALUED ROW IS NOW
-- PERMITTED in the header: the rule survives, in a stricter form, inside
-- apply_format_override(), because its condition is another row and a CHECK
-- cannot see one. Deliberately no IF EXISTS: if the applied shape is not what
-- this migration expects, it must abort rather than proceed quietly.
--
-- The ADD closes the open half of 0018's `content_items_check1`, which stops
-- format_overridden = true with no reason and says nothing about a reason left
-- behind after the flag goes false. Without it, a withdrawal could leave the
-- retracted override's reason sitting on the item as though it still applied.
-- Layer B enforces this too; it is a table CHECK as well because a CHECK holds
-- for owner and superuser sessions with no trigger to reason about, and this
-- one is cheap and unconditional.
-- ----------------------------------------------------------------------------

alter table format_overrides
  drop constraint format_overrides_check;

alter table content_items
  add constraint content_items_override_reason_absent
  check (format_overridden or override_reason is null);


-- ----------------------------------------------------------------------------
-- 3. format_override_state() -- the one reading of the log
--
-- All three layers derive their expectations from this function, so they
-- cannot disagree about what the log says. Aggregate-only with no GROUP BY, so
-- it returns exactly one row for an item with no decisions: log_rows 0,
-- is_overridden false, every latest_* null.
--
-- is_overridden is a COUNT COMPARISON rather than a lookup of the newest row,
-- and that is the point: overrides exceed withdrawals by exactly one when an
-- override is in force, which is order-free and cannot be confused by two rows
-- sharing a timestamp. The latest_* values do need an order, which is what
-- Layer A's one-decision-per-transaction rule exists to keep well-defined.
--
-- p_exclude lets Layer A ask what the log said BEFORE the row being inserted.
-- It runs as an AFTER INSERT trigger -- so that a row rejected by a table
-- constraint never reaches the logic at all -- which means its own row is
-- already visible and must be discounted to see the prior state.
-- ----------------------------------------------------------------------------

create function format_override_state(
  p_item    uuid,
  p_exclude uuid default null
)
returns table (
  log_rows           bigint,
  is_overridden      boolean,
  latest_at          timestamptz,
  latest_chosen      text,
  latest_recommended text,
  latest_reason      text
)
language sql
stable
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where recommended is distinct from chosen)
      > count(*) filter (where recommended is not distinct from chosen),
    max(created_at),
    (array_agg(chosen      order by created_at desc))[1],
    (array_agg(recommended order by created_at desc))[1],
    (array_agg(reason      order by created_at desc))[1]
  from format_overrides
  where content_item_id = p_item
    and (p_exclude is null or id <> p_exclude);
$$;

comment on function format_override_state(uuid, uuid) is
  'The single reading of an item''s format decision log, used by all three '
  'consistency layers so none of them can disagree about what the log says. '
  'is_overridden is true when overrides outnumber withdrawals, which they do '
  'by exactly one while an override is in force (0026).';


-- ----------------------------------------------------------------------------
-- 4. Layer A -- apply_format_override(), the door
--
-- AFTER INSERT, so the row has already passed every table constraint and the
-- RLS policy before any of this runs, and the row this trigger reasons about
-- is one that will exist if the transaction commits.
--
-- Branch order is fixed and every branch carries its own message, so a
-- negative test can assert the SPECIFIC rejection it expects rather than
-- inferring one from a generic failure. Same discipline as 0025.
-- ----------------------------------------------------------------------------

create function apply_format_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid;
  v_item       content_items%rowtype;
  v_prior      record;
  v_new_flag   boolean;
  v_new_reason text;
begin
  -- 1. Identity comes from the session, once, and is compared to the column
  --    rather than taken from it. See IDENTITY IS NOT A COLUMN in the header.
  v_actor := auth.uid();

  if v_actor is null then
    raise exception
      'a format override is a human decision and must be logged by a signed-in session (P14.7, §8.11)';
  end if;

  if new.actor is distinct from v_actor then
    raise exception
      'format_overrides.actor must be the signed-in user; the log records whose judgement to retune against, and that is not a value the caller supplies (0024)';
  end if;

  -- 2. The parent, locked, so two concurrent decisions on one item serialise
  --    rather than both reading the same prior state.
  --
  --    The not-found branch is reachable despite the foreign key: referential
  --    integrity is enforced by internal AFTER triggers and Postgres fires
  --    AFTER row triggers in name order, so nothing guarantees the FK has been
  --    checked before this one runs.
  select * into v_item
  from content_items
  where id = new.content_item_id
  for update;

  if not found then
    raise exception
      'content item % does not exist', new.content_item_id;
  end if;

  -- 3. Authorisation, asked and answered rather than dodged. This function is
  --    SECURITY DEFINER and would otherwise apply the write on the owner's
  --    privileges; the two tests below are content_items_update_staff, stated
  --    explicitly. See THE PERMISSION MISMATCH THIS CLOSES in the header.
  if not can_promote(v_actor) then
    raise exception
      'only an admin, editor or contributor may override a recommended format (§7.2)';
  end if;

  if not (is_admin_or_editor(v_actor) or v_item.created_by = v_actor) then
    raise exception
      'you may log a format decision only on a content item you created; an editor or admin may log one on any item (content_items_update_staff)';
  end if;

  -- 4. Format is a live question in Draft studio and a settled one after it.
  if v_item.status not in ('queued', 'producing', 'ready', 'needs_work') then
    raise exception
      'content item % is at status %, past the point where its format is a live question; format is chosen at promote and in Draft studio (§8.11)',
      new.content_item_id, v_item.status;
  end if;

  -- 5. There must be a recommendation for the decision to be about.
  if v_item.recommended_format is null then
    raise exception
      'content item % has no recommended_format, so there is nothing to override and nothing to withdraw (§8.5)',
      new.content_item_id;
  end if;

  if new.recommended is distinct from v_item.recommended_format then
    raise exception
      'format_overrides.recommended is % but the item recommends %; the log must record the recommendation the decision was actually taken against',
      new.recommended, v_item.recommended_format;
  end if;

  -- 6. The prior state -- this row discounted. See format_override_state().
  select * into v_prior
  from format_override_state(new.content_item_id, new.id);

  if v_prior.latest_at is not null and v_prior.latest_at >= new.created_at then
    raise exception
      'content item % already carries a format decision logged at %, at or after this one; an override and its withdrawal are separate decisions taken at different moments and cannot share a transaction',
      new.content_item_id, v_prior.latest_at;
  end if;

  -- 7. Override or withdrawal, and the alternation that distinguishes them.
  if new.recommended is distinct from new.chosen then
    if v_prior.is_overridden then
      raise exception
        'content item % is already overridden to %; a second override in the same direction records no correction (0018)',
        new.content_item_id, new.chosen;
    end if;

    v_new_flag   := true;
    v_new_reason := new.reason;
  else
    if not v_prior.is_overridden then
      raise exception
        'recommended and chosen are both %, which records agreement with the recommendation rather than a decision; an equal-valued row is permitted only to withdraw an override currently in force (0018, 0026)',
        new.chosen;
    end if;

    v_new_flag   := false;
    v_new_reason := null;
  end if;

  -- 8. Apply. The FOUND test is belt and braces behind the explicit
  --    authorisation above: if a future policy change ever put an RLS filter
  --    back in this path, this raises instead of silently applying nothing.
  update content_items
  set format_overridden = v_new_flag,
      override_reason   = v_new_reason
  where id = new.content_item_id;

  if not found then
    raise exception
      'the format decision was logged but could not be applied to content item %',
      new.content_item_id;
  end if;

  return null;
end;
$$;

comment on function apply_format_override() is
  'AFTER INSERT trigger on format_overrides. The only writer of '
  'content_items.format_overridden and override_reason: validates the logged '
  'decision, requires actor to be the signed-in session, re-checks '
  'content_items_update_staff explicitly rather than relying on its own '
  'definer rights, and applies the derived flag and reason (0026).';


-- ----------------------------------------------------------------------------
-- 5. Layer B -- protect_format_override_flag(), the lock
--
-- Column-shaped, not identity-shaped: it never asks who is calling, only
-- whether the values being written are the ones the log supports. That makes
-- it hold for the owner, for service_role and for apply_format_override()
-- itself -- if Layer A were ever edited to write something the log does not
-- say, this rejects it.
--
-- It short-circuits when neither guarded column moved, so ordinary edits to a
-- content item -- and the second statement of every legitimate override, which
-- moves format and archetype -- pay nothing for it.
-- ----------------------------------------------------------------------------

create function protect_format_override_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state           record;
  v_expected_reason text;
begin
  if tg_op = 'INSERT' then
    if new.format_overridden then
      raise exception
        'a content item cannot be created already overridden: the format_overrides row recording the decision cannot exist before the item it points at (P0.2, 0026)';
    end if;

    if new.override_reason is not null then
      raise exception
        'override_reason cannot be set when a content item is created; it is a copy of the override currently in force and no decision can have been logged yet (P0.2, 0026)';
    end if;

    return new;
  end if;

  if new.format_overridden is not distinct from old.format_overridden
     and new.override_reason is not distinct from old.override_reason then
    return new;
  end if;

  select * into v_state from format_override_state(new.id);

  v_expected_reason := case
                         when v_state.is_overridden then v_state.latest_reason
                         else null
                       end;

  if new.format_overridden is distinct from v_state.is_overridden then
    raise exception
      'format_overridden is derived from format_overrides and is not an input: this write says % and the log for content item % says % (P0.2). Insert a format_overrides row instead of setting the column.',
      new.format_overridden, new.id, v_state.is_overridden;
  end if;

  if new.override_reason is distinct from v_expected_reason then
    raise exception
      'override_reason is derived from format_overrides and is not an input: this write says % and the log for content item % says % (P0.2). Insert a format_overrides row instead of setting the column.',
      coalesce(quote_literal(new.override_reason), 'null'),
      new.id,
      coalesce(quote_literal(v_expected_reason), 'null');
  end if;

  return new;
end;
$$;

comment on function protect_format_override_flag() is
  'BEFORE INSERT OR UPDATE trigger on content_items. Raises when '
  'format_overridden or override_reason is written to a value the item''s '
  'format_overrides log does not support. Raises rather than correcting: a '
  'wrong value here means a format was overridden without the decision being '
  'logged, which is P14.7''s failure, and silently repairing the row would '
  'destroy the only evidence of it (0026).';


-- ----------------------------------------------------------------------------
-- 6. Layer C -- assert_format_override_consistent(), the backstop
--
-- A DEFERRED CONSTRAINT TRIGGER, checking the end of the transaction rather
-- than the middle. It exists for the one failure the other two layers cannot
-- see: `update content_items set format = 'video', archetype = 'V1'` with no
-- format_overrides row ever inserted. Layer B short-circuits -- neither
-- guarded column moved -- and Layer A never fires, so without this the item
-- ends the transaction at a format that disagrees with its recommendation
-- while format_overridden reads false.
--
-- Re-reads the row by id rather than trusting NEW; see WHY LAYER C MUST BE
-- DEFERRED in the header. The not-found return covers an item created and
-- deleted inside one transaction.
--
-- It does NOT re-assert what Layer B holds. Layer B runs on every write to
-- those two columns, including apply_format_override()'s own, so a transaction
-- that reaches commit has already had each of those writes checked against the
-- log at the moment it happened.
-- ----------------------------------------------------------------------------

create function assert_format_override_consistent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item  content_items%rowtype;
  v_state record;
begin
  select * into v_item from content_items where id = new.id;

  if not found then
    return null;
  end if;

  select * into v_state from format_override_state(v_item.id);

  if v_state.log_rows > 0 then
    if v_item.format is distinct from v_state.latest_chosen then
      raise exception
        'content item % ends this transaction at format % while its latest format decision chose %; the item and its log must agree at commit (0026)',
        v_item.id, v_item.format, v_state.latest_chosen;
    end if;

    if v_item.recommended_format is distinct from v_state.latest_recommended then
      raise exception
        'content item % ends this transaction recommending % while its latest format decision was taken against %; a recommendation cannot move under a correction already recorded against it (0026)',
        v_item.id, v_item.recommended_format, v_state.latest_recommended;
    end if;
  end if;

  if v_item.recommended_format is null then
    if v_item.format_overridden then
      raise exception
        'content item % has no recommended_format and therefore cannot be overridden (0026)',
        v_item.id;
    end if;
  elsif v_item.format_overridden
        is distinct from (v_item.format is distinct from v_item.recommended_format) then
    raise exception
      'content item % ends this transaction at format % against a recommendation of % with format_overridden = %; changing a format without logging the decision leaves the flag lying about it (P14.7, 0018 contract 2)',
      v_item.id, v_item.format, v_item.recommended_format, v_item.format_overridden;
  end if;

  return null;
end;
$$;

comment on function assert_format_override_consistent() is
  'Deferred constraint trigger on content_items. Asserts at commit that the '
  'item''s format and recommended_format agree with its latest logged format '
  'decision, and that format_overridden agrees with format vs '
  'recommended_format. Catches the transaction that changes a format without '
  'logging the decision, which the immediate guards cannot see (0026).';


-- ----------------------------------------------------------------------------
-- 7. The three triggers
--
-- content_items already carries content_items_protect_status (BEFORE UPDATE).
-- Postgres fires same-timing triggers in name order, putting
-- content_items_protect_format_override before content_items_protect_status,
-- but nothing here depends on that: the two guards read disjoint columns and
-- neither can be tripped by the other's subject.
--
-- content_items has no updated_at column and therefore no set_updated_at
-- trigger from 0022; there is no interaction to reason about.
-- ----------------------------------------------------------------------------

create trigger format_overrides_apply
  after insert on format_overrides
  for each row execute function apply_format_override();

create trigger content_items_protect_format_override
  before insert or update on content_items
  for each row execute function protect_format_override_flag();

create constraint trigger content_items_assert_format_override
  after insert or update on content_items
  deferrable initially deferred
  for each row execute function assert_format_override_consistent();


-- ----------------------------------------------------------------------------
-- 8. None of these four functions is a client-facing function
--
-- PUBLIC is named alongside the roles because this database grants EXECUTE on
-- new functions in public to anon, authenticated and service_role BY NAME on
-- top of the implicit PUBLIC grant; revoking either half alone is a no-op that
-- reads like a lock (0024). Verified by reading proacl back after applying,
-- not by reading this file: all four now read {postgres=X/postgres}.
--
-- THE THREE TRIGGER FUNCTIONS ARE REVOKED TOO, and the reason is worth stating
-- because the opposite call is the intuitive one. A PL/pgSQL trigger function
-- refuses to run outside trigger context, so the grant conveys nothing a
-- caller could use, and the first draft of this migration left the three
-- alone on exactly that reasoning. That reasoning is incomplete: PostgREST
-- exposes every function in `public` that a role may execute, so the default
-- grants published /rest/v1/rpc/apply_format_override and its two siblings as
-- live endpoints reachable by anon, and Supabase's own linter flags all three
-- (0028_anon_security_definer_function_executable). An endpoint that only ever
-- returns an error is still an endpoint, and a SECURITY DEFINER one that
-- reviewers must re-derive the harmlessness of every time they read the
-- advisor output.
--
-- THE REVOKE DOES NOT STOP THE TRIGGERS FIRING. EXECUTE on a trigger function
-- is checked when the trigger is CREATED, not each time it fires, so a trigger
-- whose function is revoked from every role still runs for every role.
-- Verified rather than assumed, on 2026-09-01: with all three revoked, a
-- legitimate override by an `authenticated` contributor still applied through
-- Layer A, and a hand-written flag by that same session was still rejected by
-- Layer B with its own message.
--
-- format_override_state() is revoked for the ordinary reason: it is an
-- internal helper, and all three layers are SECURITY DEFINER and therefore
-- call it as the owner, so the revoke costs them nothing.
-- ----------------------------------------------------------------------------

revoke execute on function format_override_state(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function apply_format_override()
  from public, anon, authenticated, service_role;

revoke execute on function protect_format_override_flag()
  from public, anon, authenticated, service_role;

revoke execute on function assert_format_override_consistent()
  from public, anon, authenticated, service_role;
