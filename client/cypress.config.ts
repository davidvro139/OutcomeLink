import { writeFileSync } from "node:fs";
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    // Tall enough that the whole sidebar is on screen (Cypress will not click an element scrolled out of view inside it).
    viewportWidth: 1400,
    viewportHeight: 1200,
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents(on) {
      on("task", {
        /** Prints accessibility violations to the terminal (cy.log is invisible in headless runs). */
        log(message: string) {
          console.log(message);
          return null;
        },
        /** Dumps a JSON file — used to collect a full accessibility audit in one pass. */
        writeJson({ file, data }: { file: string; data: unknown }) {
          writeFileSync(file, JSON.stringify(data, null, 2));
          return null;
        },
      });
    },
  },
});
