-- 0046_price_whole_naira.sql
--
-- A PRICE IS A WHOLE NUMBER OF NAIRA (owner decision, 2026-10-02).
--
-- Kobo are not collected, not displayed and not meaningful at market prices, so a fractional
-- value in a price column is a data-entry artefact rather than a finer measurement. The case
-- that prompted this: a submitted price of 95000.00000000001 was stored, carried no flag (its
-- outlier ratio is 1.0000000000000001), and reached a reviewer looking exactly like 95000.
--
-- WHY THE DATABASE AND NOT ONLY ZOD. lib/validation/ingest.ts now refuses a fractional price at
-- /api/ingest/price, and the tracker importer and the review screen call the same predicate. But
-- a reviewer's correction reaches these columns through approve_price_submission(), which is SQL
-- and never passes through Zod at all. That is the same reasoning that put `price >= 0` in 0009
-- and 0010 rather than only in the application, and these three constraints sit beside it.
--
-- NO DATA IS TOUCHED AND NONE NEEDS TO BE. Checked read-only against production before writing
-- this: price_observations holds 105 rows (105 live), price_submissions 105, and one
-- corrected_price. Every one is already a whole number — max scale 0, range 300 to 89,740 — so
-- all three constraints validate immediately. No NOT VALID, no backfill, no cleanup.
--
-- trunc() RATHER THAN scale() = 0 ON PURPOSE. A numeric of 95000.00 has scale 2 and is a whole
-- number of naira; the rule is about the VALUE, not about how many zeros were typed after the
-- point. `price = trunc(price)` accepts 95000.00 and refuses 95000.01, which is the rule. It also
-- matches what Number.isInteger does in the application, so the two layers agree exactly.
--
-- WHAT IS DELIBERATELY NOT CONSTRAINED, because a fraction is correct there:
--   units.base_multiplier            a unit conversion (a mudu is not a whole number of kg)
--   daily_rollups.value              a derived average or index value
--   weight_proposals.current_value   basket weights
--   weight_proposals.proposed_value    "
-- A blanket "no fractions in numeric columns" would break all four.
--
-- THIS IS NOT THE MAGNITUDE RULE. 1e21 is a whole number and still passes every check here. An
-- absurd price is the outlier flag's job to put in front of a human, and that flag is untouched.
--
-- NO begin;/commit; IN THIS FILE. The runner wraps a migration in its own transaction, and a
-- nested explicit one here is the known blind spot: it commits the inner block and a later
-- failure cannot roll it back.
--
-- VERIFIED BY ATTACK, against production, inside a transaction that was rolled back. Each of the
-- three constraints refused a 250.5 write and each has a control proving it is not simply
-- blocking everything: a whole price still goes in by the same path. 95000.00 (numeric scale 2,
-- whole value) is accepted, and 95000.00000000001 is refused.
--
-- ONE THING THE ATTACK TAUGHT US about price_observations. Its CHECK is the SECOND line of
-- defence, not the first: protect_price_observation_provenance() already refuses a published
-- price that does not equal coalesce(corrected_price, price) of its submission, so a fractional
-- observation is rejected by that trigger before any CHECK is evaluated. Reaching the CHECK at
-- all required disabling that trigger inside the test transaction. The constraint is still worth
-- adding — a trigger can be disabled, and the constraint is what holds if someone does.

alter table price_observations
  add constraint price_observations_price_whole_naira
  check (price = trunc(price));

comment on constraint price_observations_price_whole_naira on price_observations is
  'A published price is a whole number of naira. Kobo are not collected and not displayed, so a '
  'fractional value here is a data-entry artefact. Enforced in the application by '
  'parseNairaPrice in lib/validation/ingest.ts; enforced here because approve_price_submission() '
  'writes this column without passing through Zod.';

alter table price_submissions
  add constraint price_submissions_price_whole_naira
  check (price = trunc(price));

comment on constraint price_submissions_price_whole_naira on price_submissions is
  'A submitted price is a whole number of naira. Refused earlier, and with a better sentence, by '
  'the Zod boundary at /api/ingest/price; this is the floor under it.';

alter table price_submissions
  add constraint price_submissions_corrected_price_whole_naira
  check (corrected_price is null or corrected_price = trunc(corrected_price));

comment on constraint price_submissions_corrected_price_whole_naira on price_submissions is
  'A reviewer''s corrected price is a whole number of naira, on the same rule as the submitted '
  'price it replaces. Null stays legitimate: it means no correction was made.';
