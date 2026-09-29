-- ============================================================================
-- 0041_two_prices_per_tier.sql
-- P1.7, amended: at most TWO live prices per commodity, per ISO week, per
-- tier -- in DIFFERENT units, one `primary` and one `secondary`.
--
-- 0010_price_observations.sql built the series univariate and said so in its
-- first paragraph: "One price per commodity, per ISO week, per tier (P1.7) --
-- univariate by construction." The unique index below that sentence,
-- price_observations_live_series_key, is the whole of the enforcement, and
-- the protocol's own reasoning for it was that "a second observation for the
-- same key is a correction (P1.3), not an additional data point, and the
-- system offers no way to average two of them".
--
-- THE MARKET DISAGREES WITH THE FIRST CLAUSE AND NOT THE SECOND. The weekly
-- tracker prices rodo by the paint bucket AND by the plate in the same week,
-- and long-grain rice by the 50 kg bag AND by the 25 kg bag. Those are two
-- prices, both true, neither a correction of the other. Under the old index
-- the second one cannot be published at all: approve_price_submission()
-- refuses it as a duplicate and tells the reviewer to go and supersede a
-- figure that is not wrong. The collector's second reading is simply lost.
--
-- Averaging is still impossible and is still never offered. units
-- .base_multiplier is null on every row (0036: "not yet weighed"), so no
-- conversion between a bucket and a plate exists to average them WITH. The
-- two figures sit side by side, each labelled with its unit, and the
-- `primary` is the one public surfaces lead with.
--
-- THIS IS AN AMENDMENT, NOT AN EXCEPTION. P13 lists P1.7 among the rules with
-- no exception procedure, so this cannot go in docs/exceptions.md and should
-- not: an exception is a documented deviation from a rule that still stands,
-- and this rule no longer stands in the form it was written. The project
-- owner changed it on 2026-09-29. docs/build-protocol.md and CLAUDE.md carry
-- the amended text and name this migration.
--
-- WHAT THIS MIGRATION DOES, in the order the sections appear:
--   1. unit_role on price_observations -- NOT NULL, two values, and every
--      existing row tagged `primary` without touching a single one of them.
--   2. unit_role on price_submissions -- nullable, a PROPOSAL at intake and
--      the RECORD of the decision after approval.
--   3. The index swap: one unique index out, two in.
--   4. approve_price_submission(), re-created at five arguments, resolving
--      the role and refusing a third price four different ways.
--   5. protect_price_observation_provenance(), extended to eleven
--      comparisons so the role a submission authorised is the role that is
--      published.
--   6. The closing assertion.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--
--   - IT DOES NOT PROMOTE A SECONDARY TO PRIMARY, and nothing else does
--     either. 0025's append-only lock freezes every column of a published
--     row except superseded_at, and it does that with a whole-row jsonb
--     comparison, so it reaches unit_role the moment the column exists --
--     without an edit to 0025 and without this migration asking. Re-ranking
--     which figure a week leads with is therefore a supersede plus a fresh
--     submission (P1.3), exactly like changing the price. That is a real
--     cost, it is stated in the protocol amendment, and it is the right cost:
--     which measure a commodity is quoted in is an editorial commitment, and
--     a reader who saw the week lead with the bucket price should be able to
--     see that it did.
--
--   - IT DOES NOT MAKE A THIRD ROLE POSSIBLE. There are exactly two values
--     and the cap IS the vocabulary: with `primary` and `secondary` taken, a
--     third live price has no role left to hold, and the role index in
--     section 3 refuses it without needing to count anything. A fourth value
--     was considered and ruled out by the project owner on 2026-09-29.
--
--   - IT DOES NOT TOUCH price_observations_series_lookup. The series is now
--     commodity + tier + unit, so (commodity_id, tier, unit_id, iso_year,
--     iso_week desc) would suit the route's new per-unit baseline read
--     better. It would ALSO push iso_year/iso_week out of reach of section
--     4's whole-week lookup, which is the hotter of the two on the path that
--     matters. With 26 rows in the table neither plan is measurable, and
--     swapping an index on a guess is how a migration acquires a change
--     nobody can defend. When the series is large enough for the question to
--     have an answer, it is its own migration with its own timings.
--
--   - IT DOES NOT OPEN THE CORRECTION PATH. Section 5 now requires a
--     published row's unit_role to match its submission's, and only
--     approve_price_submission() ever sets a submission's unit_role. A
--     hand-inserted correction therefore still needs an APPROVED submission
--     that is not already spent, which submission_id's UNIQUE makes
--     unreachable -- exactly as unreachable as it was before this migration,
--     for exactly the same reason. 0038's header records that gap; this
--     neither widens nor closes it.
--
-- APPLIES CLEANLY TO WHAT IS ON DISK. Read 2026-09-29 against
-- marketprices-rebuild: 26 price_observations, all live (superseded_at
-- null), across 4 distinct units, occupying 26 DISTINCT (commodity, tier,
-- ISO year, ISO week) keys -- so not one of them shares a key with another,
-- and every one of them is the only figure its week has. 26 price_submissions,
-- all 'approved', one per observation. Section 1's backfill therefore states
-- a fact about all 26 rather than choosing between candidates, and both
-- indexes in section 3 are satisfiable the moment they are built.
-- ============================================================================


