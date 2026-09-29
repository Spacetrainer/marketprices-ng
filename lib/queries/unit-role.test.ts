import { describe, expect, it } from "vitest";
import { availableUnitRole } from "./unit-role";

/**
 * The role decision, tested where it now lives.
 *
 * These cases moved out of `price-review.test.ts` with the function. They import from
 * `./unit-role` DIRECTLY rather than through `price-review.ts`'s re-export, which is the point:
 * a test that reached for the re-export would load `../supabase/server` and stop proving that
 * this module stands on its own. If someone later gives `unit-role.ts` a server-only import,
 * the build breaks — and this file should break with it rather than quietly keep passing.
 */
describe("availableUnitRole", () => {
  it("offers primary for a week that holds nothing", () => {
    // Which is why plain Approve is one click on the ordinary path: there is nothing to choose
    // between, and a lone price is the figure every surface shows.
    expect(availableUnitRole([])).toBe("primary");
  });

  it("offers secondary once the week has a headline figure", () => {
    expect(
      availableUnitRole([
        { unitName: "Paint bucket", unitRole: "primary", price: 7000, currency: "NGN" },
      ]),
    ).toBe("secondary");
  });

  it("offers nothing once both roles are held", () => {
    // Null is what removes the approve controls entirely. There is no third role, so a third
    // unit cannot be published and a disabled button would invite a hunt for a permission that
    // does not exist (P1.7).
    expect(
      availableUnitRole([
        { unitName: "Paint bucket", unitRole: "primary", price: 7000, currency: "NGN" },
        { unitName: "Plate", unitRole: "secondary", price: 1000, currency: "NGN" },
      ]),
    ).toBeNull();
  });

  it("offers primary when the only live price is somehow a secondary", () => {
    // Unreachable through approval — 0041 refuses a secondary into an empty week, because its
    // only published figure would be one nothing displays. Asserted anyway: the function must
    // answer from what is TAKEN rather than from how many rows there are, so that a week in a
    // state this product cannot create is still described correctly rather than read as full.
    expect(
      availableUnitRole([
        { unitName: "Plate", unitRole: "secondary", price: 1000, currency: "NGN" },
      ]),
    ).toBe("primary");
  });
});
