-- ============================================================================
-- 0021_governance.sql
-- Versioned settings (editorial_rules) and the permanent, tamper-resistant
-- record of every settings change and staff action (audit_log).
--
-- NUMBERING NOTE: 0013_articles.sql (line ~262) contains a comment
-- referencing "0021" as the future triggers/guards batch. That comment
-- was written against the build plan's original numbering, which has
-- since drifted from the real on-disk numbering (see exceptions.md). This
-- file -- disk 0021 -- is governance. The triggers/guards batch that old
-- comment meant lands later, as its own migration. 0013 is applied and is
-- never edited to fix the comment in place; this note plus an
-- exceptions.md entry are the durable record instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. editorial_rules
--
-- Every versioned setting (P16.2) lives here. A row is never overwritten
-- in place -- changing a setting retires the currently active row and
-- inserts a new one, via set_editorial_rule() below. "scope" replaces the
-- design doc's "group": group is a reserved word in Postgres, and scope
-- is already the name of this same axis on weight_proposals.
-- ----------------------------------------------------------------------------

create table editorial_rules (
  id uuid primary key default extensions.uuid_generate_v4(),
  scope text not null check (scope <> ''),
  key text not null check (key <> ''),
  value jsonb not null check (
    jsonb_typeof(value) <> 'null'
    and value <> '""'::jsonb
    and value <> '{}'::jsonb
    and value <> '[]'::jsonb
  ),
  version integer not null check (version > 0),
  active_from timestamptz not null default now(),
  is_active boolean not null default true,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table editorial_rules is
  'Versioned settings (P16.2). Never updated in place -- set_editorial_rule() '
  'retires the old row and inserts the new one as a single transaction. '
  'changed_by is nullable only for the initial seed path (Stage 2 seed '
  'data), which does not go through set_editorial_rule() and has no staff '
  'member behind it.';

create unique index editorial_rules_active_uidx
  on editorial_rules (scope, key)
  where is_active;

create unique index editorial_rules_version_uidx
  on editorial_rules (scope, key, version);

alter table editorial_rules enable row level security;

create policy editorial_rules_select_staff
  on editorial_rules for select
    using (is_staff(auth.uid()));

-- No insert/update/delete policy for any role. All writes to this table
-- happen through set_editorial_rule() (SECURITY DEFINER, below), which is
-- the only path that can keep is_active and version consistent with each
-- other.

-- ----------------------------------------------------------------------------
-- 2. audit_log
--
-- The permanent record of every settings change and staff action (P16.6).
-- Append-only at the database level (P1.5): no UPDATE, DELETE or TRUNCATE
-- for any role, including service_role and the table owner.
-- ----------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  actor_id uuid references profiles(id) on delete restrict,
  action text not null check (action <> ''),
  entity_type text not null check (entity_type <> ''),
  entity_id uuid not null,
  diff jsonb not null check (
    jsonb_typeof(diff) = 'object' and diff <> '{}'::jsonb
  ),
  created_at timestamptz not null default now()
);

comment on table audit_log is
  'Append-only at the database level (P1.5). actor_id is nullable only for '
  'system-written entries (cron jobs, the rollup job) -- there is no '
  'sentinel "system" profile, an action with no human simply has a null '
  'actor. created_at is transaction time, not clock time, by design: it '
  'is meant to match the moment the change it records took effect, not '
  'to provide a strict order across a hypothetical future batch write '
  '(see exceptions.md).';

create index audit_log_entity_idx
  on audit_log (entity_type, entity_id, created_at desc);
-- Deliberately no index on actor_id alone -- a fast "everything this
-- person did" query is a surveillance tool, not an audit tool.

alter table audit_log enable row level security;

-- Admin + Editor + Analyst, not Contributor -- matches §7.2's "View audit
-- log" row exactly. Neither is_staff() (includes Contributor) nor
-- is_admin_or_editor() (excludes Analyst) matches this membership, so it
-- gets its own helper.
create or replace function can_view_audit_log(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from profiles
    where id = uid
      and is_active
      and role in ('admin', 'editor', 'analyst')
  );
