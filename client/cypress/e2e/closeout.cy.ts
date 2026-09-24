import { ACCOUNTS } from "../support/e2e";

const STEPS = [
  "Set the outcomes deadline",
  "Compute results",
  "Run validation",
  "Resolve validation errors",
  "Review off-track programs",
  "Sign off the review",
  "Finalize the period",
  "Mark as submitted",
];

/**
 * The reporting-period close-out checklist. Read-only here on purpose: the
 * specs open a period and check what is shown and offered per role, but never
 * compute, sign off or finalize (that would change the demo data the other
 * specs rely on) — the lifecycle rules themselves are covered by the server's
 * integration tests.
 */
describe("reporting-period close-out checklist", () => {
  function openFirstPeriod() {
    cy.nav().contains("a", "Accreditation").click();
    // Wait for the navigation: the home page has tables of its own that would otherwise match below.
    cy.url().should("include", "/accreditation/reporting-periods");
    cy.contains("h2", "Reporting Periods").should("be.visible");
    cy.get("table tbody tr").first().find("a").click();
    cy.contains("Close-out steps").should("be.visible");
  }

  it("lists the steps in order and offers actions to an administrator", () => {
    cy.loginAs(ACCOUNTS.institutionalAdmin);
    openFirstPeriod();

    STEPS.forEach((title) => cy.contains(title).should("be.visible"));

    // Either something still needs doing (an action button), or the period is locked and shows its record.
    cy.get("body").then(($body) => {
      const locked =
        $body.text().includes("This period is finalized") ||
        $body.text().includes("has been submitted");
      if (locked) {
        cy.contains("Reopen the period to change anything").should("be.visible");
      } else {
        cy.contains("button", /Compute now|Run validation|Sign off|Finalize…/).should("exist");
      }
    });
  });

  it("shows the checklist, without any actions, to a read-only auditor", () => {
    cy.loginAs(ACCOUNTS.auditor);
    openFirstPeriod();

    STEPS.forEach((title) => cy.contains(title).should("be.visible"));
    cy.contains("button", "Compute now").should("not.exist");
    cy.contains("button", "Sign off").should("not.exist");
    cy.contains("button", "Finalize…").should("not.exist");
  });

  it("the other period tabs are still one click away", () => {
    cy.loginAs(ACCOUNTS.institutionalAdmin);
    openFirstPeriod();
    [
      "CPL Dashboard",
      "Readiness",
      "Data Validation",
      "Improvement Plans",
      "Reports",
      "Audit History",
    ].forEach((tab) => {
      cy.contains('[role="tab"]', tab).click();
      cy.contains('[role="tab"][aria-selected="true"]', tab).should("exist");
    });
  });
});
