/**
 * Route inventory (P12.1, P12.5).
 *
 * Asserts that every page under `app/(admin)/` appears in `ADMIN_ROUTES`. Adding an admin
 * route without editing that constant fails this check — which is the point: the reviewer
 * sees the allowlist change in the diff.
 *
 * Allowlisted routes that do not exist on disk are NOT failures. Most of the six surfaces
 * are not built yet, and the allowlist is the plan as much as it is the inventory.
 *
 * Run with `pnpm check:routes`.
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ADMIN_ROUTES } from "../lib/constants";

const ADMIN_DIR = join(process.cwd(), "app", "(admin)");
const PAGE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"]);

function findPageDirs(dir: string, found: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found; // app/(admin)/ absent — no admin routes to check.
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      findPageDirs(join(dir, entry.name), found);
    } else if (PAGE_FILES.has(entry.name)) {
      found.push(dir);
    }
  }
  return found;
}

/** `app/(admin)/admin/settings/[group]` → `/admin/settings/[group]`. Route groups, being
 *  parenthesised, contribute nothing to the URL and are dropped. */
function toRoute(pageDir: string): string {
  const segments = relative(ADMIN_DIR, pageDir)
    .split(sep)
    .filter((segment) => segment !== "" && !segment.startsWith("("));
  return `/${segments.join("/")}`;
}

const onDisk = findPageDirs(ADMIN_DIR).map(toRoute).sort();
const allowed = new Set<string>(ADMIN_ROUTES);
const unlisted = onDisk.filter((route) => !allowed.has(route));

if (unlisted.length > 0) {
  console.error(
    `Admin route inventory failed — ${unlisted.length} route(s) on disk are not in ADMIN_ROUTES:`,
  );
  for (const route of unlisted) console.error(`  ${route}`);
  console.error(
    "\nThere are exactly six admin surfaces (P12.1). If this route is genuinely one of them,\n" +
      "add it to ADMIN_ROUTES in lib/constants.ts. If it is a seventh surface, it must not exist.",
  );
  process.exit(1);
}

console.log(`Admin route inventory OK — ${onDisk.length} route(s) on disk, all allowlisted.`);
for (const route of onDisk) console.log(`  ${route}`);
