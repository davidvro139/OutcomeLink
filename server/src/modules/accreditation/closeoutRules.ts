import type { CloseoutBlocker, CloseoutStep } from "@outcomelink/shared";

/** Everything the checklist is worked out from — gathered by closeout.ts, kept plain so the rules are unit-testable. */
export interface CloseoutFacts {
  status: string;
  outcomesDeadline: Date | null;
  computedAt: Date | null;
  validatedAt: Date | null;
  /** Data changes (audit entries on enrollment/outcome/licensure/employment/student records) after each timestamp. */
  changesSinceComputed: number;
  changesSinceValidated: number;
  changesSinceSignOff: number;
  openErrorCount: number;
  warningCount: number;
  /** Off-track program metrics that have no improvement plan for this period. */
  offTrackWithoutPlan: { programName: string; metric: string }[];
  offTrackTotal: number;
  signedOffAt: Date | null;
  signedOffBy: string | null;
  signedOffNote: string | null;
  signedOffResultsAt: Date | null;
  finalizedAt: Date | null;
  finalizeOverrideReason: string | null;
}

export interface CloseoutEvaluation {
  locked: boolean;
  steps: CloseoutStep[];
  blockers: CloseoutBlocker[];
  signOffCurrent: boolean;
  /** Finalize is allowed once signed off; blockers additionally need an override reason. */
  canFinalize: boolean;
  needsOverride: boolean;
}

