import { Container } from "../primitives/container";

// §3.2 row 1: white band, "Social + search". No dedicated spec section exists for this band's
// internals, and there's nothing real yet to wire a search input or social icons to — so this
// stays a structural shell (frame only, no placeholder content) until Stage 12.
export function UtilityBar() {
  return (
    <div className="border-b border-line-200 bg-surface-0">
      <Container className="flex h-sp-8 items-center justify-end" />
    </div>
  );
}
