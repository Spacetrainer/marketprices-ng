"use client";

import { useActionState } from "react";
import { Button } from "../../../../components/primitives/button";
import { verifyChallengeAction } from "./actions";
import { emptyFormState } from "./form-state";
import { Field, FormError } from "./field";
import { SignOutLink } from "./sign-out-link";

export function ChallengeForm() {
  const [state, formAction, pending] = useActionState(verifyChallengeAction, emptyFormState);

  return (
    <form action={formAction} className="flex flex-col gap-sp-4" noValidate>
      <FormError message={state.error} />

      <Field
        label="Six-digit code"
        name="code"
        // Not type="number": that strips leading zeros and offers spinners on a code.
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={7}
        className="num tracking-[0.25em]"
        error={state.fieldErrors.code}
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </Button>

      <SignOutLink />
    </form>
  );
}
