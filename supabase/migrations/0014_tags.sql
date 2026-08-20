-- 0014_tags.sql
-- MarketPrices — Stage 2, migration batch 4
--
-- Printed as `0013_tags.sql` in the build plan's migration table. The disk
-- numbering has run one ahead since 0005 and the disk number is the real one.
--
-- tags, article_tags and homepage_pins (§9.1). The vocabulary layer and the
-- one editorial override on the homepage. `videos` is NOT here — it is its own
-- migration.
--
-- THREE TABLES, THREE DIFFERENT ACCESS SHAPES, and the differences are the
-- substance of this file:
--
--   tags          — the only master data in the build that is NOT behind
--                   Settings, because it is created inline while drafting.
--                   Broadest write grant here, and the only real DELETE.
--   article_tags  — assignment state, not history. The build's first table
--                   where DELETE is the normal path rather than a prohibition.
--   homepage_pins — ephemeral curation. Expires by design, and carries the
--                   build's second consciously-taken exception to P9.1.
--
-- P9.1 AMENDMENT, RECORDED HERE AND IN docs/exceptions.md. P9.1 enumerates the
-- tables that may carry an anon SELECT policy — sections, commodities, units,
-- collection_sites, price_observations, basket_snapshots where is_complete,
-- articles where published — and says "only on". ALL THREE tables in this file
-- take one, so this migration amends that list by three, not by one:
--
--   * tags and article_tags, because /tag/[slug] is a public page and §13's
--     placement map lists tag pages as a "join-table query". Without anon
--     SELECT on both, the page cannot render for a signed-out reader.
--   * homepage_pins, because getSectionArticles() applies pins before falling
--     back to recency, and it runs on the public homepage under ISR.
--
-- The alternative for the third was routing the homepage query through a
-- service-role client. Rejected: it makes every homepage render depend on a
-- privileged connection for one small table, to avoid exposing a uuid that
-- cannot be resolved to a person because profiles is not anon-readable.
--
-- NO PIN NUMBER APPEARS IN THIS FILE. §1.5's "up to N article IDs per section"
-- and its "configurable window (default 72h)" are both settings, not constants
-- (P16.1), and there is no Homepage group among §14's twelve, so both live in
-- editorial_rules. A `default now() + interval '72 hours'` on expires_at would
-- freeze a configurable value into the schema — the same thing 0011 refused to
-- do with anomaly bands. The caller reads the window and computes the
-- timestamp.

-- can_author() — active admin, editor or contributor.
--
-- Identical in membership to 0011's can_promote() today, and deliberately a
-- SEPARATE function rather than a reuse of it. 0011 made this argument itself
-- when it declined to reuse is_admin_or_editor(): the product has a third
-- audience, so the predicate deserved its own name. The same logic applies one
-- level down — promoting an anomaly and coining a tag are different
-- permissions that happen to share a membership list right now, and collapsing
-- them into one function means a future change to either silently moves the
-- other.
--
-- Not is_staff(): that would hand tag creation to Analyst, whose entire surface
-- is the Dashboard (§7.2 grants Analyst no feed, radar, studio or queue, and
-- therefore no editor). Not is_admin_or_editor(): that would break the inline
-- create-new flow for the contributors who use the same editor on their own
-- drafts.
create function can_author(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and is_active and role in ('admin', 'editor', 'contributor')
  );
$$;

