// Runs before every spec file. Custom commands for testing.

export const ACCOUNTS = {
  systemAdmin: { email: "admin@test.edu", password: "password123" },
  institutionalAdmin: { email: "inst-admin@test.edu", password: "password123" },
};

// Custom command to log in as a specific account
Cypress.Commands.add(
  "loginAs",
  (account: typeof ACCOUNTS[keyof typeof ACCOUNTS]) => {
    cy.visit("/login");
    cy.get("input[type=email]").type(account.email);
    cy.get("input[type=password]").type(account.password);
    cy.contains("button", "Sign in").click();
    cy.url().should("include", "/");
  }
);

// Custom command to get the navigation sidebar
Cypress.Commands.add("nav", () => {
  return cy.get("nav");
});

// Extend types
declare global {
  namespace Cypress {
    interface Chainable {
      loginAs(account: { email: string; password: string }): Chainable<void>;
      nav(): Chainable<JQuery<HTMLElement>>;
    }
  }
}