-- ============================================================================
-- 1. price_observations.unit_role -- which of the week's at-most-two prices
--    this row is
-- ============================================================================
--
-- NOT NULL, because a published price that does not say whether it leads its
-- week is a figure no surface knows what to do with. There is no third state
-- and no "unranked".
--
-- ADDED WITH A DEFAULT AND THEN STRIPPED OF IT, in that order, and both
-- halves are load bearing:
--
--   THE DEFAULT IS HOW THE 26 EXISTING ROWS GET A ROLE WITHOUT BEING
--   TOUCHED. price_observations is append-only and 0025's trigger enforces
--   it for the owner too, so `update price_observations set unit_role =
--   'primary'` would be refused by this project's own law -- and rightly.
--   ALTER TABLE ADD COLUMN ... DEFAULT is not an UPDATE: since PostgreSQL 11
--   it records the value in pg_attribute.attmissingval and rewrites nothing,
--   so no row version is created, no trigger fires, and every existing row
--   keeps its ctid and its xmin. The closing assertion in section 6 checks
--   exactly that rather than trusting the paragraph.
--
--   'primary' IS A DESCRIPTION OF THOSE ROWS, NOT AN ASSUMPTION ABOUT THEM
--   (P0.2). Each of the 26 is the sole live price for its commodity, tier and
--   ISO week -- verified above, 26 rows across 26 distinct keys -- which is
--   to say each one IS the figure every surface currently shows. The backfill
--   writes down what is already true on the public site. It is not a guess
--   about which of two measures someone would have preferred, because there
--   is no second measure anywhere in the table to prefer.
--
--   DROPPING THE DEFAULT IS WHAT KEEPS IT FROM BECOMING AN ASSUMPTION ABOUT
--   THE FUTURE. Left in place, `insert into price_observations (...)` without
--   a role would silently publish a leading figure -- the exact shape of P0.2
--   violation this build refuses everywhere else. After the drop, an insert
--   that omits the role fails on NOT NULL, and every caller must say which
--   price it is publishing. price_observations_insert_staff is still a live
--   INSERT policy (0010), so that caller is not hypothetical.
--
-- A NAMED CHECK CONSTRAINT rather than an anonymous one, so section 6 and any
-- later negative test can assert the specific rejection. The same call 0038's
-- section 1 makes about its five correction checks.
-- ----------------------------------------------------------------------------

alter table price_observations
  add column unit_role text not null default 'primary';

alter table price_observations
  add constraint price_observations_unit_role_valid
    check (unit_role in ('primary', 'secondary'));

alter table price_observations
  alter column unit_role drop default;

comment on column price_observations.unit_role is
  'Which of the at-most-two live prices for this commodity, ISO week and '
  'tier this row is (P1.7 as amended by 0041). `primary` is the figure every '
  'public surface leads with; `secondary` is the same commodity quoted in a '
  'second unit in the same week -- a paint bucket beside a plate. The two are '
  'NEVER averaged or compared: units.base_multiplier is null on every unit '
  '(0036), so no conversion between them exists. Frozen once published by '
  '0025''s whole-row append-only lock, so re-ranking is a supersede plus a '
  'fresh submission (P1.3). NOT NULL with no default: a caller that does not '
  'say which price it is publishing is refused, never defaulted (P0.2).';


-- ============================================================================
-- 2. price_submissions.unit_role -- a proposal at the door, a record after
--    the decision
-- ============================================================================
--
-- NULLABLE, and null is the ordinary case rather than a degraded one. The
-- Google Form does not ask which measure a page should lead with and must not
-- start: a collector standing in front of a stall has no view on that, and
-- inventing one for them would put an editorial judgement in the evidence
-- column. So every form submission arrives here with null.
--
-- IT IS WRITABLE AT INTAKE ANYWAY, because the tracker importer needs a door.
-- scripts/import-tracker.ts reads a reviewed map file naming the primary unit
-- per commodity per tier, and that proposal has to reach the review queue
-- through THE ONE DOOR IN (P1.1) rather than by a second write path into
-- price_observations. A value here is a suggestion to the reviewer and
-- nothing more -- section 4 overwrites it with the role it actually
-- published.
--
-- AFTER APPROVAL IT IS THE RECORD OF THE DECISION, and that is what makes
-- section 5's eleventh comparison possible: the provenance guard can only
-- hold a published row to a role if the submission carries the role it
-- authorised.
--
-- THE BACKFILL RUNS THE OTHER WAY ROUND FROM SECTION 1's. It reads the role
-- off the observation each submission already published and copies it back,
-- which is a derivation from a published fact rather than a default. Without
-- it the 26 decided submissions would disagree with the 26 rows they
-- authorised -- null against 'primary' -- and the guard's premise would be
-- false for every row in the table on the day it is installed.
--
-- IT IS A PLAIN UPDATE, which is legal here for two reasons that both need
-- stating. price_submissions has no append-only trigger -- 0038's section 5
-- records that as a deliberate scope decision and a pending finding -- so
-- nothing refuses this write at the table level. And 0038's `revoke update`
-- covers anon, authenticated and service_role, not the owner a migration runs
-- as. This is the migration exercising the one privilege that revoke leaves
-- standing, on 26 rows, to state something already true of them.
-- ----------------------------------------------------------------------------

