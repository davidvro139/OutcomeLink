// Input: extracted 2025_Gaz_place_national.txt from the US Census Gazetteer.
// See src/data/README.md for the source and regeneration command.
const fs = require("node:fs");
const path = require("node:path");
const lines = fs.readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/);
const headers = lines.shift().split("|").map((s) => s.trim());
const rows = lines.map((line) => {
  const row = Object.fromEntries(line.split("|").map((value, i) => [headers[i], value.trim()]));
  // Remove only Census legal/statistical suffixes, preserving actual place names.
  const city = row.NAME.replace(/ (city and borough|consolidated government|metropolitan government|unified government|municipality|city|town|village|borough|CDP)( \(balance\))?$/, "");
  return [row.USPS, city, Number(row.INTPTLAT), Number(row.INTPTLONG)];
});
const out = path.join(__dirname, "../src/data/us-places-2025.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, "[\n" + rows.map((row) => JSON.stringify(row)).join(",\n") + "\n]\n");
console.log(`Wrote ${rows.length} places`);
