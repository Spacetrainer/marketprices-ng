/**
 * Renders the REAL QueueZone to static markup and prints it to stdout.
 *
 * It runs as a subprocess rather than as an import inside the spec because Playwright's
 * transform compiles JSX with its own component-test factory, which cannot be handed to
 * react-dom/server. Rendering out of process keeps the layout test measuring the actual
 * component instead of a copy of its markup that would silently go stale.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueZone } from "../../../components/admin/queue-zone";
import type { QueueCard } from "../../../lib/queries/dashboard";

const cards: QueueCard[] = [
  { id: "ready", label: "Ready to schedule", href: "/admin/studio?status=ready", timeSensitive: false, measure: { state: "known", value: 0 } },
  { id: "needs-work", label: "Needs work", href: "/admin/studio?status=needs_work", timeSensitive: false, measure: { state: "known", value: 0 } },
  { id: "going-out-today", label: "Going out today", href: "/admin/queue?view=day", timeSensitive: true, measure: { state: "known", value: 0 } },
  // The state this test exists for: a short label plus an explanation, in a box sized for a
  // digit. The strings match what getQueueCards() returns for this card today.
  { id: "dispatch-failures", label: "Dispatch failures", href: "/admin/queue?status=failed", timeSensitive: true, measure: { state: "unavailable", label: "Not connected yet", note: "The dispatch queue lives outside this database." } },
  { id: "hot-signals", label: "Hot signals unactioned", href: "/admin/signals", timeSensitive: true, measure: { state: "known", value: 0 } },
  // The longest label of the six — the one most likely to wrap and push a card over.
  { id: "critical-anomalies", label: "Critical anomalies unactioned", href: "/admin/radar", timeSensitive: true, measure: { state: "known", value: 0 } },
];

process.stdout.write(renderToStaticMarkup(createElement(QueueZone, { cards })));
