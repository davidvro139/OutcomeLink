/**
 * Mantine form values always include every declared field, even ones the user
 * left blank — but the server's Zod schemas often validate an optional field's
 * *format* (e.g. `.email()`, `.url()`) when it's present, and an empty string
 * fails that check even though `undefined` would pass fine (the field being
 * genuinely optional). Strip empty strings before sending, so "left blank"
 * means "omitted" rather than "sent an invalid empty value".
 */
export function stripEmptyStrings<T extends object>(values: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(values) as [keyof T, unknown][]) {
    if (value !== "") {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}
