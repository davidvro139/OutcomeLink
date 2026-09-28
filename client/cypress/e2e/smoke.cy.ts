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
    cy.get("table").should("be.visible");
  });
});
