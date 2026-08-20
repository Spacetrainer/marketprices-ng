-- 0012_basket.sql
-- MarketPrices — Stage 2, migration batch 3
--
-- basket_definition and basket_snapshots (§9.2, §6.4): the Lagos Food Basket
-- Index. A frozen basket of commodities and quantities, priced weekly and
-- expressed against a base week:
--
--     basket_index = (cost_this_week / cost_base_week) × 100
--
-- This is the one aggregate in the entire system (§1 M3) and the one number
-- the platform owns. Two protocol rules shape every line below.
--
-- P16.2 — THE DEFINITION IS VERSIONED, NEVER MUTATED. Changing a live basket
-- retroactively rewrites every index value ever published, because every one
-- of them was a ratio against a basket that no longer exists. A change is a
-- new `version` with a new `active_from`, and the old rows stay exactly as
-- they were. This is why basket_definition has an INSERT policy and no
-- UPDATE policy at all (see the policy block).
--
-- P2.10 — AN INCOMPLETE WEEK IS NOT AN INDEX. If any commodity in the active
-- basket has no observation for a week, that week has NO index value — not a
-- partial one, not a carried-forward one, not a zero. It is stored anyway,
-- with is_complete = false and the missing commodities named, so the gap is
-- visible rather than absent. The checks on basket_snapshots make the
-- alternative unrepresentable: an incomplete row cannot hold a cost, an index
-- or sub-index values, because those columns are forced null.
--
-- DERIVED DATA, like price_anomalies and unlike the price spine. Every figure
-- in basket_snapshots is computed by /api/cron/price-intel from
-- price_observations, on price approval and on a nightly sweep, and is
-- recomputed freely when the underlying observations change (a correction
-- under P1.3 can complete a week that was incomplete, or re-cost a week that
-- was already published). There is no human decision block here — unlike
-- price_anomalies.state, nothing in basket_snapshots survives a recompute
-- because nothing in it was ever authored by a person.
--
-- STRUCTURE — the trade-off, recorded rather than resolved. basket_definition
-- is flat, exactly as §9.2 prints it: one row per commodity line, with
-- `version`, `active_from`, `base_iso_year` and `base_iso_week` repeated on
-- every line of the same version. Those four are properties of the VERSION,
-- not of the line, and a flat table cannot enforce that all rows sharing a
-- version agree on them — an insert could create a version 3 whose beef line
-- says active_from 2026-03-02 and whose rice line says 2026-03-09, and the
-- database would accept it. A basket_versions parent table would make that
-- impossible, and it is deliberately NOT invented here: the schema in §9.2 is
-- the schema, and a table the spec does not name is not added by a migration
-- on its own authority. The consistency is therefore a WRITE CONTRACT on the
-- Settings screen (insert all lines of a version in one transaction, from one
-- form, with one active_from and one base week) and on any reader, which must
-- take the version's active_from and base week from the version as a whole
-- and not from whichever row it happened to read first. If this bites, the
-- fix is a documented follow-up migration, not an edit to this one.
--
-- Both `version` here and `basket_version` on the snapshot are plain integers
-- with no foreign key between them, for the same reason: the thing a snapshot
-- refers to is a version, and a version is not a row in this design — it is a
-- set of rows. A foreign key to any single line would be a lie about what the
-- reference means.

