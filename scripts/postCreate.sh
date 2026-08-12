#!/usr/bin/env bash
set -euo pipefail

corepack enable && corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
npm install -g supabase
pnpm exec playwright install --with-deps chromium
git config --global core.editor "code --wait"
echo "Ready. Run 'claude' to start."
