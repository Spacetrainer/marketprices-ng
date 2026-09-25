import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueCard } from "./queue-card";
import type { QueueCard as QueueCardData } from "../../lib/queries/dashboard";

function card(overrides: Partial<QueueCardData> = {}): QueueCardData {
  return {
    id: "hot-signals",
    label: "Hot signals unactioned",
    href: "/admin/signals",
    timeSensitive: true,
    measure: { state: "known", value: 0 },
    ...overrides,
  };
}

describe("QueueCard", () => {
  it("draws the 3px amber left border when the count is non-zero and time-sensitive", () => {
    const html = renderToStaticMarkup(
      <QueueCard card={card({ measure: { state: "known", value: 4 } })} />,
    );
    expect(html).toContain("border-l-amber-action");
  });

  it("does not draw it at a measured zero", () => {
    const html = renderToStaticMarkup(<QueueCard card={card()} />);
    expect(html).not.toContain("border-l-amber-action");
  });

  it("does not draw it on a non-time-sensitive card, however large the count", () => {
    const html = renderToStaticMarkup(
      <QueueCard
        card={card({
          id: "ready",
          timeSensitive: false,
          measure: { state: "known", value: 99 },
        })}
      />,
    );
    expect(html).not.toContain("border-l-amber-action");
  });

  it("renders a measured zero as the digit 0", () => {
    const html = renderToStaticMarkup(<QueueCard card={card()} />);
    expect(html).toContain(">0<");
    expect(html).toContain('data-measure="known"');
  });

  it("renders an unmeasured card as words, never as a zero", () => {
    const html = renderToStaticMarkup(
      <QueueCard
        card={card({
          id: "dispatch-failures",
          label: "Dispatch failures",
          measure: {
            state: "unavailable",
            label: "Not connected yet",
            note: "The dispatch queue lives outside this database.",
          },
        })}
      />,
    );

    expect(html).toContain("Not connected yet");
    expect(html).toContain("The dispatch queue lives outside this database.");
    expect(html).not.toContain(">0<");
    expect(html).toContain('data-measure="unavailable"');
  });

  it("gives the unmeasured value the figure's emphasis and its name the caption's", () => {
    // The card's hierarchy, asserted as markup so a refactor cannot quietly swap the two
    // back. The rendered proof is in tests/e2e/dashboard-queue-card.spec.ts, which compares
    // the computed weight and colour in a browser — this is the cheap guard next to it.
    const html = renderToStaticMarkup(
      <QueueCard
        card={card({
          id: "dispatch-failures",
          label: "Dispatch failures",
          measure: {
            state: "unavailable",
            label: "Not connected yet",
            note: "The dispatch queue lives outside this database.",
          },
        })}
      />,
    );

    const value = html.slice(html.indexOf("<span class"), html.indexOf("Not connected yet"));
    expect(value).toContain("font-bold");
    expect(value).toContain("text-navy-deep");
    // The caption colour on the value line is what inverted the card.
    expect(value).not.toContain("text-ink-500");

    const label = html.slice(0, html.indexOf("Dispatch failures"));
    const labelClass = label.slice(label.lastIndexOf("<span class"));
    expect(labelClass).toContain("font-medium");
    expect(labelClass).toContain("text-ink-900");
    expect(labelClass).not.toContain("font-bold");
  });

  it("uses that same caption styling for a measured card's name", () => {
    const html = renderToStaticMarkup(<QueueCard card={card()} />);
    const label = html.slice(0, html.indexOf("Hot signals unactioned"));
    const labelClass = label.slice(label.lastIndexOf("<span class"));
    expect(labelClass).toContain("text-fs-body");
    expect(labelClass).toContain("font-medium");
    expect(labelClass).toContain("text-ink-900");
  });

  it("never draws the urgency border on an unmeasured card — there is no number to be urgent", () => {
    const html = renderToStaticMarkup(
      <QueueCard
        card={card({
          measure: { state: "unavailable", label: "Unavailable", note: "why" },
        })}
      />,
    );
    expect(html).not.toContain("border-l-amber-action");
  });

  it("makes the whole card the link to its filtered screen", () => {
    const html = renderToStaticMarkup(<QueueCard card={card()} />);
    expect(html).toContain('href="/admin/signals"');
  });
});
