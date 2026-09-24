import { evaluateCloseout, type CloseoutFacts } from "./closeoutRules";

const t = (iso: string) => new Date(`2026-09-${iso}:00.000Z`);

/** A period that is fully ready: computed, validated after, no errors, signed off after that. */
const ready: CloseoutFacts = {
  status: "OPEN",
  outcomesDeadline: t("30T00:00"),
  computedAt: t("10T09:00"),
  validatedAt: t("10T10:00"),
  changesSinceComputed: 0,
  changesSinceValidated: 0,
  changesSinceSignOff: 0,
  openErrorCount: 0,
  warningCount: 0,
  offTrackWithoutPlan: [],
  offTrackTotal: 0,
  signedOffAt: t("10T11:00"),
  signedOffBy: "Ada",
  signedOffNote: null,
  signedOffResultsAt: t("10T09:00"),
  finalizedAt: null,
  finalizeOverrideReason: null,
};

const codes = (facts: CloseoutFacts) => evaluateCloseout(facts).blockers.map((b) => b.code);
const state = (facts: CloseoutFacts, id: string) =>
  evaluateCloseout(facts).steps.find((s) => s.id === id)!.state;

describe("evaluateCloseout", () => {
  it("has no blockers, and can finalize, when everything is in order and signed off", () => {
    const result = evaluateCloseout(ready);
    expect(result.blockers).toEqual([]);
    expect(result.signOffCurrent).toBe(true);
    expect(result).toMatchObject({ canFinalize: true, needsOverride: false, locked: false });
    expect(result.steps.map((s) => s.id)).toEqual([
      "deadline",
      "compute",
      "validate",
      "errors",
      "review",
      "signoff",
      "finalize",
      "submit",
    ]);
    expect(state(ready, "finalize")).toBe("TODO");
  });

  it("blocks on missing results, and holds the dependent steps back", () => {
    const fresh: CloseoutFacts = {
      ...ready,
      computedAt: null,
      validatedAt: null,
      signedOffAt: null,
      signedOffResultsAt: null,
    };
    expect(codes(fresh)).toEqual(["RESULTS_MISSING_OR_STALE", "VALIDATION_NOT_CURRENT"]);
    expect(state(fresh, "compute")).toBe("TODO");
    expect(state(fresh, "validate")).toBe("BLOCKED");
    expect(state(fresh, "errors")).toBe("BLOCKED");
    expect(state(fresh, "review")).toBe("BLOCKED");
    expect(state(fresh, "signoff")).toBe("BLOCKED");
    expect(evaluateCloseout(fresh).canFinalize).toBe(false);
  });

  it("treats results as stale once student data changed after they were computed", () => {
    expect(codes({ ...ready, changesSinceComputed: 3 })).toContain("RESULTS_MISSING_OR_STALE");
    expect(state({ ...ready, changesSinceComputed: 3 }, "compute")).toBe("TODO");
  });

  it("requires validation to have run after the last compute and the last data change", () => {
    expect(codes({ ...ready, validatedAt: t("10T08:00") })).toEqual(["VALIDATION_NOT_CURRENT"]); // recomputed after validating
    expect(codes({ ...ready, changesSinceValidated: 1 })).toEqual(["VALIDATION_NOT_CURRENT"]);
    expect(codes({ ...ready, validatedAt: null })).toContain("VALIDATION_NOT_CURRENT");
  });

  it("blocks on open errors only — warnings are reported but never block", () => {
    expect(codes({ ...ready, openErrorCount: 2 })).toEqual(["OPEN_ERRORS"]);
    const warned = { ...ready, warningCount: 5 };
    expect(codes(warned)).toEqual([]);
    expect(evaluateCloseout(warned).steps.find((s) => s.id === "errors")!.detail).toContain(
      "5 warnings",
    );
  });

  it("blocks on off-track programs without an improvement plan, naming them", () => {
    const facts = {
      ...ready,
      offTrackTotal: 2,
      offTrackWithoutPlan: [{ programName: "Welding", metric: "PLACEMENT" }],
    };
    const result = evaluateCloseout(facts);
    expect(result.blockers).toEqual([
      {
        code: "OFF_TRACK_WITHOUT_PLAN",
        message: "Off-track with no improvement plan: Welding (placement).",
      },
    ]);
    expect(state(facts, "review")).toBe("TODO");
    expect(state({ ...ready, offTrackTotal: 2 }, "review")).toBe("DONE"); // all have plans
  });

  it("never blocks on a missing deadline", () => {
    expect(codes({ ...ready, outcomesDeadline: null })).toEqual([]);
    expect(state({ ...ready, outcomesDeadline: null }, "deadline")).toBe("OPTIONAL");
  });

  it("the sign-off goes stale if results, data or validation change after it", () => {
    expect(evaluateCloseout({ ...ready, signedOffAt: null }).signOffCurrent).toBe(false);
    expect(
      evaluateCloseout({ ...ready, computedAt: t("10T10:30"), validatedAt: t("10T10:45") })
        .signOffCurrent,
    ).toBe(false); // recomputed since
    expect(evaluateCloseout({ ...ready, changesSinceSignOff: 1 }).signOffCurrent).toBe(false);
    expect(evaluateCloseout({ ...ready, validatedAt: t("10T12:00") }).signOffCurrent).toBe(false); // validated again after signing
    const stale = evaluateCloseout({ ...ready, changesSinceSignOff: 1 });
    expect(stale.canFinalize).toBe(false);
    expect(stale.steps.find((s) => s.id === "signoff")!.detail).toContain("no longer applies");
  });

  it("needs an override, but can still finalize once signed off, when blockers remain", () => {
    const result = evaluateCloseout({ ...ready, openErrorCount: 1 });
    expect(result).toMatchObject({ canFinalize: true, needsOverride: true });
  });

  it("locks every step on a finalized period and points submit at the next action", () => {
    const finalized = evaluateCloseout({
      ...ready,
      status: "FINALIZED",
      finalizedAt: t("11T00:00"),
      finalizeOverrideReason: "Accreditor approved an exception",
    });
    expect(finalized.locked).toBe(true);
    expect(finalized.canFinalize).toBe(false);
    expect(
      finalized.steps
        .filter((s) => s.id !== "submit" && s.id !== "deadline")
        .every((s) => s.state === "LOCKED" || s.state === "OPTIONAL"),
    ).toBe(true);
    expect(finalized.steps.find((s) => s.id === "finalize")!.detail).toContain(
      "Accreditor approved an exception",
    );
    expect(finalized.steps.find((s) => s.id === "submit")).toMatchObject({
      state: "TODO",
      action: "SUBMIT",
    });
    expect(
      evaluateCloseout({ ...ready, status: "SUBMITTED" }).steps.find((s) => s.id === "submit")!
        .state,
    ).toBe("DONE");
  });

  it("does not present live numbers on a locked period, and says plainly when it was finalized before sign-offs existed", () => {
    const legacy = evaluateCloseout({
      ...ready,
      status: "FINALIZED",
      finalizedAt: t("11T00:00"),
      signedOffAt: null,
      signedOffBy: null,
      signedOffResultsAt: null,
      changesSinceComputed: 6,
      openErrorCount: 4,
      validatedAt: null,
    });
    expect(legacy.steps.find((x) => x.id === "signoff")!.detail).toContain(
      "before sign-off was part of the close-out",
    );
    for (const id of ["compute", "validate", "errors", "review"]) {
      expect(legacy.steps.find((x) => x.id === id)!.detail).toBe(
        "Locked with the period. Reopen it to review this step again.",
      );
    }
  });
});
