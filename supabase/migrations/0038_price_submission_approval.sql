-- ============================================================================
-- 0038_price_submission_approval.sql
-- The one door in, closed: approval, rejection, and the provenance law that
-- binds the published series to the submission it came from.
--
-- 0009_price_submissions.sql calls price_submissions "THE ONE DOOR IN (P1.1)"
-- and says "nothing becomes a published observation without a human approving
-- a row in this table". 0010_price_observations.sql makes submission_id NOT
-- NULL and UNIQUE so that "there is no path into the published series that
-- does not pass through a submission". Both sentences are true about the
-- SHAPE of the data and neither is enforced about its CONTENT. Today, with
-- sixteen pending submissions on disk and zero observations, the door is a
-- doorframe:
--
--   1. NOTHING APPROVES ANYTHING. There is no function, no job and no page
--      that moves a submission out of 'pending'. The only path is
--      price_submissions_update_staff, an open UPDATE policy that lets any
--      admin or editor set any column on any row through PostgREST -- edit
--      the price the collector reported, rewrite the ISO week, stamp
--      'approved' without publishing anything.
--
--   2. AN OBSERVATION NEED NOT RESEMBLE ITS SUBMISSION. price_observations
--      _insert_staff permits an admin or editor to insert a row naming any
--      submission id that is not already spent. The FK proves a submission
--      EXISTS; nothing proves it was approved, and nothing proves the
--      published price, week, commodity, unit, tier, site or collection date
--      are the ones the collector actually reported. A figure could be typed
--      straight into the public series with a pending submission's id
--      stapled to it as provenance, and every constraint in the schema would
--      be satisfied.
--
-- So P1.1 is, at this moment, a convention -- the same finding 0025 recorded
-- about P1.3 and P1.4, in the same words, one table upstream.
--
-- WHAT THIS MIGRATION DOES, in the order the sections appear:
--   1. Two additive nullable columns recording an EDITED price beside the
--      submitted one, never over it.
--   2. approve_price_submission() -- decides the row AND publishes the
--      observation, as one transaction.
--   3. reject_price_submission() -- decides the row with a reason, and
--      publishes nothing.
--   4. protect_price_observation_provenance() -- a BEFORE INSERT trigger
--      asserting that every published row matches an APPROVED submission in
--      every field it carries over.
--   5. The REVOKE and the policy drop that leave those two functions as the
--      only writers of a decision.
--
-- THE FUNCTION IS THE DOOR; THE TRIGGER IS THE LAW. 0025's phrase, and the
-- same division of labour: section 4's guard never asks who is calling. It
-- constrains approve_price_submission() itself, so that a later edit to that
-- function, or a second function added beside it, still cannot publish a
-- figure that disagrees with its submission.
--
-- WHO MAY APPROVE: admin and editor, via is_admin_or_editor(), which is the
-- gate 0009's insert policy and 0010's insert policy already use for this
-- data. A CONTRIBUTOR CAN READ THE WHOLE QUEUE AND DECIDE NOTHING IN IT --
-- price_submissions_select_staff is is_staff() and is left exactly as it is.
-- Confirmed intended: seeing what is waiting is not the same right as
-- publishing it, and the radar's review table is legible to a contributor
-- precisely so they can see the state of the week's intake.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--
--   - IT DOES NOT COMPUTE A WEEK. week_start_date is passed IN, by the
--     caller, from lib/weeks.ts. 0010 is explicit that the three CHECK
--     constraints re-deriving isodow/isoyear/week from that date are "the one
--     place ISO week arithmetic is allowed to exist outside lib/weeks.ts, and
--     it only ever checks -- it never computes a value anything reads".
--     Section 2 keeps that bargain: it CHECKS the Monday it was handed
--     against the submission's stored week and refuses a mismatch with a
--     legible message, and it never derives one. A second implementation of
--     ISO week boundaries is the failure this project can least afford.
--
--   - IT DOES NOT TOUCH price_submissions' DELETE OR TRUNCATE GRANTS.
--     service_role still holds both on this table (relacl read 2026-09-17:
--     service_role=arwdDxtm), so a machine path can still erase the audit
--     trail this whole migration exists to protect. That is a real finding
--     and it is NOT bundled here: it is recorded in docs/exceptions.md and
--     wants its own migration, with its own verification, on the same
--     three-layer shape 0025 and 0030 use. 0032's header states the rule this
--     follows -- "If a table's INSERT/UPDATE/DELETE posture is wrong, that is
--     a finding about that table, and it belongs in a migration that says so
--     and verifies it. Not here."
--
--   - IT DOES NOT PUBLISH A CORRECTION. approve_price_submission() always
--     inserts an ORIGINAL observation, with corrects_id null. Correcting an
--     already-published figure is 0010's documented two-step -- supersede the
--     live row, then insert a correction backed by its OWN fresh submission --
--     and section 2 refuses outright to approve into a week that already holds
--     a live price (P1.7), rather than silently becoming a second path to a
--     correction.
--
--   - IT DOES NOT CARRY variety INTO THE SERIES. price_submissions.variety
--     has no counterpart column on price_observations, so an approved
--     submission's variety stays on the submission and is not published. That
--     is 0010's schema, not this migration's choice, and section 4 cannot
--     compare a column that does not exist.
--
-- APPLIES CLEANLY TO THE SIXTEEN EXISTING ROWS. Read 2026-09-17: sixteen
-- price_submissions, all 'pending', all for 2026-W38, all flagged; zero
-- price_observations. Both new columns are nullable with no default, so every
-- existing row arrives with both null, and all five CHECK constraints in
-- section 1 are satisfied by null. Nothing is backfilled and nothing moves.
-- ============================================================================


