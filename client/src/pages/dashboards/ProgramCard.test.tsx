import type { CplMetric } from "@outcomelink/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MetricAssessment, ProgramAssessment } from "../../api/programDashboard";
import { renderWithProviders } from "../../test/renderWithProviders";
import { ProgramCard } from "./ProgramCard";
import { describeMetric } from "./riskDisplay";

const metric = (patch: Partial<MetricAssessment>): MetricAssessment => ({
  numerator: 5,
  denominator: 10,
  percentage: 50,
  benchmark: 70,
  negotiated: false,
  status: "AT_RISK",
  needed: 2,
  maxPossiblePercentage: 100,
  pools: { numeratorOnly: 5, both: 0 },
  ...patch,
});

const emptyTrend = { COMPLETION: [], PLACEMENT: [], LICENSURE: [] } as ProgramAssessment["trend"];

const program = (
  metrics: ProgramAssessment["metrics"],
  patch: Partial<ProgramAssessment> = {},
): ProgramAssessment => ({
  programId: 1,
  name: "Automotive",
  code: "AUTO",
  campusName: "Main",
  status: "AT_RISK",
  metrics,
  openIssueCount: 0,
  unresolvedOutcomeCount: 0,
  trend: emptyTrend,
  ...patch,
});

describe("describeMetric", () => {
  it("says what an at-risk metric needs, in plain words", () => {
    expect(describeMetric("PLACEMENT", metric({}))).toBe(
      "Needs 2 more successes to reach 70%. 5 students could still move it — best possible 100%.",
    );
    expect(
      describeMetric("PLACEMENT", metric({ needed: 1, pools: { numeratorOnly: 1, both: 0 } })),
    ).toContain("Needs 1 more success to");
  });

  it("says when a metric can no longer reach its benchmark", () => {
    const text = describeMetric(
      "PLACEMENT",
      metric({
        status: "OFF_TRACK",
        needed: null,
        maxPossiblePercentage: 50,
        pools: { numeratorOnly: 0, both: 0 },
      }),
    );
    expect(text).toContain("Can no longer reach 70%");
    expect(text).toContain("best possible is 50%");
  });

  it("reports the counts when meeting, and marks a negotiated benchmark", () => {
    expect(
      describeMetric(
        "COMPLETION" as CplMetric,
        metric({ status: "MEETING", numerator: 8, denominator: 10, percentage: 80 }),
      ),
    ).toBe("8 of 10 students.");
    expect(describeMetric("PLACEMENT", metric({ status: "MEETING", negotiated: true }))).toContain(
      "negotiated benchmark",
    );
  });

  it("does not present a not-applicable metric as a failing 0%", () => {
    expect(
      describeMetric("LICENSURE", metric({ status: "NO_DATA", denominator: 0, percentage: 0 })),
    ).toContain("Doesn't apply");
  });
});

describe("ProgramCard", () => {
  it("shows the overall status, each metric's status, and the data-quality badges", () => {
    renderWithProviders(
      <ProgramCard
        program={program(
          {
            PLACEMENT: metric({}),
            LICENSURE: metric({
              status: "NO_DATA",
              denominator: 0,
              percentage: 0,
              needed: null,
              maxPossiblePercentage: null,
            }),
          },
          { openIssueCount: 3, unresolvedOutcomeCount: 5 },
        )}
      />,
    );
    expect(screen.getByRole("heading", { name: "Automotive" })).toBeInTheDocument();
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(0);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("5 graduates without an outcome")).toBeInTheDocument();
    expect(screen.getByText("3 open validation issues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /trend/i })).toBeInTheDocument();
  });

  it("says so when a program has no computed results", () => {
    renderWithProviders(<ProgramCard program={program({}, { status: "NO_DATA" })} />);
    expect(screen.getByText("No computed results for this program yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trend/i })).not.toBeInTheDocument();
  });
});