alter table price_submissions
  add column unit_role text;

alter table price_submissions
  add constraint price_submissions_unit_role_valid
    check (unit_role in ('primary', 'secondary'));

update price_submissions s
   set unit_role = o.unit_role
  from price_observations o
 where o.submission_id = s.id
   and s.unit_role is null;

comment on column price_submissions.unit_role is
  'Which of the at-most-two prices for this commodity, ISO week and tier this '
  'one is (P1.7 as amended by 0041). Null at intake on every form submission '
  'and that is normal -- the form does not ask, because which measure a page '
  'leads with is an editorial decision and a collector at a stall has no view '
  'on it. The tracker importer MAY send one as a proposal. '
  'approve_price_submission() overwrites it with the role it published, after '
  'which this column is the record the provenance guard holds the published '
  'row to.';


-- ============================================================================
-- 3. The index swap -- one out, two in
-- ============================================================================
--
-- price_observations_live_series_key (0010) is
-- (commodity_id, iso_year, iso_week, tier) partial on superseded_at is null,
-- and it is the entire enforcement of the rule this migration amends. It goes.
--
-- TWO INDEXES REPLACE IT BECAUSE THE AMENDED RULE HAS TWO HALVES, and one
-- compound index cannot state both:
--
--   ..._live_role_key   -- AT MOST TWO. With exactly two permitted role
--                          values, uniqueness on the role IS the cap: a third
--                          live price for one commodity, week and tier has no
--                          role left to take, whichever one it claims. This
--                          is why section 1 needed no count and no trigger.
--
--   ..._live_unit_key   -- IN DIFFERENT UNITS. Without this, a week could
--                          hold two prices for the SAME unit by labelling one
--                          of them secondary -- two live figures for one
--                          series, which is the univariate rule the original
--                          P1.7 was actually protecting and which is NOT
--                          amended. Two prices for one unit in one week is a
--                          correction (P1.3), not a second measure.
--
-- BOTH PARTIAL ON superseded_at is null, for 0010's reason verbatim: "a
-- superseded row keeps its series key forever", so the constraint is that at
-- most one LIVE row exists per key, which is exactly what the reader sees.
-- Corrections accumulate underneath both indexes without ever colliding.
--
-- THE INDEXES ARE THE GUARANTEE; SECTION 4'S BRANCHES ARE THE SENTENCE.
-- 0038's division of labour, applied here. approve_price_submission() takes
-- FOR UPDATE on the submission row, not on the week, so two reviewers
-- approving two DIFFERENT submissions into the same week at the same instant
-- can both pass section 4's checks. What stops the second one is the unique
-- index, at commit, unconditionally -- and that is the layer that also binds
-- a direct staff INSERT, which never runs section 4 at all.
-- ----------------------------------------------------------------------------

drop index price_observations_live_series_key;

create unique index price_observations_live_role_key
  on price_observations (commodity_id, iso_year, iso_week, tier, unit_role)
  where superseded_at is null;

create unique index price_observations_live_unit_key
  on price_observations (commodity_id, iso_year, iso_week, tier, unit_id)
  where superseded_at is null;

comment on index price_observations_live_role_key is
  'P1.7 as amended (0041): at most two live prices per commodity, ISO week '
  'and tier. With exactly two permitted unit_role values, uniqueness on the '
  'role is the cap -- a third live price has no role left to claim.';

comment on index price_observations_live_unit_key is
  'P1.7 as amended (0041): the week''s two live prices must be in DIFFERENT '
  'units. Two live prices for one commodity, week, tier AND unit is the '
  'univariate rule that is NOT amended -- that is a correction (P1.3), not a '
  'second measure.';


