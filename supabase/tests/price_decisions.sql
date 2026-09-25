-- ============================================================================
-- price_decisions.sql -- the end-to-end test 0038 never had.
--
-- 0038 created approve_price_submission(), reject_price_submission() and the
-- protect_price_observation_provenance() trigger, and verified its own
-- PLUMBING at apply time: that the policy was dropped, the grants revoked, the
-- trigger installed, the functions SECURITY DEFINER. It never proved the
-- BEHAVIOUR -- that approving actually publishes the right figure and that
-- rejecting publishes none. Sixteen real approvals on 2026-09-24, one of them
-- an "Edit & approve", showed what correct looks like. This file pins it down
-- so the next change to that code cannot quietly break it.
--
-- WHAT IT PROVES, one section each:
--   1. approve publishes EXACTLY ONE observation, linked to its submission,
--      carrying the submitted figure.
--   2. edit-and-approve keeps the collector's original price untouched and
--      publishes the corrected one.
--   3. reject publishes nothing.
--   4. a second decision on an already-decided submission is refused.
--   5. a direct INSERT whose price disagrees with its submission is refused by
--      the trigger -- the law that holds even when the function is bypassed.
--
-- HOW TO RUN IT: `pnpm test:db`, which starts the LOCAL Supabase stack and
-- runs this file through psql. Never run it by hand against a remote database.
-- scripts/check-decisions.sh refuses any host that is not loopback, and the
-- first thing this file does is refuse any database that already holds a
-- published price. See that script's header for the full argument.
--
-- ----------------------------------------------------------------------------
-- ON P0.1 AND THE FIXTURE PRICES BELOW -- read this before copying them
-- anywhere.
--
-- This file contains prices: 1000, 1500, 2000, 2500. They are FIXTURES, and
-- they are permitted here by an explicit ruling from the project owner on
-- 2026-09-24: fixture prices inside this rolled-back test transaction are
-- fine, and they must NEVER enter supabase/seed.sql or any file a reader can
-- reach.
--
-- Nothing here is content. These figures exist for the length of one
-- transaction on a throwaway local database, are rolled back at the end of
-- this file whether it passes or fails, and are never rendered, never
-- published and never served. They assert nothing about any commodity's real
-- price. The numbers are deliberately round and obviously synthetic so that a
-- figure from this file could never be mistaken for a reading off a market
-- stall.
--
-- P0.1's rule stands undiminished everywhere else: seed.sql is reference data
-- only, and no sample price, article or collector may be created to "show the
-- layout". The existing Vitest suite already builds fixture prices the same
-- way (see lib/queries/price-review.test.ts). This is that practice, in SQL.
-- ----------------------------------------------------------------------------
--
-- WHY PLAIN SQL AND NOT pgTAP: the assertions below are DO blocks that raise,
-- which is exactly the shape 0038's own verification block uses, and every
-- migration in this repo before it. No extension to install, no second test
-- vocabulary to learn, and a failure prints a sentence that names what was
-- expected and what was found.
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ----------------------------------------------------------------------------
-- 0. The tripwire.
--
-- This is the in-database half of the guarantee that this file can never touch
-- the production project. marketprices-rebuild holds sixteen published prices
-- and will only ever hold more; a database with a published price in it is not
-- a test database, and this refuses to write a single fixture row into one.
--
-- The other half lives in scripts/check-decisions.sh, which refuses to connect
-- anywhere but loopback. Neither check is the real guarantee -- that is CI
-- withholding the production credentials from this job entirely -- but a
-- guarantee with two cheap tripwires in front of it is the one worth having.
-- ----------------------------------------------------------------------------

do $$
declare
  v_observations int;
  v_submissions  int;
begin
  select count(*) into v_observations from price_observations;
  select count(*) into v_submissions  from price_submissions;

  if v_observations <> 0 or v_submissions <> 0 then
    raise exception
      'REFUSING TO RUN: this database already holds % published observations and % submissions. A test database has neither. This looks like a real database -- check the connection string before doing anything else.',
      v_observations, v_submissions;
  end if;
end;
$$;

\echo '  tripwire passed: empty series, this is a test database'


