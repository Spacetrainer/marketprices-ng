import "./globals.css";
import { Footer } from "../components/layout/footer";
import { Nav } from "../components/layout/nav";
import { PriceTicker } from "../components/layout/price-ticker";
import { UtilityBar } from "../components/layout/utility-bar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UtilityBar />
        <Nav />
        <PriceTicker items={[]} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