-- ============================================================================
-- 1. The correction columns -- additive, nullable, and never over the top of
--    what the collector reported
-- ============================================================================
--
-- "Edit & approve" (build plan 3.5) is a reviewer changing a figure a human
-- read off a market stall. The submitted price is EVIDENCE: it is what the
-- collector says they saw, and it is the only record of that. Overwriting
-- price in place would destroy it and leave the queue unable to answer the
-- one question that matters after a bad week -- did the collector misread the
-- stall, or did the reviewer mistype the correction?
--
-- So the correction is recorded BESIDE the submission, in two new columns,
-- and price is never written again after intake. This is the same posture
-- P1.3 takes on the published series (a correction is a new row, never an
-- edit), applied one table upstream in the only form available to a table
-- whose rows are decided in place.
--
-- WHICH FIGURE THE SERIES CARRIES: coalesce(corrected_price, price).
-- Section 4 makes that expression the law rather than a habit -- an
-- observation whose price is neither the submitted figure nor the corrected
-- one is refused at the trigger.
--
-- FIVE NAMED CHECKS RATHER THAN ONE COMPOUND. Each has its own name so a
-- negative test can assert the SPECIFIC rejection it expects, which is the
-- same reason 0025's guard gives every branch its own message.
--
--   both_or_neither    -- the fx_rate/fx_fetched_at and reviewed_by/reviewed_at
--                         pattern, for the same reason 0010 gives: a corrected
--                         figure with no stated reason is unciteable, and a
--                         reason attached to nothing is noise.
--   non_negative       -- the same rule price and price_observations.price
--                         carry. 0 stays legitimate.
--   reason_not_blank   -- a whitespace reason is a null wearing a disguise.
--   changes_the_price  -- an "edit" equal to the submitted figure is not a
--                         correction; it is a no-op that would put a reason on
--                         the record for a change nobody made.
--   only_on_approved   -- a pending row has no correction because nobody has
--                         reviewed it yet, and a rejected row publishes
--                         nothing, so a corrected price on one would describe
--                         a figure that never existed.
-- ----------------------------------------------------------------------------

alter table price_submissions
  add column corrected_price   numeric,
  add column correction_reason text;

