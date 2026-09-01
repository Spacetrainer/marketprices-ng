-- ============================================================================
-- 0034_weight_proposal_decision_lock.sql
-- Closes the service-role escape in protect_weight_proposal(), and gives
-- weight_proposals the DELETE and TRUNCATE refusal it has never had.
--
-- WHAT IS WRONG TODAY, confirmed against the live function on 2026-09-01
-- (pg_proc.prosrc still contains the early return):
--
--     if auth.uid() is null then
--       return new;
--     end if;
--
-- That is the first statement in the function. Every rule below it -- the
-- frozen proposal body from 0020, the frozen decision record added by 0023,
-- and the one-way finality of a decision -- is skipped entirely whenever there
-- is no signed-in person behind the write. The guard is not weaker for
-- service-role; it is absent.
--
-- 0020 introduced the escape deliberately and said why: "the guard constrains
-- humans, because that is the direction the risk runs in." 0023 inherited it
-- deliberately too, and its header records the choice -- "SERVICE-ROLE POSTURE
-- UNCHANGED... The proposer's own supersede write still passes through
-- untouched." Both were reasonable calls about a table nobody could reach yet.
-- Neither survives the standard applied from 0025 onward, where the bypassing
-- role IS the threat and "no identified user" is precisely the case that must
-- still be blocked. audit_log (0021), price_observations (0025),
-- content_revisions / editorial_rules / site_events (0030) and signals /
-- price_anomalies (0033) are all unconditional. This is the last one that
-- is not.
--
-- WHAT THE ESCAPE ACTUALLY PERMITS TODAY, and it is not theoretical: any
-- service-role connection may rewrite `proposed_value` on a decided proposal,
-- reassign `decided_by` to a different editor, shift `decided_at`, flip an
-- accepted proposal to rejected, or move a settled row back to `proposed`.
-- P16.5 puts a named person at the end of every weight change; `decided_by` is
-- the whole of that accountability, and a record that any machine path can
-- silently reassign is not a record. This is the same exposure
-- docs/exceptions.md logs for the authenticated path, which 0023 closed --
-- reached through the door 0023 left open.
--
-- ============================================================================
-- WHY THIS TABLE IS NOT SHAPED LIKE 0033'S TWO
-- ============================================================================
--
-- 0033 partitioned signals and price_anomalies into machine columns, decision
-- columns and frozen identity, because on those tables an automated job
-- legitimately REWRITES a block of columns on every pass. weight_proposals has
-- no such block. Its automated writer INSERTS a proposal and then performs
-- exactly one update -- retiring an open proposal to `superseded` when it
-- computes a newer suggestion for the same setting. Everything else about the
-- row is written once and never again.
--
-- So this is a state machine over a SHARED column, not a column partition, and
-- `status` is the column both parties write:
--
--     proposed -> superseded          the proposer's, decided_at set,
--                                     decided_by left NULL because no person
--                                     superseded it -- the proposer did
--     proposed -> accepted|rejected   a person's, both decided_by and
--                                     decided_at required
--     anything else                   refused
--
-- Those footprints are not invented here; they are what weight_proposals_check1
-- already encodes as a CHECK ("WHEN 'superseded' THEN decided_at IS NOT NULL",
-- with decided_by unconstrained; accepted and rejected require both). The
-- CHECK says what a row may LOOK like. This guard says how a row may MOVE,
-- which a CHECK cannot express, and it is the movement that carries the
-- accountability.
--
-- THE BODY IS FROZEN UNCONDITIONALLY AND WITH NO CARVE-OUT: id, scope, key,
-- current_value, proposed_value, evidence, sample_size, proposed_at. Not once
-- the row is decided -- always, from the moment it exists, for every caller.
-- A proposal's body is the proposer's statement of what it observed; there is
-- no actor and no moment at which editing it is legitimate. Enumerated rather
-- than computed as a remainder, because unlike 0033's two tables there is no
-- machine block here for a future column to fall into: a column added to this
-- table later is either part of the proposal (and should be frozen, which
-- requires adding it to this list) or part of the decision (and needs its own
-- branch). Neither case has a safe default, so the list is explicit and a
-- future migration must think about it.
--
-- ============================================================================
-- NO INSERT BRANCH, DELIBERATELY, AND ONE GAP THIS LEAVES OPEN
-- ============================================================================
--
-- 0033 constrains INSERT on its two tables so a machine cannot fabricate a
-- decision by inserting an already-settled row. The equivalent hole exists
-- here -- weight_proposals_check1 is satisfied by an INSERT that arrives
-- already `accepted` with a decided_by pointing at a real editor, and with
-- DELETE now refused that is the one remaining way to author a human decision
-- without a human. It is NOT closed here, because the scope of this migration
-- was specified as the body freeze, the three transitions, and DELETE and
-- TRUNCATE refusal. Recorded as a known remaining gap rather than folded in
-- silently; it is three lines whenever it is wanted.
--
-- ============================================================================
-- MECHANICS
-- ============================================================================
--
-- CREATE OR REPLACE at the same signature, so the existing trigger
-- weight_proposals_protect_decision (BEFORE UPDATE, FOR EACH ROW, added by
-- 0020) keeps pointing at this function by name and picks up the new body
-- without being touched. 0023 made the same call for the same reason: dropping
-- and re-adding a live guard removes protection for no benefit.
--
-- TWO TRIGGERS ARE ADDED rather than the existing one being widened, for that
-- same reason. weight_proposals has never had any DELETE or TRUNCATE guard at
-- all -- the only trigger on the table is BEFORE UPDATE -- so a service-role
-- or owner session can drop a proposal and its decision record outright today.
-- P16.5's audit trail cannot survive a table whose rows can be deleted.
--
-- PLAIN FUNCTION, NO SECURITY DEFINER, NO search_path PIN: the body reads only
-- OLD, NEW and pg_catalog operators (to_jsonb, unnest, string_agg) and touches
-- no table and no schema-qualified object. Same posture as
-- protect_price_observation() (0025) and 0033's two guards, and the reason
-- 0027 gives for leaving this class of function unpinned holds here.
--
-- 0020 AND 0023 ARE NOT EDITED. Both are applied. This is a fix-forward.
-- ============================================================================

