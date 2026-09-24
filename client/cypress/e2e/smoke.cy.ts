import { ACCOUNTS } from "../support/e2e";

/**
 * One smoke flow proving the critical path works end to end: sign in through
 * the real form, create a student, open a reporting period and view the CPL
 * dashboard. Catches the kind of wiring break (a route that 404s, a provider
 * that's missing) that only shows up when the whole app runs together in a
 * real browser — not a substitute for the Jest and Vitest suites.
 */
describe("smoke: sign in -> create student -> view CPL dashboard", () => {
  it("signs in, creates a student, and views the CPL dashboard", () => {
    const uniqueId = `CY-${Date.now()}`;

    cy.loginAs(ACCOUNTS.institutionalAdmin);

    cy.nav().contains("a", "Students").click();
    cy.url().should("include", "/students");
    cy.contains("button", "New Student").click();

    cy.field("Internal Student ID").type(uniqueId);
    cy.field("First name").type("Cypress");
    cy.field("Last name").type("Smoketest");
    cy.contains("button", "Create").click();
    // (The new student may not be on the first page of the list, so check the confirmation instead.)
    cy.contains("Student created").should("be.visible");

    cy.nav().contains("a", "Accreditation").click();
    cy.url().should("include", "/accreditation/reporting-periods");
    cy.contains("h2", "Reporting Periods").should("be.visible");
    cy.get("table tbody tr").first().find("a").click();

    // A period opens on its Close-out checklist; the CPL results are one tab over.
    cy.contains("Close-out steps").should("be.visible");
    cy.contains('[role="tab"]', "CPL Dashboard").click();
    cy.get("table").should("be.visible");
  });
});
