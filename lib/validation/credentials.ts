import { z } from "zod";

/**
 * The login boundary. Credentials and TOTP codes arrive as untyped FormData from a browser,
 * which makes them external input — validated here before anything reaches Supabase.
 *
 * Deliberately permissive on the password: length and composition rules belong to the
 * identity provider, and enforcing a second, different set of them at sign-in only produces
 * a client-side rejection of a password that would in fact have worked.
 */
export const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * TOTP is six digits. Authenticator apps commonly render them as "123 456", and people
 * paste that, so the space is stripped before the shape is checked rather than rejected.
 */
export const totpCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the six-digit code from your authenticator app")),
});

export type TotpCode = z.infer<typeof totpCodeSchema>;

/** Enrolment verifies a specific factor, so its id rides along with the code. */
export const enrolmentVerificationSchema = totpCodeSchema.safeExtend({
  factorId: z.string().min(1),
});
