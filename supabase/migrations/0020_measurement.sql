-- 0020_measurement.sql
-- MarketPrices — Stage 2, migration batch 9
--
-- THE MEASUREMENT LAYER (§9.4, §9.5): site_events → daily_rollups, plus
-- weight_proposals. Three tables that between them answer "what did readers
-- actually do", "what may the Dashboard read" and "what would the system
-- change if it were allowed to" — which it is not (P16.5).
--
-- NUMBERING. The build plan calls this `0018_measurement.sql`. The plan's
-- table has been wrong since 0017 and is now wrong by a non-constant offset
-- (see docs/exceptions.md); the disk number is the real one.
--
-- WHY THE THREE TRAVEL TOGETHER. site_events and daily_rollups are one
-- mechanism cut in half by P8.7 — the raw log and the only thing allowed to
-- read it. Separating them would ship a table nothing may query beside a table
-- with nothing to aggregate. weight_proposals joins them because §9.5 places
-- it in governance but Stage 20 is what produces its rows: a proposal is a
-- reading of daily_rollups and content_performance, and it has no writer
-- before this stage. The governance batch that follows carries
-- editorial_rules and audit_log, which are settings and provenance rather
-- than measurement.
--
-- THREE PROTOCOLS SHAPE THIS FILE AND ONE OF THEM IS ENFORCED STRUCTURALLY:
--
--   P8.7  — the Dashboard NEVER scans site_events. Enforced here by giving
--           site_events no SELECT policy at all, so the screen physically
--           cannot read it through a user session. See the RLS block.
--   P11.1 — metrics are real or absent. No table here has a metric column
--           with a default, and no row here may be hand-written by a person.
--   P16.5 — proposals never auto-apply. Nothing in this file writes a
--           setting, and no trigger here reaches editorial_rules.
--
-- NO COEFFICIENT, THRESHOLD OR WEIGHT APPEARS IN THIS FILE, same posture as
-- 0018. P18.2's data floor (30 days, 50 sessions), §8.10's ten-minute read-time
-- cap and the "last 50 published items" sample behind a proposal are all
-- versioned settings and collector rules, not constraints. A number in a check
-- constraint is a number you cannot change without a migration, which is P16.1
-- inverted.


-- ============================================================================
-- site_events — the first-party engagement log (§9.4, formerly `events`)
-- ============================================================================
--
-- One row per reader action, written by the beacon route (`/api/events`) and
-- read by the hourly rollup job and by nothing else, ever.
--
-- THIS IS THE ONLY TABLE IN THE BUILD THAT GROWS WITHOUT BOUND. Every other
-- table grows with editorial work — one row per week per commodity, per
-- article, per signal. This one grows with traffic, which is the number the
-- whole product is trying to increase. It is designed as a log: append-only,
-- unreadable by the application, aggregated on a schedule, and never joined to
-- at request time.
--
-- NO PERSONAL DATA REACHES THIS TABLE. There is no ip column, no user_agent,
-- no profile reference and no auth.users reference, and their absence is the
-- design rather than an omission — the questions §8.10 asks of this table
-- (sessions, scroll depth, read completion, which commodities get searched)
-- are all answerable from an opaque session id and none of them need a person.
-- A future column naming one is a decision to be argued for, not a convenience.

