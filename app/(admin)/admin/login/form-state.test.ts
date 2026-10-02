import { describe, expect, it } from "vitest";
import { emptyFormState } from "./form-state";

describe("emptyFormState", () => {
  // Regression: this used to be exported from actions.ts, a "use server" module. Such a
  // module may only export async functions, so it arrived as undefined on the client and
  // every form threw on `state.fieldErrors.<name>` during first render.
  it("is a real object with a usable fieldErrors map", () => {
    expect(emptyFormState).toBeDefined();
    expect(emptyFormState.error).toBeNull();
    expect(emptyFormState.fieldErrors).toEqual({});
    expect(emptyFormState.fieldErrors.anything).toBeUndefined();
  });
});
