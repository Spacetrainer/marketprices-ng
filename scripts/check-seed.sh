#!/usr/bin/env bash
#
# check-seed.sh — the seed audit (P0.1).
#
# THE RULE IT ENFORCES. `supabase/seed.sql` may contain REFERENCE DATA ONLY:
# sections, commodities, units, collection sites, sources, templates and seed
# rules. Never content. No articles, no prices, no collectors, no signals, no
# media, no "temporary" sample row to show the layout. P0.1 is the founding rule
# of this project and this script is its enforcement mechanism — a protocol
# enforced only by prose is a protocol that will be broken.
#
# HOW IT WORKS. An ALLOWLIST, not a denylist, for the same reason ADMIN_ROUTES
# is an allowlist: a new table added by a future migration is refused by default
# rather than silently permitted. Widening the list is a deliberate edit that a
# reviewer sees.
#
# It also refuses DDL. Schema changes belong in a numbered migration (P10.1); a
# CREATE or ALTER in the seed is a schema change nobody reviewed and that no
# other environment will have.
#
# COMMENTS ARE STRIPPED FIRST, and quote-aware. This matters concretely:
# seed.sql's own header documents the follow-up
# `update commodities set is_tracked = true where slug in (...)`, and a naive
# grep flags the file's own documentation. A check that cries wolf on a correct
# file is a check someone deletes.
#
# Usage: pnpm check:seed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED="$ROOT/supabase/seed.sql"

# Reference data only (P0.1). `templates` is content_templates; `seed rules` is
# editorial_rules. Everything else in the schema is content or operational state
# and is seeded by a human action in the product, never by this file.
ALLOWED="sections commodities units collection_sites sources content_templates editorial_rules"

fail=0
note() { printf '  %s\n' "$*"; }
violation() { printf '  ✗ %s\n' "$*"; fail=1; }

if [[ ! -f "$SEED" ]]; then
  printf 'check-seed: FAIL\n'
  note "supabase/seed.sql does not exist. pnpm db:seed depends on it."
  exit 1
fi

# Strip -- line comments and /* */ block comments WITHOUT touching string
# literals, keeping original line numbers as a "N:" prefix. A '' inside a string
# toggles twice and nets out, which is the behaviour we want here.
strip_comments() {
  awk '
    BEGIN { ins = 0; blk = 0 }
    {
      out = ""; i = 1; n = length($0)
      while (i <= n) {
        c = substr($0, i, 1); two = substr($0, i, 2)
        if (blk)      { if (two == "*/") { blk = 0; i += 2 } else { i++ } }
        else if (ins) { out = out c; if (c == "\047") ins = 0; i++ }
        else if (c == "\047") { ins = 1; out = out c; i++ }
        else if (two == "--") { break }
        else if (two == "/*") { blk = 1; i += 2 }
        else { out = out c; i++ }
      }
      print NR ":" out
    }
  ' "$1"
}

SQL="$(strip_comments "$SEED")"

printf 'check-seed: auditing supabase/seed.sql\n'

# 1. Every write target must be on the allowlist.
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  line="${hit%%:*}"
  target="$(printf '%s' "${hit#*:}" | sed -E 's/.*[[:space:]]([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*$/\1/')"
  if [[ " $ALLOWED " != *" $target "* ]]; then
    violation "line $line: writes to '$target', which is not reference data (P0.1)"
  fi
done < <(printf '%s\n' "$SQL" \
  | grep -inE '(insert[[:space:]]+into|update|delete[[:space:]]+from|truncate([[:space:]]+table)?|copy)[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*' \
  | sed -E 's/^([0-9]+):.*[^a-zA-Z0-9_](insert[[:space:]]+into|update|delete[[:space:]]+from|truncate[[:space:]]+table|truncate|copy)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1: \3/I' \
  | sed -E 's/^([0-9]+):(insert[[:space:]]+into|update|delete[[:space:]]+from|truncate[[:space:]]+table|truncate|copy)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1: \3/I')

# 2. No DDL. Schema changes are numbered migrations (P10.1).
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  violation "line ${hit%%:*}: DDL in the seed — schema changes are migrations (P10.1)"
done < <(printf '%s\n' "$SQL" | grep -inE ':[[:space:]]*(create|alter|drop|grant|revoke)[[:space:]]' || true)

if [[ $fail -eq 0 ]]; then
  targets="$(printf '%s\n' "$SQL" \
    | grep -ioE 'insert[[:space:]]+into[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*' \
    | sed -E 's/.*[[:space:]]//' | sort -u | tr '\n' ' ')"
  printf 'check-seed: PASS\n'
  note "reference data only; writes to: ${targets:-(none)}"
  exit 0
fi

printf 'check-seed: FAIL\n'
note "supabase/seed.sql may hold reference data only — see P0.1 in docs/build-protocol.md."
exit 1