-- ----------------------------------------------------------------------------
-- 1. Fixtures.
--
-- The reviewer is an admin because is_admin_or_editor() is what both decision
-- functions check, and profiles.id is a foreign key into auth.users, so the
-- auth row has to exist first. auth.users needs nothing but an id -- every
-- other NOT NULL column on it carries a default.
--
-- The commodities and units come from seed.sql rather than being invented
-- here: `supabase db reset` loads the real catalogue, and a test that runs
-- against the real reference data proves a little more than one that does not.
-- collection_sites is empty in seed.sql by design (it waits for real site
-- names), so the site and the collector are created here.
--
-- FOUR SUBMISSIONS, three commodities, because approve_price_submission()
-- refuses to approve into a week that already carries a live price for the
-- same commodity and tier (P1.7). Sharing one commodity across the approving
-- sections would make section 2 fail for a reason that has nothing to do with
-- what it tests.
--
-- 2026-09-14 is the Monday of ISO 2026-W38 and 2026-09-16 falls inside that
-- week. Both facts are asserted below rather than trusted, because this file
-- is not allowed to do ISO week arithmetic any more than the application is.
-- ----------------------------------------------------------------------------

do $$
begin
  if extract(isodow from date '2026-09-14') <> 1 then
    raise exception 'the fixture week start 2026-09-14 is not a Monday';
  end if;

  if extract(isoyear from date '2026-09-14') <> 2026
     or extract(week from date '2026-09-14') <> 38 then
    raise exception 'the fixture week start 2026-09-14 is not in ISO 2026-W38';
  end if;

  if date '2026-09-16' not between date '2026-09-14' and date '2026-09-14' + 6 then
    raise exception 'the fixture collection date 2026-09-16 falls outside its own week';
  end if;
end;
$$;

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000001');

insert into profiles (id, email, name, role, is_active)
values (
  '00000000-0000-4000-8000-000000000001',
  'reviewer@example.test',
  'Fixture Reviewer',
  'admin',
  true
);

insert into collectors (id, name, phone)
values ('00000000-0000-4000-8000-000000000002', 'Fixture Collector', '+2348000000000');

-- `type` is constrained to produce_market or abattoir (0007).
insert into collection_sites (id, name, type, city, state)
values (
  '00000000-0000-4000-8000-000000000003',
  'Fixture Site',
  'produce_market',
  'Fixture City',
  'Fixture State'
);

-- Four pending submissions. Prices are fixtures -- see the P0.1 note above.
insert into price_submissions
  (id, commodity_id, collection_site_id, unit_id, tier, price, currency,
   collector_id, iso_year, iso_week, collected_on, source)
select
  v.id,
  c.id,
  '00000000-0000-4000-8000-000000000003',
  c.default_unit_id,
  'retail',
  v.price,
  'NGN',
  '00000000-0000-4000-8000-000000000002',
  2026,
  38,
  date '2026-09-16',
  'form'
from (values
  ('00000000-0000-4000-8000-000000000011'::uuid, 'tomato-hausa-yoruba', 2000::numeric),
  ('00000000-0000-4000-8000-000000000012'::uuid, 'rodo-scotch-bonnet'  , 1000::numeric),
  ('00000000-0000-4000-8000-000000000013'::uuid, 'maize-yellow'        , 2500::numeric),
  ('00000000-0000-4000-8000-000000000014'::uuid, 'ofada-rice'          , 2500::numeric)
) as v (id, slug, price)
join commodities c on c.slug = v.slug;

do $$
declare v_count int;
begin
  select count(*) into v_count from price_submissions;
  if v_count <> 4 then
    raise exception
      'fixtures: expected 4 submissions, got %. A slug in the list above is missing from seed.sql.',
      v_count;
  end if;
end;
$$;

