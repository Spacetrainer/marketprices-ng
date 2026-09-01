-- ============================================================================
-- 0035_weight_proposal_born_open.sql
-- Closes the INSERT gap 0034 named and deliberately left open.
--
-- 0034's header records it as a known remaining gap:
--
--     "NO INSERT BRANCH, DELIBERATELY, AND ONE GAP THIS LEAVES OPEN... the
--      equivalent hole exists here -- weight_proposals_check1 is satisfied by
--      an INSERT that arrives already `accepted` with a decided_by pointing at
--      a real editor, and with DELETE now refused that is the one remaining
--      way to author a human decision without a human."
--
-- This is that branch. A proposal must be born genuinely open: status
-- 'proposed', decided_by null, decided_at null. It is the same rule 0033
-- already applies to signals and price_anomalies ("a signal is scored, never
-- authored"; "an anomaly is computed, never authored"), stated for the one
-- table that did not get it.
--
-- WHY THIS IS NOT A CHECK CONSTRAINT, SETTLED BY EXPERIMENT RATHER THAN BY
-- PREFERENCE. weight_proposals_check1 already governs this table's shape, so a
-- second CHECK is the obvious first instinct and it is wrong. A CHECK
-- constraint is a row-state invariant: it is evaluated on every INSERT AND
-- every UPDATE, and it cannot see which one is happening. The candidate
--
--     check (status = 'proposed' and decided_by is null and decided_at is null)
--
-- was added to the live table inside a rolled-back transaction on 2026-09-01
-- and exercised. It did close the gap -- inserting a pre-accepted proposal was
-- rejected -- and it also rejected THE LEGITIMATE ACCEPT TRANSITION and THE
-- LEGITIMATE PROPOSER SUPERSEDE, both with the same constraint violation,
-- because an accepted row does not satisfy an invariant that says every row is
-- open. Dropping the constraint and repeating the accept confirmed the
-- transition itself was fine. A CHECK expressing "born open" therefore does
-- not express "born open" at all; it expresses "always open", which forbids
-- the table's entire lifecycle.
--
-- This is the same distinction 0034's own header draws between the two
-- instruments: "The CHECK says what a row may LOOK like. This guard says how a
-- row may MOVE." Creation is a move -- from nothing to a first state -- so it
-- belongs with the other transitions, in the trigger, beside them.
--
-- MECHANICS. CREATE OR REPLACE at the same signature, so the three existing
-- triggers (weight_proposals_protect_decision on UPDATE from 0020,
-- weight_proposals_no_delete and weight_proposals_no_truncate from 0034) keep
-- pointing at this function by name and are not touched. One new trigger adds
-- the INSERT timing the table has never had. Same posture 0034 took: a live
-- guard is never dropped to widen it.
--
-- The INSERT branch sits after the DELETE and TRUNCATE branches and before any
-- reference to OLD, which does not exist on an INSERT. Everything from the
-- body freeze onward is byte-identical to the applied 0034 version.
--
-- UNCONDITIONAL, like the rest of the function since 0034: no auth.uid()
-- escape, so this binds the proposer job running under service-role exactly as
-- it binds a signed-in editor. The proposer is unaffected in normal operation
-- -- status defaults to 'proposed' and a new proposal has nothing to decide --
-- which is the point: the rule costs the legitimate writer nothing and removes
-- the last path to a fabricated decision.
--
-- WITH THIS APPLIED, every route to a decision record on this table is closed
-- except the two real ones: the proposer may open a proposal and later
-- supersede it, and a person may accept or reject it. A decision cannot be
-- inserted, cannot be edited, cannot be reassigned, cannot be deleted and
-- cannot be truncated away.
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
  if tg_op = 'DELETE' then
    raise exception
      'a weight proposal is never deleted: it is the record of a suggestion and of what a person decided about it (P16.5)';
  end if;

  if tg_op = 'TRUNCATE' then
    raise exception
      'weight_proposals is not truncatable (P16.5)';
  end if;

  -- ------------------------------------------------------------------------
  -- 0. NEW IN 0035. A proposal is born open.
  --
  -- Must precede every reference to OLD, which does not exist on an INSERT.
  -- weight_proposals_check1 permits a row to arrive already 'accepted' with a
  -- decided_by naming a real editor; with DELETE refused since 0034, that was
  -- the last way to author a human decision without a human.
  -- ------------------------------------------------------------------------

  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then
      raise exception
        'a proposal is born open: a new row starts at status ''proposed'', not ''%''. A decision is recorded by a later transition, never at insert (P16.5)',
        new.status;
    end if;

    if new.decided_by is not null or new.decided_at is not null then
      raise exception
        'a newly created proposal carries no decision: decided_by and decided_at must be null at insert (P16.5)';
    end if;

    return new;
  end if;

  -- ------------------------------------------------------------------------
  -- Everything below is unchanged from 0034.
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

  if new.status = 'proposed' then
    if new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception
        'a decision record is written by the decision itself: decided_by and decided_at may not be set while the proposal is still open (P16.5)';
    end if;

    return new;
  end if;

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

  if new.status in ('accepted', 'rejected') then
    if new.decided_by is null or new.decided_at is null then
      raise exception
        'accepting or rejecting a proposal records who decided and when: decided_by and decided_at are both required (P16.5)';
    end if;

    return new;
  end if;

  raise exception
    'a proposal moves from ''proposed'' to ''accepted'', ''rejected'' or ''superseded'' only; ''%'' is not a status a write may set (P16.5)',
    new.status;
end;
$$;

comment on function protect_weight_proposal() is
  'The weight_proposals decision lock (P16.5). A proposal is born open '
  '(0035), its body is frozen unconditionally, exactly three transitions out '
  'of ''proposed'' are permitted -- superseded (decided_at only, by the '
  'proposer), accepted and rejected (both decided_by and decided_at, by a '
  'person) -- and a settled row is final in every column. Refuses every DELETE '
  'and TRUNCATE. Unconditional: no auth.uid() escape, so it binds service_role '
  'and the table owner as well as signed-in staff.';

-- The three existing triggers already point at this function by name and are
-- deliberately left in place. This adds the INSERT timing the table has never
-- had.

create trigger weight_proposals_insert_open
  before insert on weight_proposals
  for each row execute function protect_weight_proposal();
