#!/usr/bin/env bash
#
# check-vocab.sh — the vocabulary audit (P12.3).
#
# THE RULE IT ENFORCES. The status is `queued`, never `lead`. The classification
# field is `insight_type`, never `lead_type`. The word "lead" does not appear as
# a noun in identifiers, comments or UI copy. P12.3 exists because "lead" drags a
# whole CRM mental model with it — a lead desk, a pipeline, a triage inbox — and
# that model is explicitly prohibited (P12.4). The vocabulary is the first place
# the wrong model shows up, so it is the cheapest place to stop it.
#
# THE PATTERN is the protocol's, unchanged: \blead(s|_type)?\b, case-insensitive.
#
# THE ALLOWLIST is token-level, NOT line-level. This distinction is the whole
# design. Filtering whole LINES (grep -v leading) would mean a line such as
#
#     <p className="leading-none">{lead.title}</p>
#
# is silently discarded because it happens to contain a Tailwind class — the
# violation escapes precisely because it sits next to an allowed word. Instead
# each MATCHED TOKEN is tested on its own, so an allowed word can never vouch
# for a banned one sharing its line.
#
# Note: with the protocol's pattern these entries are belt-and-braces. \b already
# refuses "leading" (the "i" is a word character, so there is no boundary after
# "lead"), and it has no way to reach "line-height" at all. They are written down
# anyway so that the exemption is a reviewed decision rather than a side effect of
# regex trivia, and so that widening the pattern later cannot silently start
# flagging typography.
#
# Usage: pnpm check:vocab
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PATTERN='\blead(s|_type)?\b'

# Tailwind's leading-* utilities and the CSS property they set. Anchored, so
# these match a whole token or nothing.
ALLOW='^(leading|leading-.+|line-height)$'

# docs/prompts/ holds the model prompt templates. It does not exist yet — the
# engine stage has not landed — and a check that fails because a future directory
# is absent is a check someone disables. It joins the scan the day it appears.
TARGETS=(app components lib)
[[ -d docs/prompts ]] && TARGETS+=(docs/prompts)

fail=0
note() { printf '  %s\n' "$*"; }
violation() { printf '  ✗ %s\n' "$*"; fail=1; }

printf 'check-vocab: auditing %s\n' "${TARGETS[*]}"

# -I skips binary files; a match inside one is unreadable as a report anyway.
hits="$(grep -rnIE -i "$PATTERN" "${TARGETS[@]}" || true)"

if [[ -n "$hits" ]]; then
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    file="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"; text="${rest#*:}"

    # Test every matched token on this line independently against the allowlist.
    banned=""
    while IFS= read -r token; do
      [[ -z "$token" ]] && continue
      shopt -s nocasematch
      if [[ ! "$token" =~ $ALLOW ]]; then banned="${banned:+$banned, }$token"; fi
      shopt -u nocasematch
    done < <(printf '%s' "$text" | grep -oIE -i "$PATTERN" || true)

    [[ -z "$banned" ]] && continue
    violation "$file:$line: uses '$banned' — the status is \`queued\`, never \`lead\` (P12.3)"
  done <<< "$hits"
fi

if [[ $fail -eq 0 ]]; then
  printf 'check-vocab: PASS\n'
  note "no prohibited vocabulary in: ${TARGETS[*]}"
  exit 0
fi

printf 'check-vocab: FAIL\n'
note "P12.3: the status is \`queued\`, the field is \`insight_type\`."
note "See the standing prohibition block (P12.4) in docs/build-protocol.md."
exit 1
