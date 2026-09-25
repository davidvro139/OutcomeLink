<<<<<<< HEAD
/**
 * One smoke flow proving the critical path actually works end to end:
 * log in, create a student, and view the CPL dashboard. Not a substitute
 * for the Jest integration tests (server/) or the classifier's unit tests —
 * this is here to catch the kind of wiring break (a route that 404s, a
 * provider that's missing) that only shows up when the whole app runs
 * together in a real browser.
 *
 * Assumes the dev server (`npm run dev:server` / `npm run dev:client`) is
 * running against a database with at least one reporting period already
 * created — true after the manual verification done while building stages
 * 4-6, and will be true unconditionally once stage 8's demo-data seeder
 * lands.
 */
describe("smoke: login -> create student -> view CPL dashboard", () => {
  it("logs in, creates a student, and views the CPL dashboard", () => {
    const uniqueId = `CY-${Date.now()}`;

    cy.visit("/login");
    cy.contains("Demo login").click();
    cy.url().should("eq", `${Cypress.config().baseUrl}/`);
    cy.contains("Welcome,").should("be.visible");

    cy.contains("Students").click();
    cy.url().should("include", "/students");
    cy.contains("New Student").click();

    cy.get('label:contains("Internal Student ID") + div input').type(uniqueId);
    cy.get('label:contains("First name") + div input').type("Cypress");
    cy.get('label:contains("Last name") + div input').type("Smoketest");
    cy.contains("button", "Create").click();

    cy.contains(uniqueId).should("be.visible");

    cy.contains("Accreditation").click();
    cy.url().should("include", "/accreditation/reporting-periods");
    cy.get("table tbody tr").first().find("a").click();

    cy.contains("CPL Dashboard").should("be.visible");
=======
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
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    cy.get("table").should("be.visible");
  });
});
