import { Footer } from "../../components/layout/footer";
import { Nav } from "../../components/layout/nav";
import { PriceTicker } from "../../components/layout/price-ticker";
import { UtilityBar } from "../../components/layout/utility-bar";

/**
 * Public chrome. It lives here, not in the root layout, so that `app/(admin)/` inherits none
 * of it — the control room must not render the public navigation, and the public navigation
 * must not render around the control room (P12.5).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UtilityBar />
      <Nav />
      <PriceTicker items={[]} />
      {children}
      <Footer />
    </>
  );
}
