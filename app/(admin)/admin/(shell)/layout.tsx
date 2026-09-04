import { redirect } from "next/navigation";
import { Sidebar } from "../../../../components/admin/sidebar";
import { resolveLoginStep } from "../../../../lib/auth/access";
import { readAdminSession } from "../../../../lib/auth/session";
import { ADMIN_LOGIN_PATH } from "../../../../lib/constants";
import { getNavBadges, getSyncStatus } from "../../../../lib/queries/dashboard";

/**
 * The control-room shell (§7.3, §7.5): 240px navy sidebar, `--surface-50` content area,
 * 13px base type at line-height 1.4.
 *
 * It is a route GROUP, `(shell)`, rather than a layout on `admin/` itself, because the login
 * screen is also under `/admin` and must render without chrome — it has no role to build a
 * sidebar from, and a half-signed-in user must not see the six surfaces named.
 *
 * The guard still belongs to `middleware.ts`. What happens here is the AUTHENTICATION half
 * of it repeated — signed in, provisioned, active, past 2FA — for two reasons: the layout
 * needs the ROLE to filter the nav, and a layout that trusts the middleware to have run is
 * one misconfigured matcher away from serving the shell to a signed-out visitor. The
 * redirect below is unreachable in normal operation and is meant to stay that way.
 *
 * AUTHORISATION by surface is not repeated here, because a layout cannot see the pathname.
 * `resolveAdminAccess` makes that call in the middleware, off the same `canViewSurface` the
 * sidebar filters with, so a role that loses a nav item loses the route in the same commit.
 */
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readAdminSession();

  if (session.type !== "staff" || !session.account.isActive) {
    redirect(ADMIN_LOGIN_PATH);
  }
  if (resolveLoginStep(session) !== "complete") {
    redirect(ADMIN_LOGIN_PATH);
  }

  const [badges, syncStatus] = await Promise.all([getNavBadges(), getSyncStatus()]);

  return (
    <div className="flex min-h-screen bg-surface-50 font-ui text-fs-body leading-[1.4] text-ink-900">
      <Sidebar role={session.account.role} badges={badges} syncStatus={syncStatus} />
      <main className="min-w-0 flex-1 p-sp-6">{children}</main>
    </div>
  );
}
