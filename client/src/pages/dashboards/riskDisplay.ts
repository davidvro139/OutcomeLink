import type { CplMetric, RiskStatus } from "@outcomelink/shared";
import type { MetricAssessment } from "../../api/programDashboard";

export const STATUS_COLORS: Record<RiskStatus, string> = {
  MEETING: "green",
  AT_RISK: "yellow",
  OFF_TRACK: "red",
  NO_DATA: "gray",
};

export const METRIC_LABELS: Record<CplMetric, string> = {
  COMPLETION: "Completion",
  PLACEMENT: "Placement",
  LICENSURE: "Licensure",
};

export const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n === 1 ? singular : pluralForm}`;

/** One plain-language sentence saying what the number means for this program right now. */
export function describeMetric(metric: CplMetric, m: MetricAssessment): string {
  switch (m.status) {
    case "NO_DATA":
      return "Doesn't apply this period (no students counted).";
    case "MEETING":
      return `${m.numerator} of ${m.denominator} students${m.negotiated ? " — against a negotiated benchmark" : ""}.`;
    case "AT_RISK": {
      const pool = m.pools.numeratorOnly + m.pools.both;
      return `Needs ${plural(m.needed ?? 0, "more success", "more successes")} to reach ${m.benchmark}%. ${plural(pool, "student")} could still move it — best possible ${m.maxPossiblePercentage}%.`;
    }
    case "OFF_TRACK":
      return `Can no longer reach ${m.benchmark}% — even if every remaining student succeeds the best possible is ${m.maxPossiblePercentage}%.${
        metric === "COMPLETION" ? "" : " Improvement plan recommended."
      }`;
  }
}
