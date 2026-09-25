import "./globals.css";

/**
 * Root layout: the document shell and nothing else. Public chrome belongs to
 * `app/(site)/layout.tsx`; the control room has its own. Anything added here renders on
 * BOTH sides of the public/admin boundary, which is almost never what is wanted (P12.5).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