create table site_events (
  id                   uuid primary key default extensions.uuid_generate_v4(),

  -- THE ANONYMOUS SESSION, minted client-side and sent with every beacon.
  -- §9.4 gives no type; uuid is chosen over text deliberately.
  --
  -- The reasoning is privacy, not tidiness: a uuid column CANNOT hold an email
  -- address, a phone number, an IP or a signed-in user's id. Whatever a future
  -- implementer is tempted to correlate sessions by, this column will refuse
  -- it at the boundary rather than silently store it. text would accept all of
  -- them.
  --
  -- NOT NULL, because count(distinct session_id) is the sessions figure on the
  -- Dashboard and in P18.2's data floor. A nullable session id undercounts
  -- sessions silently, which is the shape of failure this build cares about
  -- most: wrong rather than absent.
  --
  -- NO FOREIGN KEY. It points at nothing and must not — a session is a
  -- browser tab, not a row and not a person.
  session_id           uuid not null,

  -- WHAT WAS BEING READ, both nullable and both legitimately absent.
  --
  -- content_item_id is the production spine's row; published_article_id is the
  -- public record of what went live. An article page's beacon carries both,
  -- because §8.10's feedback loop needs to join engagement back to the
  -- decision_utility score the item was promoted on. A price_search or
  -- commodity_view carries neither: the reader is on /prices, which is not a
  -- content item at all, and the commodity travels in metadata below.
  --
  -- NO CROSS-COLUMN CHECK against event_type, decided rather than overlooked.
  -- The rule ("a 'view' names something; a 'price_search' names nothing") is
  -- real, but it is a rule about a request that the route handler has already
  -- validated with Zod, in a place where a violation can be rejected with an
  -- explanation and logged. Enforced here instead it would be a constraint
  -- violation inside a fire-and-forget beacon insert, on a path where nothing
  -- reads the error — and it would have to be widened for every new event
  -- type, making the vocabulary a migration twice over. The check lives at the
  -- boundary that can act on it.
  --
  -- on delete restrict, consistent with every other reference to these two
  -- tables. Deleting an article that people read does not make them not have
  -- read it.
  content_item_id      uuid references content_items (id) on delete restrict,
  published_article_id uuid references articles (id) on delete restrict,

  -- THE SEVEN EVENTS, and unlike 0019's `platform` this vocabulary IS checked.
  --
  -- The contrast is worth stating because the two tables sit next to each
  -- other and take opposite decisions. Adding a social platform is a business
  -- decision that should not need a deploy, so `content_performance.platform`
  -- carries no check. Adding an event type is not: the beacon must be taught
  -- to emit it, the rollup job must be taught to count it, and the Dashboard
  -- must be taught to draw it. The migration is the smallest part of that
  -- work, and the check turns "somebody typo'd 'scroll_75'" from a silent hole
  -- in a chart into a rejected insert.
  --
  -- The list is §9.4's, matching Stage 20 step 1 exactly.
  event_type           text not null check (
    event_type in (
      'view',
      'scroll_25',
      'scroll_80',
      'complete',
      'price_search',
      'commodity_view',
      'error_report'
    )
  ),

  -- THE EVENT'S OWN PAYLOAD: the searched term on a price_search, the
  -- commodity id on a commodity_view, the failing route on an error_report.
  --
  -- Nullable — most events carry nothing beyond their type — and object-shaped
  -- when present, the same light guard 0018 puts on data_blocks. No key check:
  -- the payload differs per event type and a schema written now would be a
  -- guess at what the beacon sends next quarter.
  --
  -- CONTRACT, and it is the privacy note above restated where it can be
  -- violated: metadata is jsonb and jsonb will hold anything, including the
  -- personal data the columns above are shaped to refuse. Nothing identifying
  -- a reader goes in here. The Zod schema at the beacon route is where that is
  -- enforced.
  --
  -- No gin index. Nothing queries into it — the rollup job groups on
  -- event_type and created_at — and an unqueried gin index on the fastest-
  -- growing table in the build is pure write cost.
  metadata             jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),

  -- ATTRIBUTION (§8.10's "where did they come from"). All four nullable,
  -- because most arrivals carry none of them: a direct visit has no referrer
  -- and an organic search result has no UTM.
  --
  -- The trim halves matter more here than elsewhere. These arrive from a query
  -- string, and '' is exactly what a link builder produces from an empty
  -- template variable — `?utm_source=&utm_medium=`. Without the check the
  -- attribution breakdown grows a blank-string bucket that reads as a real
  -- source. Null means "no UTM"; there is no second way to say it.
  referrer             text check (referrer is null or btrim(referrer) <> ''),
  utm_source           text check (utm_source is null or btrim(utm_source) <> ''),
  utm_medium           text check (utm_medium is null or btrim(utm_medium) <> ''),
  utm_campaign         text check (utm_campaign is null or btrim(utm_campaign) <> ''),

  -- When the event happened, and the column the rollup job walks. No
  -- updated_at: an event is a fact about a moment and is never revised.
  created_at           timestamptz not null default now()
);

