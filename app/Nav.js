"use client";

import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/prices", label: "Prices" },
    { href: "/food-and-drinks", label: "Food & Drinks" },
    { href: "/experience", label: "Experience" },
    { href: "/learn", label: "Learn" },
    { href: "/videos", label: "Videos" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold text-gray-900 no-underline">
          MarketPrices
        </Link>

        <div className="hidden md:flex items-center gap-x-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-700 no-underline hover:text-green-700"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="text-sm font-medium text-green-700 no-underline hover:text-green-800"
          >
            Account
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="md:hidden inline-flex items-center justify-center p-2 text-gray-700 hover:text-green-700"
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M3 12h18M3 6h18M3 18h18" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-6 py-3 flex flex-col gap-y-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-gray-700 no-underline hover:text-green-700"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-green-700 no-underline hover:text-green-800"
            >
              Account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}