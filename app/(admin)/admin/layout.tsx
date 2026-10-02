import type { Metadata } from "next";

/**
 * Control-room shell. Deliberately bare for now: the sidebar, the role-aware nav and the
 * six surfaces are Stage 6's work. What this layout owns today is the one thing that must
 * be true of every admin route from the first commit — `noindex, nofollow` (P9.4).
 *
 * There is NO auth guard here. The guard is `middleware.ts`, which runs before this renders
 * and before any page-level data fetch. Putting a second guard in this layout would also
 * lock out the login screen, which lives under it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