-- Exactly the index §9.6 names for this table, in that column order, and
-- nothing else.
--
-- §9.6 annotates it "rollup job only" and that is the whole access pattern:
-- the hourly job asks for one bounded window of created_at and groups by
-- event_type within it. created_at leads because the window is the selective
-- half — an hour of traffic out of everything ever recorded — and event_type
-- follows so the group-by reads from the index rather than the heap.
--
-- No index on content_item_id, and that is P8.7 again rather than an
-- oversight. "Which sessions read this item" is a per-item scan of the largest
-- table in the build, which is precisely the Dashboard query that gets slower
-- every week; the answer comes from daily_rollups with content_item_id as the
-- dimension. If an index on this column ever looks necessary, the query
-- wanting it should be examined first — it is more likely to be a P8.7
-- violation than a missing index.
create index site_events_rollup
  on site_events (created_at, event_type);

alter table site_events enable row level security;

-- NO POLICIES. NONE, FOR ANY ROLE, INCLUDING SELECT — and the SELECT half is
-- the deliberate one.
--
-- Every other table since 0011 grants `select ... using (is_staff(auth.uid()))`.
-- This one does not, and the reason is P8.7: "the Dashboard never scans
-- site_events." A staff SELECT policy would make `from('site_events')` work
-- perfectly from a Dashboard query — fast on ten thousand rows, fine at
-- launch, and progressively slower every week that the product succeeds, on
-- the one screen whose Zone 1 must render in under a second. That failure
-- arrives quietly and months late, long after the query was reviewed.
--
-- Withholding the policy makes the wrong query impossible rather than merely
-- discouraged, which is the same instrument 0019 uses on its uniqueness key.
-- The right query — daily_rollups — is readable by staff and is right below.
--
-- WHAT THIS COSTS, stated so it is a known price: an operator debugging the
-- beacon cannot inspect this table through the application's client and must
-- use a service-role connection. That is a fair cost for an internal log
-- nobody reads by hand twice a year, and it is reversible in one line if the
-- rollup job turns out to need a non-service-role reader.
--
-- NO INSERT POLICY EITHER, and this one is not merely about performance. The
-- beacon route writes under service-role, which bypasses RLS. An anon INSERT
-- policy is the obvious alternative — the browser posts straight to PostgREST
-- and no route handler is needed — and it hands anyone on the internet an
-- unauthenticated write into the table the Dashboard's every figure derives
-- from. Fabricated metrics are what P11.1 forbids in its strongest terms, and
-- an open insert endpoint is an invitation to fabricate them at scale.
-- Validation, rate limiting and shape-checking happen in the route, which is
-- a place that can refuse.
--
-- No update or delete policy, ever. A log is append-only or it is not a log.


-- ============================================================================
-- daily_rollups — the Dashboard's only source (§9.4, P8.7)
-- ============================================================================
--
-- One row per day, per metric, per dimension value. Written by
-- `/api/cron/rollups` hourly, read by every figure on the Dashboard.
--
-- THE TABLE IS A CONTRACT, NOT A CACHE. A cache is an optimisation you may
-- bypass under load; this is the only path to the numbers, because the table
-- it aggregates cannot be read by the application at all (see above). That is
-- what makes P8.7 structural instead of advisory.
--
-- THE SHAPE IS KEY-VALUE ON PURPOSE, and it is the one place in this schema
-- where that is right. Elsewhere a key-value table would be an excuse not to
-- decide on columns; here the metric vocabulary genuinely belongs to the
-- Dashboard rather than to the database, and §8.10's list will grow every time
-- a card is added to Zone 3. A column-per-metric table would make every new
-- KPI card a migration, and a wide table of mostly-null columns would lose the
-- one thing this table must never lose: the difference between "this metric
-- was not computed for this day" and "this metric was zero that day" (P11.3).
-- Here a missing row says the first and a row with value 0 says the second.

