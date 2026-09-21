/**
 * Minimal RFC4180-ish CSV writer — used only to serialize a live Dataverse
 * fetch's rows (server/src/modules/imports/dataConnections.ts) into the same
 * byte shape an uploaded .csv file would have, so the rest of the Bulk
 * Import pipeline (map/validate/preview/commit) can stay completely
 * unaware of where a batch's rows actually came from. Not a general-purpose
 * CSV library — just enough correct quoting to round-trip through this
 * app's own parseCsv() (server/src/modules/imports/importBatches.ts).
 */
function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function stringifyCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
