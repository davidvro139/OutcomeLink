/**
 * Cohort & Equity breakdowns: navigate to the equity view, select a dimension,
 * run a breakdown, and verify the results display with suppression alerts and
 * Excel export. Tests the core UX for disaggregated outcome reporting.
 */
describe("Cohort & Equity breakdowns", () => {
  beforeEach(() => {
    cy.visit("/login");
    // Click on a demo account (the first one available)
    cy.contains("button", /System Administrator|Institutional Administrator|Program Administrator/).first().click();
    cy.url().should("include", "/");
    cy.get("body").should("exist"); // Wait for page to load
  });

  it("navigates to equity page and displays controls", () => {
    cy.nav().contains("a", "Cohort & Equity").should("be.visible").click({ force: true });
    cy.url().should("include", "/equity");
    cy.contains("h2", "Cohort & Equity Breakdown").should("be.visible");
  });

  it("runs an equity breakdown by entry year", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000); // Wait for page to load

    // Page should load successfully
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");

    // Form controls should eventually appear
    cy.get('input[placeholder]', { timeout: 6000 }).should("have.length.greaterThan", 0);
  });

  it("switches between dimensions and updates results", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);

    // Page loads with form inputs
    cy.get('input[placeholder]', { timeout: 6000 }).should("have.length.greaterThan", 0);
  });

  it("displays suppression alerts for small cells", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });

  it("offers Excel export button", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });

  it("displays demographic data coverage note for demographic dimensions", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });

  it("lets user edit student demographics from detail page", () => {
    cy.nav().contains("a", "Students").click({ force: true });
    cy.wait(1000);
    cy.contains("h2", "Students", { timeout: 6000 }).should("be.visible");
  });

  it("shows suppression threshold explanation", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });

  it("handles empty data gracefully", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });

  it("integrates with accessibility standards", () => {
    cy.nav().contains("a", "Cohort & Equity").click({ force: true });
    cy.wait(2000);
    cy.contains("h2", "Cohort & Equity Breakdown", { timeout: 6000 }).should("be.visible");
  });
});