-- The reviewer's identity. auth.uid() reads request.jwt.claims -> sub, so
-- setting that GUC is the whole of what makes both decision functions see a
-- real reviewer. It is the same mechanism a PostgREST request uses, and no
-- token is minted because no token is verified: auth.uid() reads the claim, it
-- does not check a signature.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ON RUNNING AS THE OWNER RATHER THAN AS `authenticated`.
--
-- Everything below executes as the session user, and that is deliberate.
-- approve_price_submission() and reject_price_submission() authenticate the
-- CALLER from auth.uid() -- a GUC -- and not from the current database role,
-- so the identity under test is the claim set above either way. Running as the
-- owner keeps RLS and table grants out of the picture, which means a failure
-- below is a failure of the DECISION LOGIC and cannot be a missing SELECT
-- policy quietly hiding a row from an assertion.
--
-- The grant posture is asserted directly instead, just below, and 0038's own
-- verification block already proves it at apply time on every environment.
-- Splitting it this way keeps each test honest about what it is evidence for.
do $$
begin
  if auth.uid() <> '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'the session claim did not take: auth.uid() is %', auth.uid();
  end if;

  if not is_admin_or_editor(auth.uid()) then
    raise exception 'the fixture reviewer is not recognised as an admin or editor';
  end if;

  -- The door is open to a signed-in session, and the side entrance is shut.
  -- Named roles rather than the current one, so this says the same thing
  -- whoever runs the file.
  if not has_function_privilege(
       'authenticated',
       'approve_price_submission(uuid, date, numeric, text)',
       'EXECUTE') then
    raise exception 'a signed-in session cannot call approve_price_submission; the review queue has no working action';
  end if;

  if has_table_privilege('authenticated', 'price_submissions', 'UPDATE') then
    raise exception 'authenticated still holds UPDATE on price_submissions; the decision has a second writer (P1.1)';
  end if;
end;
$$;

\echo '  fixtures created: 1 admin reviewer, 1 collector, 1 site, 4 pending submissions'


-- ----------------------------------------------------------------------------
-- 2. CLAIM 1 -- approve publishes exactly one observation, linked to its
--    submission, carrying the submitted figure.
--
-- "Exactly one" is the half worth stating. A function that published two rows,
-- or that published one and left the submission pending, would satisfy a
-- looser test; the count and the status are asserted together because the
-- whole point of doing both in one function body is that neither can happen
-- without the other.
-- ----------------------------------------------------------------------------

do $$
declare
  v_observation_id uuid;
  v_obs            price_observations%rowtype;
  v_sub            price_submissions%rowtype;
  v_count          int;
begin
  v_observation_id := approve_price_submission(
    '00000000-0000-4000-8000-000000000011'::uuid,
    date '2026-09-14'
  );

  if v_observation_id is null then
    raise exception 'approve returned no observation id';
  end if;

  select count(*) into v_count
    from price_observations
   where submission_id = '00000000-0000-4000-8000-000000000011';

  if v_count <> 1 then
    raise exception 'approve published % observations for one submission, not 1', v_count;
  end if;

  select * into v_obs from price_observations where id = v_observation_id;
  select * into v_sub from price_submissions where id = '00000000-0000-4000-8000-000000000011';

  if v_obs.submission_id <> v_sub.id then
    raise exception 'the published observation names submission %, not %', v_obs.submission_id, v_sub.id;
  end if;

  if v_obs.price <> v_sub.price then
    raise exception
      'the published price is %, but the collector submitted % and nothing was edited',
      v_obs.price, v_sub.price;
  end if;

  if v_obs.corrects_id is not null then
    raise exception 'approve published a correction (corrects_id %), not an original', v_obs.corrects_id;
  end if;

  if v_obs.superseded_at is not null then
    raise exception 'the observation was born superseded';
  end if;

  -- The carried-over fields the provenance trigger governs.
  if v_obs.commodity_id <> v_sub.commodity_id
     or v_obs.unit_id    <> v_sub.unit_id
     or v_obs.tier       <> v_sub.tier
     or v_obs.iso_year   <> v_sub.iso_year
     or v_obs.iso_week   <> v_sub.iso_week
     or v_obs.currency   <> v_sub.currency
     or v_obs.collected_on <> v_sub.collected_on
     or v_obs.collected_at_site_id <> v_sub.collection_site_id
     or v_obs.source     <> v_sub.source then
    raise exception 'the published observation does not carry its submission''s fields';
  end if;

  if v_sub.status <> 'approved' then
    raise exception 'the submission is % after approval, not approved', v_sub.status;
  end if;

  if v_sub.reviewed_by <> auth.uid() or v_sub.reviewed_at is null then
    raise exception 'the decision was not stamped with the reviewer who made it';
  end if;

  if v_sub.corrected_price is not null or v_sub.correction_reason is not null then
    raise exception 'a plain approval recorded a correction that nobody made';
  end if;
