/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/src"],
      testMatch: ["**/*.test.ts"],
      testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
    },
    {
      // Hits a real, disposable test database (server/.env.test) — see
      // jest.globalSetup.cjs. Run with --runInBand (see package.json) since
      // these share DB state and aren't safe to parallelize.
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/src"],
      testMatch: ["**/*.integration.test.ts"],
      setupFiles: ["<rootDir>/jest.setup-env.cjs"],
      globalSetup: "<rootDir>/jest.globalSetup.cjs",
    },
  ],
};
