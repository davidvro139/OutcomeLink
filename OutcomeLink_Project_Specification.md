# OutcomeLink

## Technical College Outcomes, Placement & Accreditation Management Platform

## 1. Product Overview

OutcomeLink is a web-based outcomes management platform designed for technical colleges, career schools, and occupational education institutions.

The platform tracks students after they complete or leave a program, manages graduate follow-up and employer verification, records employment and licensure outcomes, calculates accreditation metrics, and provides institutional administrators with detailed reporting about student outcomes.

The initial accreditation framework supported by OutcomeLink will be the Council on Occupational Education (COE).

OutcomeLink should understand COE Completion, Placement, and Licensure (CPL) reporting rules rather than simply storing manually calculated percentages.

The application should be designed so additional accreditation frameworks or institutional reporting requirements can be added later without rewriting the core system.

OutcomeLink complements student-progress systems such as ETrack. ETrack focuses on students while they are enrolled. OutcomeLink begins with enrollment/completion data and focuses primarily on outcomes after students complete, graduate, withdraw, or otherwise leave a program.

## 2. Primary Goals

OutcomeLink should allow an institution to:

1. Track student outcomes after enrollment.
2. Track graduate employment.
3. Determine whether employment is related to the student's training.
4. Track employers hiring graduates.
5. Track licensure requirements and exam results.
6. Manage graduate follow-up attempts.
7. Manage employer verification.
8. Store evidence supporting reported outcomes.
9. Calculate COE Completion, Placement, and Licensure rates.
10. Explain exactly why an individual student is included or excluded from a calculation.
11. Validate data before accreditation reporting.
12. Identify programs that fall below required benchmarks.
13. Track corrective actions and improvement plans.
14. Analyze outcomes across programs and reporting periods.
15. Provide administrators with institution-wide outcome analytics.
16. Track employer relationships and hiring trends.
17. Collect graduate and employer surveys.
18. Maintain an auditable history of changes to outcome data.
19. Export data for accreditation and institutional reporting.
20. Provide configurable reporting periods and accreditation rule sets.
21. Track student communication preferences and honor opt-outs during follow-up outreach.
22. Detect and resolve duplicate student records without losing outcome history.

## 3. Important Design Principle

OutcomeLink must NOT simply store CPL percentages.

The system must calculate CPL metrics from individual student records using the applicable accreditation rules.

Student records -> classifications -> eligibility rules -> numerator/denominator determination -> program CPL -> institutional CPL

Every reported number must be traceable back to the underlying records. An administrator should be able to click a reported number and see exactly which students contributed to it.

## 4. User Roles

System Administrator

- Configure institution settings
- Manage users and roles
- Manage programs
- Configure accreditation frameworks and reporting periods
- Manage integrations
- View audit logs

Institutional Administrator

- View institution-wide dashboards
- View all programs and CPL calculations
- Review accreditation reports and data-quality problems
- Compare programs
- Manage improvement plans
- Export institutional reports

Program Administrator

- View assigned programs
- Manage student outcomes and placement information
- Review follow-up queues and program reports
- Manage program improvement plans

Career Services / Placement Staff

- View students and employers across all programs
- Manage employer relationships and verification across programs
- Record employment and placement information
- Coordinate follow-up efforts with program staff

Instructor / Staff

- View authorized students
- Record follow-up attempts
- Enter employment information
- Upload verification evidence
- Record survey responses
- Update assigned tasks

Read-Only / Auditor

- View authorized reports, supporting records, evidence, and audit history
- Cannot modify data.

## 5. Institution Structure

The system should support:

Institution -> Campus -> Department -> Program -> Cohort / Reporting Population -> Student

Departments and cohorts should be optional.

Programs should include program name, code, CIP code, credential type, program length, clock hours, credit hours, campus, department, active/inactive status, licensure requirement, accreditation reporting status, and effective dates.

## 6. Student Records

Identity fields:

- Internal student ID
- First name
- Last name
- Preferred name
- Email
- Phone

Communication preferences:

- Preferred contact method
- SMS consent status and date
- Do-not-contact flag and reason

