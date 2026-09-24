import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    // Tall enough that the whole sidebar is on screen (Cypress will not click an element scrolled out of view inside it).
    viewportWidth: 1400,
    viewportHeight: 1200,
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
  },
});
