-- 0003_profiles.sql
-- MarketPrices — Stage 2, migration batch 1
--
-- Profiles, keyed 1:1 to auth.users. This is also where the two admin-write
-- policies deferred by 0002_sections.sql land — they check profiles.role,
-- and profiles didn't exist yet at 0002 (P9.1, P9.4, §7.1/§7.2).

-- Role enum — matches the role matrix in §7.2.
create type user_role as enum ('admin', 'editor', 'contributor', 'analyst');

-- profiles
-- id is NOT given a uuid default: it must equal the auth.users row it extends,
-- assigned explicitly at insert time (the admin-invite flow), never generated.
create table profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null unique,
  name             text not null,
  avatar_url       text,
  role             user_role not null default 'analyst', -- least-privilege default
  is_active        boolean not null default true,
  is_2fa_enabled   boolean not null default false,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table profiles enable row level security;

-- is_admin() — SECURITY DEFINER helper so the "admin reads all" policy doesn't
-- query profiles from inside a profiles policy (which would recurse and error).
create function is_admin(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = uid and role = 'admin'
  );
$$;

-- profiles_select_own: a signed-in user can read their own profile row, nothing else.
create policy profiles_select_own
  on profiles
  for select
  to authenticated
  using (id = auth.uid());

-- profiles_select_admin: an admin can read every profile row.
create policy profiles_select_admin
  on profiles
  for select
  to authenticated
  using (is_admin(auth.uid()));

-- profiles_update_own: a user can update their own row; the trigger below still
-- stops them touching role/is_active/is_2fa_enabled on it.
create policy profiles_update_own
  on profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles_insert_admin: only an admin can create a profile row (invite-only).
create policy profiles_insert_admin
  on profiles
  for insert
  to authenticated
  with check (is_admin(auth.uid()));

-- No delete policy, on purpose: RLS enabled + zero matching policies = default deny.
-- Users are deactivated via is_active, never deleted.

-- Role-protection trigger — a non-admin editing their own row must not be able to
-- grant themselves a role, reactivate themselves, or flip their own 2FA flag.
-- Admin-driven updates to OTHER users' rows go through server-side service-role
-- code, outside RLS, and are untouched by this check.
create function protect_profile_privileges() returns trigger
language plpgsql
as $$
begin
  if new.id = auth.uid() and not is_admin(auth.uid()) then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.is_2fa_enabled is distinct from old.is_2fa_enabled then
      raise exception 'cannot change role, is_active or is_2fa_enabled on your own profile';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on profiles
  for each row
  execute function protect_profile_privileges();

-- Deferred from 0002_sections.sql: admin-only write policies on sections,
-- now unblocked because profiles (and is_admin()) exist.

-- sections_insert_admin: an admin can create a new section.
create policy sections_insert_admin
  on sections
  for insert
  to authenticated
  with check (is_admin(auth.uid()));

-- sections_update_admin: an admin can edit an existing section.
create policy sections_update_admin
  on sections
  for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));