For development and public portfolio deployments, use synthetic student data only.

Enrollment fields:

- Program
- Campus
- Start date
- Expected completion date
- Actual completion/exit date
- Enrollment status
- Credential earned
- Exit reason

Possible display statuses include Active, Graduate Completer, Non-Graduate Completer, Withdrawn, Transferred, and Other. Exact accreditation classifications must be handled by the accreditation rules engine.

## 7. Student Outcome Record

Each student reporting-period record should contain the outcome information needed by the accreditation engine, including reporting period, completion classification, employment status, employer, job title, employment start date, related-to-training determination and justification, continuing education status, military status when applicable, availability-for-employment status, licensure requirement, licensure exam date and result, outcome verification status, verification method, verified by, verification date, and notes.

Outcome classifications should be controlled values rather than unrestricted text.

## 8. Employment & Placement

Employment records should contain student, employer, job title, start date, end date when applicable, full-time/part-time, related-to-training status, relationship determination method, salary or wage if voluntarily collected, employment status, verification status, verification date, verification source, and notes.

The system should preserve historical employment records rather than overwriting previous employment.

## 9. Employer Management

OutcomeLink should include an employer CRM. Employer records should include employer name, industry, NAICS code when available, address, city, state, ZIP, website, primary contact, verification contact, phone, email, notes, and active/inactive status.

Employer profiles should display programs they hire from, number of graduates hired, current placements, historical placements, average time-to-employment, employer survey results, verification history, contacts, and follow-up history.

## 10. Employer Relationship Analytics

Administration should be able to identify top employers by graduate hires, employers hiring from multiple programs, new employers, employers no longer hiring graduates, repeat employers, employers with high graduate retention, industries hiring graduates, geographic concentration of employers, programs with weak employer networks, employer survey satisfaction, employers interested in advisory committees, and employers offering internships or apprenticeships.

## 11. Follow-Up Management

Each follow-up attempt should contain student, date/time, staff member, method, outcome, notes, and next follow-up date.

Methods may include Phone, Email, SMS, Survey, In person, Employer contact, and Other.

Possible outcomes include No response, Student contacted, Employment reported, Employment verified, Seeking employment, Continuing education, Unavailable, Incorrect contact information, Follow-up required, and Complete.

Follow-up attempts must honor the student's recorded communication preferences and consent status (see Student Records). A contact method the student has opted out of should not be used for outreach.

## 12. Follow-Up Queue

Provide a task-oriented queue with Student, Program, Status, Attempts, Last Contact, Next Action, and Assigned To. Filters should include Program, Campus, Staff member, Outcome status, Days overdue, Number of attempts, and Reporting period. Overdue follow-ups should be highlighted.

## 13. Automated Follow-Up Rules

Examples:

- If no outcome exists seven days after completion -> Create follow-up task.
- If no response after three attempts -> Escalate.
- If student reports employment -> Create employer verification task.
- If employment is verified -> Close placement verification task.
- If licensure is required and no result exists -> Create licensure follow-up.
- If a student has opted out of a contact method -> Exclude that method and route to staff for manual review.

Rules should eventually be configurable.

## 14. Verification & Evidence

Every reportable outcome should support evidence. Evidence types may include employer verification, graduate confirmation, email, letter, survey, employment documentation, licensure result, school record, and other approved evidence.

Store evidence type, file, description, uploaded by, upload date, and verification status. Outcome records should display whether sufficient evidence exists.

## 15. Audit Trail

Important records must have an audit history. Track record creation, field changed, previous value, new value, user, timestamp, and reason when required. Audit history should not be editable by normal users.

## 16. Reporting Periods

OutcomeLink must model reporting periods as first-class records rather than implicit date ranges.

A reporting period should include name/label, start date, end date, associated accreditation framework and rule set version, cohort window definition (how completion dates map into the period, consistent with the applicable COE rule set), and status (Open, Ready for Review, Finalized, Submitted, Reopened).

