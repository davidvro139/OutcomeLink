import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // @outcomelink/shared is CommonJS (kept that way so the server's Jest setup
  // stays simple) and linked in via the npm workspace, so Vite's dev server
  // would otherwise serve its dist file as native ESM without going through
  // esbuild's CJS-interop pre-bundling, breaking named imports (e.g.
  // "does not provide an export named 'ROLE_LABELS'"). Forcing it through
  // optimizeDeps fixes that.
  optimizeDeps: {
    include: ["@outcomelink/shared"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
