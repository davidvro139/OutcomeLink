const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses simple durations like "15m" or "7d" (the shape used by JWT_ACCESS_TTL/JWT_REFRESH_TTL) into milliseconds. */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit!]!;
}
