-- 0008_collectors.sql
-- MarketPrices — Stage 2, migration batch 2
--
-- collectors (§9.2): id, name, phone, submission_count, accuracy_score,
-- is_trusted, is_active. THE SENSITIVE ONE (P9.2) — collectors.phone is
-- field-collector PII and must never reach a public/anon query, and never
-- reach a public reader's authenticated session either (a reader with only
-- an entitlements row is still `authenticated`). This table has NO anon
-- policy at all, and SELECT is gated to staff (an active profiles row),
-- not to `authenticated` in general.
--
-- Public attribution ("submitted by Chidinma A.") uses name only, never
-- phone, and does NOT happen through this table directly — the name-only
-- view is deferred to its own reviewed migration. No anon grant here.

create table collectors (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  name               text not null,
  phone              text not null,

  -- Maintained by triggers/service-role code as submissions arrive, not
  -- editable by a client. 0 is a true starting fact for a new collector.
  submission_count   integer not null default 0 check (submission_count >= 0),

  -- Null = not yet computed. Defaulting to 0 would assert "0% accurate" and
  -- 100 would assert "perfect" — both fabricated. Same P0.2 logic.
  accuracy_score     numeric check (accuracy_score >= 0 and accuracy_score <= 100),

  -- Trust is granted explicitly by a human reviewer, never assumed.
  is_trusted         boolean not null default false,
  is_active          boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table collectors enable row level security;

-- is_staff() — true for anyone with an active profiles row, any role.
-- Deliberately broader than is_admin_or_editor() (contributors/analysts
-- count too) but strictly narrower than `authenticated`: a public reader
-- with only an entitlements row has no profiles row and fails this check.
create function is_staff(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = uid and is_active
  );
$$;

-- collectors_select_staff: any signed-in staff member (any role) can read
-- the full collectors table, phone included. No anon policy exists at all
-- — phone is unreachable by anon by construction, not by convention.
create policy collectors_select_staff
  on collectors
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- collectors_insert_staff: an admin or editor can register a new collector.
create policy collectors_insert_staff
  on collectors
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- collectors_update_staff: an admin or editor can edit an existing collector
-- — trust status, active status, corrected phone/name.
create policy collectors_update_staff
  on collectors
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy: RLS enabled + zero matching policies = default deny.
-- A collector who stops submitting is deactivated, never deleted — every
-- price row's attribution (P1) must keep resolving to a real collector.