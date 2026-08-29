-- ============================================================================
-- 0023_weight_proposal_decision_guard.sql
-- Closes a hole in protect_weight_proposal(), shipped in 0020_measurement.sql.
--
-- WHAT WAS WRONG. 0020's guard freezes the BODY of a proposal -- scope, key,
-- current_value, proposed_value, evidence, sample_size, proposed_at -- and it
-- makes a decision one-way, proposed -> accepted/rejected, once. It does not
-- freeze the DECISION RECORD. `decided_by` and `decided_at` appear nowhere in
-- the function, so on an already-decided row an authenticated editor can
-- reassign authorship of the decision to a different editor and move the
-- timestamp, and neither write raises. The status branch does not catch it
-- because it sits inside `if new.status is distinct from old.status`, and such
-- an update leaves status alone.
--
-- The CHECK constraints narrow this without closing it: weight_proposals_check
-- stops decided_by being nulled on an accepted row, and weight_proposals_check2
-- stops decided_at moving earlier than proposed_at. Swapping decided_by to
-- another valid profile, and shifting decided_at forward, are both unconstrained.
-- The UPDATE policy does not close it either -- weight_proposals_update_decide
-- is `is_admin_or_editor(auth.uid())` on USING and WITH CHECK, with no status
-- predicate, so any editor may write any column of any row.
--
-- WHY IT MATTERS BEYOND TIDINESS. P16.5 puts a person, by name, at the end of
-- every weight change: the proposer suggests and a human decides. decided_by is
-- the whole of that accountability and decided_at is when it happened. A record
-- of who decided, that any editor can quietly reassign to someone else after the
-- fact, is not a record. This is the rule 0020 already enforces on the
-- proposal's body, applied to the half of the row that names a human.
--
-- NOT AN EDIT TO 0020. 0020 is applied, and applied migrations are never edited
-- (see exceptions.md, which carries the standalone entry for this finding,
-- including why the original verification reported a false pass). This is a
-- fix-forward via CREATE OR REPLACE. The trigger weight_proposals_protect_decision
-- already points at this function by name and is deliberately left untouched:
-- replacing the function is the entire change, and dropping and re-adding the
-- trigger would remove a live guard for no reason.
--
-- SEPARATE FROM 0022. This does not touch the functions batch and does not
-- depend on it. It is numbered 0023 so 0022 stays free for that batch.
--
-- SERVICE-ROLE POSTURE UNCHANGED. The function still returns early when
-- auth.uid() is null, exactly as 0020 wrote it and for the reason 0020 gives:
-- the guard constrains humans, because that is the direction the risk runs in.
-- The proposer's own supersede write still passes through untouched.
-- ============================================================================

create or replace function protect_weight_proposal() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- The body of a proposal is the proposer's. Unchanged from 0020.
  if new.scope is distinct from old.scope
     or new.key is distinct from old.key
     or new.current_value is distinct from old.current_value
     or new.proposed_value is distinct from old.proposed_value
     or new.evidence is distinct from old.evidence
     or new.sample_size is distinct from old.sample_size
     or new.proposed_at is distinct from old.proposed_at then
    raise exception
      'a proposal is written by the system and decided by a person; it cannot be edited (P16.5)';
  end if;

  -- NEW IN 0023. The decision record is written once, by the decision itself,
  -- and is frozen from that moment. While old.status is still 'proposed' these
  -- two columns are being filled in by that decision and must stay writable;
  -- weight_proposals_check already forbids populating them on a row that
  -- remains 'proposed', so no separate guard is needed in that direction.
  if old.status <> 'proposed'
     and (new.decided_by is distinct from old.decided_by
          or new.decided_at is distinct from old.decided_at) then
    raise exception
      'this proposal was decided by a named person at a fixed moment; that record is final (P16.5)';
  end if;

  -- A decision is final. Unchanged from 0020.
  if new.status is distinct from old.status then
    if old.status <> 'proposed' then
      raise exception
        'this proposal is already %; a decision is final', old.status;
    end if;

    if new.status not in ('accepted', 'rejected') then
      raise exception
        'a person accepts or rejects a proposal; % is set by the proposer (P16.5)',
        new.status;
    end if;
  end if;

  return new;
end;
$$;
