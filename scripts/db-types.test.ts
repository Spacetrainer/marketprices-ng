import { describe, expect, it } from "vitest";
import { DbTypesError, assertLooksGenerated, readProjectRef } from "./db-types";

/**
 * The two refusals in scripts/db-types.ts.
 *
 * What these pin down is the property the old one-line `db:types` script did not have: that
 * every path which does not end in a successfully generated file ends in a thrown error
 * BEFORE anything is written, so types/database.ts survives. The script's `>` predecessor
 * truncated the file first and asked questions afterwards.
 *
 * The ref below is synthetic — twenty letters that are not any project's ref. The real one
 * lives in .env.local and supabase/.temp, and neither belongs in an assertion.
 */

const VALID_REF = "abcdefghijklmnopqrst";

/** The shape the CLI actually prints, reduced to the markers the script looks for. */
const GENERATED = [
  "export type Json =",
  "  | string",
  "",
  "export type Database = {",
  "  public: {",
  "    Tables: {}",
  "  }",
  "}",
].join("\n");

describe("readProjectRef", () => {
  it("returns the ref when it is present and well formed", () => {
    expect(readProjectRef({ SUPABASE_PROJECT_ID: VALID_REF })).toBe(VALID_REF);
  });

  it("trims surrounding whitespace rather than rejecting it", () => {
    expect(readProjectRef({ SUPABASE_PROJECT_ID: ` ${VALID_REF}\n` })).toBe(VALID_REF);
  });

  it.each([
    ["unset", {}],
    ["empty", { SUPABASE_PROJECT_ID: "" }],
    ["whitespace only", { SUPABASE_PROJECT_ID: "   " }],
  ])("refuses a %s SUPABASE_PROJECT_ID, and says the file is untouched", (_label, env) => {
    expect(() => readProjectRef(env)).toThrow(DbTypesError);
    expect(() => readProjectRef(env)).toThrow(/SUPABASE_PROJECT_ID is not set/);
    expect(() => readProjectRef(env)).toThrow(/has NOT been touched/);
  });

  it("names .env.local when the variable is missing, because that is where it lives", () => {
    expect(() => readProjectRef({})).toThrow(/\.env\.local/);
  });

  it.each([
    ["truncated at an unquoted '#'", "wmrojmupdkhsw"],
    ["too long", `${VALID_REF}extra`],
    ["uppercase", VALID_REF.toUpperCase()],
    ["a whole connection string", "postgresql://postgres@localhost:54322/postgres"],
  ])("refuses a ref that is %s", (_label, value) => {
    expect(() => readProjectRef({ SUPABASE_PROJECT_ID: value })).toThrow(/does not look like a project ref/);
    expect(() => readProjectRef({ SUPABASE_PROJECT_ID: value })).toThrow(/has NOT been touched/);
  });
});

describe("assertLooksGenerated", () => {
  it("accepts output carrying every marker the generator emits", () => {
    expect(() => assertLooksGenerated(GENERATED)).not.toThrow();
  });

  it.each([
    ["nothing at all", ""],
    ["an error page instead of TypeScript", "Unexpected error: failed to connect to project"],
    ["a partial file missing the Database type", "export type Json =\n  | string\n"],
  ])("refuses %s, so the committed file is never overwritten with it", (_label, output) => {
    expect(() => assertLooksGenerated(output)).toThrow(DbTypesError);
    expect(() => assertLooksGenerated(output)).toThrow(/has NOT been touched/);
  });
});