-- tags
create table tags (
  id           uuid primary key default extensions.uuid_generate_v4(),

  -- The public route key: /tag/[slug]. RESERVED_SLUGS is not checked here and
  -- does not need to be — that list guards the /[section]/[slug] catch-all
  -- against shadowing /prices/commodity/..., and a tag slug lives under /tag/
  -- where it can collide with nothing.
  slug         text not null,
  check (btrim(slug) <> ''),

  -- Deliberately NOT unique, unlike slug. Slug uniqueness already does the
  -- work that matters: 'Maize' and 'maize' both slug to 'maize' and collide
  -- there. A second unique on name would additionally forbid two tags whose
  -- display names differ only by characters the slugifier strips, which is a
  -- rule nothing in the spec asks for.
  name         text not null,
  check (btrim(name) <> ''),

  -- Both beyond §9.1's printed three columns, matching every other master-data
  -- table in the build (sections, units, commodities, collection_sites,
  -- media). created_at because when a term entered the vocabulary is genuinely
  -- useful once the vocabulary is large; updated_at because a tag's display
  -- name is editable — see tags_update_staff below, which is what makes the
  -- second column mean anything.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index tags_slug_key
  on tags (slug);

alter table tags enable row level security;

-- tags_select_public: the whole vocabulary, readable by anyone. Part of the
-- P9.1 amendment recorded in the header. Unscoped because a tag carries
-- nothing private — it is a slug and a display name.
create policy tags_select_public
  on tags
  for select
  to anon, authenticated
  using (true);

-- tags_insert_author: admin, editor OR contributor. This is the only write
-- grant in the build that reaches contributors directly, and it exists because
-- tags are the only master data not administered through Settings — §14's
-- twelve groups place commodities, aliases and collectors in group 5 and sites
-- and basket in group 6, and tags appear in none of them. They are coined
-- inline, mid-sentence, by whoever is drafting.
create policy tags_insert_author
  on tags
  for insert
  to authenticated
  with check (can_author(auth.uid()));

-- tags_update_staff: admin and editor, NOT contributor. Coining a new tag
-- affects only the draft in hand; renaming an existing one changes a public
-- page's title and every article already carrying it, which is an editorial
-- act rather than a drafting one.
--
-- Note what this policy permits that the schema does not police: changing
-- `slug` breaks /tag/[slug] for anything already linking to it. That is an
-- editorial judgement about a live URL, in the same class as recalling an
-- article, and it is left to the person making it rather than frozen by a
-- column-immutability trigger.
create policy tags_update_staff
  on tags
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- tags_delete_admin — a REAL delete policy, which almost nothing in this build
-- has, and the reasoning is worth keeping because it is the exception.
--
-- A tag carries no historical or audit weight. P1.4's no-hard-delete list is
-- price data; P5.9's retain-with-a-reason rule is signals; nothing anywhere
-- covers tags. §9.1 gives the table three columns and not even a timestamp.
--
-- Against that: inline create-new GUARANTEES junk accumulates, and every typo
-- becomes a permanent public page at /tag/[slug], in the sitemap, indefinitely.
--
-- What makes the grant safe is not the policy but the foreign key on
-- article_tags.tag_id, which is `on delete restrict`: a tag any article carries
-- cannot be deleted at all, and the only thing this policy can actually remove
-- is a tag nothing uses — which is exactly the typo case and nothing else. The
-- policy grants the right; the FK narrows it to the only safe target.
--
-- Admin rather than editor because it is destructive and has no undo.
create policy tags_delete_admin
  on tags
  for delete
  to authenticated
  using (is_admin(auth.uid()));

-- article_tags
create table article_tags (
  -- cascade: dead code under RLS, because articles has no DELETE policy and a
  -- recall is a status change. It is here for the paths RLS does not govern —
  -- a service-role or psql delete — where orphaned join rows pointing at a
  -- vanished article are worse than nothing.
  article_id  uuid not null references articles (id) on delete cascade,

  -- restrict, and asymmetric with the line above on purpose: this is the
  -- mechanism behind tags_delete_admin. It is the reason that policy can be
  -- granted at all.
  tag_id      uuid not null references tags (id) on delete restrict,

  primary key (article_id, tag_id)
);

-- No timestamps on this table, unlike tags. A join row is not a record of an
-- event, it is the current state of an assignment; when that assignment last
-- changed is recorded by articles.updated_at, on the row the change was made
-- from.

-- The reverse direction. The primary key leads with article_id and serves the
-- article page's TagRow; it cannot serve /tag/[slug] or RelatedGrid, which
-- start from a tag and need its articles.
--
-- Earned, unlike the two indexes removed from 0012: this table grows with
-- every article multiplied by every tag on it, so it is the one table in this
-- migration with no ceiling.
create index article_tags_tag_id
  on article_tags (tag_id);

alter table article_tags enable row level security;

-- article_tags_select_public: part of the P9.1 amendment. Unscoped rather than
-- restricted to published articles — a subquery against articles in a policy
-- would run on every row of every tag-page query, and it would buy very
-- little: the tag page joins through to articles anyway, where the published
-- filter already applies. What an anon reader can learn from this table alone
-- is that some article id carries some tag, with no way to read the article.
create policy article_tags_select_public
  on article_tags
  for select
  to anon, authenticated
  using (true);

-- article_tags_insert_staff / article_tags_delete_staff — admin and editor,
-- matching the write grants on articles itself, and excluding contributors,
-- who tag DRAFTS (content_items.tags text[]) and never the published record.
--
-- Rows are first materialised by the publish job, which converts the content
-- item's text[] into rows here. But they do not stop there: §8.13's editor
-- form carries a Tags multi-select, and its Update (published items) control
-- opens a published article in that same form. Re-tagging a live article is a
-- human write straight to this table, which is why these two policies exist at
-- all rather than the table being machine-written like price_anomalies.
--
-- DELETE IS THE NORMAL PATH HERE, and this is the first table in the build
-- where that is true. The distinction from articles, which has no DELETE
-- policy, is not squeamishness: a deleted article is a dead URL, a hole in the
-- sitemap and a broken link in every social post that pointed at it, whereas a
-- join row is the current state of an assignment. Removing a tag is not
-- erasing history — it is the assignment now being different.
create policy article_tags_insert_staff
  on article_tags
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

create policy article_tags_delete_staff
  on article_tags
  for delete
  to authenticated
  using (is_admin_or_editor(auth.uid()));

-- No update policy. A two-column join row has nothing to update: you add the
-- assignment or you remove it.

-- homepage_pins
create table homepage_pins (
  section_id  uuid not null references sections (id) on delete cascade,
  article_id  uuid not null references articles (id) on delete cascade,

  -- 1-indexed. §1.5: "pinned articles occupy the first slots in order".
  --
  -- NO UPPER BOUND, because the maximum is the configurable N (P16.1), and no
  -- uniqueness — which is the non-obvious half. `unique (section_id, position)`
  -- looks right and interacts badly with expiry: an expired row still occupies
  -- its slot, so re-pinning slot 1 would fail with a violation naming a pin
  -- that is no longer in effect. The natural fix, a partial index `where
  -- expires_at > now()`, IS NOT AVAILABLE — now() is STABLE, not IMMUTABLE,
  -- and Postgres refuses it in an index predicate, the same wall 0012 hit with
  -- current_date in a check.
  --
  -- So duplicate positions are storable, and the read query orders by
  -- (position, pinned_at) so that they resolve deterministically rather than
  -- erroring. A tidy constraint that fails at the wrong moment is worse than a
  -- loose one with a defined tie-break.
  --
  -- `position` needs no rename and no quoting. It is a NON-reserved keyword in
  -- Postgres — unlike `window` (renamed in 0011) and `group` (renamed in
  -- 0006), both of which are reserved — and a bare column reference parses
  -- normally. Verified before this file was written; do not rename it out of
  -- pattern-matching on those two.
  position    smallint not null check (position >= 1),

  -- not null + restrict, matching articles.published_by: every curation act
  -- carries a named actor, and an account that has pinned something is
  -- deactivated via profiles.is_active rather than deleted.
  pinned_by   uuid not null references profiles (id) on delete restrict,

  pinned_at   timestamptz not null default now(),

  -- NOT NULL WITH NO DEFAULT — see the header. The 72h in §1.5 is a default
  -- setting, not a schema fact, and it lives in editorial_rules. The caller
  -- reads the window and computes this timestamp.
  expires_at  timestamptz not null,
  check (expires_at > pinned_at),

  -- Composite, no surrogate id. §9.1 omits `id` for exactly two tables — this
  -- one and article_tags — and both are relationship tables, which is a pattern
  -- rather than an oversight. The natural key holds by construction: §1.5 says
  -- a section pins "up to N article IDs", so the same article pinned twice in
  -- one section is meaningless.
  --
  -- Not (section_id, position), which would make reordering mutate primary
  -- keys.
  primary key (section_id, article_id)
);

-- A CROSS-TABLE RULE THIS FILE DOES NOT ENFORCE: nothing here stops an article
-- being pinned into a section it does not belong to, because a check constraint
-- cannot read articles.section_id. It COULD be made declarative with a
-- composite foreign key — `unique (id, section_id)` on articles, then
-- `foreign key (article_id, section_id) references articles (id, section_id)`
-- — and that is deliberately not done: it would add a redundant index to
-- articles purely to enable it. Left as a write contract, the same call 0012
-- made for basket_definition's cross-row consistency.

-- No index beyond the primary key, which already leads with section_id and
-- serves the only read this table has. At most N pins across seven sections,
-- and 0012's lesson applies: an index on a table that never grows is a write
-- cost bought with nothing.

alter table homepage_pins enable row level security;

-- homepage_pins_select_public: the third leg of the P9.1 amendment, and the
-- only one of the three that is scoped. An expired pin is unreachable by a
-- public client, not merely ignored by the query — so a future homepage,
-- feed or embed cannot promote a stale pin by forgetting to filter, which is
-- the same fail-closed shape as basket_snapshots' `using (is_complete)`.
create policy homepage_pins_select_public
  on homepage_pins
  for select
  to anon, authenticated
  using (expires_at > now());

-- homepage_pins_select_staff: staff see expired pins too, which the public
-- policy hides. A curation UI that cannot see what just lapsed cannot explain
-- why the homepage changed.
create policy homepage_pins_select_staff
  on homepage_pins
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- homepage_pins_insert_staff: admin and editor. §7.2 has no row for homepage
-- curation, so this is reasoned by nearest neighbour: pinning changes what the
-- public homepage shows, which is the same class of power as "Schedule /
-- publish" and "Reschedule or recall" — both Admin and Editor, contributor
-- excluded.
--
-- pinned_by = auth.uid() so a pin can only be attributed to the person making
-- it, the same "only as themselves" shape as 0005's media_insert_staff.
create policy homepage_pins_insert_staff
  on homepage_pins
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()) and pinned_by = auth.uid());

