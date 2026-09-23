export * from "./accreditation.routes";

// Registers the nightly-validation job with the job runner (see lib/jobRunner.ts).
import "./validationScheduler";
