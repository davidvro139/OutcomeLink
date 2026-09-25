import { assessMetric, type AssessmentInput } from "./assessment";

const base: AssessmentInput = {
  numerator: 0,
  denominator: 0,
  percentage: 0,
  benchmark: 70,
  numeratorOnlyPool: 0,
  bothPool: 0,
};
const rate = (n: number, d: number) => Math.round((n / d) * 10_000) / 100;
const make = (n: number, d: number, extra: Partial<AssessmentInput> = {}): AssessmentInput => ({
  ...base,
  numerator: n,
  denominator: d,
  percentage: rate(n, d),
  ...extra,
});

describe("assessMetric", () => {
  it("has no data when the denominator is 0, however many students could still be added", () => {
    expect(assessMetric({ ...base, bothPool: 5 })).toEqual({
      status: "NO_DATA",
      needed: null,
      maxPossiblePercentage: null,
    });
  });

  it("is meeting at or above the benchmark, including exactly on it", () => {
    expect(assessMetric(make(8, 10))).toMatchObject({ status: "MEETING", needed: 0 });
    expect(assessMetric(make(7, 10))).toMatchObject({ status: "MEETING", needed: 0 }); // exactly 70%
  });

  it("is at risk when a numerator-only pool (seeking students) can close the gap, and says how many", () => {
    // 5/10 = 50%; each of the 6 seeking students who gets placed adds 1 to the numerator: 7/10 needs 2.
    expect(assessMetric(make(5, 10, { numeratorOnlyPool: 6 }))).toMatchObject({
      status: "AT_RISK",
      needed: 2,
      maxPossiblePercentage: 100,
    });
  });

  it("is off track when even every pooled student succeeding would not reach the benchmark", () => {
    // 3/10 = 30%; only 2 seeking students: best case 5/10 = 50%.
    expect(assessMetric(make(3, 10, { numeratorOnlyPool: 2 }))).toEqual({
      status: "OFF_TRACK",
      needed: null,
      maxPossiblePercentage: 50,
    });
  });

  it("with no pool at all, a rate below the benchmark is off track (nothing left to change)", () => {
    expect(assessMetric(make(5, 10))).toMatchObject({
      status: "OFF_TRACK",
      needed: null,
      maxPossiblePercentage: 50,
    });
  });

  it("counts a 'both' pool (not yet in the denominator) as adding to numerator and denominator", () => {
    // 5/10 = 50%. Three current students who will complete: (5+3)/(10+3) = 61.5% — not enough for 70.
    expect(assessMetric(make(5, 10, { bothPool: 3 }))).toMatchObject({
      status: "OFF_TRACK",
      maxPossiblePercentage: 61.54,
    });
    // Ten of them: (5+10)/(10+10) = 75%; needs y with (5+y)/(10+y) >= 0.7 -> y = 7 (12/17 = 70.6%).
    expect(assessMetric(make(5, 10, { bothPool: 10 }))).toMatchObject({
      status: "AT_RISK",
      needed: 7,
    });
  });

  it("uses the numerator-only pool first, since it raises the rate more per success", () => {
    // 6/10 = 60%. One seeking student: 7/10 = 70% -> needs exactly 1 even though a 'both' pool also exists.
    expect(assessMetric(make(6, 10, { numeratorOnlyPool: 1, bothPool: 4 }))).toMatchObject({
      status: "AT_RISK",
      needed: 1,
    });
  });

  it("does not lose a rate that lands exactly on a decimal benchmark to floating point", () => {
    // 62.5% benchmark: 5/8 = 62.5% exactly.
    expect(assessMetric(make(4, 8, { benchmark: 62.5, numeratorOnlyPool: 1 }))).toMatchObject({
      status: "AT_RISK",
      needed: 1,
    });
    expect(assessMetric(make(5, 8, { benchmark: 62.5 }))).toMatchObject({ status: "MEETING" });
  });

  it("judges the stored (rounded) percentage, matching Readiness", () => {
    // 69.996% rounds to 70.00 in storage, so it is meeting a 70% benchmark.
    expect(
      assessMetric({ ...base, numerator: 6999, denominator: 10000, percentage: 70, benchmark: 70 })
        .status,
    ).toBe("MEETING");
  });
});