create or replace function protect_weight_proposal()
returns trigger
language plpgsql
as $$
declare
  c_body constant text[] := array[
    'id', 'scope', 'key', 'current_value', 'proposed_value',
    'evidence', 'sample_size', 'proposed_at'
  ];
  v_body_changed text;
begin
  -- ------------------------------------------------------------------------
  -- No early return. This is the whole point of the migration: the bypassing
  -- role is the threat, so a write with no identified user behind it is the
  -- case that must still be judged, not the case that is waved through.
  -- ------------------------------------------------------------------------

  if tg_op = 'DELETE' then
    raise exception
      'a weight proposal is never deleted: it is the record of a suggestion and of what a person decided about it (P16.5)';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'weight_proposals is not truncatable (P16.5)';
  end if;

  -- ------------------------------------------------------------------------
  -- 1. The body is frozen always, for every caller, at every status.
  -- ------------------------------------------------------------------------

  select string_agg(k, ', ' order by k)
    into v_body_changed
    from unnest(c_body) k
   where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;

  if v_body_changed is not null then
    raise exception
      'a proposal is written by the system and decided by a person; its body is never edited (P16.5). Changed: %',
      v_body_changed;
  end if;

  -- ------------------------------------------------------------------------
  -- 2. A settled proposal is final in every column, including who decided it
  --    and when. This is 0023's rule, now binding on every caller rather than
  --    only on signed-in ones.
  -- ------------------------------------------------------------------------

  if old.status <> 'proposed' then
    if new.status is distinct from old.status
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception
        'this proposal is already %; the decision, the person who made it and the moment they made it are all final (P16.5)',
        old.status;
    end if;

    return new;
  end if;

  -- ------------------------------------------------------------------------
  -- 3. From 'proposed', exactly three transitions are legitimate.
  -- ------------------------------------------------------------------------

  -- Still open. The decision record belongs to the decision; it may not be
  -- filled in ahead of one. (weight_proposals_check1 also forbids this shape,
  -- but a CHECK reports a constraint name where this reports the rule.)
  if new.status = 'proposed' then
    if new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception
        'a decision record is written by the decision itself: decided_by and decided_at may not be set while the proposal is still open (P16.5)';
    end if;

    return new;
  end if;

  -- The proposer's own retirement. No person superseded this proposal, so
  -- decided_by stays null and only the moment is recorded.
  if new.status = 'superseded' then
    if new.decided_at is null then
      raise exception
        'superseding a proposal records when it happened: decided_at is required (P16.5)';
    end if;

    if new.decided_by is not null then
      raise exception
        'no person superseded this proposal, the proposer did: decided_by stays null on a superseded row (P16.5)';
    end if;

    return new;
  end if;

  -- A human decision. P16.5 puts a named person at the end of every weight
  -- change, so both halves of the record are required together.
  if new.status in ('accepted', 'rejected') then
    if new.decided_by is null or new.decided_at is null then
      raise exception
        'accepting or rejecting a proposal records who decided and when: decided_by and decided_at are both required (P16.5)';
    end if;

    return new;
  end if;

  -- Unreachable while weight_proposals_status_check holds, and kept so that a
  -- fifth status added later fails loudly here instead of falling through.
  raise exception
    'a proposal moves from ''proposed'' to ''accepted'', ''rejected'' or ''superseded'' only; ''%'' is not a status a write may set (P16.5)',
    new.status;
end;
$$;

comment on function protect_weight_proposal() is
  'The weight_proposals decision lock (P16.5). Freezes the proposal body '
  'unconditionally, permits exactly three transitions out of ''proposed'' -- '
  'superseded (decided_at only, by the proposer), accepted and rejected (both '
  'decided_by and decided_at, by a person) -- and makes a settled row final in '
  'every column. Refuses every DELETE and TRUNCATE. Unconditional as of 0034: '
  'unlike the 0020/0023 versions it does NOT return early when auth.uid() is '
  'null, so it binds service_role and the table owner as well as signed-in '
  'staff.';

-- weight_proposals_protect_decision (BEFORE UPDATE FOR EACH ROW, from 0020)
-- already points at this function by name and is deliberately left in place.
-- These two add the coverage the table has never had.

create trigger weight_proposals_no_delete
  before delete on weight_proposals
  for each row execute function protect_weight_proposal();

-- Row triggers never fire for TRUNCATE; it needs its own statement trigger.
create trigger weight_proposals_no_truncate
  before truncate on weight_proposals
  for each statement execute function protect_weight_proposal();
