import type { Metadata } from "next";
import { HealthStrip } from "../../../../components/admin/health-strip";
import { QueueZone } from "../../../../components/admin/queue-zone";
import { getDashboardData } from "../../../../lib/queries/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Surface 1 — the Dashboard (§8.10), zones 1 and 2 only.
 *
 * The screen's job is two questions in a fixed order: what needs a human right now, and is
 * what we published working. Zones 3 and 4 answer the second and are not built — there is no
 * traffic data to answer it with, and an engagement zone drawn against an empty analytics
 * table would be the vanity mirror §8.10 opens by warning about.
 *
 * Every figure below comes from `lib/queries/dashboard.ts`. This page composes; it does not
 * compute, and it does not know how to invent a number.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { queueCards, readouts } = await getDashboardData();

  return (
    <div className="flex flex-col gap-sp-6">
      <h1 className="text-fs-h4 font-bold text-navy-deep">Dashboard</h1>
      <QueueZone cards={queueCards} />
      <HealthStrip readouts={readouts} />
    </div>
  );
}
