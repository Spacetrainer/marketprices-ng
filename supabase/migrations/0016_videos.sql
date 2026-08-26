-- 0016_videos.sql
-- MarketPrices — Stage 2, migration batch 5
--
-- Printed as `0014_videos.sql` in the build plan's migration table. The disk
-- numbering ran one ahead from 0005 onward and the disk number is the real one.
--
-- videos (§6.5, §9.1): THE SYNC MIRROR, AND ONLY THAT. Every six hours
-- /api/cron/youtube-sync calls the YouTube Data API v3 for the channel and
-- upserts what it finds here. A row is a copy of a fact YouTube owns; nothing
-- in this file is authored, edited or published by us.
--
-- WHAT THIS TABLE IS NOT is the load-bearing half. §9.7 lists the tables
-- deliberately not created, and a `video_articles` table is one of them: a
-- video article is an `articles` row with type = 'video' and a youtube_id,
-- built in 0013, and that stays true. This table never becomes the public
-- record of a video. It is the inbox Draft studio's Import control reads from.
--
-- WHICH MEANS NO ANON POLICY, and that is not caution — it is the P0.1 line.
-- The moment a signed-out visitor can read this table, a synced YouTube title
-- is publishable content that no human chose, in a voice no editor approved.
-- §6.5 says it outright: "Never auto-publish a synced video — YouTube titles
-- are optimised for YouTube's algorithm and will break the card layout and the
-- editorial voice." The public /videos page renders `articles` where
-- type = 'video'. It does not read this table, and it must not be able to.
--
-- P5.1 — nothing reaches a reader without a human choosing the piece, the
-- format and the release time. The only path out of this table is
-- link_video_to_content_item() at the foot of the file, and a person calls it.
--
-- TWO COLUMNS DIVERGE FROM §9.1'S PRINTED LIST, both recorded in
-- docs/exceptions.md rather than made quietly:
--   * `published_at`  → `youtube_published_at`. Across this schema
--     `published_at` already means the moment WE released something to OUR
--     readers (articles.published_at, written by the publish cron, governed by
--     P5.1). Here it would mean the moment a video appeared on the channel.
--     Those never coincide — a video synced today may have gone up eighteen
--     months ago — and the collision is silent: both are timestamptz, both
--     sort descending in a "newest first" list, and a join that says
--     `published_at` is answered by either table with no error and a wrong
--     answer. A comment warning about the ambiguity only helps the person who
--     reads it; a name that cannot be confused helps the one who does not.
--   * `duration` → `duration_seconds`, on weaker grounds. A bare untyped
--     `duration` is an interval in one reader's head, a "4:31" string in
--     another's, and YouTube's ISO-8601 "PT4M31S" in the API response that
--     fills it. Naming the unit ends that, and the parse happens once, at the
--     sync boundary.