Every student outcome record, CPL calculation, and validation result must reference a specific reporting period. Reporting periods must never be inferred implicitly from a date range at calculation time — the assignment of a student to a period is itself a rule-driven, auditable decision made by the accreditation engine (see Accreditation Engine and Versioned Accreditation Rules).

Reporting periods should support historical reopening only through an explicit, permissioned, and audited action (see Reporting Period Finalization & Locking).

## 17. Accreditation Engine

Create an independent accreditation engine with Frameworks, RuleSets, Classifiers, Calculators, Validators, Benchmarks, and Explanations. Initial framework: COE. Initial rule set: COE-2026. Do not hard-code rules into React components.

## 18. Versioned Accreditation Rules

Rules must support effective dates. Historical reports must continue using the rule set that applied to that reporting period even if rules later change. Rules may define student classifications, numerator rules, denominator rules, exclusions, completion calculation, placement calculation, licensure calculation, benchmarks, and validation requirements.

## 19. CPL Calculation Engine

The system must calculate Completion, Placement, and Licensure from individual records. For each metric determine the eligible population, numerator, denominator, exclusions, and resulting percentage. Exact calculations must be implemented from applicable COE documentation and validated with unit tests. Never infer an accreditation rule solely from assumptions.

## 20. Calculation Explainability

Every student should have a 'How This Student Counts' panel showing reporting period, classification, whether the student counts in each numerator and denominator, and the reason. The calculation engine should generate these explanations.

## 21. Calculation Drill-Down

Every metric displayed to administrators should be drillable. Example: Placement Rate 81.4% -> Placement numerator 127 -> View 127 students; Placement denominator 156 -> View 156 students; Excluded 18 -> View 18 students. Each list should explain the student's classification.

## 22. Accreditation Validation Engine

Before reports are considered ready, run validation checks for missing outcome classifications, missing completion dates, employment without employer, related employment without justification, placement without verification, missing licensure result, duplicate student, conflicting categories, enrollment totals that do not reconcile, invalid reporting-period dates, missing evidence, and programs below benchmark. Classify issues as ERROR, WARNING, or INFORMATION.

Duplicate students identified here should be resolved using the Duplicate Student Resolution workflow rather than deleted or ignored.

## 23. Duplicate Student Resolution

Detecting a duplicate student is not sufficient on its own. OutcomeLink should provide a merge workflow that lets an authorized administrator review two candidate records side by side, choose which record survives as the primary record, and reconcile enrollment, outcome, employment, follow-up, evidence, and survey history onto the surviving record.

The merge action itself must be captured in the audit trail, including which record was retired, who performed the merge, when, and why. Merged-away records should remain retrievable for audit purposes rather than being deleted.

## 24. Accreditation Readiness Dashboard

Provide reporting-period readiness with program counts, ready/warning/error counts, total student records, missing outcomes, missing verification, missing licensure results, classification conflicts, and an overall report status. Every number should be clickable.

When a reporting period's readiness reaches an acceptable state, administrators finalize it (see Reporting Period Finalization & Locking).

## 25. Reporting Period Finalization & Locking

Once a reporting period's CPL calculations and validation checks are reviewed and considered accurate, an Institutional Administrator should be able to finalize the period, moving its status from Open/Ready for Review to Finalized.

Finalizing a period should:

- Prevent further edits to student outcome, employment, and licensure records tied to that period through normal workflows.
- Freeze the CPL calculation results and the rule set version used to produce them.
- Require an explicit, permissioned "reopen" action, with a mandatory reason, to make further changes. Reopening must be recorded in the audit trail and should re-trigger validation before the period can be re-finalized.

A Submitted status should be available to mark periods that have been reported to COE or another accreditation body, distinct from Finalized, so administrators can track internal sign-off separately from external submission.

## 26. Improvement Plans

Programs below expectations should support improvement plans with Program, Metric, Reporting period, Current result, Target, Problem description, Root cause, Corrective actions, Responsible staff, Due dates, Supporting evidence, Progress updates, and Status. Statuses: Draft, Active, Monitoring, Completed, Closed.

## 27. Executive Administration Dashboard

