/// <reference types="cypress" />

// Shared helpers for the end-to-end specs. They assume the demo data from
// `npm run prisma:seed` (every seeded account shares one password) and a
// running API + web app — see docs in README.md ("Checks").

const DEMO_PASSWORD = "password123";

/** The seeded staff accounts, one per role. */
export const ACCOUNTS = {
  systemAdmin: "sam@mwtc.edu",
  institutionalAdmin: "ada@mwtc.edu",
  programAdmin: "priya.patel@mwtc.edu",
  careerServices: "jordan.blake@mwtc.edu",
  instructor: "terry.osei@mwtc.edu",
  auditor: "quinn.alvarado@mwtc.edu",
} as const;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Signs in through the real login form (cached per account for the run), then opens the home page. */
      loginAs(email: string): Chainable<void>;
      /** The input belonging to a Mantine-labelled field. */
      field(label: string): Chainable<JQuery<HTMLElement>>;
      /** The left-hand navigation. */
      nav(): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("field", (label: string) =>
  cy
    .contains("label", label)
    .invoke("attr", "for")
    .then((id) => cy.get(`#${id}`)),
);

Cypress.Commands.add("nav", () => cy.get("nav"));

Cypress.Commands.add("loginAs", (email: string) => {
  cy.session(
    email,
    () => {
      cy.visit("/login");
      cy.field("Email").type(email);
      cy.field("Password").type(DEMO_PASSWORD, { log: false });
      cy.contains("button", "Sign in").click();
      cy.contains("Welcome,").should("be.visible");
    },
    { cacheAcrossSpecs: true },
  );
  cy.visit("/");
  cy.contains("Welcome,").should("be.visible");
});
