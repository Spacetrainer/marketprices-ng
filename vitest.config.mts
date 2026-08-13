import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// tsconfig.json sets "jsx": "preserve" for Next.js's own SWC compiler. The Vite/Rolldown
// pipeline vitest 4 pulls in doesn't reliably transform JSX in SSR-mode test files without
// this plugin — confirmed by testing the esbuild-only config first (it wasn't enough).
export default defineConfig({
  plugins: [react()],
  test: {
    // tests/e2e is Playwright's — its .spec.ts files use @playwright/test's own test()
    // and must not be picked up by Vitest's default glob.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
