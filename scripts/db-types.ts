/**
 * db-types.ts — regenerate types/database.ts from the linked Supabase project.
 *
 * WHAT IT REPLACES, AND THE TRAP IT CLOSES. This was a one-line npm script:
 *
 *     supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > types/database.ts
 *
 * The shell opens a `>` redirect BEFORE running the command, so that line truncated
 * types/database.ts to zero bytes first and refilled it only if the CLI then succeeded.
 * Nothing loaded .env.local either, so in a fresh shell `$SUPABASE_PROJECT_ID` expanded to
 * nothing, the CLI was handed an empty --project-id, it failed — and the repo was left with
 * an empty types/database.ts and a build that no longer typechecked. A regeneration that
 * fails must leave the committed file exactly as it found it.
 *
 * THREE THINGS THIS DOES THAT THE ONE-LINER COULD NOT:
 *
 *   1. IT LOADS .env.local, the same way capture:session and gen:form-options already do —
 *      `tsx --env-file-if-exists=.env.local` in package.json. The project ref lives in that
 *      file; expecting every developer to also export it by hand is how the hole got dug.
 *
 *   2. IT REFUSES A MISSING OR MALFORMED REF before spawning anything. A Supabase project
 *      ref is exactly twenty lowercase letters or digits. Anything else is an unset
 *      variable, a typo, or a value that node's --env-file cut short at an unquoted '#'
 *      (it does that; bash does not, which is why a shell sanity check can disagree).
 *
 *   3. IT WRITES THROUGH A TEMP FILE AND A RENAME, and only after the output looks like
 *      what the generator produces. A non-zero exit, empty stdout, or an error page instead
 *      of TypeScript all end the same way: types/database.ts untouched.
 *
 * --schema public IS DELIBERATE AND MUST STAY. Without it the CLI falls back to
 * supabase/config.toml's [api].schemas, which `supabase init` wrote as
 * ["public", "graphql_public"], and the generated file grows a graphql_public block that no
 * migration asked for — spurious drift in a file CLAUDE.md requires be regenerated, never
 * hand-edited. Pinning the flag makes this output independent of that local config file.
 *
 * Usage: pnpm db:types
 */

import { execFile } from "node:child_process";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OUTPUT_PATH = path.join(process.cwd(), "types", "database.ts");

/** A Supabase project ref: twenty lowercase letters or digits, e.g. the one in .env.local. */
const PROJECT_REF = /^[a-z0-9]{20}$/;

/** Substrings every generated file contains. Their absence means the CLI printed something else. */
const EXPECTED_MARKERS = ["export type Json =", "export type Database = {", "public: {"];

export class DbTypesError extends Error {}

/**
 * The guard. Reads SUPABASE_PROJECT_ID and insists it looks like a project ref.
 *
 * Takes the environment as an argument rather than reading process.env directly so the
 * refusals below can be tested without mutating the test runner's own environment. It is typed
 * as a plain string map rather than NodeJS.ProcessEnv because Next.js augments that type
 * with a required NODE_ENV, which a test fixture has no business supplying.
 */
export function readProjectRef(env: Readonly<Record<string, string | undefined>>): string {
  const ref = env.SUPABASE_PROJECT_ID?.trim();

  if (!ref) {
    throw new DbTypesError(
      "SUPABASE_PROJECT_ID is not set, so there is no project to generate types from.\n" +
        "  It normally comes from .env.local, which this script loads automatically.\n" +
        "  Check that .env.local exists and contains SUPABASE_PROJECT_ID, or export it for one run.\n" +
        "  types/database.ts has NOT been touched.",
    );
  }

  if (!PROJECT_REF.test(ref)) {
    throw new DbTypesError(
      `SUPABASE_PROJECT_ID is set but does not look like a project ref (got ${ref.length} ` +
        "characters; a ref is exactly twenty lowercase letters or digits).\n" +
        "  A value cut short like this is usually an unquoted '#' in .env.local — node's\n" +
        "  --env-file truncates there, though bash does not. Quote the value.\n" +
        "  types/database.ts has NOT been touched.",
    );
  }

  return ref;
}

/**
 * The second half of the guarantee: never write output that is not the generated file.
 *
 * The CLI exits non-zero on most failures, which is caught below, but "prints a warning and
 * nothing else" is not worth betting the committed file on.
 */
export function assertLooksGenerated(output: string): void {
  const missing = EXPECTED_MARKERS.filter((marker) => !output.includes(marker));

  if (missing.length > 0) {
    throw new DbTypesError(
      `The Supabase CLI produced ${output.length} characters that do not look like generated ` +
        `types (missing: ${missing.join(", ")}).\n` +
        "  types/database.ts has NOT been touched.",
    );
  }
}

async function generate(ref: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "supabase",
      ["gen", "types", "typescript", "--project-id", ref, "--schema", "public"],
      // The file is ~60KB today and grows with the schema; execFile's 1MB default would
      // turn a large schema into a confusing ENOBUFS rather than a working regeneration.
      { maxBuffer: 32 * 1024 * 1024 },
    );

    return stdout;
  } catch (error: unknown) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";

    throw new DbTypesError(
      `The Supabase CLI failed to generate types for project ${ref}.\n` +
        (stderr.trim() ? `  ${stderr.trim().split("\n").join("\n  ")}\n` : "") +
        "  types/database.ts has NOT been touched.",
    );
  }
}

async function write(contents: string): Promise<void> {
  // Temp file then rename, for the same reason generate-form-options.ts does it: an
  // interrupted run must not be able to leave a half-written types/database.ts behind.
  const temporary = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, OUTPUT_PATH);
}

async function main(): Promise<void> {
  const ref = readProjectRef(process.env);
  const contents = await generate(ref);
  assertLooksGenerated(contents);
  await write(contents);

  // trimEnd first: the file ends in a newline, and split would otherwise count the empty
  // string after it and report one line more than `wc -l` does.
  console.log(
    `Wrote types/database.ts from project ${ref} — ${contents.trimEnd().split("\n").length} lines, public schema only.`,
  );
}

// Same guard as generate-form-options.ts: the helpers above are imported by db-types.test.ts,
// and importing this module must not spawn the CLI or overwrite the committed file.
const invokedDirectly = (process.argv[1] ?? "").includes("db-types");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof DbTypesError ? `✗ ${error.message}` : error);
    process.exit(1);
  });
}
