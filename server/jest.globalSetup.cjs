// Runs once before the whole test run, in its own process context (not
// subject to setupFiles). Resets outcomelink_test to a clean, freshly-
// migrated state so integration tests never depend on state left over from
// a previous run or from manual dev-database testing.
const path = require("node:path");
const { execSync } = require("node:child_process");

require("dotenv").config({ path: path.resolve(__dirname, ".env.test") });

module.exports = async function globalSetup() {
  if (!process.env.DATABASE_URL?.includes("outcomelink_test")) {
    throw new Error(
      "Refusing to run migrate reset: DATABASE_URL does not point at outcomelink_test. Check server/.env.test.",
    );
  }

  execSync("npx prisma migrate reset --force --skip-generate --skip-seed", {
    cwd: __dirname,
    env: process.env,
    stdio: "inherit",
  });
};