-- ============================================================================
-- 4. approve_price_submission() at five arguments -- the role resolved, and a
--    third price refused four ways
-- ============================================================================
--
-- THE FOUR-ARGUMENT FORM IS DROPPED, NOT SHADOWED. p_unit_role could have
-- been added with a default, leaving both signatures resolvable; that would
-- have been worse in a way that is easy to miss. A four-argument call would
-- keep resolving to the OLD body, which knows nothing about unit_role, writes
-- none onto the submission, and inserts an observation without one -- dying
-- on section 1's NOT NULL with a constraint violation instead of a sentence,
-- at the end of a function that has already updated the submission. Dropping
-- it makes any stale caller fail at parse time with "function does not
-- exist", which is a legible error at the right moment. lib/queries/
-- price-review.ts calls it with all five.
--
-- WHAT IS UNCHANGED FROM 0038, and why it is repeated verbatim rather than
-- refactored: the authorisation gate, the FOR UPDATE, the status check, the
-- correction-argument branches, and the three ISO week checks. CREATE OR
-- REPLACE cannot change a function's argument list, so the whole body has to
-- be restated; restating it is not an invitation to improve it. The only
-- behavioural change in this function is the P1.7 block, plus unit_role in
-- the UPDATE, the INSERT and the audit entry.
--
-- p_week_start_date IS STILL AN ARGUMENT AND IS STILL ONLY EVER CHECKED.
-- 0038's bargain with P2.7 stands: a second implementation of ISO week
-- boundaries is the failure this project can least afford, so the three
-- branches below compare the caller's Monday against the submission's stored
-- week and compute nothing anything reads.
--
-- THE P1.7 BLOCK, in the order the branches must run, because the order is
-- what decides WHICH TRUE SENTENCE a refused reviewer reads:
--
--   (a) SAME UNIT ALREADY LIVE -> refused as a duplicate, FIRST. A second
--       paint-bucket price in a week that already has one is one figure
--       twice, no matter which role it asks for. If the role branches ran
--       first, a reviewer re-submitting a bucket price into a week whose
--       secondary slot is taken would be told the secondary slot is taken --
--       true, irrelevant, and it would send them looking for a free slot
--       instead of at the correction path they actually need.
--
--   (b) NO ROLE GIVEN. With nothing live, it resolves to 'primary': a lone
--       price IS the figure every surface shows, which is a description, not
--       an inference. With ANYTHING live, it is REFUSED. This is the branch
--       this whole design exists for. Reading silence as "the remaining slot"
--       would make which figure a commodity leads with a function of which
--       submission the reviewer happened to click first -- an assumption
--       about a value nobody stated, which is P0.2, and one that 0025 then
--       freezes forever.
--
--   (c) THE ROLE IS TAKEN -> refused, naming the role and the tier.
--
--   (d) SECONDARY WITH NO PRIMARY -> refused. A week whose only published
--       price is `secondary` has a figure no surface displays, and because
--       0025 freezes the role it could never be promoted into view: the
--       collector's reading would be permanently invisible. The first price
--       of a week is always the primary.
--
-- EACH BRANCH RAISES ITS OWN MESSAGE. supabase/tests/price_decisions.sql
-- asserts against the message text, not merely that something raised -- four
-- refusals share this block and a test that only checked for an exception
-- would pass while the wrong branch spoke.
--
-- THE LIVE WEEK IS READ ONCE, into four aggregates, rather than four times.
-- One scan, and every branch judges the same snapshot -- four separate
-- EXISTS probes could in principle disagree with each other.
-- ----------------------------------------------------------------------------

drop function approve_price_submission(uuid, date, numeric, text);