Display total enrollment, total completers, completion rate, placement rate, licensure pass rate, number of active programs, programs below benchmark, students awaiting outcome verification, average days from completion to employment, employer count, and repeat employer rate. Include comparisons with previous reporting period, institutional target, and accreditation benchmark.

## 28. Program Performance Report

Administrators need to compare programs using columns such as Program, Enrollment, Completers, Completion %, Placement %, Licensure %, Average Days to Placement, Unknown Outcomes, Verification %, and Trend. Allow sorting and drill-down into a program.

## 29. Historical Trend Reporting

Provide 3-year and 5-year trends for Completion, Placement, Licensure, Enrollment, Completer count, Employer count, Related placement percentage, Unknown outcome percentage, and Verification percentage. Allow Program vs Institution, Program vs Previous Year, Current Year vs Institutional Target, and Current Year vs Accreditation Benchmark comparisons.

## 30. Cohort Analysis

Allow administrators to analyze outcomes by entry year, completion year, reporting period, program, campus, credential type, and cohort. Track how outcomes develop after completion.

## 31. Time-to-Employment Report

Measure number of days between completion and first related employment. Report median days to placement, average days to placement, and percentages placed within 30, 60, 90, and 180 days. Compare programs.

## 32. Placement Quality Report

Analyze related vs unrelated employment, full-time vs part-time, employment retention, wage data when available, repeat employers, industry alignment, and job-title distribution. Clearly distinguish OFFICIAL ACCREDITATION METRIC from INSTITUTIONAL ANALYTIC.

## 33. Outcome Funnel

Provide an administrative funnel such as Enrolled -> Completed -> Available for Placement -> Placed -> Related Placement. Clearly indicate when funnel numbers are institutional analytics rather than official accreditation calculations.

## 34. Unknown Outcome Report

Show students without known outcomes, program, completion date, days since completion, contact attempts, last attempt, assigned staff, and next action. Administration should be able to see unknown outcome rate by program, with unusually high rates highlighted.

## 35. Follow-Up Effectiveness Report

Measure average attempts before contact, contact success rate, email response rate, phone response rate, survey response rate, average days until outcome established, outcome verification rate, and follow-up workload by staff member.

## 36. Employer Concentration Report

Identify dependency on particular employers, such as the percentage of placements accounted for by the top employers or cases where a program receives a large percentage of placements from a single employer.

## 37. Employer Pipeline Report

Show employers by current hires, historical hires, programs hired from, last hire date, last contact, survey satisfaction, and verification responsiveness. Classify employers as Strategic Partner, Active, Occasional, New, or Inactive.

## 38. Geographic Placement Reporting

Optionally integrate geocoding to map graduate employers, graduate job locations, placement density, programs, and campus service areas. Analyze average commute distance, percentage employed within local service area, regional employment concentrations, and industries by geographic area. This can reuse the separate geocoding service.

## 39. Licensure Dashboard

For programs requiring licensure display Eligible graduates, Waiting for exam, Scheduled, Tested, Passed, Failed, Unknown, Pass rate, and First-attempt pass rate when available. Allow comparison across Program, Year, Campus, and Reporting period.

## 40. Data Quality Dashboard

Administration should have a dedicated data-quality view for missing employment verification, missing employer, missing completion date, invalid program, duplicate students, unclassified outcomes, missing licensure result, conflicting classifications, stale follow-up records, and missing supporting evidence. Generate an internal DATA QUALITY SCORE that is never represented as a COE metric.

## 41. Program Health Score

Optionally create an institutional Program Health Score using enrollment trend, completion trend, placement trend, licensure trend, employer demand, graduate survey results, employer satisfaction, and unknown outcome rate. The calculation must be transparent and configurable and must not be represented as an accreditation metric.

## 42. Administrative Alerts

Examples: placement dropped from last year; graduates lack verified outcomes; licensure is below institutional target; a major employer hired multiple graduates; or a program has not recorded graduate follow-up recently. Alerts should link directly to supporting data.

## 43. Graduate Surveys

Support secure survey links collecting employment status, employer, job title, related-to-training response, continuing education, satisfaction with training, skills preparedness, and comments. Survey responses should create candidate outcome information and should not automatically become verified accreditation outcomes unless allowed by rules and institutional process.

