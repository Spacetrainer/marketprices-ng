import { SECTIONS } from "../../lib/constants";
import { Container } from "../primitives/container";

// §3.2 row 14: --navy-brand, "Logo, links, pills, legal, admin link". No dedicated spec
// section exists; built as frame only. Social handle pills are left out entirely rather than
// invented (P0.1) — there are no real handles yet. The Admin link is the single, quiet,
// public entry point into the control room (P12.5) and appears nowhere else in this file or
// anywhere else in public chrome.
export function Footer() {
  return (
    <footer className="bg-navy-brand">
      <Container className="flex flex-col gap-sp-8 py-sp-12">
        <nav aria-label="Sections">
          <ul className="flex flex-wrap gap-sp-6">
            {SECTIONS.map((section) => (
              <li key={section.slug}>
                <a href={`/${section.slug}`} className="text-fs-body text-on-dark-muted">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Legal row: the single, quiet Admin entry (P12.5). No copyright/legal copy invented
            here yet — that's real content this stage doesn't own. */}
        <div className="flex items-center justify-end border-t border-on-dark-muted pt-sp-6 text-fs-meta">
          <a href="/admin/login" className="text-on-dark-muted">
            Admin
          </a>
        </div>
      </Container>
    </footer>
  );
}
