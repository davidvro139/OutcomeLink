/** Reporting-period close-out checklist (docs/TODO.md). */
export const CLOSEOUT_STEP_STATES = ["DONE", "TODO", "BLOCKED", "OPTIONAL", "LOCKED"] as const;
export type CloseoutStepState = (typeof CLOSEOUT_STEP_STATES)[number];

/** The things that stop a period being finalized without an override reason. Warnings never appear here. */
export const CLOSEOUT_BLOCKER_CODES = [
  "RESULTS_MISSING_OR_STALE",
  "VALIDATION_NOT_CURRENT",
  "OPEN_ERRORS",
  "OFF_TRACK_WITHOUT_PLAN",
] as const;
export type CloseoutBlockerCode = (typeof CLOSEOUT_BLOCKER_CODES)[number];

export type CloseoutAction = "SET_DEADLINE" | "COMPUTE" | "VALIDATE" | "SIGN_OFF" | "FINALIZE" | "SUBMIT";
export type CloseoutLink = "validation" | "improvement-plans" | "readiness" | "dashboard";

export interface CloseoutStep {
  id: "deadline" | "compute" | "validate" | "errors" | "review" | "signoff" | "finalize" | "submit";
  title: string;
  state: CloseoutStepState;
  detail: string;
  action: CloseoutAction | null;
  link: CloseoutLink | null;
}

export interface CloseoutBlocker {
  code: CloseoutBlockerCode;
  message: string;
}