## 44. Employer Surveys

Collect graduate, job title, employment verification, technical preparedness, communication, problem solving, professionalism, overall satisfaction, skills gaps, likelihood to hire another graduate, and comments. Survey results should feed administrative reporting.

## 45. Survey Analytics

Administration should see graduate satisfaction, employer satisfaction, response rates, program comparisons, skill-gap trends, employer comments, and graduate comments, with historical comparison.

## 46. Skills Gap Analysis

Employer surveys can identify requested skills by program and track trends over time. This should help program administrators identify curriculum opportunities. This is institutional analytics, not an accreditation calculation.

## 47. Unified Student Communication Timeline

Each student should have a single chronological communication timeline combining follow-up attempts, survey invitations and responses, verification contacts, and notification history. This reinforces the platform's core drill-down principle (see Dashboard Drill-Down Principle) by giving staff one place to see everything that has been done to reach a student, rather than splitting history across the follow-up and survey modules.

## 48. Reporting Center

Create a central Reporting module with categories:

Accreditation: CPL Summary, CPL Detail, Accreditation Readiness, Data Validation, Below-Benchmark Programs, Licensure, Improvement Plans.

Student Outcomes: Completion, Placement, Related Placement, Time to Employment, Unknown Outcomes, Outcome Funnel, Employment Retention.

Employers: Top Employers, Employer Trends, Employer Concentration, Employer Pipeline, Industry Distribution, Geographic Placement.

Surveys: Graduate Satisfaction, Employer Satisfaction, Response Rates, Skills Gaps.

Administration: Program Performance, Historical Trends, Program Health, Data Quality, Follow-Up Effectiveness, Staff Workload.

## 49. Report Builder

Eventually allow administrators to create custom reports using filters such as reporting period, program, campus, department, credential, student classification, employer, industry, placement status, verification status, and licensure status. Outputs should include on-screen table, CSV, Excel, and PDF. Custom reports should support saved report definitions.

## 50. Scheduled Reports

Future functionality may allow administrators to subscribe to reports such as Monthly Outcomes Summary, Weekly Missing Verification Report, Quarterly Employer Report, and Annual CPL Readiness Report. Do not implement email scheduling until the core reporting system is stable.

## 51. Import System

Support imports from CSV, Excel, and SIS exports. Workflow: Upload -> Map columns -> Validate -> Preview -> Identify conflicts -> Import -> Generate import report. Never silently discard invalid records.

