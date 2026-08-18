-- 0009_price_submissions.sql
-- MarketPrices — Stage 2, migration batch 3
--
-- price_submissions (§6.1/§9.2): THE ONE DOOR IN (P1.1). Every row that ever
-- reaches price_observations passes through here first — the public Google
-- Form pipeline (POST /api/ingest/price, service-role, bypasses RLS) and the
-- control room's manual-entry form both land here as 'pending', and nothing
-- becomes a published observation without a human approving a row in this
-- table. Manual and phone-in entry is not an exception to that (P1.1) — it's
-- a second value of `source`, not a second door.
--
-- No created_at/updated_at pair: submitted_at (when the row was received)
-- and reviewed_at (when it was decided) already cover this row's only two
-- moments — a submission is never edited outside the single review action
-- that resolves it.

create table price_submissions (
  id                  uuid primary key default extensions.uuid_generate_v4(),

  commodity_id        uuid not null references commodities (id) on delete restrict,

  -- Optional descriptor within the commodity (e.g. a rice or yam variety).
  -- Most commodities won't carry one.
  variety             text,

  collection_site_id  uuid not null references collection_sites (id) on delete restrict,
  unit_id             uuid not null references units (id) on delete restrict,

  tier                text not null check (tier in ('retail', 'wholesale')),

  -- 0 is a legitimate submitted price (given away, promotional) and is kept;
  -- a negative price is a data-entry error and is blocked outright.
  price               numeric not null check (price >= 0),

  currency            text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),

  -- P1.2: every submission traces to a person. No anonymous submissions,
  -- including from the public form — an unknown contributor becomes a
  -- collector record first, untrusted, so their prices queue for review.
  collector_id        uuid not null references collectors (id) on delete restrict,

  -- Derived once from collected_on by application code (lib/weeks.ts) at
  -- submission time and stored redundantly for query performance — never
  -- recomputed ad hoc, never hand-rolled elsewhere (P2.7).
  iso_year            integer not null check (iso_year >= 2020),
  iso_week            smallint not null check (iso_week between 1 and 53),

  -- The date the collector actually stood in the market. Distinct from
  -- submitted_at, which is when the row reached this table.
  collected_on        date not null,
  submitted_at        timestamptz not null default now(),

  -- Which channel created this row: the public Google Form pipeline, or the
  -- control room's manual-entry form. Drives review-queue UI copy; see the
  -- note on `notes` below for what this does — and doesn't — enforce.
  source              text not null default 'form' check (source in ('form', 'manual')),

  -- Optional proof photo (form field, not required).
  photo_url           text,

  -- Free-text notes. For manual/phone-in entries the admin-editor form
  -- requires this — it's where "who phoned it in" gets recorded (P1.1) —
  -- but that requirement is enforced by the form, not by this column. A
  -- database constraint tying notes to source = 'manual' was deliberately
  -- left out here: it's a UI-layer rule, not a data-integrity one.
  notes               text,

  status              text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),

  -- System-computed at validation time (seasonality-aware anomaly check +
  -- duplicate check), never free text typed by the submitter.
  flags               text[] not null default '{}'::text[]
                       check (flags <@ array['outlier', 'new_series', 'duplicate', 'site_switch']::text[]),

  -- Nullable, set null on delete: if the reviewing account is later removed,
  -- the decision itself must survive — only the attribution is lost. Same
  -- pattern as entitlements.granted_by and media.uploaded_by.
  reviewed_by         uuid references profiles (id) on delete set null,
  reviewed_at         timestamptz,

  reject_reason       text,

  -- Rejection always carries a reason (P1.4) — database-enforced.
  check (status <> 'rejected' or reject_reason is not null),

  -- A decided row (approved or rejected) always carries who decided it and
  -- when, together — database-enforced.
  check (status = 'pending' or (reviewed_by is not null and reviewed_at is not null))
);

alter table price_submissions enable row level security;

-- price_submissions_select_staff: any signed-in staff member (any role) can
-- read the full submission queue — collector_id, photo, notes included. No
-- anon policy exists at all; same call as collectors (P9.2) and for the same
-- reason: this table sits one join away from collector PII.
create policy price_submissions_select_staff
  on price_submissions
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- price_submissions_insert_staff: an admin or editor can create a submission
-- directly, from the control room's manual-entry form. No contributor
-- direct-submit path exists. The public Google Form pipeline doesn't need
-- one either — it lands rows through /api/ingest/price under service-role
-- credentials, which bypasses RLS entirely and isn't a grant made here.
create policy price_submissions_insert_staff
  on price_submissions
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- price_submissions_update_staff: an admin or editor can edit a pending row
-- (Edit & approve) or move it to approved/rejected.
create policy price_submissions_update_staff
  on price_submissions
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy: RLS enabled + zero matching policies = default deny.
-- Rejected submissions are retained with status = 'rejected' and a reason
-- (P1.4) — nothing is hard-deleted from this table, ever.
