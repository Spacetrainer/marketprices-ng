"use client";

import { useState, type ReactNode } from "react";
import { SECTIONS } from "../../lib/constants";
import { Container } from "../primitives/container";

export interface NavProps {
  /** Wordmark / brand slot — left unstyled here, this component doesn't invent brand type. */
  logo?: ReactNode;
}

// §4.8: 72px --navy-brand, logo left, seven links at 36px spacing (28px between 1200-1439,
// per §11.2 — below 1200 the nav is already collapsed to hamburger, so only these two values
// matter), amber dot marking Prices, search icon right, hamburger below 992px, sticky.
//
// 992/1200/1440 and the 36px/28px spacing values have no matching tokens in tokens.css (no
// --breakpoint-* or matching --sp-* entries) — used as literal arbitrary values straight from
// spec text, same precedent as FilterPill's 34px. Logged in docs/exceptions.md.
export function Nav({ logo }: NavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-[72px] bg-navy-brand">
      <Container className="flex h-full items-center justify-between">
        <div className="text-fs-h4 font-bold text-on-dark">{logo}</div>

        <nav
          aria-label="Sections"
          className="hidden min-[992px]:flex min-[992px]:items-center min-[992px]:gap-[28px] min-[1440px]:gap-[36px]"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.slug}
              href={`/${section.slug}`}
              className="inline-flex items-center gap-sp-1 text-fs-nav font-medium text-on-dark"
            >
              {section.slug === "prices" ? (
                <span aria-hidden="true" className="h-sp-2 w-sp-2 rounded-r-pill bg-amber-action" />
              ) : null}
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-sp-4">
          <button type="button" aria-label="Search" className="hidden min-[992px]:inline-flex">
            <SearchIcon />
          </button>

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={isOpen}
            className="inline-flex min-[992px]:hidden"
            onClick={() => setIsOpen((open) => !open)}
          >
            <HamburgerIcon />
          </button>
        </div>
      </Container>

      {isOpen ? (
        <nav
          aria-label="Sections"
          className="min-[992px]:hidden bg-navy-brand px-[var(--gutter)] pb-sp-4"
        >
          <ul className="flex flex-col gap-sp-3">
            {SECTIONS.map((section) => (
              <li key={section.slug}>
                <a
                  href={`/${section.slug}`}
                  className="inline-flex items-center gap-sp-1 text-fs-nav font-medium text-on-dark"
                >
                  {section.slug === "prices" ? (
                    <span aria-hidden="true" className="h-sp-2 w-sp-2 rounded-r-pill bg-amber-action" />
                  ) : null}
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-on-dark">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-on-dark">
      <line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
