#!/usr/bin/env bash
set -euo pipefail

corepack enable && corepack prepare pnpm@11.21.0 --activate
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz -C /tmp && sudo mv /tmp/supabase /usr/local/bin/supabase
pnpm exec playwright install --with-deps chromium
git config --global core.editor "code --wait"
echo "Ready. Run 'claude' to start."
