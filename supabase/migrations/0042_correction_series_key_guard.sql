-- ============================================================================
-- 0042_correction_series_key_guard.sql
-- corrects_id must point at a row in the SAME series. A correction corrects a
-- figure; it does not move one.
--
-- 0010_price_observations.sql gives corrects_id a foreign key, a UNIQUE (so a
-- row is corrected at most once and the chain never fans out) and a CHECK
-- that a row does not correct itself. Between them those three say that the
-- target EXISTS, is claimed only once, and is not this row. NOTHING SAYS THE
-- TARGET IS THE SAME PRICE. Today an admin or editor -- who still holds a
-- live INSERT policy on this table (price_observations_insert_staff), because
-- 0010's stated design is that staff hand-insert corrections -- can publish a
-- row for cassava that declares itself a correction of a row for rice, or a
-- 2026-W38 figure that corrects a 2026-W12 one. Every constraint in the
-- schema is satisfied. The public row-expansion history then draws a
-- correction between two prices that were never the same measurement.
--
-- THAT WAS ALWAYS WRONG AND 0041 MAKES IT WORSE, which is why this migration
-- exists now and is separate. Before 0041 there was at most one live price
-- per commodity, week and tier, so a mislabelled correction was a visible
-- absurdity across two obviously different series. After 0041 a week holds
-- TWO live prices, deliberately, and they differ in exactly one field. A row
-- inserted as a correction of the week's OTHER figure is no longer absurd on
-- its face -- it is one word wrong, it supersedes a price the reviewer did
-- not mean to retire, and because 0025 freezes every published column it
-- cannot be undone except by a further supersede and a further submission.
-- The second price of a week is not a correction of the first.
--
-- IT IS ITS OWN MIGRATION, AND THAT IS THE PROJECT OWNER'S RULING (2026-09-29)
-- AS WELL AS 0032'S STANDING RULE: "If a table's INSERT/UPDATE/DELETE posture
-- is wrong, that is a finding about that table, and it belongs in a migration
-- that says so and verifies it." 0041 amends P1.7. This closes a hole in
-- P1.3 that predates it. Bundling them would have left one revert impossible
-- without the other, and would have buried this guard in a migration whose
-- header is about something else.
--
-- WHAT IT COMPARES -- and the exclusion is the substance of the design:
--
--   commodity_id, tier, iso_year, iso_week   COMPARED. A correction is a
--       restatement of one measurement of one thing in one week. Change any
--       of these and it is a different series or a different week, and
--       "correction" is the wrong word for what is being published.
--
--   unit_role                                COMPARED. This is the field
--       0041 created and the reason for the timing. Correcting the primary
--       must not retire the secondary, or the other way round.
--
--   unit_id                                  NOT COMPARED, DELIBERATELY, and
--       this is the one that will look like an oversight to a later reader.
--       "We published the bowl price under the plate unit" is a legitimate
--       correction and is arguably the LIKELIEST correction this system will
--       ever need -- a unit is chosen from a dropdown by a collector working
--       quickly, and the figure is right while the label is wrong. Refusing
--       it would leave the only remedy a supersede with no replacement,
--       which puts a hole in the series (0010: "a supersede that is not
--       followed by an insert leaves the series with a hole rather than a
--       correction"). supabase/tests/price_decisions.sql asserts this
--       exclusion positively -- it inserts a unit-only correction and
--       requires that THIS guard let it through -- so a later reader who
--       "tightens" the comparison meets a failing test that explains itself.
--
--   price, currency, collected_on, site      NOT COMPARED. A correction
--       exists to change the figure; the rest is 0038's provenance guard's
--       business, and it holds every one of them to the correction's OWN
--       submission.
--
-- A TRIGGER, NOT A CONSTRAINT, because a CHECK cannot read another row and a
-- foreign key cannot compare columns. Same shape and same reasoning as 0025's
-- and 0038's guards: unconditional, identity-blind, no session flag to forge,
-- and it binds the owner and approve_price_submission() as readily as a
-- PostgREST insert by staff.
--
-- THE NAME IS CHOSEN FOR THE ORDER IT FIRES IN. PostgreSQL fires
-- same-event, same-timing triggers in trigger-NAME order.
-- price_observations_correction_series_key sorts before
-- price_observations_provenance, so a mislabelled correction is refused by
-- THIS guard's sentence -- which names the series -- rather than by the
-- provenance guard's, which would talk about a submission and send the
-- reviewer to the wrong place. The closing assertion checks that ordering
-- explicitly rather than trusting the alphabet to stay convenient: the two
-- are the only BEFORE INSERT triggers on this table (read 2026-09-29), and a
-- third one inserted between them by name would silently change which error
-- a reviewer sees.
--
-- NOT SECURITY DEFINER, and that is a departure from 0038's guard worth
-- stating. 0038's reads price_submissions, which is staff-only, so run as the
-- caller it could fail to see a row that exists and misdescribe its own
-- refusal. This one reads price_observations, whose SELECT policy is
-- `using (true)` for anon and authenticated alike (0010,
-- price_observations_select_public) -- every caller already sees every row,
-- superseded ones included. Definer rights would buy nothing and would add a
-- function running as owner for no reason. search_path is pinned regardless,
-- as every function in this build pins it.
--
-- APPLIES CLEANLY TO WHAT IS ON DISK. Read 2026-09-29 against
-- marketprices-rebuild: 26 price_observations, every one of them an original
-- (corrects_id null) -- the guard's WHERE clause is `corrects_id is not
-- null`, so there is nothing for it to judge and no existing row it could
-- retroactively invalidate. The closing assertion confirms the count rather
-- than repeating the sentence.
-- ============================================================================


-- ============================================================================
-- 1. The guard
-- ============================================================================
--
-- RETURNS EARLY ON AN ORIGINAL. Every insert on this table passes through
-- here, and the overwhelming majority carry no corrects_id at all; the null
-- check is the first statement so an ordinary approval pays one comparison.
--
-- THE "NOT FOUND" BRANCH IS UNREACHABLE while corrects_id keeps its foreign
-- key, and is kept for 0038's reason verbatim: a guard must not silently pass
-- when its premise is missing. A series check that no-ops on an absent target
-- is worse than no series check, because it reads as protection.
--
-- ONE COMBINED BRANCH FOR THE FOUR SERIES COLUMNS, and a SEPARATE ONE FOR THE
-- ROLE, rather than five messages or one. The four say the same thing -- this
-- is a different price -- and a reviewer who crossed a commodity does not
-- need to be told which of four columns tipped it off, because the message
-- prints both keys in full. The role is split out because its failure is a
-- DIFFERENT MISTAKE with a different remedy: the reviewer meant to publish a
-- second price for the week and reached for corrects_id, and the sentence has
-- to say so in those words or they will go and edit the commodity.
-- ----------------------------------------------------------------------------

create function protect_price_observation_correction_series()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target price_observations%rowtype;
begin
  if new.corrects_id is null then
    return new;
  end if;

  select * into v_target
    from price_observations
   where id = new.corrects_id;

  if not found then
    raise exception
      'price observation declares itself a correction of %, which does not exist (P1.3)',
      new.corrects_id;
  end if;

  if new.commodity_id is distinct from v_target.commodity_id
     or new.tier      is distinct from v_target.tier
     or new.iso_year  is distinct from v_target.iso_year
     or new.iso_week  is distinct from v_target.iso_week then
    raise exception
      'a correction must be in the same series as the row it corrects (P1.3): this row is commodity %, % tier, ISO week %-%, but row % is commodity %, % tier, ISO week %-%',
      new.commodity_id, new.tier, new.iso_year, new.iso_week,
      v_target.id, v_target.commodity_id, v_target.tier, v_target.iso_year, v_target.iso_week;
  end if;

  if new.unit_role is distinct from v_target.unit_role then
    raise exception
      -- The closing clause is lower case and stays that way: it is the phrase
      -- supabase/tests/price_decisions.sql matches on, and LIKE is case
      -- sensitive. Re-capitalising it after a full stop would read better and
      -- break the test with a message that looks correct.
      'a correction must hold the same role as the row it corrects: this row is the % figure for its week and row % is the % one, so correcting it would retire a price nobody said was wrong; the second price of a week is not a correction of the first (P1.7, P1.3)',
      new.unit_role, v_target.id, v_target.unit_role;
  end if;

  return new;
end;
$$;

comment on function protect_price_observation_correction_series() is
  'BEFORE INSERT guard on price_observations (P1.3). When corrects_id is set, '
  'refuses any correction whose commodity, tier, ISO week or unit_role '
  'differs from the row it corrects. unit_id is deliberately NOT compared: '
  'publishing a price under the wrong unit is a legitimate correction, and '
  'arguably the likeliest one. Unconditional and identity-blind. Fires before '
  'price_observations_provenance by name, so a mislabelled correction is '
  'refused in the language of the series rather than of the submission.';

create trigger price_observations_correction_series_key
  before insert on price_observations
  for each row execute function protect_price_observation_correction_series();

-- EXECUTE on a trigger function is checked when the trigger is CREATED, not
-- each time it fires (established and verified in docs/exceptions.md), so
-- this removes a grant no caller can use and clears the standing Supabase
-- linter WARN. It changes nothing about enforcement. Same revoke 0038 applied
-- to protect_price_observation_provenance(), for the same two reasons.
revoke execute on function protect_price_observation_correction_series()
  from public, anon, authenticated, service_role;


-- ============================================================================
-- 2. The closing assertion
-- ============================================================================
--
-- The trigger exists, it fires on the right event, it fires BEFORE the
-- provenance guard, and there is nothing already in the table that it would
-- have refused. Raising here aborts the migration's transaction, so a failure
-- leaves the schema exactly as it was.
--
-- THE ORDERING CHECK IS THE ONE WORTH READING. It does not assert the two
-- names in the abstract; it asks the catalogue for every BEFORE INSERT row
-- trigger on price_observations in firing order and insists this one comes
-- first. That survives a third trigger being added later -- it will fail, and
-- whoever added it will have to decide where it belongs rather than discover
-- the answer from a confusing error message months afterwards.
-- ----------------------------------------------------------------------------

do $$
declare
  v_first       text;
  v_mismatched  int;
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace
       and c.relname = 'price_observations'
       and t.tgname  = 'price_observations_correction_series_key'
       and not t.tgisinternal
       and t.tgtype & 2 = 2   -- BEFORE
       and t.tgtype & 4 = 4   -- INSERT
       and t.tgtype & 1 = 1   -- FOR EACH ROW
  ) then
    raise exception
      'the correction series guard is not installed as a BEFORE INSERT row trigger on price_observations';
  end if;

  select t.tgname into v_first
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname = 'price_observations'
     and not t.tgisinternal
     and t.tgtype & 2 = 2
     and t.tgtype & 4 = 4
   order by t.tgname
   limit 1;

  if v_first <> 'price_observations_correction_series_key' then
    raise exception
      'the first BEFORE INSERT trigger on price_observations is %, not the correction series guard. Triggers fire in name order, so a mislabelled correction would now be refused by the wrong guard, with a message that sends the reviewer to the wrong place.',
      v_first;
  end if;

  -- Nothing on disk contradicts the new rule. 26 originals today, so this
  -- counts zero out of zero -- which is worth asserting precisely because it
  -- is the claim that makes this migration safe to apply to live data.
  select count(*) into v_mismatched
    from price_observations n
    join price_observations t on t.id = n.corrects_id
   where n.commodity_id is distinct from t.commodity_id
      or n.tier         is distinct from t.tier
      or n.iso_year     is distinct from t.iso_year
      or n.iso_week     is distinct from t.iso_week
      or n.unit_role    is distinct from t.unit_role;

  if v_mismatched <> 0 then
    raise exception
      '% published corrections point at a row in a different series or role. This guard only binds new inserts, so these would survive it -- they need superseding and re-publishing before it can be trusted (P1.3).',
      v_mismatched;
  end if;
end;
$$;