create table daily_rollups (
  -- §9.4 prints this column as `date` and it stays `date`, unlike 0016's
  -- `duration` and 0019's `avg_time` which were renamed for ambiguity. There
  -- is no ambiguity to resolve — a rollup's date is the day it aggregates and
  -- nothing else — and DATE is a non-reserved keyword, so `date date not null`
  -- and `where date >= ...` are both plain legal SQL. Noted only so the next
  -- reader does not spend the minute checking that this compiles.
  --
  -- THE DAY AGGREGATED, never the day computed. Same distinction 0019 draws
  -- between collected_for_date and collected_at, and computed_at below is the
  -- other half of it.
  date            date not null,

  -- WHAT WAS MEASURED: 'sessions', 'page_views', 'read_completion_median',
  -- 'price_searches' and whatever Zone 3 grows next.
  --
  -- NO CHECK, the same call as content_performance.platform and for the same
  -- reason one degree further: this vocabulary is not merely open, it is owned
  -- by the screen. Adding a KPI card must not be a migration.
  --
  -- Non-blank only. A rollup that cannot say what it measured is a number with
  -- no meaning, which is worse than a missing row.
  metric_key      text not null check (btrim(metric_key) <> ''),

  -- HOW IT WAS CUT, and the pair is why the primary key has four columns:
  -- dimension names the axis ('section', 'content_item', 'commodity',
  -- 'platform') and dimension_value names the point on it.
  --
  -- BOTH NOT NULL, WITH 'total' AS THE PLACEHOLDER for a metric that is not
  -- cut at all. The alternative — nullable columns, null meaning undimensioned
  -- — was rejected because null is not comparable in a unique constraint:
  -- ('2026-08-27', 'sessions', null, null) can be inserted twice and Postgres
  -- will accept both, which is the one failure a rollup table must not have.
  -- §9.4 prints UNIQUE on these four columns precisely to stop a day's figure
  -- existing twice, and nullable columns would make that constraint decorative
  -- on exactly the rows the Dashboard reads most: the undimensioned totals.
  --
  -- The cost is that 'total' is a magic string, and it is documented rather
  -- than disguised. It appears in the rollup job and in lib/queries/, never in
  -- a component.
  dimension       text not null check (btrim(dimension) <> ''),
  dimension_value text not null check (btrim(dimension_value) <> ''),

  -- 'total' IS ALL-OR-NOTHING. Without this, ('section', 'total') is writable
  -- and means "sessions across all sections" — a second, indistinguishable way
  -- of writing the row that ('total', 'total') already holds. Two spellings of
  -- one figure is how a Dashboard ends up drawing a total twice, or summing a
  -- total into a breakdown, which is P18.1's error wearing a different hat.
  -- One representation, enforced.
  check ((dimension = 'total') = (dimension_value = 'total')),

  -- THE FIGURE. numeric because this column holds counts (sessions), averages
  -- (read time in seconds) and fractions (median read completion) depending on
  -- metric_key, and integer would silently truncate two of the three.
  --
  -- NOT NULL WITH NO DEFAULT, which is P11.3 in DDL: a row exists because the
  -- job computed something. If it computed zero, the row says 0 and the card
  -- displays 0. If it computed nothing, there is no row — and the card's empty
  -- state, not a zero, is what the Dashboard renders.
  --
  -- NO LOWER BOUND, and the open metric_key vocabulary is exactly why. `>= 0`
  -- is obviously right for every metric named today and obviously wrong for
  -- the first signed one somebody adds — net follower change, week-on-week
  -- delta — and a constraint that has to be widened by migration the first
  -- time it is tested is worse than the contract it replaces. The bound
  -- belongs with the job that knows what the metric means.
  value           numeric not null,

  -- WHEN THE JOB LAST WROTE THIS ROW, distinct from `date` above in exactly
  -- the way 0019's collected_at is distinct from collected_for_date, and added
  -- for the same reason: without it, a rollup job that died at 09:00 and one
  -- that has genuinely seen no new traffic since 09:00 produce identical
  -- tables. P18.4 requires each Dashboard module to state its own freshness;
  -- `date` answers "which day is this about", and only this column answers
  -- "when did we last look".
  --
  -- It also makes the hourly re-computation visible. Today's row is rewritten
  -- every hour as the day fills in, so a today figure whose computed_at is
  -- three hours old is a figure to caveat.
  --
  -- CONTRACT, the same one 0017's poller and 0019's collector carry: stamped
  -- on every successful run, including a run that changes no value.
  --
  -- DELIBERATELY NOT IN THE PRIMARY KEY, for the reason 0019 gives — a column
  -- that moves on every refresh would make each re-computation a new row and
  -- defeat the key it is meant to sit beside.
  computed_at     timestamptz not null default now(),

  -- §9.4 prints UNIQUE (date, metric_key, dimension, dimension_value) and no
  -- id. This is that constraint promoted to the primary key rather than added
  -- beside a surrogate one: with all four columns NOT NULL the two are
  -- equivalent in what they enforce, and the composite key is what every read
  -- and every upsert actually uses.
  --
  -- A uuid id here would be a column nothing selects, nothing joins on and
  -- nothing orders by — no table references a rollup row, because a rollup row
  -- is an aggregate rather than an entity — plus a second index on the widest-
  -- writing table after site_events.
  --
  -- COLUMN ORDER IS THE READ ORDER. date leads because every Dashboard query
  -- is a bounded window of days (P8.7's "bounded query with an index behind
  -- it"), and the sparklines in Zone 3 are exactly that. metric_key second
  -- narrows the window to one card's series.
  primary key (date, metric_key, dimension, dimension_value)
);

-- NO SECOND INDEX, following 0019's rule of adding none the specs do not name
-- and none a real read has asked for. §9.6 lists no index for this table at
-- all, and the primary key covers the two shapes the Dashboard has: a date
-- window across metrics, and one metric's series within a window.
--
-- THE ONE THAT MIGHT LATER EARN ITS PLACE is (metric_key, date), for a single
-- card reaching far back — a 90-day sparkline scans 90 days of every metric
-- under the current key order. That is cheap while this table has hundreds of
-- rows per day and worth measuring before it has thousands. Add it when a
-- query plan asks for it, with the query named in the migration.

alter table daily_rollups enable row level security;

-- daily_rollups_select_staff: is_staff(), and this is the policy that makes
-- site_events' silence workable. The Analyst role sees the Dashboard and
-- nothing else (§7.2); this table is what that screen reads.
--
-- No anon policy. P9.1's enumerated list does not name it, and P11.2 requires
-- public-facing counts to be computed at request time from live data rather
-- than served from an aggregate — a coverage string on the public site reads
-- price_observations, never this table.
create policy daily_rollups_select_staff
  on daily_rollups
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- No insert, update or delete policy. Default deny. The rollup cron writes
-- under service-role; a hand-written rollup row is an invented figure on the
-- Dashboard, which is P11.1's exact prohibition, and a hand-edited one is
-- worse because it is indistinguishable from a computed one afterwards.
--
-- THE REFRESH CONTRACT, for whoever writes /api/cron/rollups:
--
-- Upsert on the primary key, updating value and computed_at. The job re-runs
-- hourly and today's rows legitimately change all day as the day fills in;
-- yesterday's are recomputed once more after midnight and then settle.
--
-- NEVER DELETE-AND-REINSERT A DAY. It is the obvious way to write this job and
-- it opens a window in which the Dashboard reads a half-rebuilt day and shows
-- figures that are wrong rather than stale.
--
-- A METRIC WITH NO ACTIVITY WRITES 0; A METRIC NOT COMPUTED WRITES NO ROW.
-- This is the distinction the table exists to preserve (P11.3) and the job is
-- the only thing that can honour it. Writing no row for a genuine zero makes
-- the card render its empty state and hides a real fact; writing 0 for a
-- metric the job could not compute invents one.


-- ============================================================================
-- weight_proposals — what the system would change, and never does (§9.5, P16.5)
-- ============================================================================
--
-- One row per suggested setting change, produced from observed performance
-- over the last 50 published items (§8.10) and rendered on the Dashboard's
-- Zone 4 as "Proposed adjustments". Each card links into Settings → Scoring,
-- where a human sees the replay preview (P16.4) and decides.
--
-- THIS TABLE PROPOSES. IT DOES NOT APPLY. Accepting a proposal here does not
-- change a weight anywhere — there is no trigger writing editorial_rules, no
-- function that applies a value, and none is coming. The applied setting is a
-- new versioned editorial_rules row written by the Settings screen, by a
-- person, audited with a diff (P16.2, P16.6). The status column below records
-- what the human said about the suggestion; it is not a switch.
--
-- P16.5 IS THE WHOLE REASON THE TABLE EXISTS RATHER THAN A JOB THAT TUNES
-- ITSELF: "an automatically self-tuning editorial system optimises for
-- engagement, and engagement is not the same thing as decision utility — which
-- is the entire premise of the scoring rubric." A schema that made
-- auto-application easy would be a schema arguing with its own protocol.
--
-- ZONE 4 NEEDS ROUGHLY 50 PUBLISHED ITEMS BEFORE ITS CORRELATIONS MEAN
-- ANYTHING (Stage 20). This table will and should sit empty for months.

create table weight_proposals (
  id             uuid primary key default extensions.uuid_generate_v4(),

  -- WHICH SETTING, as a two-part textual pointer: scope is the settings group
  -- ('scoring', 'categories', 'anomaly_thresholds', 'format_heuristics') and
  -- key is the rule within it.
  --
  -- NO FOREIGN KEY TO editorial_rules, and not because that table is one
  -- migration away — because it could not carry one even once it lands.
  -- editorial_rules is versioned (P16.2): many rows share a (group, key) with
  -- different active_from dates, so there is no unique target to reference.
  -- Pointing at one particular version's id would be worse still: a proposal
  -- would then reference the row it was computed against rather than the
  -- setting it concerns, and would go stale the moment anyone edited the
  -- setting by hand.
  --
  -- CONSEQUENCE, stated because it is the price of the above: nothing stops a
  -- proposal naming a scope and key that do not exist. The Settings screen
  -- resolves the pair when it renders the card and must handle finding
  -- nothing — a proposal for a deleted category is a card that says so, not a
  -- crash.
  --
  -- NO CHECK ON scope, the same reasoning as metric_key: the settings groups
  -- in §13 are twelve today and the ones this table can address will grow.
  scope          text not null check (btrim(scope) <> ''),
  key            text not null check (btrim(key) <> ''),

  -- THE TWO NUMBERS. numeric and unbounded, because §8.10's own example is a
  -- category weight of 9 suggesting 10 while §13 group 4's scoring
  -- coefficients are fractions summing to 1.0 (P16.3) and the anomaly
  -- thresholds are z-scores. One column cannot be bounded across those three
  -- without being wrong for two of them, and the sum-to-1.0 rule belongs where
  -- the whole weight set is visible — the Settings save — not here, where a
  -- proposal only ever sees one member of the set.
  --
  -- current_value IS A FROZEN COPY, taken when the proposal was computed, and
  -- it is deliberately not re-read afterwards. It is what makes a proposal
  -- readable months later: "9, suggest 10" still says what it meant even if
  -- the weight is 12 by then.
  --
  -- IT CAN THEREFORE DRIFT from the live setting, and that drift is
  -- information rather than corruption — it means a human changed the setting
  -- while the proposal was open. The Settings screen must re-read the current
  -- value at decision time and say so if it has moved. This is another face of
  -- P16.5: accepting a stale proposal cannot be a blind write, because it is
  -- not a write at all.
  --
  -- NOT NULL, both. A proposal that cannot say what it would change from, or
  -- to, is not a proposal.
  current_value  numeric not null,
  proposed_value numeric not null,

  -- A proposal that changes nothing is a bug in the proposer, not a suggestion
  -- for an editor to read. `is distinct from` rather than `<>` for the null
  -- semantics, though both columns are NOT NULL — the form is correct whatever
  -- happens to the columns later.
  check (proposed_value is distinct from current_value),

  -- WHY, and it has to say something. The card in Zone 4 renders a sentence
  -- from this ("Category weight for Weather & climate is outperforming its 9"),
  -- and the shape of that sentence differs per scope, so the keys are the
  -- proposer's to define rather than the schema's.
  --
  -- NOT NULL WITH A NON-EMPTY GUARD, the same pattern as content_items.sources
  -- (0018): NOT NULL alone does not stop '{}'::jsonb, and a proposal with an
  -- empty evidence object is precisely the thing P16.5 exists to keep out of
  -- the Settings screen — a number with an authoritative tone and nothing
  -- behind it.
  evidence       jsonb not null check (
    jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb
  ),

  -- HOW MANY ITEMS IT IS BASED ON, printed on the card beside the suggestion.
  --
  -- NOT NULL and positive. §8.10 computes proposals from the last 50 published
  -- items and P18.2 sets a data floor of 30 days or 50 sessions before a trend
  -- may be shown at all — NEITHER NUMBER IS A CONSTRAINT HERE, the same call
  -- 0019 makes about §8.10's ten-minute read-time cap. Those thresholds are
  -- versioned settings the proposer reads; writing 50 into a check constraint
  -- would put a tuning parameter in a place only a migration can reach, which
  -- is P16.1 exactly inverted.
  --
  -- What the check does enforce is that the figure is real: a proposal
  -- claiming a sample of zero items is a fabricated recommendation.
  sample_size    integer not null check (sample_size > 0),

  -- FOUR STATES. 'proposed' is where every row starts; a human moves it to
  -- 'accepted' or 'rejected' from Settings; the proposer moves it to
  -- 'superseded' when it computes a newer suggestion for the same setting.
  --
  -- 'accepted' MEANS "A HUMAN AGREED WITH THIS", NOT "THIS IS IN EFFECT".
  -- The applied change is an editorial_rules row with its own version and its
  -- own audit entry. Reading this column as the live state of a setting is the
  -- one misreading that would turn the table into the self-tuning system P16.5
  -- forbids, and it is why the vocabulary is deliberate rather than 'applied'.
  --
  -- 'superseded' EXISTS BECAUSE OF THE PARTIAL UNIQUE INDEX BELOW. Only one
  -- proposal per setting may be open at a time, so the proposer needs
  -- somewhere to put the previous one that is neither a decision a human made
  -- nor a deletion (P1.4). Without it, a weekly job either accumulates ten
  -- open proposals for one weight or falsely records that somebody rejected
  -- nine of them.
  status         text not null default 'proposed' check (
    status in ('proposed', 'accepted', 'rejected', 'superseded')
  ),

  proposed_at    timestamptz not null default now(),

  -- WHO DECIDED. on delete set null, with the same interaction 0011 and 0017
  -- document: while an accepted or rejected row exists the check below
  -- requires decided_by to be present, so deleting the deciding profile is
  -- refused outright rather than quietly nulled. Deactivate the account, which
  -- is what this build does everywhere.
  --
  -- Null on a superseded row, and that is the point of allowing null at all:
  -- no person superseded it. The proposer did.
  decided_by     uuid references profiles (id) on delete set null,
  decided_at     timestamptz,

  -- THE DECISION TRIO, held together per state.
  --
  -- 'proposed'  — both null. An undecided proposal that carries a decider is a
  --               record of something that did not happen.
  -- 'accepted'/
  -- 'rejected'  — both present. P16.5's "a human decides; the audit log
  --               records who" is unbuildable if the row itself cannot say
  --               who, and the audit entry is written elsewhere.
  -- 'superseded'— decided_at required, decided_by free. The moment is real and
  --               is what orders the history of a setting's suggestions;
  --               the actor is a job, and jobs do not have profiles rows.
  --
  -- `else false` rather than an open ELSE, deliberately: if a fifth status is
  -- ever added by widening the check above — as 0015 widened articles.type —
  -- this constraint refuses it loudly until someone states what the trio means
  -- for it. A CASE with no ELSE returns null, and a null check constraint
  -- PASSES, so the new state would silently arrive with no rule at all.
  check (
    case status
      when 'proposed'   then decided_by is null     and decided_at is null
      when 'accepted'   then decided_by is not null and decided_at is not null
      when 'rejected'   then decided_by is not null and decided_at is not null
      when 'superseded' then decided_at is not null
      else false
    end
  ),

  -- A decision cannot precede the proposal it decides.
  check (decided_at is null or decided_at >= proposed_at)
);

-- ONE OPEN PROPOSAL PER SETTING, and the partial predicate is what makes it
-- workable: decided rows accumulate freely as the history of what the system
-- suggested and what was said about it, while at most one row per (scope, key)
-- sits in 'proposed'.
--
-- WHY IT MATTERS ON A SCREEN NOBODY LOOKS AT DAILY: without it, a job that
-- runs weekly and finds the same signal every week stacks five identical cards
-- into Zone 4 by month's end, and a card repeated five times reads as five
-- pieces of evidence rather than one observation seen five times. That is the
-- shape of P18.2's complaint about deltas from a base of five — noise dressed
-- as insight — arriving through the interface instead of the arithmetic.
--
-- It also gives the proposer an unambiguous instruction: before inserting,
-- supersede the open row for this setting. There is no "pick the latest" rule
-- for any reader to get wrong, because there is only ever one.
create unique index weight_proposals_one_open_per_setting
  on weight_proposals (scope, key)
  where status = 'proposed';

-- No second index. The table holds tens of rows, Zone 4 reads the handful
-- where status = 'proposed', and the partial index above already answers that
-- read. A settings screen showing one setting's history filters on (scope,
-- key), which the same index leads with.