create function approve_price_submission(
  p_submission_id     uuid,
  p_week_start_date   date,
  p_corrected_price   numeric default null,
  p_correction_reason text default null,
  p_unit_role         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor         uuid;
  v_sub           price_submissions%rowtype;
  v_reason        text;
  v_price         numeric;
  v_role          text;
  v_live          int;
  v_same_unit     boolean;
  v_has_primary   boolean;
  v_has_secondary boolean;
  v_observation_id uuid;
begin
  v_actor := auth.uid();

  if not is_admin_or_editor(v_actor) then
    raise exception 'only an admin or editor may approve a price submission (P1.1)';
  end if;

  select * into v_sub
    from price_submissions
   where id = p_submission_id
     for update;

  if not found then
    raise exception 'price submission % does not exist', p_submission_id;
  end if;

  if v_sub.status <> 'pending' then
    raise exception
      'price submission % is already %; a decided submission is final (P1.4)',
      p_submission_id, v_sub.status;
  end if;

  -- The correction arguments, judged before anything is written. Each branch
  -- restates a CHECK from 0038's section 1 with a message a reviewer can act
  -- on: the constraint is the law, this is the sentence.
  v_reason := btrim(coalesce(p_correction_reason, ''));

  if p_corrected_price is null and v_reason <> '' then
    raise exception
      'a correction reason was given but no corrected price; nothing was edited';
  end if;

  if p_corrected_price is not null then
    if v_reason = '' then
      raise exception
        'an edited price requires a reason (P1.4): the submitted figure is what the collector reported, and the record must say why it was not published';
    end if;

    if p_corrected_price < 0 then
      raise exception 'a corrected price may not be negative';
    end if;

    if p_corrected_price = v_sub.price then
      raise exception
        'the corrected price equals the submitted price; an edit that changes nothing is not a correction';
    end if;
  end if;

  -- The caller's Monday, checked against the week the submission was filed
  -- under at intake. Checks only; derives nothing (see the header).
  if extract(isodow from p_week_start_date) <> 1 then
    raise exception
      'week_start_date % is not a Monday; an ISO week starts on Monday',
      p_week_start_date;
  end if;

  if extract(isoyear from p_week_start_date) <> v_sub.iso_year
     or extract(week from p_week_start_date) <> v_sub.iso_week then
    raise exception
      'week_start_date % belongs to ISO week %-%, but submission % is filed under %-%',
      p_week_start_date,
      extract(isoyear from p_week_start_date), extract(week from p_week_start_date),
      p_submission_id, v_sub.iso_year, v_sub.iso_week;
  end if;

  -- P1.7 as amended. One read of the live week; four branches over it.
  select count(*),
         count(*) filter (where o.unit_id  = v_sub.unit_id)   > 0,
         count(*) filter (where o.unit_role = 'primary')      > 0,
         count(*) filter (where o.unit_role = 'secondary')    > 0
    into v_live, v_same_unit, v_has_primary, v_has_secondary
    from price_observations o
   where o.commodity_id = v_sub.commodity_id
     and o.tier         = v_sub.tier
     and o.iso_year     = v_sub.iso_year
     and o.iso_week     = v_sub.iso_week
     and o.superseded_at is null;

  -- (a) The same unit twice. First, so this reader is not sent hunting for a
  --     free role slot when what they need is the correction path.
  if v_same_unit then
    raise exception
      'ISO week %-% already carries a live % price for this commodity in this unit; that is one figure, and changing it is supersede_price_observation() plus a new submission (P1.3), not a second approval',
      v_sub.iso_year, v_sub.iso_week, v_sub.tier;
  end if;

  -- (b) Silence. Resolved only when there is nothing to choose between.
  if p_unit_role is null then
    if v_live > 0 then
      raise exception
        'ISO week %-% already holds a live % price for this commodity, so this approval must say whether it is the primary or the secondary figure. A role is never inferred from which price arrived first (P0.2), and a published role is frozen (P1.3).',
        v_sub.iso_year, v_sub.iso_week, v_sub.tier;
    end if;
    v_role := 'primary';
  else
    if p_unit_role not in ('primary', 'secondary') then
      raise exception
        'unit_role % is not a role; a price is the primary or the secondary figure for its week (P1.7)',
        p_unit_role;
    end if;
    v_role := p_unit_role;
  end if;

  -- (c) The role is spoken for.
  if (v_role = 'primary' and v_has_primary)
  or (v_role = 'secondary' and v_has_secondary) then
    raise exception
      'ISO week %-% already has a % % price for this commodity (P1.7); a week carries at most two live prices, in different units, and both slots cannot hold the same role',
      v_sub.iso_year, v_sub.iso_week, v_role, v_sub.tier;
  end if;

  -- (d) A secondary with nothing to be secondary to.
  if v_role = 'secondary' and not v_has_primary then
    raise exception
      'this would be published as the secondary figure for ISO week %-%, but there is no live % price for this commodity yet; the first price of a week leads it, and 0025 freezes the role so this one could never be promoted into view',
      v_sub.iso_year, v_sub.iso_week, v_sub.tier;
  end if;

  v_price := coalesce(p_corrected_price, v_sub.price);

  update price_submissions
     set status            = 'approved',
         reviewed_by       = v_actor,
         reviewed_at       = now(),
         corrected_price   = p_corrected_price,
         correction_reason = case when p_corrected_price is null then null else v_reason end,
         -- The role this approval published, written onto the submission so
         -- section 5's guard has something to hold the published row to. It
         -- overwrites whatever proposal arrived at intake: the reviewer
         -- decides, the importer suggests.
         unit_role         = v_role
   where id = v_sub.id;

  insert into price_observations (
    commodity_id,
    unit_id,
    unit_role,
    tier,
    iso_year,
    iso_week,
    week_start_date,
    price,
    currency,
    collected_at_site_id,
    collected_on,
    submission_id,
    source
  )
  values (
    v_sub.commodity_id,
    v_sub.unit_id,
    v_role,
    v_sub.tier,
    v_sub.iso_year,
    v_sub.iso_week,
    p_week_start_date,
    v_price,
    v_sub.currency,
    v_sub.collection_site_id,
    v_sub.collected_on,
    v_sub.id,
    v_sub.source
  )
  returning id into v_observation_id;

  -- write_audit_entry() raises on failure, so the decision, the publication
  -- and the log are one transaction. unit_role joins the payload because
  -- which figure a week leads with is a decision the log must be able to
  -- answer for later -- and because 0025 freezes it, the audit entry is the
  -- only place the reasoning for it can ever live.
  perform write_audit_entry(
    v_actor,
    'price_submission.approve',
    'price_submissions',
    v_sub.id,
    jsonb_build_object(
      'observation_id',    v_observation_id,
      'commodity_id',      v_sub.commodity_id,
      'tier',              v_sub.tier,
      'iso_year',          v_sub.iso_year,
      'iso_week',          v_sub.iso_week,
      'unit_id',           v_sub.unit_id,
      'unit_role',         v_role,
      'unit_role_proposed', p_unit_role,
      'submitted_price',   v_sub.price,
      'published_price',   v_price,
      'corrected_price',   p_corrected_price,
      'correction_reason', case when p_corrected_price is null then null else v_reason end,
      'currency',          v_sub.currency,
      'collector_id',      v_sub.collector_id,
      'collected_on',      v_sub.collected_on,
      'flags',             to_jsonb(v_sub.flags),
      'source',            v_sub.source
    )
  );

  return v_observation_id;
end;
$$;

comment on function approve_price_submission(uuid, date, numeric, text, text) is
  'The one door in (P1.1): decides a pending price submission and publishes '
  'its observation as ONE transaction. Admin and editor only. Publishes '
  'coalesce(corrected_price, price); records an edited figure beside the '
  'submitted one rather than over it; never sets corrects_id. Resolves the '
  'unit_role (P1.7 as amended by 0041): omitted means primary ONLY when the '
  'week is empty, and is refused outright once anything is live -- a role is '
  'never inferred from arrival order (P0.2). Refuses a repeat of a published '
  'unit, a role already held, and a secondary with no primary. Takes '
  'week_start_date as an argument and only ever CHECKS it -- ISO week '
  'arithmetic lives in lib/weeks.ts (P2.7).';

-- EXECUTE, restated for the new signature. PUBLIC must be named: on FUNCTIONS
-- the default grant is to PUBLIC, so revoking from anon and service_role
-- alone would be cosmetic (0024's finding). service_role is revoked even
-- though a call from it would raise at the authorisation gate anyway --
-- auth.uid() is null there and is_admin_or_editor(null) is false. Two layers
-- that agree beat one layer plus a comment: there is no machine path to a
-- price decision, and the grant should not suggest otherwise.
revoke execute on function approve_price_submission(uuid, date, numeric, text, text)
  from public, anon, service_role;

grant execute on function approve_price_submission(uuid, date, numeric, text, text)
  to authenticated;


-- ============================================================================
-- 5. protect_price_observation_provenance() -- an eleventh comparison
-- ============================================================================
--
-- 0038's guard asserts that a published row matches an APPROVED submission in
-- every field it carries over, and enumerates the comparisons because the two
-- sides are different tables with different column sets. Its own header names
-- the honest weakness of that shape: "A COLUMN ADDED TO EITHER TABLE IS NOT
-- COVERED UNTIL SOMEONE EDITS THIS FUNCTION." unit_role is that column, and
-- this is that edit.
--
-- WHY THE ROLE BELONGS IN THE GUARD AT ALL. Without it, a direct staff INSERT
-- could publish a row whose role contradicts the decision its submission
-- records -- approve a bucket price as the week's primary, then hand-insert
-- it as the secondary, or vice versa. Both the observation and the submission
-- would be individually well-formed; only the pair is false. That is exactly
-- the class of contradiction 0038 exists to make impossible, and the role is
-- now one of the two things a reviewer is actually deciding.
--
-- THE FUNCTION IS REPLACED WHOLE, via CREATE OR REPLACE, with one branch
-- added after the unit comparison and everything else byte-identical. It
-- keeps SECURITY DEFINER for 0038's reason -- it READS price_submissions,
-- which is staff-only, so run as the caller it would misdescribe its own
-- refusal as "submission not found".
--
-- ELEVEN COMPARISONS NOW, and section 6 counts them. That count is the
-- tripwire 0038 installed against precisely this migration's failure mode: a
-- column added to either table and the guard left behind.
-- ----------------------------------------------------------------------------

create or replace function protect_price_observation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub   price_submissions%rowtype;
  v_price numeric;
begin
  select * into v_sub
    from price_submissions
   where id = new.submission_id;

  -- Unreachable while submission_id keeps its NOT NULL foreign key. Kept
  -- because the guard must not silently pass when its premise is missing: a
  -- "provenance check" that no-ops on an absent submission is worse than none.
  if not found then
    raise exception
      'price observation names submission %, which does not exist; the published series is fed only by submissions (P1.1)',
      new.submission_id;
  end if;

  if v_sub.status <> 'approved' then
    raise exception
      'price submission % is %, not approved; a human approves a submission before its price is published (P1.1)',
      v_sub.id, v_sub.status;
  end if;

  -- The figure. coalesce(corrected_price, price) is the only price this
  -- submission authorises, which is what makes 0038's correction columns law
  -- rather than decoration.
  v_price := coalesce(v_sub.corrected_price, v_sub.price);

  if new.price is distinct from v_price then
    raise exception
      'published price % does not match submission %: the approved figure is % (submitted %, corrected %)',
      new.price, v_sub.id, v_price, v_sub.price, v_sub.corrected_price;
  end if;

  if new.commodity_id is distinct from v_sub.commodity_id then
    raise exception 'published commodity_id % does not match submission %''s %',
      new.commodity_id, v_sub.id, v_sub.commodity_id;
  end if;

  if new.unit_id is distinct from v_sub.unit_id then
    raise exception 'published unit_id % does not match submission %''s %',
      new.unit_id, v_sub.id, v_sub.unit_id;
  end if;

  -- The eleventh, added by 0041. A submission decided as the week's primary
  -- cannot be published as its secondary, or the other way round: the
  -- decision and the publication would disagree about the one thing 0025
  -- then freezes forever.
  if new.unit_role is distinct from v_sub.unit_role then
    raise exception
      'published unit_role % does not match submission %''s % (P1.7); which figure a week leads with is decided at approval and frozen at publication',
      new.unit_role, v_sub.id, v_sub.unit_role;
  end if;

  if new.tier is distinct from v_sub.tier then
    raise exception 'published tier % does not match submission %''s %',
      new.tier, v_sub.id, v_sub.tier;
  end if;

  if new.iso_year is distinct from v_sub.iso_year
     or new.iso_week is distinct from v_sub.iso_week then
    raise exception
      'published ISO week %-% does not match submission %''s %-% (P2.7)',
      new.iso_year, new.iso_week, v_sub.id, v_sub.iso_year, v_sub.iso_week;
  end if;

  if new.collected_on is distinct from v_sub.collected_on then
    raise exception 'published collected_on % does not match submission %''s %',
      new.collected_on, v_sub.id, v_sub.collected_on;
  end if;

  if new.collected_at_site_id is distinct from v_sub.collection_site_id then
    raise exception
      'published collected_at_site_id % does not match submission %''s collection_site_id % (P1.6)',
      new.collected_at_site_id, v_sub.id, v_sub.collection_site_id;
  end if;

  if new.currency is distinct from v_sub.currency then
    raise exception 'published currency % does not match submission %''s %',
      new.currency, v_sub.id, v_sub.currency;
  end if;

  if new.source is distinct from v_sub.source then
    raise exception 'published source % does not match submission %''s %',
      new.source, v_sub.id, v_sub.source;
  end if;

  return new;
end;
$$;

comment on function protect_price_observation_provenance() is
  'BEFORE INSERT guard on price_observations (P1.1). Refuses any published '
  'row whose submission is not approved, or which disagrees with that '
  'submission on price, commodity, unit, UNIT ROLE, tier, ISO week, '
  'collection date, collection site, currency or source. The approved price '
  'is coalesce(corrected_price, price). Unconditional and identity-blind: it '
  'binds approve_price_submission() and the table owner as well as a direct '
  'insert by staff. The function is the door; this is the law.';


-- ============================================================================
-- 6. The closing assertion
-- ============================================================================
--
-- Asks the catalogue the questions this migration exists to answer, and
-- refuses to commit unless every answer is the intended one. Raising inside
-- the migration aborts its transaction, so a failure leaves the schema
-- exactly as it was rather than half-applied.
--
-- THE ROW-IDENTITY CHECK IS THE UNUSUAL ONE. Section 1 claims the 26 existing
-- observations were given a role without being touched. `count(*) where
-- unit_role = 'primary'` would not prove that -- an UPDATE would satisfy it
-- too, while destroying the append-only guarantee this table is built on. So
-- the assertion reads pg_stat_get_xact_tuples_updated() for the relation:
-- inside this migration's own transaction it counts row versions this
-- transaction has created on price_observations, and the claim is that the
-- number is zero. If ADD COLUMN ... DEFAULT ever stops being a catalog-only
-- operation, this stops the migration rather than letting it quietly rewrite
-- the published series.
-- ----------------------------------------------------------------------------

do $$
declare
  v_comparisons int;
  v_updated     bigint;
  v_roleless    int;
  v_breaches    int;
  v_old_fn      regprocedure;
  v_new_fn      regprocedure;
begin
  -- Section 1: the column, its shape, and the absence of a default.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'price_observations'
       and column_name = 'unit_role'
       and is_nullable = 'NO'
       and column_default is null
  ) then
    raise exception
      'price_observations.unit_role is missing, nullable, or still carries a default; a published price must state which figure it is, and must never be given one by omission (P0.2)';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'price_submissions'
       and column_name = 'unit_role'
       and is_nullable = 'YES'
  ) then
    raise exception
      'price_submissions.unit_role is missing or NOT NULL; the form does not ask for a role and every form submission arrives without one';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'price_observations_unit_role_valid'
       and conrelid = 'price_observations'::regclass
  )
  or not exists (
    select 1 from pg_constraint
     where conname = 'price_submissions_unit_role_valid'
       and conrelid = 'price_submissions'::regclass
  ) then
    raise exception 'a unit_role CHECK constraint is missing; a third role value would be accepted';
  end if;

  -- Section 1's real claim: every existing row got a role, and NOT ONE OF
  -- THEM was rewritten to get it.
  v_updated := pg_stat_get_xact_tuples_updated('price_observations'::regclass);
  if v_updated <> 0 then
    raise exception
      'this migration created % row versions on price_observations; ADD COLUMN ... DEFAULT was supposed to be catalog-only, and rewriting a published price is exactly what 0025 forbids (P1.3)',
      v_updated;
  end if;

  select count(*) into v_roleless from price_observations where unit_role is null;
  if v_roleless <> 0 then
    raise exception '% published prices carry no role', v_roleless;
  end if;

  -- Section 2: no approved submission disagrees with the row it published.
  if exists (
    select 1
      from price_observations o
      join price_submissions s on s.id = o.submission_id
     where s.unit_role is distinct from o.unit_role
  ) then
    raise exception
      'an approved submission records a different role from the observation it published; the provenance guard''s premise is false on existing data';
  end if;

  -- Section 3: one index out, two in, both unique and both partial.
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'price_observations_live_series_key'
  ) then
    raise exception
      'the old univariate index is still present; a second unit in one week would still be refused';
  end if;

  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'price_observations_live_role_key'
       and i.indisunique and i.indpred is not null
  )
  or not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'price_observations_live_unit_key'
       and i.indisunique and i.indpred is not null
  ) then
    raise exception
      'a live-series index is missing, not unique, or not partial; P1.7 has no enforcement';
  end if;

  -- The rule itself, asked of the data in the language of the rule rather
  -- than of the indexes that enforce it.
  select count(*) into v_breaches from (
    select 1
      from price_observations
     where superseded_at is null
     group by commodity_id, tier, iso_year, iso_week
    having count(*) > 2 or count(distinct unit_id) <> count(*)
  ) t;
  if v_breaches <> 0 then
    raise exception
      '% commodity/week/tier keys hold more than two live prices, or two live prices sharing a unit (P1.7)',
      v_breaches;
  end if;

  -- Section 4: the old signature is gone, the new one is present, definer,
  -- and reachable from a signed-in session and nowhere else.
  --
  -- to_regprocedure() RATHER THAN pg_get_function_identity_arguments(). The
  -- latter prints PARAMETER NAMES as well as types -- 'p_submission_id uuid,
  -- p_week_start_date date, ...' -- so comparing it against a bare type list
  -- never matches and the assertion silently passes whatever the catalogue
  -- says. That is a check that cannot fail, which is worse than no check;
  -- this one resolves the signature the way a caller does, and returns null
  -- when there is nothing to resolve.
  v_old_fn := to_regprocedure('public.approve_price_submission(uuid, date, numeric, text)');
  v_new_fn := to_regprocedure('public.approve_price_submission(uuid, date, numeric, text, text)');

  if v_old_fn is not null then
    raise exception
      'the four-argument approve_price_submission() still exists; a stale caller would resolve to it and publish no role';
  end if;

  if v_new_fn is null then
    raise exception 'the five-argument approve_price_submission() is not present';
  end if;

  if not (select prosecdef from pg_proc where oid = v_new_fn) then
    raise exception 'approve_price_submission() is not SECURITY DEFINER; it cannot write past 0038''s revoke';
  end if;

  if has_function_privilege('anon',         'approve_price_submission(uuid, date, numeric, text, text)', 'EXECUTE')
  or has_function_privilege('service_role', 'approve_price_submission(uuid, date, numeric, text, text)', 'EXECUTE') then
    raise exception 'a price decision is still callable by anon or service_role; approving a price is a human act (P1.1)';
  end if;

  if not has_function_privilege('authenticated', 'approve_price_submission(uuid, date, numeric, text, text)', 'EXECUTE') then
    raise exception 'a signed-in session cannot call approve_price_submission; the review queue has no working action';
  end if;

  -- Section 5: 0038's tripwire, moved on by one.
  select count(*) into v_comparisons
    from regexp_matches(
           pg_get_functiondef('protect_price_observation_provenance()'::regprocedure),
           'is distinct from', 'g'
         );

  if v_comparisons <> 11 then
    raise exception
      'the provenance guard makes % field comparisons, not the 11 this migration verified. A column was added to price_submissions or price_observations without extending the guard -- extend it and re-verify rather than changing this number.',
      v_comparisons;
  end if;

  -- The trigger 0038 installed is still installed. CREATE OR REPLACE on the
  -- function does not detach it, and this says so rather than assuming it.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace
       and c.relname = 'price_observations'
       and t.tgname  = 'price_observations_provenance'
       and not t.tgisinternal
  ) then
    raise exception 'the provenance trigger is no longer installed on price_observations';
  end if;
end;
$$;
