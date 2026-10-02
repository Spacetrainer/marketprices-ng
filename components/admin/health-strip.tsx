import type { Readout } from "../../lib/queries/dashboard";
import { HealthReadout } from "./health-readout";

export interface HealthStripProps {
  readouts: readonly Readout[];
}

/**
 * Zone 2 — engine health (§8.10). One horizontal strip, six readouts, NO charts. The chart
 * ban is the point: this zone is read in a glance on the way past, and a sparkline here would
 * invite the reading Zone 3 is for.
 */
export function HealthStrip({ readouts }: HealthStripProps) {
  return (
    <section
      aria-labelledby="health-strip-heading"
      className="rounded-r-card border border-line-200 bg-surface-0 p-sp-4 shadow-rest"
    >
      <h2 id="health-strip-heading" className="sr-only">
        Engine health
      </h2>
      <div className="grid grid-cols-1 gap-sp-4 min-[768px]:grid-cols-3 min-[1200px]:grid-cols-6">
        {readouts.map((readout) => (
          <HealthReadout key={readout.id} readout={readout} />
        ))}
      </div>
    </section>
  );
}