Column mappings should be savable as reusable profiles per source system so recurring imports (e.g., each term's SIS export) do not require remapping from scratch.

## 52. Data Export

Support exports for student outcome records, CPL calculation details, employer records, follow-up records, licensure results, validation errors, and survey results. Exports should honor user permissions.

## 53. Dashboard Drill-Down Principle

No dashboard should contain unexplained numbers. Every major metric should allow Metric -> records -> student -> classification -> evidence -> audit history. This principle is central to OutcomeLink.

## 54. Search

Provide global search for Student, Student ID, Employer, Program, and Contact. Search results should respect permissions.

## 55. Notifications

Internal notifications should support Follow-up due, Follow-up overdue, Verification required, Licensure result required, Validation error, Improvement-plan task due, and Program below threshold. Email notifications can be added later.

## 56. Security

Implement authentication, role-based authorization, program-level access, campus-level access, secure file access, audit logging, session expiration, password security, input validation, and API authorization. Sensitive student information must never be exposed through public APIs. Public portfolio deployments should contain synthetic data only.

Although portfolio deployments use only synthetic data, the design should treat student outcome data as subject to FERPA-equivalent protections, since this reflects the real-world compliance environment the system is modeled on.

## 57. Recommended Technology Stack

Frontend: React + TypeScript
Backend: Node.js + Express + TypeScript
Database: MySQL
ORM: Sequelize or another well-supported TypeScript-compatible ORM
Testing: Jest, Supertest, Vitest, Cypress
Authentication: JWT or secure session-based authentication
Charts: modern React charting library
Mapping: Leaflet/OpenStreetMap or another appropriate mapping solution

The architecture should emphasize maintainability, testing, separation of concerns, and business-rule isolation.

## 58. Suggested Backend Architecture

Use clear domain separation. Suggested top-level modules:

auth/
students/
programs/
outcomes/
employers/
placements/
licensure/
followups/
surveys/
evidence/
reports/
accreditation/
audit/
notifications/
imports/

Within accreditation:
frameworks/
rules/
classifiers/
calculators/
validators/
benchmarks/
explanations/

Do not allow accreditation logic to become mixed with controllers.

## 59. API Conventions

Define consistent conventions for the backend API early: versioning strategy, request/response envelope shape, pagination parameters, a standard error format (including validation error detail suitable for the Import System and Accreditation Validation Engine), and consistent authorization error handling. These conventions should be documented once and applied uniformly across all domain modules rather than decided ad hoc per endpoint.

## 60. Testing Requirements

Accreditation calculations require extensive automated testing. Tests should cover every student classification, numerator inclusion, denominator inclusion, exclusions, boundary conditions, missing information, invalid classifications, historical rule sets, program calculations, institutional calculations, and licensure calculations. The accreditation engine should eventually have a comprehensive test matrix based directly on published COE examples and definitions.

## 61. Demo Data

Create realistic synthetic data for a demonstration institution such as Mountain West Technical College with Main Campus and North Campus. Programs may include Software Development, Cybersecurity, Welding Technology, Practical Nursing, Medical Assisting, Cosmetology, Automotive Technology, and Electrical Apprenticeship.

Target at least 1,000 synthetic student records, 100+ employers, and 3-5 reporting years. Include programs below benchmark, missing outcomes, missing verification, licensure failures, strong and weak programs, and historical trends.

## 62. MVP

Phase 1 should include Authentication and roles, Programs, Student import, Student records, Outcome records, Employers, Employment/placement, Follow-up, Verification, Basic evidence, COE rule engine, CPL calculations, Student calculation explanation, CPL dashboard, Program comparison, Data validation, and Basic audit history.

## 63. Phase 2

Add Licensure workflow, Accreditation readiness, Historical reporting, Improvement plans, Employer analytics, Administrative dashboards, Excel exports, Advanced drill-down, Survey system, Duplicate student merge workflow, Bulk verification and follow-up actions, and Saved import mapping profiles.

## 64. Phase 3

Add Graduate surveys, Employer surveys, Skills-gap analysis, Geographic placement, Custom report builder, Scheduled reports, Advanced workflow automation, Additional accreditation frameworks, and SIS/API integrations.

## 65. Portfolio Objectives

OutcomeLink should demonstrate professional competency in requirements analysis, domain modeling, relational database design, enterprise web development, React/TypeScript, API development, MySQL, authentication, authorization, complex business rules, rules engines, data validation, reporting, analytics, workflow automation, auditability, data import/export, automated testing, and compliance-oriented software design.

The most important technical demonstration is not CRUD. It is:

raw institutional data -> rule-based classification -> auditable calculations -> actionable administrative information.

## 66. Product Philosophy

OutcomeLink should make complex institutional outcome reporting understandable. Users should never have to trust a mysterious percentage. The system should answer where a number came from, which students are included or excluded and why, what evidence supports the outcome, what data is missing, which programs need attention, whether performance is improving, where graduates are being hired, which employers are strongest partners, what skills employers are requesting, and what actions administrators should take next.

OutcomeLink should function as both an accreditation compliance system and an institutional decision-support system.

## 67. Critical Development Instruction

Before implementing COE calculations, obtain and review the applicable official Council on Occupational Education documentation for the target reporting year.

Create a documented rule matrix showing:
COE definition -> OutcomeLink classification -> numerator behavior -> denominator behavior -> exclusion behavior -> validation rules -> automated tests

Do not guess accreditation rules. Where a COE rule is ambiguous, isolate the behavior behind configuration or a rule definition so it can be corrected without redesigning the application. Accuracy, traceability, and explainability are higher priorities than implementation speed.
