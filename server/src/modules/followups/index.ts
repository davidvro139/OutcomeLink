export * from "./followups.routes";
export { startFollowUpAutomationScheduler } from "./automationScheduler";
// Registers the FOLLOW_UP_AUTOMATION job handler
import "./automationJob";