comment on column price_submissions.corrected_price is
  'The price the reviewer published instead of the submitted one (build plan '
  '3.5, "Edit & approve"). Null on every row nobody edited. price is NEVER '
  'overwritten: it is what the collector reported, and it is the only record '
  'of that. The series carries coalesce(corrected_price, price), which '
  'protect_price_observation_provenance() enforces rather than trusts.';

comment on column price_submissions.correction_reason is
  'Why the submitted figure was not the published one. Mandatory whenever '
  'corrected_price is set and forbidden when it is not (P1.4): a changed '
  'price with no stated reason cannot be defended to the collector it '
  'contradicts.';

alter table price_submissions
  add constraint price_submissions_correction_both_or_neither
    check ((corrected_price is null) = (correction_reason is null)),

  add constraint price_submissions_corrected_price_non_negative
    check (corrected_price is null or corrected_price >= 0),

  add constraint price_submissions_correction_reason_not_blank
    check (correction_reason is null or btrim(correction_reason) <> ''),

  add constraint price_submissions_correction_changes_the_price
    check (corrected_price is null or corrected_price <> price),

  add constraint price_submissions_correction_only_on_approved
    check (corrected_price is null or status = 'approved');


-- ============================================================================
-- 2. approve_price_submission() -- the decision and the publication, as one
--    transaction
-- ============================================================================
--
-- SECURITY DEFINER, and it has to be. After section 5 no signed-in role holds
-- UPDATE on price_submissions at all, so the status change is unreachable
-- except through a function running as owner. That is the same shape
-- set_editorial_rule() (0021/0024) and supersede_price_observation() (0025)
-- already have on their tables: the grant is removed and the door is a
-- function that checks the caller itself rather than trusting a grant.
--
-- ONE TRANSACTION, AND THAT IS THE POINT. A function body is atomic, so the
-- submission cannot be marked approved without its observation appearing, and
-- the observation cannot appear without the submission being marked. The
-- two-step version of this -- update, then insert, from application code -- is
-- exactly the sequence that leaves an 'approved' submission backing no
-- published price the first time the second call fails, which the UNIQUE on
-- submission_id then makes permanently unfixable: the submission is spent.
--
-- auth.uid() IS READ ONCE, into v_actor, and used for the authorisation
-- check, the reviewed_by stamp and the audit actor. 0024 had to learn that
-- the hard way on set_editorial_rule(); the identity that authorises and the
-- identity that is recorded cannot be allowed to diverge.
--
-- FOR UPDATE on the submission row, so two reviewers hitting Approve on the
-- same row at the same moment serialise: the second waits, re-reads a row
-- whose status is now 'approved', and is refused by the status branch rather
-- than by a unique-violation on submission_id from inside the insert.
--
-- p_week_start_date IS AN ARGUMENT, NOT A DERIVATION. See the header. The
-- three branches that judge it CHECK the caller's Monday against the
-- submission's stored ISO year and week; they compute nothing anything reads.
-- The identical arithmetic exists in 0010's CHECK constraints, which would
-- catch a wrong Monday anyway -- this only catches it earlier, and with a
-- message naming both the date and the week it failed against.
--
-- THE DUPLICATE BRANCH IS A REFUSAL, NOT A CORRECTION PATH. P1.7 allows one
-- live price per commodity/week/tier, and price_observations_live_series_key
-- would reject the insert regardless. Raising here instead makes the reason
-- legible and keeps this function from being mistaken for a way to correct a
-- published figure: that is supersede_price_observation() plus a new
-- submission (0010, P1.3), and it stays a separate, deliberate act.
--
-- corrects_id IS NEVER SET. Every row this function publishes is an original.
--
-- source IS CARRIED OVER, NOT DEFAULTED. 0010's column mirrors
-- price_submissions.source, and a manual submission that published as 'form'
-- would misstate its own provenance.
-- ----------------------------------------------------------------------------

