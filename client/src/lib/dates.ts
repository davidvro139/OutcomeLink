/**
 * Formats a date-only value (e.g. "2026-10-07T00:00:00.000Z", stored as UTC
 * midnight since it represents a calendar date rather than a moment in time)
 * for display without the browser's local timezone shifting it by a day.
 * `new Date(iso).toLocaleDateString()` converts to local time first, which
 * reads back one day earlier than intended for any timezone west of UTC —
 * this instead builds the Date from the Y-M-D components directly, so its
 * local calendar date always matches what was actually stored.
 */
export function formatDateOnly(dateOnlyIsoString: string): string {
  const [year, month, day] = dateOnlyIsoString.slice(0, 10).split("-").map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString();
}
