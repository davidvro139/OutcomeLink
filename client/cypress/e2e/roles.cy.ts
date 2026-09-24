import { ACCOUNTS } from "../support/e2e";

/**
 * Role-based visibility: the controls and links a role can't use are hidden,
 * not just rejected by the server when clicked. The rules live in one place
 * (`@outcomelink/shared` role sets, used by both the API's guards and the
 * client's `usePermissions`) — these specs check what a person actually sees.
 */
describe("role-based visibility", () => {
  describe("System Administrator", () => {
    beforeEach(() => cy.loginAs(ACCOUNTS.systemAdmin));

    it("sees the administration links and the write controls", () => {
      cy.nav().within(() => {
        cy.contains("a", "Bulk Import").should("be.visible");
        cy.contains("a", "Users").should("be.visible");
        cy.contains("a", "Job History").should("be.visible");
        cy.contains("a", "Settings").should("be.visible");
      });
      cy.nav().contains("a", "Students").click();
      cy.contains("button", "New Student").should("be.visible");
    });

    it("can open Settings and see the Email, Data retention and Backups tabs", () => {
      cy.nav().contains("a", "Settings").click();
      cy.contains("h2", "Settings").should("be.visible");
      cy.contains('[role="tab"]', "Email").should("be.visible");
      cy.contains('[role="tab"]', "Data retention").should("be.visible");
      cy.contains('[role="tab"]', "Backups").should("be.visible");
    });
  });

  describe("Read-Only Auditor", () => {
    beforeEach(() => cy.loginAs(ACCOUNTS.auditor));

    it("has no administration links", () => {
      cy.nav().within(() => {
        cy.contains("a", "Students").should("be.visible");
        cy.contains("a", "Users").should("not.exist");
        cy.contains("a", "Settings").should("not.exist");
        cy.contains("a", "Job History").should("not.exist");
        cy.contains("a", "Bulk Import").should("not.exist");
      });
    });

    it("sees the student list without the New Student button", () => {
      cy.nav().contains("a", "Students").click();
      cy.get("table tbody tr").should("have.length.greaterThan", 0);
      cy.contains("button", "New Student").should("not.exist");
    });

    it("can read My Programs but not refresh its results", () => {
      cy.nav().contains("a", "My Programs").click();
      cy.contains("h2", "My Programs").should("be.visible");
      cy.contains("Results computed").should("be.visible");
      cy.contains("button", "Recompute now").should("not.exist");
    });
  });

  describe("Career Services staff", () => {
    beforeEach(() => cy.loginAs(ACCOUNTS.careerServices));

    it("can add employers but not students", () => {
      cy.nav().contains("a", "Employers").click();
      cy.contains("button", "New Employer").should("be.visible");
      cy.nav().contains("a", "Students").click();
      cy.get("table tbody tr").should("have.length.greaterThan", 0);
      cy.contains("button", "New Student").should("not.exist");
    });
  });

  describe("Program Administrator", () => {
    beforeEach(() => cy.loginAs(ACCOUNTS.programAdmin));

    it("sees only their programs, and can refresh the results", () => {
      cy.nav().contains("a", "My Programs").click();
      cy.contains("h2", "My Programs").should("be.visible");
      cy.contains("button", "Recompute now").should("be.visible");
      cy.contains("Needs attention").should("be.visible");
    });

    it("cannot see the administration links", () => {
      cy.nav().within(() => {
        cy.contains("a", "Users").should("not.exist");
        cy.contains("a", "Settings").should("not.exist");
      });
    });
  });

  describe("access to admin pages by URL", () => {
    it("shows a plain message, not the page, to a role that can't use it", () => {
      cy.loginAs(ACCOUNTS.instructor);
      cy.visit("/settings");
      cy.contains("You don't have access to this page.").should("be.visible");
      cy.visit("/jobs");
      cy.contains("You don't have access to this page.").should("be.visible");
    });
  });
});