-- basket_definition
create table basket_definition (
  id              uuid primary key default extensions.uuid_generate_v4(),

  -- The version this line belongs to. Monotonic, starting at 1, and never
  -- reused: version 2 is a different basket from version 1, and an index
  -- value computed under one is not comparable to one computed under the
  -- other (§6.4 rule 1). See the header on why this is not a foreign key.
  version         integer not null check (version >= 1),

  commodity_id    uuid not null references commodities (id) on delete restrict,

  -- How much of this commodity the basket holds, in unit_id. Strictly
  -- positive: a zero-quantity line is a commodity that is not in the basket,
  -- and the way to say that is to leave the line out.
  quantity        numeric not null check (quantity > 0),

  -- The unit the quantity is expressed in. NOT defaulted from
  -- commodities.default_unit_id: the basket states its own units, so that
  -- changing a commodity's default unit later cannot silently re-weight a
  -- published basket. on delete restrict — a unit a live basket depends on
  -- is not deletable.
  unit_id         uuid not null references units (id) on delete restrict,

  -- Which of the four sub-indices this line rolls up into (§6.4, §11 Band 2:
  -- staples, protein, vegetables, oils & condiments). Fixed vocabulary, and
  -- deliberately fixed HERE rather than in editorial_rules: P16.1 puts
  -- thresholds in the database because they change, but these four are the
  -- published shape of the index — a fifth sub-index is a new version of the
  -- product, not a settings change. `oils_condiments` is the identifier form
  -- of "oils & condiments"; the display label is the UI's business, not this
  -- table's.
  sub_index       text not null
                   check (sub_index in ('staples', 'protein', 'vegetables', 'oils_condiments')),

  -- The first week this version is in force. A DATE rather than an ISO
  -- year/week pair, as §9.2 prints it — and constrained to a Monday, so it is
  -- unambiguously the start of an ISO week and can be compared directly
  -- against price_observations.week_start_date. Without the constraint,
  -- "active from Wednesday" is storable and the question of which week that
  -- version covers has no answer.
  active_from     date not null,
  check (extract(isodow from active_from) = 1),

  -- The week this version's index is 100 at. Carried on the definition
  -- because it is part of what the version IS: an index value is a ratio
  -- against a specific week's cost, and a version whose base week is not
  -- recorded produces numbers no one can reproduce. §6.4's published form is
  -- "Index 118.4 — basket v2, base week 2026-W01", which is exactly this pair
  -- plus the version.
  --
  -- Not constrained relative to active_from, and that is on purpose: whether
  -- a new version's base week sits inside its own active period (a fresh
  -- rebase to 100) or before it (chained onto the previous version's base) is
  -- an editorial decision about comparability, and the schema does not get to
  -- pre-empt it.
  base_iso_year   integer not null check (base_iso_year >= 2020),
  base_iso_week   smallint not null check (base_iso_week between 1 and 53),

  -- When this line was written. No updated_at: this table has no UPDATE path,
  -- so a second timestamp could only ever repeat the first one.
  created_at      timestamptz not null default now()
);

-- One line per commodity per version. A basket that holds rice twice is a
-- basket that weights rice twice without saying so.
create unique index basket_definition_version_commodity_key
  on basket_definition (version, commodity_id);

-- NO FURTHER INDEX ON THIS TABLE, and the omission is deliberate. The hot
-- read is "which version is in force for this week" — the rows whose
-- active_from is the greatest one not after the week's Monday — which leads
-- with active_from and cannot use the key above. It still does not earn an
-- index: this table holds one row per commodity line per version, so a
-- thirty-line basket revised once a year is a few hundred rows after a
-- decade. Postgres will seq-scan that faster than it can descend a btree,
-- and an index on a table that never grows is a write cost and a page of
-- maintenance bought with nothing.

alter table basket_definition enable row level security;

-- basket_definition_select_authenticated: any signed-in user can read the
-- basket composition. Not on P9.1's anon-SELECT list, so it stops at
-- authenticated — same call as media in 0005. The composition reaches the
-- public through the methodology page and the index card's labelling, which
-- are rendered server-side, not by an anon client reading this table.
create policy basket_definition_select_authenticated
  on basket_definition
  for select
  to authenticated
  using (true);

