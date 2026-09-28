export * from "./accreditation.routes";
export { startNightlyValidationScheduler } from "./validationScheduler";
// Registers the NIGHTLY_VALIDATION job handler
import "./validationJob";
