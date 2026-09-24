import { ACCOUNTS } from "../support/e2e";

/**
 * The bulk-import wizard, as far as its first step: upload a CSV and land on
 * the column-mapping screen. Stops before committing anything so the demo
 * data is left alone; the validate/commit rules are covered by the server's
 * integration tests.
 */
describe("bulk import wizard", () => {
  it("uploads a CSV and reaches the column-mapping step", () => {
    const csv = [
      "Student ID,First,Last,Email",
      "CYIMP-1,Ada,Lovelace,ada@example.edu",
      "CYIMP-2,Grace,Hopper,grace@example.edu",
    ].join("\n");

    cy.loginAs(ACCOUNTS.institutionalAdmin);
    cy.nav().contains("a", "Bulk Import").click();
    cy.contains("button", "New Import").click();

    cy.field("Source system").type("Cypress SIS");
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from(csv),
        fileName: `cypress-${Date.now()}.csv`,
        mimeType: "text/csv",
      },
      { force: true },
    );
    cy.contains("button", "Upload").should("not.be.disabled").click();

    cy.url().should("match", /\/imports\/\d+$/);
    cy.contains("Map Columns").should("be.visible");
    cy.contains("Student ID").should("be.visible"); // the file's own headers are offered for mapping
  });

  it("is not offered to roles that can't import", () => {
    cy.loginAs(ACCOUNTS.careerServices);
    cy.nav().should("not.contain", "Bulk Import");
    cy.visit("/imports");
    cy.contains("button", "New Import").should("not.exist");
  });
});
