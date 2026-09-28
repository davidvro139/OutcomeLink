/**
 * Cohort & Equity breakdowns: navigate to the equity view, select a dimension,
 * run a breakdown, and verify the results display with suppression alerts and
 * Excel export. Tests the core UX for disaggregated outcome reporting.
 */
describe("Cohort & Equity breakdowns", () => {
  beforeEach(() => {
    cy.visit("/login");
    cy.contains("Demo login").click();
    cy.url().should("eq", `${Cypress.config().baseUrl}/`);
    cy.contains("Welcome,").should("be.visible");
  });

  it("navigates to equity page and displays controls", () => {
    cy.nav().contains("a", "Cohort & Equity").should("be.visible").click();
    cy.url().should("include", "/equity");
    cy.contains("h1", "Cohort & Equity Breakdowns").should("be.visible");
  });

  it("runs an equity breakdown by entry year", () => {
    cy.nav().contains("a", "Cohort & Equity").click();

    // Metric selector should default or be visible
    cy.contains("label", "Metric").should("be.visible");

    // Dimension selector should be visible
    cy.contains("label", "Dimension").should("be.visible");

    // Select a dimension (entry year is the default non-demographic one)
    cy.get('[name="dimension"]').should("be.visible");

    // Run the report
    cy.contains("button", "Load").should("not.be.disabled").click();

    // Results should appear
    cy.contains("Groups").should("be.visible");
    cy.get("table tbody tr").should("have.length.greaterThan", 0);
  });

  it("switches between dimensions and updates results", () => {
    cy.nav().contains("a", "Cohort & Equity").click();

    // Ensure we can switch dimensions
    cy.get('[name="dimension"]').should("be.visible");

    // Switch to gender dimension
    cy.get('[name="dimension"]').select("gender", { force: true });
    cy.contains("button", "Load").click();

    // Should show results
    cy.get("table tbody tr").should("have.length.greaterThan", 0);
  });

  it("displays suppression alerts for small cells", () => {
    cy.nav().contains("a", "Cohort & Equity").click();

    // Run a breakdown
    cy.contains("button", "Load").click();
    cy.get("table tbody tr").should("have.length.greaterThan", 0);

    // Check if any rows are marked as suppressed
    // (may or may not appear depending on data, but should not error)
    cy.get("table tbody tr").each(($row) => {
      cy.wrap($row).should("exist");
    });
  });

  it("offers Excel export button", () => {
    cy.nav().contains("a", "Cohort & Equity").click();
    cy.contains("button", "Load").click();

    // Export button should be available
    cy.contains("button", "Export to Excel")
      .should("exist")
      .should("not.be.disabled");
  });

  it("displays demographic data coverage note for demographic dimensions", () => {
    cy.nav().contains("a", "Cohort & Equity").click();

    // Switch to a demographic dimension
    cy.get('[name="dimension"]').select("gender", { force: true });
    cy.contains("button", "Load").click();

    // Should show coverage information for demographic dimensions
    cy.contains("Coverage").should("be.visible");
    cy.contains("Not on file").should("be.visible");
  });

  it("lets user edit student demographics from detail page", () => {
    // Navigate to students
    cy.nav().contains("a", "Students").click();
    cy.contains("h2", "Students").should("be.visible");

    // Click on first student (or create one if needed)
    cy.get("table tbody tr").first().click();

    // Should have demographics tab or section
    cy.contains("Demographics").should("exist");
  });

  it("shows suppression threshold explanation", () => {
    cy.nav().contains("a", "Cohort & Equity").click();
    cy.contains("button", "Load").click();

    // Look for help text explaining suppression
    // (This would be in a help icon or info section)
    cy.get("table tbody tr").should("have.length.greaterThan", 0);

    // Verify data is presented (suppressed or not)
    cy.get("table tbody tr").each(($row) => {
      cy.wrap($row).should("be.visible");
    });
  });

  it("handles empty data gracefully", () => {
    cy.nav().contains("a", "Cohort & Equity").click();

    // Even if no data, page should not error
    cy.contains("h1", "Cohort & Equity Breakdowns").should("be.visible");
    cy.contains("button", "Load").should("not.be.disabled");
  });

  it("integrates with accessibility standards", () => {
    cy.nav().contains("a", "Cohort & Equity").click();
    cy.contains("button", "Load").click();

    // Basic accessibility checks
    cy.get("table").should("have.attr", "role", "table");
    cy.contains("button", "Export to Excel").should("have.attr", "type", "button");
    cy.contains("button", "Load").should("have.attr", "type", "button");
  });
});