-- basket_definition_insert_admin: Admin only, and deliberately NOT
-- is_admin_or_editor() — which is the write gate on every other master-data
-- table in this build (units, commodities, collection_sites, collectors).
-- §14's Settings group 6 puts "Collection sites & basket ... versioned, with
-- a loud warning" at Admin, because this is the one piece of master data
-- whose edit invalidates published numbers retroactively. An editor can
-- correct a commodity's name; only an admin can change what the index means.
create policy basket_definition_insert_admin
  on basket_definition
  for insert
  to authenticated
  with check (is_admin(auth.uid()));

-- NO UPDATE POLICY, AND NO UPDATE PATH OF ANY KIND. RLS enabled with no
-- matching policy is default-deny, so no signed-in role — admin included —
-- can alter a line of any version, live or not. There is no security definer
-- escape hatch either, unlike price_observations' supersede function.
--
-- This is the strict reading of P16.2 and it was chosen with its cost known:
-- a version saved with a typo in a quantity cannot be repaired. The remedy is
-- to insert the next version with the correct figures, leaving the bad one in
-- place, unused and visible. A STILLBORN VERSION IS AN ACCEPTABLE OUTCOME —
-- a version nobody ever priced against is a footnote in the history, whereas
-- an editable definition means every index value in the system is a claim
-- about a basket that may since have changed underneath it.
--
-- NO DELETE POLICY: for the same reason, and more so. Deleting a line of a
-- superseded version rewrites what the published series was computed from.

-- basket_snapshots
create table basket_snapshots (
  id                     uuid primary key default extensions.uuid_generate_v4(),

  -- Which basket produced this row, and which base week it was measured
  -- against. Denormalised onto the snapshot on purpose: the published form of
  -- this number states its version and base week (§6.4), and a snapshot that
  -- has to re-derive them by date-matching against basket_definition at read
  -- time would render a label that changes if the definition table changes.
  -- Copied at compute time, they are a permanent record of what this figure
  -- actually meant, which is the whole point of versioning the basket.
  basket_version         integer not null check (basket_version >= 1),
  base_iso_year          integer not null check (base_iso_year >= 2020),
  base_iso_week          smallint not null check (base_iso_week between 1 and 53),

  -- The week this snapshot covers. Absolute, never relative (P2.7). No
  -- week_start_date here, same call as price_anomalies: this row is computed
  -- from observations that already carry a verified week, so there is no
  -- second date for a derivation check to bite on.
  iso_year               integer not null check (iso_year >= 2020),
  iso_week               smallint not null check (iso_week between 1 and 53),

  -- What the basket cost this week, and that cost as an index against the
  -- base week. BOTH NULLABLE, and null means null (P2.1) — never 0. They are
  -- null exactly when is_complete is false; the check below enforces it in
  -- both directions.
  basket_cost_naira      numeric check (basket_cost_naira >= 0),
  basket_index           numeric check (basket_index >= 0),

  -- The four sub-indices for this week, keyed by the same vocabulary as
  -- basket_definition.sub_index. jsonb as §9.2 prints it. Nullable for the
  -- same reason as the two columns above, and forced null on an incomplete
  -- week by the same check: a sub-index computed from a basket missing its
  -- beef line is a protein sub-index that silently excludes beef, which is
  -- P2.10's failure mode in miniature rather than an exception to it.
  sub_index_values       jsonb,

  -- Week-on-week and year-on-year movement of basket_index, as percentages.
  -- Null when there is nothing to compare against — no prior week, or a prior
  -- week that was itself incomplete and therefore has no index.
  wow_pct                numeric,
  yoy_pct                numeric,

  -- P2.10, the boolean the protocol calls "one NOT NULL away from making a
  -- false trend impossible". Defaults to FALSE, not true: a row that arrives
  -- without an explicit completeness verdict is treated as incomplete and
  -- publishes nothing, which is the safe direction to fail.
  is_complete            boolean not null default false,

  -- Which basket commodities had no observation this week. Named, not
  -- counted: the week renders as "Week 31 — incomplete (beef, tomato not
  -- priced)" and that sentence cannot be built from a number. Empty array,
  -- never null — "nothing was missing" and "we did not check" are different
  -- states, and only the first one is ever true of a computed row.
  missing_commodity_ids  uuid[] not null default '{}'::uuid[],

  -- P2.10 in both directions, as one biconditional: a week is complete if and
  -- only if nothing is missing from it. Blocks the two rows that would break
  -- the index — a complete week that quietly names missing commodities, and
  -- an incomplete week that names none and so cannot say what is absent.
  check (is_complete = (cardinality(missing_commodity_ids) = 0)),

  -- The teeth of P2.10. An incomplete week carries NO cost, NO index and NO
  -- sub-index values — not just no index. A cost is the sum of a basket that
  -- was not fully priced, so it is a cheaper basket presented as a total; the
  -- sub-index values have the same defect one level down. Storing them "for
  -- reference" is exactly how a partial figure reaches a chart.
  check (
    is_complete
    or (basket_cost_naira is null
        and basket_index is null
        and sub_index_values is null)
  ),

  -- And the converse: a week declared complete must actually carry all three.
  -- Without this, is_complete = true with a null index passes every other
  -- constraint here and puts an empty slot where the public index card
  -- expects a number.
  check (
    not is_complete
    or (basket_cost_naira is not null
        and basket_index is not null
        and sub_index_values is not null)
  ),

  -- A delta may not outrun the figure it is a delta of — the same rule as
  -- price_anomalies' direction/pct_change pairing. Strictly implied by the
  -- two checks above for the incomplete case (no index, therefore no
  -- movement), and stated separately because it is a claim about derivation,
  -- not about completeness, and should survive if the completeness rule is
  -- ever restated.
  check (basket_index is not null or (wow_pct is null and yoy_pct is null)),

  -- When these figures were produced. Moves on every recompute, not held at
  -- first computation: a correction upstream can re-cost a settled week, and
  -- a re-costed week carrying its original timestamp presents fresh figures
  -- as old ones. Same call as price_anomalies.detected_at.
  computed_at            timestamptz not null default now(),

  -- When this week first appeared in the table. Distinct from computed_at and
  -- worth both: created_at says when the system first had anything to say
  -- about this week, computed_at says when it last changed its mind. No
  -- updated_at — that is what computed_at already is, under a truer name.
  created_at             timestamptz not null default now()
);

