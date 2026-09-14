// Loaded via Jest's `setupFiles`, which runs before the test framework and
// before the test file's own imports — so this must win the race against
// config/env.ts's `import "dotenv/config"` (which loads plain .env). dotenv
// doesn't override already-set env vars by default, so setting these here
// first is what keeps integration tests pointed at outcomelink_test instead
// of the real dev database.
require("dotenv").config({ path: require("path").resolve(__dirname, ".env.test") });
