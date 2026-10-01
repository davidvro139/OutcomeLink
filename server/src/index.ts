import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { startJobRunner } from "./lib/jobRunner";
import { startScheduler } from "./modules/scheduledReports";

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
// import createApp() directly). Subscription polling and the job registry
// each start once; the registry owns nightly jobs and retry processing.
startScheduler();
startJobRunner();