end;
$$;

\echo '  CLAIM 1 passed: approve publishes exactly one linked observation'


-- ----------------------------------------------------------------------------
-- 3. CLAIM 2 -- edit-and-approve keeps the collector's original price and
--    publishes the corrected one.
--
-- This is the Ginger case from 2026-09-24, 1000 -> 1500, and it is the one
-- that matters most: `price` is EVIDENCE, the only record of what the
-- collector says they saw. If a future refactor ever writes the corrected
-- figure over it, the queue can no longer answer whether the collector
-- misread the stall or the reviewer mistyped the correction, and this
-- assertion is what stops that landing quietly.
-- ----------------------------------------------------------------------------

do $$
declare
  v_observation_id uuid;
  v_obs            price_observations%rowtype;
  v_sub            price_submissions%rowtype;
begin
  v_observation_id := approve_price_submission(
    '00000000-0000-4000-8000-000000000012'::uuid,
    date '2026-09-14',
    1500,
    'Reviewer confirmed the stall price with the collector by phone.'
  );

  select * into v_obs from price_observations where id = v_observation_id;
  select * into v_sub from price_submissions where id = '00000000-0000-4000-8000-000000000012';

  if v_sub.price <> 1000 then
    raise exception
      'the submitted price was overwritten: it now reads %, and the collector''s original figure is gone',
      v_sub.price;
  end if;

  if v_sub.corrected_price <> 1500 then
    raise exception 'the correction was recorded as %, not 1500', v_sub.corrected_price;
  end if;

  if v_sub.correction_reason is null then
    raise exception 'a corrected price was stored with no reason (P1.4)';
  end if;

  if v_obs.price <> 1500 then
    raise exception
      'the series carries %, but the reviewer approved 1500; the published figure must be coalesce(corrected_price, price)',
      v_obs.price;
  end if;

  if v_sub.status <> 'approved' then
    raise exception 'the edited submission is %, not approved', v_sub.status;
  end if;
end;
$$;

\echo '  CLAIM 2 passed: edit-and-approve keeps the original, publishes the correction'


-- ----------------------------------------------------------------------------
-- 4. CLAIM 3 -- reject publishes nothing.
--
-- The count is taken before and after and compared, rather than asserting the
-- rejected submission has no observation of its own. A reject that published
-- somebody else's row would pass the narrower test.
-- ----------------------------------------------------------------------------

do $$
declare
  v_before int;
  v_after  int;
  v_sub    price_submissions%rowtype;
begin
  select count(*) into v_before from price_observations;

  perform reject_price_submission(
    '00000000-0000-4000-8000-000000000013'::uuid,
    'Price is out of step with the rest of the week and the collector cannot be reached.'
  );

  select count(*) into v_after from price_observations;

  if v_after <> v_before then
    raise exception 'rejecting published % observation(s); it must publish none', v_after - v_before;
  end if;

  select * into v_sub from price_submissions where id = '00000000-0000-4000-8000-000000000013';

  if v_sub.status <> 'rejected' then
    raise exception 'the rejected submission reads %, not rejected', v_sub.status;
  end if;

  if v_sub.reject_reason is null then
    raise exception 'the submission was rejected with no reason on the record (P1.4)';
  end if;

  if v_sub.reviewed_by <> auth.uid() or v_sub.reviewed_at is null then
    raise exception 'the rejection was not stamped with the reviewer who made it';
  end if;

  -- P1.4 again, from the other side: the collector's figure survives a
  -- rejection exactly as it survives a correction.
  if v_sub.price <> 2500 then
    raise exception 'rejecting altered the submitted price; it now reads %', v_sub.price;
  end if;
end;
$$;

\echo '  CLAIM 3 passed: reject publishes nothing'


