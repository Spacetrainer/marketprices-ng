import type { SyncStatus } from "../../lib/queries/dashboard";

export interface SyncBlockProps {
  status: SyncStatus;
}

/**
 * The sidebar's bottom status block (§7.5): the last sync time with a small pulsing amber
 * dot, and the next price sync beneath it.
 *
 * "Next price sync" renders only when there is one. No cron job is registered in this repo,
 * so there is no next run to state, and printing the spec's illustrative "06:00" would be
 * exactly the copied example value P0.2 forbids. The line is absent, not zeroed.
 *
 * The dot's pulse is Tailwind's own `animate-pulse`; tokens.css's global reduced-motion rule
 * already freezes it, and `motion-reduce:animate-none` states the same thing locally.
 */
export function SyncBlock({ status }: SyncBlockProps) {
  return (
    <div className="flex flex-col gap-sp-1 border-t border-t-navy-brand px-sp-4 py-sp-4">
      <p className="flex items-center gap-sp-2 text-fs-meta text-on-dark-muted">
        <span
          aria-hidden="true"
          className="h-sp-2 w-sp-2 shrink-0 rounded-r-pill bg-amber-action animate-pulse motion-reduce:animate-none"
        />
        {status.lastSync}
      </p>
      {status.nextPriceSync ? (
        <p className="pl-sp-4 text-fs-meta text-sidebar-inactive">
          {status.nextPriceSync}
        </p>
      ) : null}
    </div>
  );
}