-- homepage_pins_update_staff: reordering and extending a pin.
create policy homepage_pins_update_staff
  on homepage_pins
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- homepage_pins_delete_staff: unpinning. Expiry is the lazy path and an editor
-- must not have to wait for it — a pin promoting a story that just became wrong
-- has to come down now. Deleting a pin destroys no record: the article, its
-- section and its publication are all untouched, and the pin was always
-- scheduled to vanish on its own.
create policy homepage_pins_delete_staff
  on homepage_pins
  for delete
  to authenticated
  using (is_admin_or_editor(auth.uid()));

-- THE HOMEPAGE READ CONTRACT, for whoever writes getSectionArticles().
--
-- 1. Pins first, then recency (§1.5). Read this section's pins where
--    expires_at > now(), ordered by (position, pinned_at) — the second term is
--    not optional, because position is not unique and a bare `order by
--    position` leaves ties to the planner.
--
-- 2. Recency fills the remainder: published articles in the section, newest
--    first, excluding anything already placed by a pin. A pinned article
--    appearing twice in one block is the failure this step has to avoid.
--
-- 3. Read N from editorial_rules, not from a constant, and treat pins beyond
--    it as surplus rather than an error — the setting can be lowered after
--    pins already exist.
--
-- 4. A pinned article whose section does not match the block is a data error
--    this schema does not prevent (see the note above the policies). Do not
--    paper over it at read time by re-filtering silently; it should be visible.
