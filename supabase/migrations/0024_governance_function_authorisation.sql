-- ============================================================================
-- 0024_governance_function_authorisation.sql
-- Closes two authorisation holes in 0021_governance.sql.
--
-- WHAT WAS WRONG. Both bugs are the same mistake made twice: a SECURITY
-- DEFINER function that takes the actor's identity as a caller-supplied
-- argument and then gates on that argument.
--
-- (1) set_editorial_rule(p_scope, p_key, p_value, p_actor_id uuid default
--     auth.uid()) checks is_admin_or_editor(p_actor_id), writes
--     editorial_rules.changed_by = p_actor_id, and passes the same value to
--     write_audit_entry(). The `default auth.uid()` reads as though identity
--     comes from the session, and it does -- only when the argument is
--     omitted. Any caller may supply it instead. A signed-in contributor or
--     analyst who knows one editor's uuid calls the function with it, passes
--     the gate, and both the setting's changed_by and the editorial_rule.set
--     audit row name an editor who did nothing.
--
--     Not exploitable while profiles holds zero rows and is staff-only SELECT.
--     It becomes exploitable the day the first article publishes:
--     articles_select_public grants anon SELECT on every published row, and
--     those rows carry author_id (not null) and published_by, both foreign
--     keys to profiles(id) -- the exact uuids is_admin_or_editor() accepts.
--
-- (2) write_audit_entry() is the same shape with a wider blast radius. It is
--     SECURITY DEFINER, EXECUTE is held by PUBLIC plus anon, authenticated and
--     service_role, and its only gate is `if p_actor_id is not null and not
--     is_staff(p_actor_id)` -- so a null actor is explicitly accepted as "the
--     system". Any caller could write any audit row: an action that never
--     happened, attributed to a real staff member, or attributed to the
--     system itself. 0021 calls this function "the only door into audit_log"
--     and treats that as the security property. It is not. The table REVOKE
--     and protect_audit_log() answer whether a row can be altered after it is
--     written. Nothing answered whether this caller may write it at all, and
--     because audit_log is append-only a forged entry is permanent.
--
-- THE FIX. Identity stops being a parameter. set_editorial_rule() drops
-- p_actor_id and reads auth.uid() into a variable once, so the value it gates
-- on and the value it records are the same value and neither comes from the
-- caller. write_audit_entry() keeps its actor parameter -- it logs on behalf
-- of other actions and must still be able to name a system write -- and
-- instead stops being reachable from the client.
--
-- THE FOUR-ARGUMENT FORM IS DROPPED, NOT SHADOWED. Changing the argument list
-- means CREATE OR REPLACE does not replace anything: it creates a second
-- overload and leaves the vulnerable one callable, which would be strictly
-- worse than doing nothing -- a three-argument call would resolve to the safe
-- function while set_editorial_rule(text, text, jsonb, uuid) stayed open. The
-- DROP below is therefore the load-bearing statement of this migration.
-- Deliberately no IF EXISTS: if the applied shape is not what this migration
-- expects, it must abort rather than proceed quietly.
--
-- Verified 2026-08-31 that nothing calls the four-argument form: no .rpc(
-- call exists anywhere in the repo, lib/queries/ does not exist yet, and no
-- document names the argument list. The only other occurrence is generated
-- types/database.ts, regenerated after this applies.
--
-- REVOKING FROM PUBLIC IS PART OF THE REVOKE, NOT AN ALTERNATIVE TO IT. This
-- database grants EXECUTE on new functions in public to anon, authenticated
-- and service_role BY NAME, on top of the implicit PUBLIC grant -- every
-- function here reads {=X/postgres,postgres=X/postgres,anon=X/postgres,
-- authenticated=X/postgres,service_role=X/postgres}. Naming only PUBLIC
-- leaves three named grants standing; naming only the roles leaves PUBLIC's
-- grant standing, which is a grant to every role including the two being
-- revoked. Either half alone is a no-op that reads like a lock. Both revokes
-- below name PUBLIC and the roles together, and are verified by reading
-- proacl back rather than by reading this file.
--
-- NOT AN EDIT TO 0021. 0021 is applied and applied migrations are never
-- edited. This is a fix-forward.
--
-- SEARCH_PATH PINNED ON BOTH, because they are being replaced anyway. Of the
-- sixteen SECURITY DEFINER functions in this schema, the only three with no
-- pinned search_path are 0021's. Two of them are rewritten here and get the
-- pin; can_view_audit_log() is untouched by this migration and still needs
-- it, in its own follow-up.
--
-- THE authenticated EXECUTE GRANT ON set_editorial_rule() IS KEPT. It is the
-- Settings screen's only path in, and once identity comes from auth.uid() the
-- question of who may call the function no longer decides who the function
-- can act as. Restricting the caller would be defence in depth against a hole
-- already closed, at the cost of the one route the application has. anon and
-- PUBLIC are revoked: an anonymous caller resolves auth.uid() to null,
-- is_admin_or_editor(null) is false and the call would raise anyway, so the
-- revoke costs nothing and removes a SECURITY DEFINER entry point from a role
-- that can never legitimately use it.
--
-- SERVICE-ROLE POSTURE. service_role keeps EXECUTE on both, and the seed path
-- is unaffected: 0021 states that seed data inserts into editorial_rules
-- directly rather than through this function, which is why changed_by is
-- nullable. A service-role call to set_editorial_rule() now raises, because
-- auth.uid() is null there and no null actor is an editor. That is the
-- intended posture -- a setting change is a human act (P16.2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. write_audit_entry() -- unchanged body, pinned search_path, closed door
--
-- Same five arguments, so CREATE OR REPLACE genuinely replaces. The body is
-- byte-for-byte 0021's; the only change is the search_path pin.
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
set search_path = public
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

-- Reachable only from inside the SECURITY DEFINER functions that log (they
-- run as owner and keep EXECUTE) and from service_role. PUBLIC is named
-- alongside the two roles for the reason given in the header: without it the
-- other two revokes are cosmetic.
revoke execute on function write_audit_entry(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. set_editorial_rule() -- identity from the session, not from the caller
--
-- The DROP is the fix. See the header: replacing a function with a different
-- argument list adds an overload and leaves the old one callable.
-- ----------------------------------------------------------------------------

drop function set_editorial_rule(text, text, jsonb, uuid);

create function set_editorial_rule(
  p_scope text,
  p_key text,
  p_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_current editorial_rules%rowtype;
  v_new_id uuid;
  v_new_version integer;
begin
  -- READ ONCE. The value that authorises is the value that is recorded, and
  -- there is no argument that can make them differ. This single line is the
  -- whole of the fix; everything below it is 0021's logic unchanged.
  v_actor := auth.uid();

  if not is_admin_or_editor(v_actor) then
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
  values (p_scope, p_key, p_value, v_new_version, v_actor)
  returning id into v_new_id;

  perform write_audit_entry(
    v_actor,
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

-- A fresh CREATE takes this database's default privileges, which include
-- PUBLIC and anon. Both are removed; authenticated and service_role keep
-- EXECUTE. Naming PUBLIC is what makes the anon revoke effective.
revoke execute on function set_editorial_rule(text, text, jsonb)
  from public, anon;

comment on function set_editorial_rule(text, text, jsonb) is
  'Retires the active editorial_rules row for (scope, key) and inserts the '
  'next version, with its audit entry, as one transaction. The actor is read '
  'from auth.uid() inside the function and is not a parameter: the identity '
  'that is authorised and the identity that is recorded are the same value '
  '(0024). Editor-or-above for every scope.';