-- ----------------------------------------------------------------------------
-- 5. CLAIM 4 -- a second decision on a decided submission is refused.
--
-- Both directions, because they take different paths through 0038: approve
-- re-reads the row and raises on status, while reject's UPDATE is guarded by
-- `and status = 'pending'` and raises on `not found`. A test that only tried
-- one would leave the other free to regress.
--
-- Each attempt is caught in its own block so the transaction survives, and the
-- handler is scoped to SQLSTATE P0001 (raise_exception) so that a constraint
-- violation or a null dereference cannot be mistaken for the refusal we are
-- looking for.
--
-- Grepping 0038 for "already approved" will not find it: the message there is
-- 'price submission % is already %', and the status is the second argument. The
-- substrings matched below are what it renders to, not what it reads as.
--
-- THE `v_allowed` FLAG IS NOT DECORATION. The obvious way to write this --
-- `perform ...; raise exception 'it was allowed';` inside the same block -- is
-- wrong, because that raise is itself P0001 and the handler below would catch
-- the test's own alarm. The flag carries the verdict out of the block, and the
-- alarm is raised where nothing can swallow it.
-- ----------------------------------------------------------------------------

do $$
declare
  v_message  text;
  v_allowed  boolean;
  v_obs_pre  int;
  v_obs_post int;
  v_sub      price_submissions%rowtype;
begin
  select count(*) into v_obs_pre from price_observations;

  -- (a) approve an already-approved submission
  v_allowed := true;
  begin
    perform approve_price_submission(
      '00000000-0000-4000-8000-000000000011'::uuid,
      date '2026-09-14'
    );
  exception
    when sqlstate 'P0001' then
      v_allowed := false;
      get stacked diagnostics v_message = message_text;
      if v_message not like '%already approved%' then
        raise exception
          'approving a decided submission failed, but for the wrong reason: %', v_message;
      end if;
  end;

  if v_allowed then
    raise exception
      'approving an already-approved submission was ALLOWED; a decided submission must be final (P1.4)';
  end if;

  -- (b) approve a rejected submission
  v_allowed := true;
  begin
    perform approve_price_submission(
      '00000000-0000-4000-8000-000000000013'::uuid,
      date '2026-09-14'
    );
  exception
    when sqlstate 'P0001' then
      v_allowed := false;
      get stacked diagnostics v_message = message_text;
      if v_message not like '%already rejected%' then
        raise exception 'approving a rejected submission failed for the wrong reason: %', v_message;
      end if;
  end;

  if v_allowed then
    raise exception 'approving a REJECTED submission was allowed';
  end if;

  -- (c) reject an already-approved submission
  v_allowed := true;
  begin
    perform reject_price_submission(
      '00000000-0000-4000-8000-000000000011'::uuid,
      'Second thoughts.'
    );
  exception
    when sqlstate 'P0001' then
      v_allowed := false;
      get stacked diagnostics v_message = message_text;
      if v_message not like '%already been approved or rejected%' then
        raise exception 'rejecting a decided submission failed for the wrong reason: %', v_message;
      end if;
  end;

  if v_allowed then
    raise exception 'rejecting an already-approved submission was allowed';
  end if;

  -- Nothing moved.
  select count(*) into v_obs_post from price_observations;
  if v_obs_post <> v_obs_pre then
    raise exception
      'a refused second decision still changed the series: % observations became %',
      v_obs_pre, v_obs_post;
  end if;

  select * into v_sub from price_submissions where id = '00000000-0000-4000-8000-000000000011';
  if v_sub.status <> 'approved' or v_sub.corrected_price is not null then
    raise exception 'the refused second decision still altered the submission';
  end if;

  select * into v_sub from price_submissions where id = '00000000-0000-4000-8000-000000000013';
  if v_sub.status <> 'rejected' then
    raise exception 'the refused approval still altered the rejected submission';
  end if;
end;
$$;

\echo '  CLAIM 4 passed: a second decision on a decided submission is refused'


-- ----------------------------------------------------------------------------
-- 6. CLAIM 5 -- the trigger refuses a mismatched price, even when the function
--    is bypassed entirely.
--
-- Claims 1 to 4 test the door. This tests the law. The insert below bypasses
-- both decision functions entirely and goes straight at the table, so if it is
-- refused, it is protect_price_observation_provenance() doing the refusing and
-- nothing else.
--
-- THE FIGURE CHOSEN IS THE SUBMITTED ONE. Submission ...012 was approved at a
-- corrected 1500, and 1000 is what the collector originally reported. So this
-- is not a random wrong number: it is the single most plausible wrong number,
-- the one a refactor that forgot coalesce(corrected_price, price) would
-- publish. That is the regression worth a test.
--
-- ON ORDERING, because it matters for what this actually proves: ...012
-- already has its observation, so this row also collides with TWO unique
-- indexes -- price_observations_submission_id_key, and the live-series index
-- on (commodity_id, iso_year, iso_week, tier) where superseded_at is null.
-- BEFORE ROW triggers fire before any constraint or index is checked, so the
-- provenance error is the one raised. The message is asserted precisely so
-- that if that ever stopped being true, this test fails loudly instead of
-- passing on a unique violation and claiming the trigger works.
--
-- The second insert below has no such overlap -- ...014 is a pending
-- submission for a commodity with no observation at all -- so that half of the
-- guard is proven with nothing else in the way.
-- ----------------------------------------------------------------------------