-- ONE SNAPSHOT PER WEEK, and the target of the cron's upsert. basket_version
-- is deliberately NOT part of this key: exactly one version is active for any
-- given week (that is what active_from means), so a second row for the same
-- week under a different version would not be a parallel series — it would be
-- two answers to "what was the index in week 31", one of which the index card
-- would pick arbitrarily.
--
-- The cost: there is no way to store a back-computed series under a new
-- basket alongside the original, so a version change splices the series at
-- active_from rather than restating its history. That is the intended
-- behaviour — restating history under a new basket is precisely what §6.4
-- rule 1 exists to prevent — but it does mean a version's active_from must
-- never be set back over weeks that already have snapshots. That rule is
-- rule 5 of the write contract at the foot of this file, and it is NOT a
-- constraint; see there for why it cannot be one.
create unique index basket_snapshots_week_key
  on basket_snapshots (iso_year, iso_week);

-- NO SECOND INDEX HERE EITHER. The 26-week path on the public index card and
-- the radar's Band 2 reads complete weeks newest first, which sounds like it
-- wants a descending partial index — and does not need one. The unique key
-- above is a btree on exactly (iso_year, iso_week), and Postgres scans a
-- btree backwards at no extra cost, so it already serves "order by iso_year
-- desc, iso_week desc limit 26". All a partial index would add is filtering
-- the incomplete weeks out first, on a table that gains fifty-two rows a
-- year and will not reach four figures this decade.

alter table basket_snapshots enable row level security;

