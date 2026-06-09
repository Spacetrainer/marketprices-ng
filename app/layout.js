import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "./Nav";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "MarketPrices.ng",
  description: "Live food and commodity prices across Lagos markets",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Nav />{children}</body>
    </html>
  );
}
