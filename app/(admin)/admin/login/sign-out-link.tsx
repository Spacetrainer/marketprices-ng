"use client";

import { signOutAction } from "./actions";

/** The way out of a half-finished two-factor step, so a stranded session is not a dead end. */
export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => {
        void signOutAction();
      }}
      className="self-start text-fs-meta text-ink-500 underline"
    >
      Sign in as someone else
    </button>
  );
}
