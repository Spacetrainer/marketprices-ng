"use client";

import { useActionState } from "react";
import { Button } from "../../../../components/primitives/button";
import { signInAction } from "./actions";
import { emptyFormState } from "./form-state";
import { Field, FormError } from "./field";

export function CredentialsForm() {
  const [state, formAction, pending] = useActionState(signInAction, emptyFormState);

  return (
    <form action={formAction} className="flex flex-col gap-sp-4" noValidate>
      <FormError message={state.error} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        autoFocus
        required
        error={state.fieldErrors.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors.password}
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
