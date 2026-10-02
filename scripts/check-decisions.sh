#!/usr/bin/env bash
#
# check-decisions.sh — runs supabase/tests/price_decisions.sql against the LOCAL
# Supabase stack, and refuses to run it anywhere else.
#
# WHAT IT GUARDS. The test file creates submissions, approves them and publishes
# observations. Pointed at marketprices-rebuild it would write fixture prices
# into a series that holds real published figures. That must never happen, and
# "must never" deserves better than a comment, so the guarantee is built in
# layers:
#
#   1. CI WITHHOLDS THE CREDENTIALS. The workflow job that calls this script
#      declares no NEXT_PUBLIC_SUPABASE_*, no SUPABASE_*, no E2E_* — GitHub
#      Actions scopes env per job, so the job has nothing to authenticate to
#      production with. This is the real guarantee: not a check that can be
#      bypassed, but an absence.
#
#   2. THIS SCRIPT NEVER INHERITS A CONNECTION STRING. It unsets DATABASE_URL
#      and every PG* variable before doing anything, and asks the Supabase CLI
#      where the local stack is rather than trusting the environment. .env.local
#      holds a DATABASE_URL pointing at production; this script must not be able
#      to pick it up by accident.
#
#   3. IT ASSERTS THE TARGET IS LOOPBACK. Host must be 127.0.0.1, localhost or
#      ::1, port must be the local stack's 54322, and the URL must not name a
#      supabase.co host. Any other target is a hard refusal.
#
#   4. THE TEST FILE REFUSES A NON-EMPTY SERIES. Its first statement aborts if
#      price_observations or price_submissions has a single row. Production has
#      sixteen of each and will only ever have more, so it can never satisfy
#      that precondition again.
#
#   5. THE TEST FILE ROLLS BACK. Even on the throwaway local database, every
#      fixture row is discarded at the end.
#
# `--linked` AND `--db-url` APPEAR NOWHERE IN THIS FILE, deliberately. This repo
# IS linked to the production project (supabase/.temp/project-ref), so
# `supabase db reset --linked` would destroy the real series. No script in this
# repo may pass that flag.
#
# Usage: pnpm test:db   (CI calls `bash scripts/check-decisions.sh` directly)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_FILE="$ROOT/supabase/tests/price_decisions.sql"

readonly LOCAL_DB_PORT="54322"

fail() { printf 'check-decisions: FAIL\n  %s\n' "$*" >&2; exit 1; }

# Layer 2. Drop anything that could point psql somewhere else. `|| true` because
# `set -u` and `unset` of an absent variable are fine together, but a stray
# non-zero from unset must not kill the script.
unset DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSSLMODE 2>/dev/null || true

[[ -f "$TEST_FILE" ]] || fail "supabase/tests/price_decisions.sql is missing."

command -v supabase >/dev/null 2>&1 || fail "the Supabase CLI is not installed."
command -v psql     >/dev/null 2>&1 || fail "psql is not installed (postgresql-client)."

printf 'check-decisions: locating the local Supabase stack\n'

# `supabase status -o env` prints shell-style assignments including
# DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres". It exits
# non-zero when the stack is not running, which is a legible failure, not a
# reason to guess a URL.
status_env="$(supabase status -o env 2>/dev/null || true)"

if [[ -z "$status_env" ]]; then
  fail "the local stack is not running. Start it with \`supabase start\` (this needs Docker).
  This project's devcontainer has no Docker, so this test runs in CI. See .github/workflows/ci.yml."
fi

db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL="\(.*\)"$/\1/p' | head -n 1)"
[[ -n "$db_url" ]] || fail "\`supabase status\` reported no DB_URL."

# Layer 3. Parse the host and port out and insist on loopback. Printed without
# the credentials, which are the local stack's throwaway postgres/postgres but
# are still not something to echo into a CI log.
if [[ ! "$db_url" =~ ^postgres(ql)?://[^@]+@([^:/]+):([0-9]+)/ ]]; then
  fail "could not parse the database URL the CLI reported."
fi

db_host="${BASH_REMATCH[2]}"
db_port="${BASH_REMATCH[3]}"

case "$db_host" in
  127.0.0.1 | localhost | ::1 | "[::1]") ;;
  *) fail "REFUSING: the target host is '$db_host', which is not loopback. This test may only run against a local stack." ;;
esac

if [[ "$db_port" != "$LOCAL_DB_PORT" ]]; then
  fail "REFUSING: the target port is $db_port, not the local stack's $LOCAL_DB_PORT."
fi

if [[ "$db_url" == *"supabase.co"* || "$db_url" == *"supabase.com"* ]]; then
  fail "REFUSING: the target URL names a hosted Supabase project."
fi

printf '  target: %s:%s — loopback, local stack\n' "$db_host" "$db_port"
printf 'check-decisions: running supabase/tests/price_decisions.sql\n'

# -X skips any local .psqlrc, so nothing in a developer's environment can change
# what this runs. ON_ERROR_STOP makes the first failed assertion the exit code;
# without it psql reports success after printing an error.
psql "$db_url" -X -v ON_ERROR_STOP=1 -f "$TEST_FILE"

printf 'check-decisions: PASS\n'
