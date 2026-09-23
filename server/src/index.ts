import { createApp } from "./app";
import { env } from "./config/env";
import { startJobRunner } from "./lib/jobRunner";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`OutcomeLink API listening on port ${env.PORT}`);
});

// Only reached from the real server entrypoint (never from tests, which
// import createApp() directly). One runner drives every background job —
// scheduled reports, nightly validation, follow-up automation — and sweeps
// for due retries each minute (docs/TODO.md's reusable scheduled-job
// infrastructure). Each module registers its own job when imported by app.ts.
startJobRunner();