create function approve_price_submission(
  p_submission_id     uuid,
  p_week_start_date   date,
  p_corrected_price   numeric default null,
  p_correction_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor          uuid;
  v_sub            price_submissions%rowtype;
  v_reason         text;
  v_price          numeric;
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
  -- restates a CHECK from section 1 with a message a reviewer can act on --
  -- the same call 0011's dismiss_price_anomaly() makes about its blank-reason
  -- guard: the constraint is the law, this is the sentence.
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

  -- P1.7. See the header: a refusal, never a second path to a correction.
  if exists (
    select 1
      from price_observations o
     where o.commodity_id = v_sub.commodity_id
       and o.tier         = v_sub.tier
       and o.iso_year     = v_sub.iso_year
       and o.iso_week     = v_sub.iso_week
       and o.superseded_at is null
  ) then
    raise exception
      'ISO week %-% already carries a live % price for this commodity (P1.7); correcting it is supersede_price_observation() plus a new submission, not a second approval (P1.3)',
      v_sub.iso_year, v_sub.iso_week, v_sub.tier;
  end if;

  v_price := coalesce(p_corrected_price, v_sub.price);

  update price_submissions
     set status            = 'approved',
         reviewed_by       = v_actor,
         reviewed_at       = now(),
         corrected_price   = p_corrected_price,
         correction_reason = case when p_corrected_price is null then null else v_reason end
   where id = v_sub.id;

  insert into price_observations (
    commodity_id,
    unit_id,
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
  -- and the log are one transaction: there is no approved submission without
  -- an audit entry. Both figures are recorded -- what was submitted and what
  -- was published -- because the difference between them is the whole content
  -- of an "Edit & approve".
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

comment on function approve_price_submission(uuid, date, numeric, text) is
  'The one door in (P1.1): decides a pending price submission and publishes '
  'its observation as ONE transaction. Admin and editor only. Publishes '
  'coalesce(corrected_price, price); records an edited figure beside the '
  'submitted one rather than over it; refuses a week that already carries a '
  'live price (P1.7); never sets corrects_id. Takes week_start_date as an '
  'argument and only ever CHECKS it -- ISO week arithmetic lives in '
  'lib/weeks.ts (P2.7).';


-- ============================================================================
-- 3. reject_price_submission() -- a decision that publishes nothing
-- ============================================================================
--
-- P1.4: a rejection always carries a reason, which 0009 already enforces as a
-- table CHECK. This raises the same rule earlier, with a legible message, and
-- takes the attribution and the timestamp from the session rather than from
-- the caller -- the shape 0011's dismiss_price_anomaly() established.
--
-- ONE-WAY FROM 'pending', by the same argument 0011 gives for a settled
-- anomaly: re-opening a rejected submission would strand its reject_reason as
-- the description of a decision no longer in force. A rejected price that
-- turns out to have been right is re-collected as a NEW submission, which is
-- also the only way it gets a fresh collector attribution (P1.2).
--
-- NOTHING IS DELETED. 0009: "Rejected submissions are retained with status =
-- 'rejected' and a reason (P1.4) -- nothing is hard-deleted from this table,
-- ever." The rejected row stays readable to every staff member, which is what
-- makes a collector's accuracy_score defensible later.
-- ----------------------------------------------------------------------------

create function reject_price_submission(
  p_submission_id uuid,
  p_reason        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid;
  v_reason text;
  v_sub    price_submissions%rowtype;
begin
  v_actor := auth.uid();

  if not is_admin_or_editor(v_actor) then
    raise exception 'only an admin or editor may reject a price submission (P1.1)';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));

  if v_reason = '' then
    raise exception 'a rejection requires a reason (P1.4)';
  end if;

  update price_submissions
     set status        = 'rejected',
         reject_reason = v_reason,
         reviewed_by   = v_actor,
         reviewed_at   = now()
   where id = p_submission_id
     and status = 'pending'
  returning * into v_sub;

  if not found then
    raise exception
      'price submission % does not exist, or has already been approved or rejected',
      p_submission_id;
  end if;

  perform write_audit_entry(
    v_actor,
    'price_submission.reject',
    'price_submissions',
    v_sub.id,
    jsonb_build_object(
      'reason',       v_reason,
      'commodity_id', v_sub.commodity_id,
      'tier',         v_sub.tier,
      'iso_year',     v_sub.iso_year,
      'iso_week',     v_sub.iso_week,
      'price',        v_sub.price,
      'currency',     v_sub.currency,
      'collector_id', v_sub.collector_id,
      'collected_on', v_sub.collected_on,
      'flags',        to_jsonb(v_sub.flags),
      'source',       v_sub.source
    )
  );
end;
$$;

comment on function reject_price_submission(uuid, text) is
  'Rejects a pending price submission with a mandatory reason (P1.4) and '
  'publishes nothing. Admin and editor only. One-way from pending: a '
  'rejected submission is final, and a price that turns out to have been '
  'right is re-collected as a new submission. Nothing is deleted.';


-- ============================================================================
-- 4. protect_price_observation_provenance() -- the law, not the door
-- ============================================================================
--
-- A BEFORE INSERT row trigger on price_observations asserting that the row
-- being published MATCHES AN APPROVED SUBMISSION in every field it carries
-- over. This is finding 2 from the header, closed.
--
-- WHY A TRIGGER AND NOT JUST THE FUNCTION. Section 2 already builds every
-- observation correctly, so on today's code path this guard never fires. It
-- exists because price_observations_insert_staff is still a live INSERT policy
-- for authenticated: an admin or editor can POST straight to
-- /rest/v1/price_observations and hand-write a published price with any
-- pending submission's id attached as provenance. The policy is not dropped,
-- because 0010's stated design is that staff insert corrections into this
-- table and that path is still needed; what this migration removes is the
-- ability for such an insert to CONTRADICT its own provenance.
--
-- UNCONDITIONAL, and identity-blind. It never asks who is calling, which is
-- 0025's argument verbatim: there is no session flag to forge, no
-- `current_user = owner` test that would whitelist the very role being
-- constrained, and -- the part that matters most -- it binds
-- approve_price_submission() itself. SECURITY DEFINER carries that function
-- past a REVOKE but not past a trigger; triggers fire for the owner and for
-- superusers alike. If section 2 is later edited to publish a price that is
-- neither the submitted nor the corrected figure, this refuses it.
--
-- SECURITY DEFINER ON A TRIGGER FUNCTION, deliberately, and 0025's
-- protect_price_observation() is not -- the difference is that this one READS
-- A TABLE. Run as the caller, the SELECT below is subject to
-- price_submissions_select_staff, so an insert by a role that cannot see the
-- submission would fail on "submission not found" and misdescribe its own
-- refusal. The guard has to compare against the row as it really is, not as
-- the caller's policies allow. search_path is pinned for the same reason
-- every definer function in this build pins it.
--
-- REVOKING EXECUTE DOES NOT STOP THE TRIGGER FIRING. Established in
-- docs/exceptions.md and verified there: EXECUTE on a trigger function is
-- checked when the trigger is CREATED, not each time it fires. The revoke in
-- section 5 therefore removes a grant no caller can use and clears the
-- standing Supabase linter WARN, and changes nothing about enforcement.
--
-- AN ENUMERATED COLUMN LIST, WHERE 0025 USED jsonb, AND THE LIMIT THAT
-- CREATES. 0025 compares to_jsonb(new) - 'superseded_at' against the old row
-- because both sides are the same table, so a column added later is protected
-- the day it is added. Here the two sides are DIFFERENT tables with different
-- column sets and two deliberately renamed pairs (collected_at_site_id <->
-- collection_site_id, price <-> coalesce(corrected_price, price)), and no
-- whole-row operator spans them. So the nine comparisons are written out --
-- and the honest consequence is that A COLUMN ADDED TO EITHER TABLE IS NOT
-- COVERED UNTIL SOMEONE EDITS THIS FUNCTION. That is a real weakness of this
-- shape, stated rather than discovered later; the mitigation is that the
-- closing assertion in section 6 counts the comparisons, so a reviewer adding
-- a column to either table meets a number that has to be re-justified.
--
-- WHAT IT DOES NOT JUDGE: corrects_id, superseded_at, published_at, fx_rate
-- and fx_fetched_at have no counterpart on a submission. The correction chain
-- is 0010's and 0025's business; FX is stamped at conversion time (P2.5).
-- ----------------------------------------------------------------------------

create function protect_price_observation_provenance()
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
  -- submission authorises, which is what makes section 1's columns law rather
  -- than decoration.
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
  'submission on price, commodity, unit, tier, ISO week, collection date, '
  'collection site, currency or source. The approved price is '
  'coalesce(corrected_price, price). Unconditional and identity-blind: it '
  'binds approve_price_submission() and the table owner as well as a direct '
  'insert by staff. The function is the door; this is the law.';

create trigger price_observations_provenance
  before insert on price_observations
  for each row execute function protect_price_observation_provenance();


-- ============================================================================
-- 5. The REVOKE and the policy drop -- one writer of a decision, not two
-- ============================================================================
--
-- price_submissions_update_staff (0009) is dropped. It was written when
-- approval had no implementation, and its comment says exactly what it was
-- for: "an admin or editor can edit a pending row (Edit & approve) or move it
-- to approved/rejected". Both of those now happen in sections 2 and 3, where
-- they are transactional, authorised, logged and constrained. Leaving the
-- policy in place would leave a second, unconstrained path to the same
-- columns -- one that can stamp 'approved' without publishing anything,
-- overwrite the price the collector reported, or move a row's ISO week after
-- the fact. That is not a convenience; it is the hole this migration exists
-- to close.
--
-- THE REVOKE IS WHAT BINDS service_role, which bypasses RLS entirely and for
-- which dropping a policy conveys nothing. No job updates this table: the
-- ingest route (app/api/ingest/price/route.ts) reads the series and INSERTS a
-- pending row under service-role credentials, and that is its only write. Its
-- INSERT grant is untouched, as is 0009's insert policy for authenticated,
-- which the control room's manual-entry form will need.
--
-- anon is named too. It holds w in relacl today (read 2026-09-17:
-- anon=arwdxtm) and has no policy of any kind on this table, so the grant is
-- inert -- but it is a live grant under a table whose whole defence is that
-- the wrong write is impossible rather than discouraged, and one future
-- `create policy` away from mattering. Same call 0030 made on site_events'
-- SELECT: revoking it makes the two layers agree.
--
-- AFTER THIS, THE ONLY WRITERS OF A DECISION ARE THE TWO FUNCTIONS ABOVE,
-- both of which run as owner and therefore pass this REVOKE, and both of
-- which check the caller themselves. There is no service-role path to an
-- approval at all: auth.uid() is null there and is_admin_or_editor(null) is
-- false. Approving a price is a human act (P1.1).
--
-- NO LAYER 3 TRIGGER ON price_submissions, and that is a scope decision, not
-- an omission. The append-only shape 0025 and 0030 use would need to permit
-- exactly the pending -> decided transition and freeze everything else, which
-- is a guard worth having and is NOT what this migration verifies. Until it
-- exists, the owner and service_role can still rewrite a decided row -- and
-- can still delete one outright, which is the docs/exceptions.md entry
-- accompanying this migration. Both belong to the same future migration.
-- ----------------------------------------------------------------------------

drop policy price_submissions_update_staff on price_submissions;

revoke update on price_submissions
  from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- EXECUTE. The two decision functions are reachable from a signed-in session
-- and from nowhere else.
--
-- PUBLIC must be named. On FUNCTIONS the default grant is to PUBLIC, so
-- revoking from anon and service_role alone would be cosmetic -- 0024's
-- finding, applied. The explicit GRANT to authenticated follows, so the
-- intent is readable off the page rather than inferred from whatever the
-- default ACL happened to include.
--
-- service_role is revoked even though a call from it would raise at the
-- authorisation gate anyway. Two layers that agree beat one layer plus a
-- comment: there is no machine path to a price decision, and the grant should
-- not suggest otherwise.
--
-- The trigger function is revoked from everything. See section 4: this
-- removes a grant no caller can use and clears a standing linter WARN; the
-- trigger fires regardless of EXECUTE.
-- ----------------------------------------------------------------------------

revoke execute on function approve_price_submission(uuid, date, numeric, text)
  from public, anon, service_role;

revoke execute on function reject_price_submission(uuid, text)
  from public, anon, service_role;

grant execute on function approve_price_submission(uuid, date, numeric, text)
  to authenticated;

grant execute on function reject_price_submission(uuid, text)
  to authenticated;

revoke execute on function protect_price_observation_provenance()
  from public, anon, authenticated, service_role;


-- ============================================================================
-- 6. The closing assertion
-- ============================================================================
--
-- Asks the catalogue the questions this migration exists to answer, and
-- refuses to commit unless every answer is the intended one. Raising inside
-- the migration aborts its transaction, so a failure leaves the schema
-- exactly as it was rather than half-applied.
--
-- The comparison count is deliberate. Section 4's guard is an enumerated
-- column list, which is the one shape in this build that silently stops
-- protecting a column someone adds later; counting the branches means a
-- reviewer who adds a column to either table meets a number that has to be
-- re-justified rather than a check that quietly still passes.
-- ----------------------------------------------------------------------------

do $$
declare
  v_comparisons int;
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'price_submissions'
       and policyname = 'price_submissions_update_staff'
  ) then
    raise exception 'price_submissions_update_staff still exists; the second write path was not closed';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'price_submissions'
       and cmd = 'UPDATE'
  ) then
    raise exception 'price_submissions still carries an UPDATE policy; a decision has more than one writer';
  end if;

  if has_table_privilege('anon',          'price_submissions', 'UPDATE')
  or has_table_privilege('authenticated', 'price_submissions', 'UPDATE')
  or has_table_privilege('service_role',  'price_submissions', 'UPDATE') then
    raise exception 'UPDATE on price_submissions is still granted; the REVOKE did not take';
  end if;

  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace
       and c.relname = 'price_observations'
       and t.tgname  = 'price_observations_provenance'
       and not t.tgisinternal
  ) then
    raise exception 'the provenance trigger is not installed on price_observations';
  end if;

  if not exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('approve_price_submission', 'reject_price_submission')
       and prosecdef
    having count(*) = 2
  ) then
    raise exception 'the two decision functions are not both present and SECURITY DEFINER';
  end if;

  if has_function_privilege('anon',         'approve_price_submission(uuid, date, numeric, text)', 'EXECUTE')
  or has_function_privilege('service_role', 'approve_price_submission(uuid, date, numeric, text)', 'EXECUTE')
  or has_function_privilege('anon',         'reject_price_submission(uuid, text)', 'EXECUTE')
  or has_function_privilege('service_role', 'reject_price_submission(uuid, text)', 'EXECUTE') then
    raise exception 'a price decision is still callable by anon or service_role; approving a price is a human act (P1.1)';
  end if;

  if not has_function_privilege('authenticated', 'approve_price_submission(uuid, date, numeric, text)', 'EXECUTE')
  or not has_function_privilege('authenticated', 'reject_price_submission(uuid, text)', 'EXECUTE') then
    raise exception 'a signed-in session cannot call the decision functions; the review queue has no working action';
  end if;

  select count(*) into v_comparisons
    from regexp_matches(
           pg_get_functiondef('protect_price_observation_provenance()'::regprocedure),
           'is distinct from', 'g'
         );

  if v_comparisons <> 10 then
    raise exception
      'the provenance guard makes % field comparisons, not the 10 this migration verified. A column was added to price_submissions or price_observations without extending the guard -- extend it and re-verify rather than changing this number.',
      v_comparisons;
  end if;
end;
$$;
