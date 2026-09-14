import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`OutcomeLink API listening on port ${env.PORT}`);
});
