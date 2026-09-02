"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "../../../../components/primitives/button";
import { createClient } from "../../../../lib/supabase/client";
import { verifyEnrolmentAction } from "./actions";
import { emptyFormState } from "./form-state";
import { Field, FormError } from "./field";
import { SignOutLink } from "./sign-out-link";

interface Enrolment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/**
 * `mfa.enroll()` runs in the browser and exactly once per mount — it is a write, not a read,
 * and every call mints another unverified factor. Any left over from an abandoned attempt
 * are cleared first, so a refresh mid-enrolment does not accumulate them.
 *
 * Verification itself goes through a server action: promotion to aal2 rotates the session,
 * and letting @supabase/ssr write those cookies server-side keeps the middleware's next read
 * consistent.
 */
export function EnrolForm() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(verifyEnrolmentAction, emptyFormState);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();

        // listFactors().totp holds VERIFIED factors only; unverified ones are in .all.
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const stale = (factors?.all ?? []).filter(
          (factor) => factor.factor_type === "totp" && factor.status !== "verified",
        );
        for (const factor of stale) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }

        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
        if (cancelled) return;

        if (error || !data) {
          setSetupError("Could not start authenticator setup. Reload to try again.");
          return;
        }

        setEnrolment({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
        });
      } catch {
        if (!cancelled) {
          setSetupError("Could not start authenticator setup. Reload to try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (setupError) return <FormError message={setupError} />;
  if (!enrolment) return <p className="text-fs-body text-ink-500">Preparing your authenticator…</p>;

  return (
    <div className="flex flex-col gap-sp-5">
      <p className="text-fs-body text-ink-500">
        Scan this with your authenticator app, then enter the six-digit code it shows.
      </p>

      <QrCode value={enrolment.qrCode} />

      <div className="flex flex-col gap-sp-1">
        <span className="text-fs-meta font-medium text-ink-400">Or enter this key manually</span>
        <code className="num rounded-r-btn bg-surface-50 px-sp-3 py-sp-2 text-fs-body break-all text-ink-900">
          {enrolment.secret}
        </code>
      </div>

      <form action={formAction} className="flex flex-col gap-sp-4" noValidate>
        <FormError message={state.error} />
        <input type="hidden" name="factorId" value={enrolment.factorId} />

        <Field
          label="Six-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={7}
          className="num tracking-[0.25em]"
          error={state.fieldErrors.code}
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Turn on two-factor"}
        </Button>

        <SignOutLink />
      </form>
    </div>
  );
}

/**
 * Supabase's own documentation describes `qr_code` two different ways — the guide calls it
 * "an SVG QR code which you can convert into a data URL", the type definitions pass it
 * straight to an <Image src>. Both forms are handled rather than betting on one, because
 * this cannot be checked without a real enrolling account.
 */
function QrCode({ value }: { value: string }) {
  const src = value.startsWith("data:")
    ? value
    : `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;

  // A data: URI has nothing for next/image to optimise, and routing it through the image
  // loader would only add a hop.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QR code for enrolling this account in your authenticator app"
      width={200}
      height={200}
      className="rounded-r-card border border-field-border bg-surface-0"
    />
  );
}
