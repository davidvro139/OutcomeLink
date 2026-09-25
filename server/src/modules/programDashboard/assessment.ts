import type { RiskStatus } from "@outcomelink/shared";

export interface AssessmentInput {
  numerator: number;
  denominator: number;
  /** The stored, rounded rate (0–100) — compared exactly the way Readiness and Validation compare it. */
  percentage: number;
  /** The benchmark that applies (0–100). */
  benchmark: number;
  /** Students who, if they end up a success, would add only to the numerator (already in the denominator). */
  numeratorOnlyPool: number;
  /** Students who, if they end up a success, would add to both numerator and denominator (not yet counted). */
  bothPool: number;
}

export interface Assessment {
  status: RiskStatus;
  /** Fewest additional successes needed to reach the benchmark (0 when already meeting it; null when it can't be reached). */
  needed: number | null;
  /** The best rate still possible if every student in the pools succeeded, or null when there's no data. */
  maxPossiblePercentage: number | null;
}

/**
 * Gap analysis on stored results (docs/TODO.md's program dashboards): is a
 * program that's below a benchmark still able to get there?
 *
 * The rate is num/den. A student in the "numerator-only" pool (e.g. counted in
 * the placement denominator but still seeking) adds 1 to the numerator when
 * they succeed; a student in the "both" pool (not yet counted at all, e.g. a
 * current student who will complete inside the period, or a graduate awaiting a
 * licensure result) adds 1 to both. Successes from the first pool raise the
 * rate more, so they are used first. Nobody in either pool failing changes
 * nothing about the numerator, and a pool member failing is never worse than
 * not counting them, so "everyone succeeds" is the best case.
 *
 * - NO_DATA: denominator 0 (the calculator stores 0% then, which is not a real 0%).
 * - MEETING: already at or above the benchmark.
 * - AT_RISK: below it, but reachable if enough of the pools succeed.
 * - OFF_TRACK: below it, and not reachable even if every pooled student succeeds.
 */
export function assessMetric(input: AssessmentInput): Assessment {
  const { numerator, denominator, percentage, benchmark, bothPool } = input;
  if (denominator <= 0) return { status: "NO_DATA", needed: null, maxPossiblePercentage: null };

  // Only students still in the denominator without a success can be converted, so the pool can't exceed that.
  const numeratorOnlyPool = Math.max(0, Math.min(input.numeratorOnlyPool, denominator - numerator));

  const maxPossible = ((numerator + numeratorOnlyPool + bothPool) / (denominator + bothPool)) * 100;
  const maxPossiblePercentage = Math.round(maxPossible * 100) / 100;

  if (percentage >= benchmark) return { status: "MEETING", needed: 0, maxPossiblePercentage };

  // Integer arithmetic (benchmark to 2 decimals) so a rate exactly on the line isn't lost to floating point.
  const benchmarkBasisPoints = Math.round(benchmark * 100);
  const reaches = (extraNumerator: number, extraBoth: number) =>
    (numerator + extraNumerator + extraBoth) * 10_000 >=
    benchmarkBasisPoints * (denominator + extraBoth);

  for (let successes = 1; successes <= numeratorOnlyPool + bothPool; successes++) {
    const fromNumeratorOnly = Math.min(successes, numeratorOnlyPool);
    const fromBoth = successes - fromNumeratorOnly;
    if (reaches(fromNumeratorOnly, fromBoth))
      return { status: "AT_RISK", needed: successes, maxPossiblePercentage };
  }
  return { status: "OFF_TRACK", needed: null, maxPossiblePercentage };
}
