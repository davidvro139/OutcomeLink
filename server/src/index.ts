import { createApp } from "./app";
import { env } from "./config/env";
import { startScheduler } from "./modules/scheduledReports";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`OutcomeLink API listening on port ${env.PORT}`);
});

// Only reached from the real server entrypoint (never from tests, which
// import createApp() directly) — the first genuine time-based background
// task in this app (docs/TODO.md's Scheduled Reports entry).
startScheduler();
