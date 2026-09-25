import { ACCOUNTS } from "../support/e2e";

describe("Help", () => {
  it("is reachable from the menu, and search lands on the matching section", () => {
    cy.loginAs(ACCOUNTS.systemAdmin);
    cy.nav().contains("a", "Help").click();
    cy.contains("h1", "Help").should("be.visible");
    cy.contains("h2", "About OutcomeLink").should("be.visible");

    cy.get('input[type="search"]').type("finalize");
    cy.get('[role="status"]').should("contain.text", "for “finalize”");
    cy.get('ul[aria-label="Search results"] a').first().click();
    cy.url().should("include", "/help/");
    cy.get("article").should("be.visible");
  });

  it("opens a guide from the context link on a page", () => {
    cy.loginAs(ACCOUNTS.systemAdmin);
    cy.visit("/my-programs");
    cy.contains("a", "Help with this page").click();
    cy.url().should("include", "/help/program-health");
    cy.contains("h2", "Program health and benchmarks").should("be.visible");
  });

  it("shows About and Security before signing in, linked from the sign-in page", () => {
    cy.visit("/login");
    cy.contains("a", "About OutcomeLink and how your data is protected").click();
    cy.url().should("include", "/about");
    cy.contains("h1", "About OutcomeLink").should("be.visible");
    cy.contains("h2", "Security").should("be.visible");
    cy.contains("Known limits").should("exist");
    cy.contains("a", "Back to sign in").click();
    cy.url().should("include", "/login");
  });
});
