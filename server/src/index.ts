import { createApp } from "./app";
import { env } from "./config/env";
import { startJobRunner } from "./lib/jobRunner";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`OutcomeLink API listening on port ${env.PORT}`);
});

// A container stop sends SIGTERM: finish in-flight requests, close the
// database connection, then exit, instead of being killed mid-request.
function shutdown(signal: string) {
  console.log(`${signal} received — shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Only reached from the real server entrypoint (never from tests, which
// import createApp() directly). One runner drives every background job —
// scheduled reports, nightly validation, follow-up automation — and sweeps
// for due retries each minute (docs/TODO.md's reusable scheduled-job
// infrastructure). Each module registers its own job when imported by app.ts.
startJobRunner();