-- basket_snapshots_select_public: the P9.1 entry, verbatim — anon SELECT on
-- this table is scoped `WHERE is_complete`. An incomplete week is not merely
-- undisplayed by the UI; it is unreachable by a public client, so no future
-- page, embed or API route can render one by forgetting to filter. Extended
-- to `authenticated` as well so a signed-in reader sees the same series a
-- signed-out one does.
create policy basket_snapshots_select_public
  on basket_snapshots
  for select
  to anon, authenticated
  using (is_complete);

-- basket_snapshots_select_staff: staff see every week, incomplete ones
-- included — the radar has to render "Week 31 — incomplete (beef, tomato not
-- priced)", which requires reading the row the public policy hides.
-- is_staff() rather than is_admin_or_editor(), so the Analyst role can see
-- the index panel on the Dashboard it is restricted to.
create policy basket_snapshots_select_staff
  on basket_snapshots
  for select
  to authenticated
  using (is_staff(auth.uid()));

-- No insert, update or delete policy: rows are computed, never authored.
-- /api/cron/price-intel writes them under service-role credentials, which
-- bypasses RLS and is not a grant made here. A hand-written snapshot is a
-- published index figure that no basket and no price produced.

-- THE RECOMPUTE CONTRACT, for whoever writes /api/cron/price-intel.
--
-- 1. Resolve the version FIRST. For the week being computed, take the
--    basket_definition rows whose active_from is the greatest one not after
--    that week's Monday. Those rows are the basket. Their version and base
--    week are what get copied onto the snapshot — read from the version as a
--    whole, per the header's note on cross-row consistency, not from an
--    arbitrary line.
--
-- 2. Completeness is decided before any arithmetic. Every commodity in the
--    resolved version needs a live (not superseded) observation for the week.
--    Any that do not go into missing_commodity_ids, is_complete is false, and
--    the cost, index and sub-index values are written as NULL — the check
--    constraints will reject the row otherwise, which is the intended
--    behaviour and not a bug to work around by writing a partial cost.
--
-- 3. Upsert on basket_snapshots_week_key. Overwrite every column freely on
--    conflict, including basket_version and the base week: unlike
--    price_anomalies, this table holds no human decision that a recompute
--    could destroy. A week that was incomplete and is now complete simply
--    becomes complete, which is the correct outcome when a late submission or
--    a correction lands (P1.3).
--
-- 4. Never delete a snapshot to force a recompute. An incomplete week is a
--    record that the week was assessed and found short; removing it turns a
--    disclosed gap into an unexplained absence.
--
-- 5. A NEW VERSION'S active_from IS NEVER SET BACK OVER A WEEK THAT ALREADY
--    HAS A SNAPSHOT. This is the one invariant in this file that is written
--    down rather than enforced, so it is worth being exact about what it is
--    and why it stays that way.
--
--    What it is NOT is "active_from must be in the future". That form of the
--    rule is both too strict and too weak: too strict, because setting a
--    version live on the Monday it takes effect is legitimate and nothing
--    has been computed for that week yet; too weak, because a date in the
--    future is still wrong if a snapshot for it somehow already exists. The
--    real invariant is stated against basket_snapshots, not the calendar.
--
--    Which is also why it is not a check constraint. A check is row-local
--    and cannot see another table, so it could never express this one; and
--    the weaker calendar form is not available either, because current_date
--    is STABLE rather than IMMUTABLE and Postgres rejects it in a check
--    outright. A trigger reading basket_snapshots could do it — and that is
--    the same shape of thing 0011 declined for "resolve the week's own
--    version, not today's version", and 0010 declined for the supersede-
--    then-insert call order: a temporal rule about the ORDER two tables are
--    written in, held in the write path rather than the schema. Consistency
--    with those two is worth more here than a partial guard.
--
--    The one temporal rule that IS enforced is the Monday constraint on
--    active_from, because it is row-local and immutable — which is the whole
--    of what a check can honestly do about a date in this design.
