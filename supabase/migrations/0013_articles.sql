-- 0013_articles.sql
-- MarketPrices — Stage 2, migration batch 4
--
-- Printed as `0012_articles.sql` in the build plan's migration table. The disk
-- numbering ran one ahead from 0005 onward and the disk number is the real one.
--
-- articles (§9.1): THE PUBLIC RECORD OF WHAT WENT LIVE. Not the production
-- pipeline — that is content_items (§9.5), several migrations away, and it is
-- where drafts, scoring, verification, scheduling and the eight-value status
-- machine live. Nothing in this file holds a draft.
--
-- A ROW HERE IS BORN PUBLISHED, and almost every decision below follows from
-- it. The publish cron selects content_items where status = 'scheduled' and
-- scheduled_for <= now(), re-asserts the P15.7 allocation fields, and only
-- then writes a row into this table. There is no path that inserts an article
-- ahead of its publication, which is why this table's status vocabulary is two
-- words rather than eight, why there is no created_at, and why the fields P3.2
-- calls blocking are NOT NULL here rather than deferred to a publish check.
--
-- P1.9 — every published article traces to a content item, including a manually
-- written one (which is a content_items row with source_screen = 'manual').
-- content_item_id below carries that link, and today it carries it WITHOUT
-- enforcement; see the long note on that column.
--
-- P5.7 — provenance is permanent. agent_assisted and content_item_id are
-- written at publish and never cleared, even when the article is later
-- recalled. Unlike every other table built so far, this one has a real UPDATE
-- policy from day one (the editor's Update control), so that permanence needs
-- an active guard rather than the absence of a grant. It is the trigger at the
-- foot of this file.
--
-- P9.1 — anon SELECT is scoped to status = 'published'. A recalled article is
-- unreachable by a public client, not merely unrendered.

create table articles (
  id                uuid primary key default extensions.uuid_generate_v4(),

  -- GLOBALLY unique, not unique per section. The route /[section]/[slug] would
  -- be satisfied by a (section_id, slug) key, but P15.5 puts
  -- utm_campaign={slug} on every outbound link and Dashboard Zone 4 is built
  -- on those UTMs — a slug repeated across two sections makes a click
  -- unattributable to a piece. Global uniqueness also means moving an article
  -- between sections can never collide.
  --
  -- RESERVED_SLUGS is deliberately NOT duplicated here. It lives in
  -- lib/constants.ts and is applied by the slug validator, per the build plan:
  -- it guards against route shadowing (/prices/commodity/...), which is a
  -- routing concern that changes when routes change, and a copy of the list
  -- frozen into a migration is a copy that goes stale silently.
  slug              text not null,
  check (btrim(slug) <> ''),

  section_id        uuid not null references sections (id) on delete restrict,

  -- Exactly two. A video article is this table, this row shape, with
  -- type = 'video' — there is no separate video table and §9.7's list of
  -- tables deliberately not created is the place that stays true.
  type              text not null check (type in ('standard', 'video')),

  -- 72 characters, P3.1's hard limit, enforced here as well as in the editor
  -- input. The editor makes typing character 73 impossible for a human; this
  -- check makes it impossible for the publish cron, which does not type.
  title             text not null,
  check (btrim(title) <> ''),
  check (char_length(title) <= 72),

  -- Optional, 150 characters when present (P3.1). Nullable rather than
  -- required: a dek is an editorial choice and the card layouts tolerate its
  -- absence. The btrim half stops an empty string being stored as if it were a
  -- dek — absent is null, not ''.
  dek               text,
  check (dek is null or (btrim(dek) <> '' and char_length(dek) <= 150)),

  body              text not null,
  check (btrim(body) <> ''),

  -- NOT NULL, and this reverses the nullable column first proposed for it.
  --
  -- §1.4 ("Every article has a designed header") is not a preference: every
  -- content item carries a designed graphical header rendered in four sizes,
  -- and the one photographic case (archetype T7) is still an image. P3.2 then
  -- states it as a rule — "publishing is blocked without: header image, header
  -- alt text, section, byline, slug. Blocked, not warned."
  --
  -- The soft-enforcement reading — database permits empty, editor disables the
  -- publish control — is the right reading for content_items, which holds
  -- half-written drafts where these fields legitimately do not exist yet. It
  -- has no meaning HERE, because a row in this table is born published: the
  -- moment of insert is the moment P3.2 gates. "Blocked before publish" and
  -- NOT NULL are the same constraint on a table with no pre-publish state.
  --
  -- Consistency settles it too. P3.2 names five fields in one breath and three
  -- of them — section, byline, slug — are NOT NULL below without argument.
  -- Singling out the header image for weaker treatment would not match any
  -- reading of that sentence.
  --
  -- on delete restrict: an image a published article is built on is not
  -- deletable out from under it.
  header_media_id   uuid not null references media (id) on delete restrict,

  -- P7.2, and the article-level override of media.alt (which is itself NOT
  -- NULL in 0005 — the same image can need different alt text in a different
  -- article, so the override exists, but it is never an escape from having
  -- any). Non-blank, with the same btrim reasoning as 0011's dismiss_reason:
  -- without it, '' satisfies "alt text is present" and P7.2 holds in name
  -- only. P7.2's decorative alt="" case cannot arise for a header — a hero
  -- image is never decorative.
  header_alt        text not null,
  check (btrim(header_alt) <> ''),

  -- The byline (P3.2). NOT NULL: a published article always says who wrote it,
  -- and P0.1 forbids a placeholder author standing in. on delete restrict, so
  -- an account that has published cannot be deleted — deactivate it via
  -- profiles.is_active, which is the pattern everywhere in this build.
  --
  -- This assumes every author is staff. If an external contributor is ever
  -- bylined, this FK is the thing that has to change, and it should change as
  -- its own migration with its own reasoning, not by relaxing this column.
  author_id         uuid not null references profiles (id) on delete restrict,

  -- GEOGRAPHY, NOT TOPIC (§1.2). Nigeria is the default, and the entire Africa
  -- page is the derived view `country != 'Nigeria'` — no filing decision, no
  -- flag, just this string compared to that string.
  --
  -- Which makes a typo here a silent misfiling: 'nigeria' or ' Nigeria ' is
  -- != 'Nigeria' and quietly relocates a Lagos story onto the Africa page. The
  -- two checks below are the lightest defence that actually defends the thing
  -- at risk, and no more:
  --
  --   1. The value is trimmed and non-empty. Whitespace is the typo class that
  --      is invisible in every UI that would let you spot the others.
  --   2. Anything that IS Nigeria must be spelled exactly 'Nigeria'. This pins
  --      only the one string the derivation pivots on, and leaves every other
  --      country as unconstrained free text.
  --
  -- What is deliberately NOT built: a countries reference table (no such table
  -- exists anywhere in §9 and inventing one for a single column is new
  -- structure the docs do not call for), and a citext column (0001 enables
  -- uuid-ossp and pg_trgm only, so this would mean adding an extension for one
  -- field). Neither is warranted.
  --
  -- The residual risk is stated rather than papered over: 'Nigera' passes both
  -- checks and lands on the Africa page. Only a vocabulary table catches a
  -- misspelling, and the editor's country field should be a select for exactly
  -- that reason. These checks catch case and whitespace, which is what they
  -- claim to catch.
  country           text not null default 'Nigeria',
  check (country = btrim(country) and country <> ''),
  check (lower(country) <> 'nigeria' or country = 'Nigeria'),

  -- TWO VALUES, and the shortness is the point. content_items owns the eight-
  -- value pipeline (queued, producing, ready, needs_work, scheduled,
  -- published, dispatching, failed); none of it belongs here.
  --
  -- 'scheduled' is not on this table: 0021's scheduled_requires_human check is
  -- declared on content_items, and the publish cron reads `scheduled` from
  -- there. 'failed' is not here either: P15.7's allocation assertion fails the
  -- CONTENT ITEM and never writes the article row at all, because the failure
  -- mode it exists to prevent is publishing an orphan.
  --
  -- 'recalled' rather than 'unpublished' (P15.4). Since a row can only be born
  -- published, "unpublished" is ambiguous with "never published", while
  -- "recalled" can only mean what actually happened — it was live and was
  -- taken down — and it matches the verb on §8.13's control. Re-publishing
  -- after a fix moves it back to 'published'; no third word is needed.
  --
  -- NOT NULL with NO DEFAULT. A default of 'published' would let an insert
  -- that forgets the column acquire published-ness by omission, and being
  -- public is not a thing this table should ever infer.
  status            text not null check (status in ('published', 'recalled')),

  -- Nullable, because a recalled row that is later re-published is briefly a
  -- row whose publication is in the past tense, and because null means null.
  -- The check binds it to status: a row claiming to be published states when.
  published_at      timestamptz,
  check (status <> 'published' or published_at is not null),

  -- No created_at, deliberately. The row is created at publication, so
  -- published_at IS its creation moment and a second column could only repeat
  -- it. Same call as 0009 and 0010.
  --
  -- Nothing currently maintains this column: no set_updated_at trigger exists
  -- on any table in this build. The editor's Update action sets it. If that
  -- ever becomes a trigger it should become one for every table at once, not
  -- for this one alone.
  updated_at        timestamptz not null default now(),

  -- INFORMATIONAL, and the distinction from published_at is the whole reason
  -- it exists: scheduled_for is when the item was MEANT to go out, copied from
  -- the content item at publish; published_at is when it actually did. The gap
  -- between them is the only way to answer "are we publishing on time".
  --
  -- Note what is absent: §9.1 gives this table scheduled_for but no
  -- scheduled_by, while §9.5 gives content_items both. That asymmetry is
  -- correct and not an oversight to fix here — P15.1's "scheduled_by and
  -- scheduled_for are NOT NULL before status may become scheduled" is a rule
  -- about the SCHEDULING decision, which happens on content_items and is
  -- enforced there in 0021. This column is a record of a time, not of a
  -- decision, so it carries no actor and no constraint.
  scheduled_for     timestamptz,

  -- Required for a video article — a type = 'video' row with nothing to play
  -- is an empty page. The reverse is deliberately NOT blocked: a standard
  -- article may carry a youtube_id (an explainer clip alongside the prose is
  -- an editorial choice, not an error), and a check that forbade it would be
  -- the schema making a layout decision.
  youtube_id        text,
  check (youtube_id is null or btrim(youtube_id) <> ''),
  check (type <> 'video' or youtube_id is not null),

  -- The "4 min read" estimate on a card, NOT the measured metric. §12's
  -- "average read time" is load-to-last-scroll from site_events and has
  -- nothing to do with this column.
  --
  -- Nullable, no default, computed in lib/ from the body at publish — a
  -- labelled derivation under P0.2. Not a generated column: the body is rich
  -- text and the counting rule (do data blocks count? pull quotes?) is an
  -- editorial decision that belongs in code with tests, not in crude SQL.
  -- Null renders as no read-time chip, never as "0 min read".
  read_time         integer check (read_time > 0),

  -- A denormalised cache of an hourly rollup that does not exist yet.
  -- §12 sources page views from first-party site_events + Vercel Analytics;
  -- site_events carries published_article_id and is built in
  -- 0018_measurement.sql alongside daily_rollups. P8.7 bars the Dashboard from
  -- scanning site_events directly, which is what this cache is for.
  --
  -- Nullable with NO DEFAULT, specifically not `not null default 0`. A genuine
  -- zero — published, nobody read it — becomes a true statement once 0018
  -- runs. Between now and then nothing is counting, so a 0 on every article
  -- would mean "we are not measuring" while rendering as "0 views". Null says
  -- the true thing in the meantime, and the distinction is the same one this
  -- schema draws with missing_commodity_ids (empty array, never null) and
  -- commodities.seasonality_profile (null, never '{}').
  view_count        integer check (view_count >= 0),

  -- P5.7, half one. NOT NULL with NO DEFAULT: `false` as a default would let a
  -- publish path that forgets this column silently claim human authorship,
  -- which is precisely the disclosure failure the /how-we-use-ai page is a
  -- public promise against. The writer states it, every time.
  --
  -- Immutable after insert — see the trigger at the foot of this file.
  agent_assisted    boolean not null,

  -- P1.9, half two, and the one column here carrying no enforcement today.
  --
  -- Plain nullable uuid, NO foreign key, NO not-null. The reason is structural
  -- rather than an ordering convenience: content_items carries
  -- published_article_id (§9.5), so these two tables reference EACH OTHER, and
  -- one direction of a mutual reference always has to be added after both
  -- tables exist regardless of migration order.
  --
  -- A conflict in the specs, recorded rather than silently resolved: P1.9 says
  -- this column is NOT NULL, flatly, while the build plan (0021) and P5.1
  -- specify a trigger keyed on `status = 'published'` guarding TWO columns,
  -- this one and published_by. Those are different rules. The trigger form is
  -- treated as operative here because published_by cannot be NOT NULL, and the
  -- protocol wants the pair guarded together. Whether 0021 also tightens this
  -- column to NOT NULL once the FK exists is a live question for 0021, not a
  -- settled one.
  --
  -- UNTIL 0021 IS APPLIED, A PUBLISHED ARTICLE WITH content_item_id = NULL IS
  -- STORABLE. That is a real gap and it is stated here so it is found on
  -- purpose rather than by accident.
  --
  -- Already immutable once set, though — the trigger below guards that half of
  -- P5.7 today, and deliberately still permits null → value so that 0021 can
  -- backfill rows written before it.
  content_item_id   uuid,

  -- The other half of 0021's trigger, split out and enforced NOW. The split is
  -- principled, not impatient: published_by has a real foreign key to a table
  -- that exists, so "present AND valid" is fully enforceable today, whereas
  -- content_item_id above can only be asserted present — and a not-null uuid
  -- pointing at nothing is false assurance, not a guard. 0021's trigger
  -- therefore shrinks to the content_item_id half.
  published_by      uuid references profiles (id) on delete restrict,
  check (status <> 'published' or published_by is not null),

  -- All nullable. Each falls back at render: seo_title to title,
  -- seo_description to dek, canonical_url to the article's own URL. Storing a
  -- copy of the fallback would be P3.3's silent authorship written into the
  -- database — a suggestion saved as though someone had chosen it.
  seo_title         text,
  seo_description   text,
  canonical_url     text
);

-- The identity rule. Written as an explicit index rather than an inline
-- UNIQUE so it carries a name that appears in the constraint-violation message
-- an editor will actually see when a slug collides.
create unique index articles_slug_key
  on articles (slug);

-- §9.6, verbatim: `articles (section_id, status, published_at DESC)`, annotated
-- there as "every homepage block, every section page". This is the one index in
-- the batch that the spec names, and the cardinality argument that removed both
-- indexes from 0012 runs the other way here — basket rows are bounded at
-- fifty-two a year, articles are not bounded at all, and this is the hottest
-- read path on the public site.
create index articles_section_status_published
  on articles (section_id, status, published_at desc);

alter table articles enable row level security;

-- articles_select_public: the P9.1 entry. A recalled article is not merely
-- unrendered — it is unreachable by an anon client, so no future page, embed,
-- feed or API route can surface one by forgetting to filter. Extended to
-- authenticated so a signed-in reader sees the same site a signed-out one does.
create policy articles_select_public
  on articles
  for select
  to anon, authenticated
  using (status = 'published');

-- articles_select_staff: staff read everything, recalled rows included. The
-- Publish queue's list view IS the published-article library (M16/R1), and it
-- cannot hide a recall from the people whose job is to fix and re-publish it.
-- is_staff() rather than is_admin_or_editor(), so an Analyst can read the
-- Dashboard's top-content table.
create policy articles_select_staff
  on articles
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- articles_insert_staff: §7.2's role matrix gives Schedule/publish to Admin and
-- Editor only. Contributor is excluded here and that is not an oversight — a
-- contributor edits DRAFTS, which are content_items rows, and never writes
-- directly to the public record.
--
-- In practice the publish cron does this insert under service-role credentials
-- and bypasses RLS entirely; this policy is what governs a human doing it from
-- the editor.
create policy articles_insert_staff
  on articles
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- articles_update_staff: §8.13's Update (published items) control, and both
-- recall paths (P15.4). Admin and Editor, matching "Reschedule or recall" in
-- the role matrix.
--
-- THIS IS THE FIRST REAL UPDATE POLICY IN THE BUILD. price_observations,
-- price_anomalies, basket_definition and basket_snapshots all have none — they
-- are append-only, machine-written, or both. This table is different by design:
-- a published article is a living document that gets corrected, and P2.4's
-- correction discipline depends on it being editable.
--
-- Which is exactly why the trigger below has to exist. RLS cannot express "this
-- column did not change": a WITH CHECK sees only the new row and never the old
-- one, so no policy written here could protect P5.7's two columns.
create policy articles_update_staff
  on articles
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy. RLS enabled + no matching policy = default deny. Recall
-- unpublishes (P15.4); nothing deletes an article. A deleted article is a dead
-- URL, a hole in the sitemap and a broken link in every social post that ever
-- pointed at it.

-- protect_article_provenance() — P5.7 made real.
--
-- Written in THIS migration rather than deferred to 0021, and the distinction
-- from the three prior deferrals is the point. 0010's append-only lock, 0011's
-- upsert contract and 0012's active_from rule all wait for 0021 because they
-- are cross-table conditions or locks against RLS-bypassing roles — things that
-- genuinely cannot be written yet. This one is same-table and column-local, it
-- depends on nothing that does not exist, and 0003's protect_profile_privileges
-- is the precedent: a BEFORE UPDATE trigger protecting three named columns,
-- written in its own table's migration.
--
-- The cost of waiting would also have been different in kind. 0010's gap is
-- open only to roles that bypass RLS. This one would be open to ordinary
-- signed-in editors, for roughly eight migrations, on the one rule the
-- /how-we-use-ai page makes a public promise about.
--
-- Being a trigger and not a policy, it also holds against service-role and
-- psql. The publish cron sets both columns at INSERT and has no business
-- changing either afterwards.
--
-- Note the asymmetry between the two guards, which is deliberate:
--   * agent_assisted is NOT NULL, so it is always set, so any change is a
--     violation.
--   * content_item_id is nullable today, so null → value is ALLOWED — that is
--     0021 backfilling rows written before it. Once it holds a value, it is
--     frozen like the other.
create function protect_article_provenance() returns trigger
language plpgsql
as $$
begin
  if new.agent_assisted is distinct from old.agent_assisted then
    raise exception 'articles.agent_assisted is written at publish and never changed (P5.7)';
  end if;

  if old.content_item_id is not null
     and new.content_item_id is distinct from old.content_item_id then
    raise exception 'articles.content_item_id is written at publish and never changed (P5.7)';
  end if;

  return new;
end;
$$;

create trigger articles_protect_provenance
  before update on articles
  for each row
  execute function protect_article_provenance();

-- THE PUBLISH CONTRACT, for whoever writes /api/cron/publish.
--
-- 1. The allocation assertion (P15.7) happens BEFORE this table is touched. A
--    content item missing its slug, section or headline sets content_items
--    .status = 'failed' with the missing field named, and NO articles row is
--    written. Never publish an orphan, never publish partially.
--
-- 2. Insert, do not upsert. A row here is born published: status = 'published',
--    published_at = now(), published_by = the human who scheduled it,
--    agent_assisted stated explicitly, content_item_id set. Nothing in this
--    table is a place to stage a draft.
--
-- 3. Recall of a published item (P15.4) is UPDATE status = 'recalled', then
--    revalidate, then mark the social rows cancelled. It is not a delete, and
--    it does not touch agent_assisted or content_item_id — the trigger above
--    will refuse if it tries. Recall of a SCHEDULED item never reaches this
--    table at all, because no row was ever written.
--
-- 4. Revalidate in one pass after either transition: the article page, the
--    section page, the homepage, the sitemap, the news sitemap and the feed
--    (P15.7). A published article that is not in the sitemap is the orphan
--    this table exists to make impossible.