$$;

create policy audit_log_select_governance
  on audit_log for select
  using (can_view_audit_log());

-- No insert/update/delete policy for any role -- see the REVOKE and the
-- trigger below. write_audit_entry() is the only path in.

-- Layer 1 (RLS, above) stops policy-bound sessions but not service-role,
-- which bypasses RLS by design.
-- Layer 2 (REVOKE) stops service-role, the table owner's own default
-- grants aside, but not a SECURITY DEFINER function body running as
-- owner, and not a superuser.
revoke insert, update, delete, truncate
  on audit_log
  from anon, authenticated, service_role;

-- Layer 3 stops the owner and any SECURITY DEFINER path, and is the only
-- layer that reaches TRUNCATE at all for an owner/superuser session.
-- Unconditional: unlike the content_items and weight_proposals guards,
-- this does NOT no-op when auth.uid() is null. P1.5's threat is
-- application code quietly tidying its own record, not a confused
-- editor, so "no identified user" is exactly the case that must still be
-- blocked, not waved through.
create or replace function protect_audit_log()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op;
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row execute function protect_audit_log();

-- Row-level triggers never fire for TRUNCATE -- only a statement-level
-- trigger catches it.
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function protect_audit_log();

-- ----------------------------------------------------------------------------
-- 3. write_audit_entry() -- the only door into audit_log
--
-- SECURITY DEFINER so it can write despite the REVOKE above. Gated on
-- is_staff() rather than a specific role, because it is meant to be
-- called from within already-gated actions across the product (settings
-- changes, price approvals, publish actions, role changes) -- the real
-- permission decision belongs to the calling action, not to the act of
-- logging it.
-- ----------------------------------------------------------------------------

create or replace function write_audit_entry(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_diff jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if p_actor_id is not null and not is_staff(p_actor_id) then
    raise exception 'audit entries must be written by staff or by the system (null actor)';
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, diff)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, p_diff)
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. set_editorial_rule() -- the only way to change a setting
--
-- Retires the current active row for (scope, key), inserts the new
-- version, and writes the audit entry -- all as one transaction. A no-op
-- write (identical value to what's already active) is rejected before
-- anything is touched. Does not gate on a per-settings-group role map
-- (§8.16 lists twelve groups with different minimum roles): hard-coding
-- that mapping here would mean adding a new settings group later requires
-- a migration just to teach this function about it. Editor-or-above for
-- every scope, uniformly.
-- ----------------------------------------------------------------------------

create or replace function set_editorial_rule(
  p_scope text,
  p_key text,
  p_value jsonb,
  p_actor_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_current editorial_rules%rowtype;
  v_new_id uuid;
  v_new_version integer;
begin
  if not is_admin_or_editor(p_actor_id) then
    raise exception 'only an editor or admin may change a setting';
  end if;

  select * into v_current
  from editorial_rules
  where scope = p_scope and key = p_key and is_active
  for update;

  if found and v_current.value = p_value then
    raise exception 'no-op: % / % is already set to this value', p_scope, p_key;
  end if;

  v_new_version := coalesce(v_current.version, 0) + 1;

  if found then
    update editorial_rules
    set is_active = false
    where id = v_current.id;
  end if;

  insert into editorial_rules (scope, key, value, version, changed_by)
  values (p_scope, p_key, p_value, v_new_version, p_actor_id)
  returning id into v_new_id;

  perform write_audit_entry(
    p_actor_id,
    'editorial_rule.set',
    'editorial_rules',
    v_new_id,
    jsonb_build_object(
      'scope', p_scope,
      'key', p_key,
      'from_version', v_current.version,
      'to_version', v_new_version,
      'previous_value', v_current.value,
      'new_value', p_value
    )
  );

  return v_new_id;
end;
$$;
