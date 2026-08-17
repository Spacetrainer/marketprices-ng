-- 0004_entitlements.sql
-- MarketPrices — Entitlements
--
-- One entitlement row per user, keyed to auth.users. Tier starts 'free' for
-- every new account via the AFTER INSERT trigger below; upgrades to 'paid'
-- are a manual_grant or subscription event, applied by service-role code —
-- never by the client itself (no insert/update policy exists for
-- `authenticated` at all; see the RLS block).
--
-- api_key_hash and api_rate_limit_per_day are deliberately NOT here. API-key
-- storage and rate-limit enforcement are deferred to a future api_keys
-- table — see docs/exceptions.md.

create type entitlement_tier as enum ('free', 'paid');

-- entitlements
create table entitlements (
  id           uuid primary key default extensions.uuid_generate_v4(),

  -- One row per user. FK cascade: deleting the auth.users row deletes the
  -- entitlement with it — there is nothing to keep once the account is gone.
  user_id      uuid not null unique references auth.users (id) on delete cascade,

  tier         entitlement_tier not null default 'free',

  -- How this row's current tier came to be.
  source       text not null default 'signup'
               check (source in ('signup', 'manual_grant', 'subscription')),

  -- Who granted this tier, when it was a human decision (manual_grant).
  -- Null for signup/subscription rows. set null on delete: if the granting
  -- admin's account is later removed, the entitlement itself must survive —
  -- only the attribution is lost.
  granted_by   uuid references auth.users (id) on delete set null,

  starts_at    timestamptz not null default now(),

  -- Null = no expiry.
  expires_at   timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table entitlements enable row level security;

-- entitlements_select_own: a signed-in user can read their own entitlement row.
create policy entitlements_select_own
  on entitlements
  for select
  to authenticated
  using (user_id = auth.uid());

-- entitlements_select_admin: an admin can read every entitlement row.
create policy entitlements_select_admin
  on entitlements
  for select
  to authenticated
  using (is_admin(auth.uid()));

-- No insert/update/delete policy for `authenticated`, on purpose. RLS
-- enabled + zero matching policies = default deny. All mutations happen
-- either through the trigger below (security definer, bypasses RLS) or
-- through service-role code (bypasses RLS entirely) — never through a
-- client-issued insert/update/delete.

-- handle_new_user_entitlement() — creates the free-tier row for every new
-- auth.users account. security definer so it can write past entitlements'
-- own no-client-insert RLS.
create function handle_new_user_entitlement() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into entitlements (user_id, tier, source)
  values (new.id, 'free', 'signup');
  return new;
end;
$$;

create trigger on_auth_user_created_entitlement
  after insert on auth.users
  for each row
  execute function handle_new_user_entitlement();