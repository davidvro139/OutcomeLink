// VS Code's integrated terminal (and its extension host) sets
// ELECTRON_RUN_AS_NODE=1 for its own purposes. Cypress's binary is itself
// an Electron app, and if that variable leaks into its environment,
// Electron runs as plain Node instead of launching the app — every CLI
// flag Cypress passes then fails with Node's own "bad option: --xyz"
// parser error. Stripping it before spawning Cypress avoids that.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const result = spawnSync("npx", ["cypress", ...args], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
