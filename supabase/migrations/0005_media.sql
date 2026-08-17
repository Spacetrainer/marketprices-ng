-- 0005_media.sql
-- MarketPrices — Stage 2, migration batch 2
--
-- media (§9.1): id, url, variants jsonb, alt, caption, width, height, uploaded_by.
-- Not on P9.1's anon-SELECT allowlist — media is authenticated-only, full stop.
-- Alt text is enforced NOT NULL here (P7.2 — enforced at upload, not just publish);
-- decorative images pass alt = '' explicitly, so NOT NULL is the right constraint.

create table media (
  id           uuid primary key default extensions.uuid_generate_v4(),

  url          text not null,

  -- Resized/format variant URLs (thumbnail, hero, etc.), keyed by name.
  variants     jsonb not null default '{}'::jsonb,

  alt          text not null,
  caption      text,

  width        integer not null check (width > 0),
  height       integer not null check (height > 0),

  -- Nullable + set null on delete: if the uploading account is later removed,
  -- the media row (and any published content referencing it) must survive —
  -- only the attribution is lost. Same pattern as entitlements.granted_by.
  uploaded_by  uuid references auth.users (id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table media enable row level security;

-- can_edit_media(uid, uploader) — true for an active admin or editor (any row),
-- or an active contributor acting on their own upload.
create function can_edit_media(uid uuid, uploader uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid
      and is_active
      and (
        role in ('admin', 'editor')
        or (role = 'contributor' and uploader = uid)
      )
  );
$$;

-- media_select_authenticated: any signed-in user can view every media row.
-- Media isn't public (not on the anon allowlist), but isn't role-restricted among staff.
create policy media_select_authenticated
  on media
  for select
  to authenticated
  using (true);

-- media_insert_staff: admin, editor or contributor can insert — but only as themselves.
create policy media_insert_staff
  on media
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and can_edit_media(auth.uid(), uploaded_by)
  );

-- media_update_staff: admin/editor update any row; a contributor only their own.
create policy media_update_staff
  on media
  for update
  to authenticated
  using (can_edit_media(auth.uid(), uploaded_by))
  with check (can_edit_media(auth.uid(), uploaded_by));

-- No delete policy: RLS enabled + zero matching policies = default deny.
-- Media is never deleted, only superseded.