create table videos (
  id                        uuid primary key default extensions.uuid_generate_v4(),

  -- THE IDENTITY, and the upsert target of the six-hourly sync. Unique below.
  --
  -- No format regex, deliberately. An eleven-character base64url id is
  -- YouTube's current convention, not YouTube's promise, and this column's job
  -- is to hold whatever the API returned for a video that demonstrably exists.
  -- A pattern check here cannot make an id valid — only the API can — and it
  -- can make a valid id unstorable the day the convention widens. The failure
  -- it would catch (a malformed id) is already visible as a broken thumbnail
  -- and a dead embed; the failure it would cause (a real video the sync
  -- silently cannot record) is not visible at all.
  --
  -- The btrim check is a different thing and stays: '' is not an id, and
  -- unlike a length or an alphabet it is knowably wrong forever.
  youtube_id                text not null,
  check (btrim(youtube_id) <> ''),

  -- THE ONLY NOT NULL FIELD DERIVED FROM THE API. Every other synced column
  -- below is nullable, and the asymmetry is a statement about what the API
  -- guarantees rather than about what we would like: a video always has a
  -- title, and a row with a blank one is a row Draft studio's Import list
  -- cannot render an entry for.
  --
  -- Note what this title is NOT: it is not a headline. §6.5 imports it as a
  -- DRAFT headline into content_items, where a human rewrites it. P3.1's
  -- 72-character limit is therefore NOT enforced here — YouTube titles run to
  -- 100 characters and truncating one at the sync boundary would corrupt the
  -- mirror to satisfy a rule about our own headlines. The limit applies where
  -- the headline is written, which is content_items and then articles.
  title                     text not null,
  check (btrim(title) <> ''),

  -- Nullable, because a video genuinely can have no description and null says
  -- so. But never blank: the btrim half stops '' being stored as though
  -- someone had written an empty description, which is the same distinction
  -- 0013 draws on `dek`.
  --
  -- This column is load-bearing for P3.5 and that is why the distinction
  -- matters more here than it looks. Publishing a type = 'video' article is
  -- blocked below a 150-word written summary, and the editor validates the
  -- summary against THIS STRING and rejects an exact match — a pasted YouTube
  -- description does not count as editorial work. If '' were storable, every
  -- video with no description would carry a comparison value that an empty
  -- summary field trivially matches, and the check would start reporting the
  -- wrong reason for the right refusal. Null compares to nothing.
  description               text,
  check (description is null or btrim(description) <> ''),

  -- Nullable and unvalidated as a URL. Same reasoning as youtube_id: the sync
  -- copies what the API returned. A scheme-or-host check would encode an
  -- assumption about YouTube's CDN that we do not get to make, and a thumbnail
  -- that fails to load is a visible, harmless, self-reporting failure in an
  -- admin-only list.
  --
  -- §6.5 makes this "a starting header" for the imported content item. It is a
  -- starting point that a human replaces — P3.2 still requires a real header
  -- image and real alt text before anything publishes, and nothing here
  -- satisfies either.
  thumbnail_url             text,

  -- Nullable integer seconds, positive when present. See the header note on
  -- the rename. The API returns ISO-8601 ("PT4M31S"); the sync parses it once
  -- and stores seconds, so that no reader of this schema has to guess and no
  -- caller has to parse.
  --
  -- `> 0` and not `>= 0`: a zero-second video is not a shorter video, it is a
  -- failed parse wearing a plausible number. Null is the honest value for
  -- "the API did not tell us" (P0.2), and a null duration renders as no
  -- duration chip, never as "0:00".
  duration_seconds          integer check (duration_seconds is null or duration_seconds > 0),

  -- WHEN THE VIDEO WENT UP ON YOUTUBE. Not when we published anything. See the
  -- header note; the rename is the whole point of this column's existence in
  -- this form.
  --
  -- Nullable, like every other API-derived field here. It is the natural sort
  -- for Draft studio's Import list, and a null sorts last rather than
  -- pretending to a position.
  youtube_published_at      timestamptz,

  -- YouTube's count, not ours. Distinct in every way from articles.view_count,
  -- which is a cache of OUR first-party site_events rollup (0018) for a page
  -- on our own site. This one measures a video on someone else's platform and
  -- the two must never be summed, averaged or compared — §12's "two
  -- scoreboards" is exactly this distinction: articles buy traffic, videos buy
  -- reach.
  --
  -- Nullable with NO DEFAULT, the same call 0013 made and for the same reason.
  -- `not null default 0` would render "0 views" on every row the API has not
  -- answered for yet, which is a measurement claim we have not made. A genuine
  -- zero is storable and means zero.
  view_count                integer check (view_count is null or view_count >= 0),

  -- THE IMPORT RECEIPT (§6.5, Draft studio's "Import as content item").
  -- Null means not yet imported; set means this video has a content item and
  -- Draft studio's Import list shows it as already taken.
  --
  -- Plain nullable uuid, NO foreign key. content_items does not exist yet —
  -- it lands in the migration after next — so the constraint cannot be
  -- written today. This is one of three places in the build now referencing
  -- content_items without a FK; all three are consolidated into a single entry
  -- in docs/exceptions.md rather than recorded separately, and all three are
  -- fixed forward in the same migration. UNTIL THEN THIS UUID CAN POINT AT
  -- NOTHING, and it is stated here so it is found on purpose.
  --
  -- Not null-checked against imported_by/imported_at either, because neither
  -- column exists. That was considered and dropped: the actor and the moment
  -- of an import belong to the content item that records a person's decision,
  -- not to a mirror of YouTube's catalogue. Duplicating them here would create
  -- a second, unmaintained answer to "who imported this" — and the first
  -- answer, on content_items, is the one the audit log will read.
  imported_content_item_id  uuid,

  -- WHEN THE SYNC LAST SAW THIS VIDEO. Beyond §9.1's printed list, added
  -- deliberately, and it is the only column here the cron writes on every pass
  -- regardless of whether anything changed.
  --
  -- It exists because an upsert mirror without one cannot answer the question
  -- that matters when it breaks: is this row current, or is it the last thing
  -- a job that has been failing for a week managed to write? Every other
  -- column would look identical in both cases. A stale mirror is P2.9's
  -- staleness problem in a different table — the answer there is to label
  -- stale data rather than hide it, and labelling requires knowing.
  --
  -- NOT NULL default now(): a row cannot exist without having been seen, since
  -- the sync is the only thing that inserts one. No trigger maintains it — no
  -- table in this build has a set_updated_at trigger yet — so the cron sets it
  -- explicitly in the upsert's DO UPDATE. See the sync contract at the foot.
  --
  -- No created_at alongside it. First-seen is not a fact about the video (that
  -- is youtube_published_at) and not a fact about our editorial process (that
  -- is the content item). It would be a fact about when we happened to connect
  -- the channel, which nothing asks.
  last_synced_at            timestamptz not null default now()
);

-- The sync's upsert target and the table's identity rule. One row per YouTube
-- video, forever: the six-hourly job runs on conflict of this key, so a video
-- re-seen is a row updated in place and never a duplicate.
--
-- Written as a named index rather than an inline UNIQUE for the same reason as
-- 0013's articles_slug_key — the constraint name is what appears in the error
-- message when something violates it.
create unique index videos_youtube_id_key
  on videos (youtube_id);

-- ONE VIDEO PER CONTENT ITEM, and one content item per video. Partial, because
-- null means "not imported" and any number of videos are legitimately not
-- imported — an unpartialled unique index would permit exactly one un-imported
-- video in the entire table, which is the opposite of the rule.
--
-- What this prevents is a real duplication path, not a hypothetical one: two
-- editors with Draft studio open, both clicking Import on the same video,
-- producing two content items that become two articles about one video with
-- two slugs. The link function below checks for it too and raises a legible
-- error; this index is what holds when a service-role caller bypasses the
-- function entirely.
create unique index videos_imported_content_item_key
  on videos (imported_content_item_id)
  where imported_content_item_id is not null;

-- NO FURTHER INDEX. §9.6 names none for this table, and none is warranted:
-- the channel's entire back catalogue is hundreds of rows, and the one read
-- path — Draft studio's Import list, ordered by youtube_published_at desc —
-- is an admin screen scanning a table that fits in a page or two of memory.
-- The unique index above already serves the sync's upsert. An index on
-- youtube_published_at would cost every sync pass a write to save a scan that
-- is faster than the index lookup it would replace.

alter table videos enable row level security;

-- videos_select_author: admin, editor or contributor. The only policy on this
-- table.
--
-- can_author() and NOT is_staff(), which excludes Analyst, and the exclusion
-- is the considered half. §7.2 grants Analyst the Dashboard and nothing else —
-- no feed, no radar, no studio, no queue, and therefore no Import control.
-- Every other staff-readable table in this build has a Dashboard card behind
-- it (0011's anomaly counts, 0012's basket index, 0013's top content); this
-- one does not. §12's Dashboard sources video reach from content_performance,
-- not from here. So the Analyst grant would be a read on a table that role has
-- no screen for, which is exactly the grant that is easy to make and hard to
-- ever remove.
--
-- can_author() and not is_admin_or_editor() for the reason 0014 gave when it
-- coined the predicate: contributors draft, and §6.5's Import lives inside
-- Draft studio, which contributors use.
--
-- NO ANON POLICY, NO authenticated-at-large POLICY. RLS enabled + no matching
-- policy = default deny, and the header states why that denial is structural
-- rather than incidental.
create policy videos_select_author
  on videos
  for select
  to authenticated
  using (can_author(auth.uid()));

-- NO INSERT, UPDATE OR DELETE POLICY AT ALL. Not a narrow one, not an
-- admin-only one — none.
--
-- Every row in this table is written by /api/cron/youtube-sync under
-- service-role credentials, which bypasses RLS and is therefore not a grant
-- made here. This is the same shape as 0011's price_anomalies: computed rows,
-- no author, no hand-editing. A hand-inserted video row would be a claim that
-- a video exists on the channel, and the only thing entitled to make that
-- claim is the API call that found it.
--
-- The one write a human legitimately makes — recording that they imported a
-- video — is not a grant either. It is the function below, which touches
-- exactly one column and cannot reach any other. Giving this table an UPDATE
-- policy to enable that single write would also, unavoidably, permit editing
-- the title, the description and the view count of a mirror row, and a mirror
-- that can be edited is not a mirror. The next sync would overwrite the edit
-- anyway, silently, which is the worst of both.
--
-- No delete policy: a video removed from the channel is a fact worth keeping,
-- because an article may already point at it. The sync marks nothing and
-- deletes nothing; a video that disappears simply stops being re-synced, and
-- last_synced_at above is how that becomes visible.

-- link_video_to_content_item() — THE SOLE HUMAN WRITE PATH INTO THIS TABLE.
--
-- Called by Draft studio's "Import as content item" action, after the
-- content_items row has been created, to record the link back. It sets
-- imported_content_item_id and NOTHING ELSE — it cannot touch the title, the
-- description, the counts or the sync timestamp even by accident, which is the
-- entire reason this is a function with two parameters rather than an UPDATE
-- policy with a column list nobody enforces.
--
-- ONE-WAY, like 0011's promote and dismiss. A video that has been imported is
-- settled: re-pointing it at a different content item would strand the first
-- item — a draft or a published article — describing a video it no longer
-- claims, and unlinking it would offer the same video for import a second
-- time. If a genuine re-import is ever needed it arrives as its own migration
-- with its own reasoning, fixed forward.
--
-- WHAT IT DOES NOT DO: it does not create the content_items row. That table
-- does not exist yet, so §6.5's Import is two steps in application code and
-- not one transaction — create the item, then call this. That is the same
-- half-satisfied shape 0011's promote_price_anomaly() has, and the two are
-- collapsed together in the migration that lands content_items. Until then, a
-- crash between the two steps leaves an orphaned content item and an
-- un-imported video, which is recoverable by hand and by design preferable to
-- the reverse.
--
-- The content_item_id parameter is NOT validated against content_items,
-- because there is nothing to validate against. The partial unique index above
-- is the only thing currently asserting anything about it.
--
-- security definer with a pinned search_path, matching every other function in
-- this build. The permission check is inside the function rather than assumed
-- from RLS, precisely because security definer bypasses the policy above.
create function link_video_to_content_item(video_id uuid, content_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_author(auth.uid()) then
    raise exception 'only an admin, editor or contributor may import a video';
  end if;

  if content_item_id is null then
    raise exception 'link_video_to_content_item requires a content item id';
  end if;

  update videos
     set imported_content_item_id = content_item_id
   where id = video_id
     and imported_content_item_id is null;

  if not found then
    raise exception 'video % does not exist, or has already been imported', video_id;
  end if;
end;
$$;

-- THE SYNC CONTRACT, for whoever writes /api/cron/youtube-sync.
--
-- 1. Upsert on youtube_id, every six hours (§6.5). insert ... on conflict
--    (youtube_id) do update. Never delete-and-reinsert: the id is the identity
--    and imported_content_item_id must survive a re-sync.
--
-- 2. The DO UPDATE sets the mirrored columns AND last_synced_at = now(). It
--    must NOT include imported_content_item_id in its column list. YouTube
--    knows nothing about our content items and a re-sync that clears the link
--    would offer an already-imported video for import again.
--
-- 3. Parse ISO-8601 duration to integer seconds at this boundary, once. A
--    duration the parse cannot read is null, not zero — the check constraint
--    will reject the zero and it is better that it never arrives.
--
-- 4. A field the API omits is null, not an empty string and not a zero
--    (P0.2). Do not carry forward the previous value to fill a gap in a
--    response: an absent description means the description is absent now.
--
-- 5. NEVER AUTO-PUBLISH, NEVER AUTO-IMPORT, NEVER AUTO-CREATE A CONTENT ITEM
--    (§6.5, P5.1). This job's entire output is rows in this table. A human
--    opens Draft studio, reads the list, and chooses.
--
-- 6. Validate the API response with Zod before it reaches this table, at the
--    boundary, like every other external input in this build. The YouTube API
--    is an external system and its response shape is not our guarantee.