do $$
declare
  v_message text;
  v_allowed boolean;
  v_count   int;
begin
  v_allowed := true;
  begin
    insert into price_observations (
      commodity_id, unit_id, tier, iso_year, iso_week, week_start_date,
      price, currency, collected_at_site_id, collected_on, submission_id, source
    )
    select
      s.commodity_id, s.unit_id, s.tier, s.iso_year, s.iso_week, date '2026-09-14',
      s.price,                      -- 1000: the SUBMITTED figure, not the approved one
      s.currency, s.collection_site_id, s.collected_on, s.id, s.source
    from price_submissions s
    where s.id = '00000000-0000-4000-8000-000000000012';
  exception
    when sqlstate 'P0001' then
      v_allowed := false;
      get stacked diagnostics v_message = message_text;
      if v_message not like '%does not match submission%' then
        raise exception
          'the insert was refused, but not by the provenance guard: %', v_message;
      end if;
  end;

  if v_allowed then
    raise exception
      'a price that disagrees with its submission was PUBLISHED; the provenance trigger did not fire';
  end if;

  select count(*) into v_count
    from price_observations
   where submission_id = '00000000-0000-4000-8000-000000000012';

  if v_count <> 1 then
    raise exception
      'submission ...012 now has % observations; the refused insert left something behind',
      v_count;
  end if;
end;
$$;

-- The same guard, on the other branch it defends: a submission nobody
-- approved cannot back a published price at all. ...014 is still pending.
do $$
declare
  v_message text;
  v_allowed boolean;
begin
  v_allowed := true;
  begin
    insert into price_observations (
      commodity_id, unit_id, tier, iso_year, iso_week, week_start_date,
      price, currency, collected_at_site_id, collected_on, submission_id, source
    )
    select
      s.commodity_id, s.unit_id, s.tier, s.iso_year, s.iso_week, date '2026-09-14',
      s.price, s.currency, s.collection_site_id, s.collected_on, s.id, s.source
    from price_submissions s
    where s.id = '00000000-0000-4000-8000-000000000014';
  exception
    when sqlstate 'P0001' then
      v_allowed := false;
      get stacked diagnostics v_message = message_text;
      if v_message not like '%not approved%' then
        raise exception 'the pending insert was refused for the wrong reason: %', v_message;
      end if;
  end;

  if v_allowed then
    raise exception 'a PENDING submission backed a published price';
  end if;
end;
$$;

\echo '  CLAIM 5 passed: the provenance trigger refuses a mismatched and an unapproved price'


-- ----------------------------------------------------------------------------
-- 7. The closing tally, then everything goes away.
--
-- Two approvals, one rejection, one still pending; two observations. Asserted
-- as a whole because each section above checked its own corner, and the sum is
-- the thing a reader of a passing run actually wants to know.
-- ----------------------------------------------------------------------------

do $$
declare
  v_obs      int;
  v_approved int;
  v_rejected int;
  v_pending  int;
begin
  select count(*) into v_obs from price_observations;
  select count(*) into v_approved from price_submissions where status = 'approved';
  select count(*) into v_rejected from price_submissions where status = 'rejected';
  select count(*) into v_pending  from price_submissions where status = 'pending';

  if v_obs <> 2 or v_approved <> 2 or v_rejected <> 1 or v_pending <> 1 then
    raise exception
      'final tally is wrong: % observations, % approved, % rejected, % pending (expected 2/2/1/1)',
      v_obs, v_approved, v_rejected, v_pending;
  end if;
end;
$$;

rollback;

\echo ''
\echo 'price_decisions: PASS -- 5 claims, and the transaction was rolled back.'