const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n === 1 ? singular : pluralForm}`;
const same = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

/**
 * The close-out rules (docs/TODO.md's guided close-out checklist), in the order
 * the steps have to happen: results are computed first because validation's
 * below-benchmark checks read them, then validation, then the errors it found,
 * then the off-track review, then sign-off, then finalize and submit.
 *
 * Blockers are what finalize refuses without an override reason: results
 * missing or out of date, validation not run since, open ERROR issues, and
 * off-track programs with no improvement plan. Warnings and the deadline never
 * block. The sign-off is separate and never overridable — it is the
 * confirmation that someone looked — and goes stale if results or data change
 * (or validation re-runs) after it.
 */
export function evaluateCloseout(f: CloseoutFacts): CloseoutEvaluation {
  const locked = f.status === "FINALIZED" || f.status === "SUBMITTED";

  const resultsCurrent = !!f.computedAt && f.changesSinceComputed === 0;
  const validationCurrent =
    !!f.validatedAt &&
    !!f.computedAt &&
    f.validatedAt >= f.computedAt &&
    f.changesSinceValidated === 0;
  const signOffCurrent =
    !!f.signedOffAt &&
    same(f.signedOffResultsAt, f.computedAt) &&
    f.changesSinceSignOff === 0 &&
    !!f.validatedAt &&
    f.validatedAt <= f.signedOffAt;

  const blockers: CloseoutBlocker[] = [];
  if (!f.computedAt) {
    blockers.push({
      code: "RESULTS_MISSING_OR_STALE",
      message: "Results have not been computed for this period.",
    });
  } else if (f.changesSinceComputed > 0) {
    blockers.push({
      code: "RESULTS_MISSING_OR_STALE",
      message: `${plural(f.changesSinceComputed, "student-data change")} since the results were computed — recompute to include them.`,
    });
  }
  if (!f.validatedAt) {
    blockers.push({
      code: "VALIDATION_NOT_CURRENT",
      message: "Validation has not been run for this period.",
    });
  } else if (f.computedAt && f.validatedAt < f.computedAt) {
    blockers.push({
      code: "VALIDATION_NOT_CURRENT",
      message: "Results were recomputed after the last validation — run validation again.",
    });
  } else if (f.changesSinceValidated > 0) {
    blockers.push({
      code: "VALIDATION_NOT_CURRENT",
      message: `${plural(f.changesSinceValidated, "student-data change")} since validation last ran — run it again.`,
    });
  }
  if (f.openErrorCount > 0) {
    blockers.push({
      code: "OPEN_ERRORS",
      message: `${plural(f.openErrorCount, "open validation error")} must be resolved.`,
    });
  }
  if (f.offTrackWithoutPlan.length > 0) {
    const list = f.offTrackWithoutPlan
      .map((o) => `${o.programName} (${o.metric.toLowerCase()})`)
      .join(", ");
    blockers.push({
      code: "OFF_TRACK_WITHOUT_PLAN",
      message: `Off-track with no improvement plan: ${list}.`,
    });
  }

  // Once the period is locked the checklist is a record, not a live check: the numbers behind each step have
  // moved on (or, for a period finalized before the checklist existed, were never recorded), so live details
  // would mislead. Only the sign-off and the finalize record are shown.
  const step = (s: CloseoutStep): CloseoutStep => {
    if (!locked) return s;
    if (s.id === "deadline") return { ...s, action: null };
    const kept = s.id === "signoff" || s.id === "finalize";
    return {
      ...s,
      state: "LOCKED",
      action: null,
      detail: kept ? s.detail : "Locked with the period. Reopen it to review this step again.",
    };
  };

  const steps: CloseoutStep[] = [
    step({
      id: "deadline",
      title: "Set the outcomes deadline",
      state: f.outcomesDeadline ? "DONE" : "OPTIONAL",
      detail: f.outcomesDeadline
        ? `Outcomes are due ${f.outcomesDeadline.toLocaleDateString("en-US", { timeZone: "UTC" })}.`
        : "Recommended — the dashboards count down to it and at-risk alerts use it.",
      action: f.outcomesDeadline ? null : "SET_DEADLINE",
      link: null,
    }),
    step({
      id: "compute",
      title: "Compute results",
      state: resultsCurrent ? "DONE" : "TODO",
      detail: !f.computedAt
        ? "No results yet — compute them from the current student data."
        : f.changesSinceComputed > 0
          ? `${plural(f.changesSinceComputed, "student-data change")} since ${f.computedAt.toISOString().slice(0, 16).replace("T", " ")} UTC — recompute.`
          : `Computed ${f.computedAt.toISOString().slice(0, 16).replace("T", " ")} UTC, with no data changes since.`,
      action: resultsCurrent ? null : "COMPUTE",
      link: "dashboard",
    }),
    step({
      id: "validate",
      title: "Run validation",
      state: !f.computedAt ? "BLOCKED" : validationCurrent ? "DONE" : "TODO",
      detail: !f.computedAt
        ? "Compute results first — validation checks them against the benchmarks."
        : validationCurrent
          ? "Validation is current."
          : !f.validatedAt
            ? "Validation has not been run."
            : "Validation is out of date — run it again.",
      action: f.computedAt && !validationCurrent ? "VALIDATE" : null,
      link: null,
    }),
    step({
      id: "errors",
      title: "Resolve validation errors",
      state: !validationCurrent ? "BLOCKED" : f.openErrorCount === 0 ? "DONE" : "TODO",
      detail: !validationCurrent
        ? "Run validation to see what needs fixing."
        : f.openErrorCount === 0
          ? f.warningCount > 0
            ? `No errors. ${plural(f.warningCount, "warning")} remain for review — they don't block finalizing.`
            : "No open errors or warnings."
          : `${plural(f.openErrorCount, "open error")} to resolve${f.warningCount > 0 ? `, plus ${plural(f.warningCount, "warning")}` : ""}.`,
      action: null,
      link: "validation",
    }),
    step({
      id: "review",
      title: "Review off-track programs",
      state: !f.computedAt ? "BLOCKED" : f.offTrackWithoutPlan.length === 0 ? "DONE" : "TODO",
      detail: !f.computedAt
        ? "Compute results first."
        : f.offTrackTotal === 0
          ? "No program is off track."
          : f.offTrackWithoutPlan.length === 0
            ? `${plural(f.offTrackTotal, "off-track metric")}, each with an improvement plan.`
            : `${plural(f.offTrackWithoutPlan.length, "off-track metric")} without an improvement plan.`,
      action: null,
      link: "improvement-plans",
    }),
    step({
      id: "signoff",
      title: "Sign off the review",
      state: signOffCurrent ? "DONE" : f.computedAt ? "TODO" : "BLOCKED",
      detail:
        locked && !f.signedOffAt
          ? "Finalized before sign-off was part of the close-out — no sign-off was recorded."
          : locked
            ? `Signed off by ${f.signedOffBy} on ${f.signedOffAt!.toISOString().slice(0, 16).replace("T", " ")} UTC${f.signedOffNote ? ` — “${f.signedOffNote}”` : ""}.`
            : signOffCurrent
              ? `Signed off by ${f.signedOffBy} on ${f.signedOffAt!.toISOString().slice(0, 16).replace("T", " ")} UTC${f.signedOffNote ? ` — “${f.signedOffNote}”` : ""}.`
              : f.signedOffAt
                ? "The earlier sign-off no longer applies — results, validation or student data changed after it. Sign off again."
                : "Confirm that the results have been reviewed. Required before finalizing.",
      action: !signOffCurrent && f.computedAt ? "SIGN_OFF" : null,
      link: null,
    }),
    step({
      id: "finalize",
      title: "Finalize the period",
      state: locked ? "DONE" : signOffCurrent ? "TODO" : "BLOCKED",
      detail: locked
        ? `Finalized${f.finalizedAt ? ` ${f.finalizedAt.toISOString().slice(0, 10)}` : ""}.${f.finalizeOverrideReason ? ` Finalized with blockers outstanding — reason: “${f.finalizeOverrideReason}”.` : ""}`
        : signOffCurrent
          ? blockers.length > 0
            ? "Ready, but blockers remain — finalizing needs an override reason."
            : "Everything is in order. Finalizing locks the period against further changes."
          : "Sign off first.",
      action: !locked && signOffCurrent ? "FINALIZE" : null,
      link: null,
    }),
    {
      id: "submit",
      title: "Mark as submitted",
      state: f.status === "SUBMITTED" ? "DONE" : f.status === "FINALIZED" ? "TODO" : "BLOCKED",
      detail:
        f.status === "SUBMITTED"
          ? "Submitted to the accreditor."
          : f.status === "FINALIZED"
            ? "Record that the report has gone to the accreditor."
            : "Finalize first.",
      action: f.status === "FINALIZED" ? "SUBMIT" : null,
      link: null,
    },
  ];

  return {
    locked,
    steps,
    blockers,
    signOffCurrent,
    canFinalize: !locked && signOffCurrent,
    needsOverride: blockers.length > 0,
  };
}
