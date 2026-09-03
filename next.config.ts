import type { NextConfig } from "next";

/**
 * In a Codespace the port is reachable two ways, and Next's Server Action CSRF check has to
 * be told about both. The check compares the `origin` header the browser sent against the
 * host the request arrived on (`x-forwarded-host`), and aborts the POST with "Invalid Server
 * Actions request." before the action body runs when they differ.
 *
 * Opening the forwarded URL directly makes both values `<codespace>-<port>.app.github.dev`,
 * so the check passes on its own. Opening the same port through the editor's local forward
 * makes the browser send `origin: localhost:<port>` while the tunnel still sets
 * `x-forwarded-host: <codespace>-<port>.app.github.dev` — a mismatch, and the path that
 * actually needs naming here. `allowedOrigins` is matched against the ORIGIN host, so both
 * spellings of the origin belong in the list.
 *
 * Derived, never hard-coded: the Codespace name changes per developer and per rebuild. The
 * list is empty everywhere else, which is the same decision the check makes today with no
 * `allowedOrigins` at all — production keeps the strict check.
 */
const port = process.env.PORT ?? "3000";

const codespaceOrigins =
  process.env.CODESPACES === "true" && process.env.CODESPACE_NAME
    ? [
        `${process.env.CODESPACE_NAME}-${port}.` +
          `${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
        `localhost:${port}`,
      ]
    : [];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: codespaceOrigins },
  },
};

export default nextConfig;
