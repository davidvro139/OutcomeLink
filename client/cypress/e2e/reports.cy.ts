import { ACCOUNTS } from "../support/e2e";

/**
 * The Report Builder: pick what to report on and which columns, run it, and
 * get results with an export available — including for the read-only auditor,
 * who may run and export reports but not save them.
 */
describe("report builder", () => {
  function runFirstNameReport() {
    cy.nav().contains("a", "Report Builder").click();
    cy.contains("h2", "Report Builder").should("be.visible");
    cy.contains("label", "First Name").click();
    cy.contains("button", "Run Report").should("not.be.disabled").click();
    cy.contains("Results (").should("be.visible");
    cy.get("table").should("be.visible");
  }

  it("runs a report and offers an export", () => {
    cy.loginAs(ACCOUNTS.institutionalAdmin);
    runFirstNameReport();
    cy.contains("button", "Export to Excel").should("not.be.disabled");
    cy.contains("button", "Save Report").should("be.visible");
  });

  it("lets a read-only auditor run and export, but not save", () => {
    cy.loginAs(ACCOUNTS.auditor);
    runFirstNameReport();
    cy.contains("button", "Export to Excel").should("not.be.disabled");
    cy.contains("button", "Save Report").should("not.exist");
  });

  it("does not offer Run until a column is chosen", () => {
    cy.loginAs(ACCOUNTS.institutionalAdmin);
    cy.nav().contains("a", "Report Builder").click();
    cy.contains("button", "Run Report").should("be.disabled");
  });
});