alter table weight_proposals enable row level security;

-- weight_proposals_select_staff: is_staff(), matching daily_rollups and for
-- the same reason — the proposals card is part of the Dashboard, and the
-- Analyst role sees the Dashboard.
create policy weight_proposals_select_staff
  on weight_proposals
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- weight_proposals_update_decide: Editor and Admin, because §13 assigns groups
-- 3 (Categories & weights) and 4 (Scoring) to Editor, and deciding a proposal
-- is the same authority as making the change it suggests. Not is_staff(): that
-- would hand the decision to Analyst and Contributor, and an Analyst who can
-- accept a weight change is an Analyst who can retune the signal feed from the
-- one screen they are allowed to open.
--
-- NO INSERT POLICY, which makes this table's pairing unusual — writable but
-- not creatable — and that asymmetry is exactly right. Proposals are computed
-- from measured performance and written under service-role. A hand-inserted
-- proposal is one person's opinion wearing the system's clothes, presented to
-- the next editor as "the system suggests", with an evidence object nothing
-- produced. P11.1 again, one level up from the metrics.
--
-- WHAT THIS POLICY CANNOT DO, the same limitation 0018 documents: a WITH CHECK
-- clause sees only the new row, so it cannot tell a decision from a rewrite —
-- an editor updating proposed_value from 10 to 25 and then accepting it passes
-- every check above. The trigger below is that half.
create policy weight_proposals_update_decide
  on weight_proposals
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy, ever (P1.4). A rejected proposal is the record that the
-- system suggested something and a person disagreed, which is the more useful
-- half of the feedback loop: if the same suggestion is rejected four times,
-- the rubric is wrong in a way worth knowing about.

-- protect_weight_proposal() — the half the policy structurally cannot express.
--
-- Two rules, both about people:
--   1. The body of a proposal is the proposer's. A person decides it; a
--      person does not edit it and then decide it.
--   2. A decision is final. proposed → accepted/rejected, once.
--
-- NO-OPS ENTIRELY UNDER SERVICE-ROLE, the same posture and the same stated
-- assumption as 0018's protect_content_status(): auth.uid() is null there, so
-- the proposer's own supersede write passes through untouched. This guard
-- constrains humans, which is the direction the risk runs in — the proposer
-- writes what it computed, while a person has an opinion about what the weight
-- should be and a text box in front of them.
create function protect_weight_proposal() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.scope is distinct from old.scope
     or new.key is distinct from old.key
     or new.current_value is distinct from old.current_value
     or new.proposed_value is distinct from old.proposed_value
     or new.evidence is distinct from old.evidence
     or new.sample_size is distinct from old.sample_size
     or new.proposed_at is distinct from old.proposed_at then
    raise exception
      'a proposal is written by the system and decided by a person; it cannot be edited (P16.5)';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'proposed' then
      raise exception
        'this proposal is already %; a decision is final', old.status;
    end if;

    if new.status not in ('accepted', 'rejected') then
      raise exception
        'a person accepts or rejects a proposal; % is set by the proposer (P16.5)',
        new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger weight_proposals_protect_decision
  before update on weight_proposals
  for each row
  execute function protect_weight_proposal();


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
--
-- NO RETENTION POLICY ON site_events, and it is the one open question this
-- file ships with rather than answers. Nothing in the three specification
-- documents states how long raw events are kept, and every plausible answer —
-- drop after 90 days, partition by month, roll up and truncate, keep
-- everything — is a different table shape, not a different cron job. Deciding
-- it here would be inventing a policy; the rollups above make the raw log
-- discardable in principle, which is what buys the time to decide properly.
-- Logged as a noted open item in docs/exceptions.md. Settle it before the
-- table has a year in it, not after.
--
-- NO PARTITIONING, for the same reason and one more: partitioning this table
-- later is a rewrite whether it happens at ten million rows or a hundred
-- million, and choosing the key now — created_at, certainly, but at what
-- granularity — without a retention policy to serve would be choosing the
-- second half of a decision before the first.
--
-- NO TRIGGER APPLYING AN ACCEPTED PROPOSAL. Stated as an absence because it is
-- the obvious next thing to build and it is forbidden (P16.5). The path from
-- 'accepted' to a changed weight runs through the Settings screen, the replay
-- preview, a new versioned editorial_rules row and an audit entry — through a
-- person, in other words, at every step.
--
-- NO editorial_rules OR audit_log. They are §9.5's other two tables and they
-- belong to the governance batch that follows this one. weight_proposals
-- arrives early because Stage 20 is what fills it; the pointer it holds into
-- editorial_rules is textual and needs nothing from that table to exist.
