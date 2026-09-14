# OutcomeLink Data Model (Draft v2)

This is a first-pass logical data model derived from `OutcomeLink_Project_Specification.md`. It is meant to be argued with, not implemented as-is. Field lists are logical (not final column types); PK/FK conventions assume surrogate integer or UUID keys unless noted.

Every table that participates in accreditation calculations carries `reporting_period_id` explicitly rather than deriving it from a date range at query time (see spec §16).

## 1. Entity groups

- **Org structure**: Institution, Campus, Department, Program, Cohort
- **Identity & access**: User, Role, UserProgramAccess, UserCampusAccess
- **Students**: Student, StudentCommunicationPreference, StudentEnrollment
- **Accreditation engine**: AccreditationFramework, RuleSet, ReportingPeriod, StudentClassification, CplCalculationResult, CplCalculationExplanation, ValidationIssue
- **Outcomes**: StudentOutcomeRecord, EmploymentRecord, LicensureResult
- **Employers**: Employer, EmployerContact
- **Follow-up & verification**: FollowUpAttempt, VerificationRecord, Evidence, CommunicationEvent (timeline)
- **Surveys**: GraduateSurvey, GraduateSurveyResponse, EmployerSurvey, EmployerSurveyResponse
- **Improvement & governance**: ImprovementPlan, ImprovementPlanUpdate, AuditLogEntry, StudentMergeLog
- **Operations**: ImportBatch, ImportMappingProfile, ImportRowError, Notification

## 2. Org structure

**Institution**

- id (PK)
- name
- created_at

**Campus**

- id (PK)
- institution_id (FK -> Institution)
- name
- address fields

**Department** (optional)

- id (PK)
- institution_id (FK)
- name

**Program**

- id (PK)
- institution_id (FK)
- campus_id (FK -> Campus)
- department_id (FK -> Department, nullable)
- name, code, cip_code
- credential_type
- program_length, clock_hours, credit_hours
- licensure_required (bool)
- accreditation_reporting_status
- active, effective_start_date, effective_end_date

**Cohort** (optional)

- id (PK)
- program_id (FK)
- name, entry_term, entry_year

Cohort is descriptive grouping only (for Cohort Analysis, spec §30) — it does not drive reporting-period cohort-window logic. Whether a student's outcome falls into a given `ReportingPeriod` is determined purely by date fields (completion date, etc.) evaluated against the period's `cohort_window_definition`, not by `Cohort` membership. Keeping these independent means a program can change its cohort structure without touching accreditation calculation logic.

## 3. Identity & access

**User**

- id (PK)
- institution_id (FK)
- name, email, password_hash
- role_id (FK -> Role) — or many-to-many if a user can hold multiple roles
- active, last_login_at

**Role** (enum-backed lookup: System Administrator, Institutional Administrator, Program Administrator, Career Services / Placement Staff, Instructor/Staff, Read-Only/Auditor)

**UserProgramAccess** — many-to-many User <-> Program, for program-scoped roles
**UserCampusAccess** — many-to-many User <-> Campus, for campus-scoped roles

## 4. Students

**Student**

- id (PK)
- institution_id (FK)
- internal_student_id
- first_name, last_name, preferred_name
- email, phone
- created_at

**StudentCommunicationPreference**

- id (PK)
- student_id (FK, 1:1)
- preferred_contact_method
- sms_consent_status, sms_consent_date
- do_not_contact (bool), do_not_contact_reason

**StudentEnrollment**

- id (PK)
- student_id (FK)
- program_id (FK)
- campus_id (FK)
- cohort_id (FK, nullable)
- start_date, expected_completion_date, actual_completion_date
- enrollment_status (Active, Graduate Completer, Non-Graduate Completer, Withdrawn, Transferred, Other — display status only)
- credential_earned, exit_reason

A student may have more than one `StudentEnrollment` over time (re-enrollment in a different program). Accreditation classification is never derived from `enrollment_status` directly — that's the rules engine's job, driven off `StudentEnrollment` + `StudentOutcomeRecord` data (spec §3, §6).

## 5. Accreditation engine

**AccreditationFramework**

- id (PK)
- name (e.g., "COE")
- description

**RuleSet**

- id (PK)
- framework_id (FK)
- version_label (e.g., "COE-2026")
- effective_start_date, effective_end_date
- rule_definition_schema_version — deliberately unresolved (see Design Decisions §13)
- rule_definition (structured config: classification rules, numerator/denominator rules, exclusions, benchmarks — see §6 below)

**ReportingPeriod**

- id (PK)
- institution_id (FK)
- rule_set_id (FK -> RuleSet) — pins the rule version for this period, per spec §16/§18
- label, start_date, end_date
- cohort_window_definition (how completion dates map into this period)
- status (Open, Ready for Review, Finalized, Submitted, Reopened)
- finalized_at, finalized_by, reopened_at, reopened_by, reopen_reason

**StudentClassification**

- id (PK)
- student_enrollment_id (FK)
- reporting_period_id (FK)
- metric (Completion | Placement | Licensure) — a student is classified separately per metric, since COE eligibility/exclusion rules differ by metric (e.g., a student in continuing education may be excluded from the Placement denominator but still counted for Completion)
- classification_code (rule-set-controlled value, e.g., Graduate Completer / Non-Completer / Exclusion category — meaning is metric-specific)
- determined_by_rule_set_id (FK) — should match the reporting period's rule set, but stored explicitly for traceability if a period is reopened under a later rule set
- computed_at
- unique (student_enrollment_id, reporting_period_id, metric)

**CplCalculationResult**

- id (PK)
- program_id (FK, nullable for institution-level rollups)
- reporting_period_id (FK)
- metric (Completion | Placement | Licensure)
- numerator, denominator, percentage
- computed_at

**CplCalculationExplanation** — backs the "How This Student Counts" panel (spec §19), one row per `StudentClassification`

- id (PK)
- student_classification_id (FK, 1:1) — metric is inherited from the classification row, not duplicated here
- counts_in_numerator (bool), counts_in_denominator (bool)
- reason_text (generated by the calculation engine, not hand-written)

**ValidationIssue**

- id (PK)
- reporting_period_id (FK)
- student_id (FK, nullable — some issues are program- or period-level, e.g. "enrollment totals do not reconcile")
- program_id (FK, nullable)
- issue_type (missing classification, missing completion date, employment without employer, etc. — spec §22)
- severity (ERROR | WARNING | INFORMATION)
- detected_at, resolved_at, resolved_by

## 6. Outcomes

**StudentOutcomeRecord**

- id (PK)
- student_enrollment_id (FK)
- reporting_period_id (FK)
- completion_classification
- employment_status
- employer_id (FK, nullable)
- job_title, employment_start_date
- related_to_training (bool), related_to_training_justification
- continuing_education_status
- military_status (nullable)
- availability_for_employment_status
- licensure_required (bool)
- verification_status, verification_method, verified_by, verification_date
- notes

**EmploymentRecord** — historical, not overwritten (spec §8)

- id (PK)
- student_id (FK)
- employer_id (FK)
- job_title
- start_date, end_date (nullable)
- full_time (bool)
- related_to_training (bool), relationship_determination_method
- salary_or_wage (nullable, voluntary)
- employment_status
- verification_status, verification_date, verification_source
- notes

**LicensureResult**

- id (PK)
- student_id (FK)
- program_id (FK)
- exam_name
- scheduled_date, exam_date
- result (Passed | Failed | Unknown | Waiting | Scheduled)
- attempt_number (supports first-attempt pass rate)

## 7. Employers

**Employer**

- id (PK)
- institution_id (FK)
- name, industry, naics_code
- address, city, state, zip, website
- notes, active

**EmployerContact**

- id (PK)
- employer_id (FK)
- name, title, phone, email
- is_primary_contact (bool), is_verification_contact (bool)

Employer profile aggregates (hire counts, time-to-employment, survey results) are computed views over `EmploymentRecord` / `EmployerSurveyResponse`, not stored fields — avoids duplicate-source-of-truth drift.

## 8. Follow-up, verification, evidence

**FollowUpAttempt**

- id (PK)
- student_id (FK)
- staff_user_id (FK -> User)
- attempted_at
- method (Phone, Email, SMS, Survey, In person, Employer contact, Other)
- outcome (No response, Student contacted, Employment reported, ... — spec §11)
- notes, next_follow_up_date

**VerificationRecord**

- id (PK)
- outcome_record_id (FK, nullable) or employment_record_id (FK, nullable) — polymorphic target
- verification_method, verified_by, verification_date, verification_status
- CHECK: exactly one target FK is non-null

**Evidence**

- id (PK)
- outcome_record_id (FK, nullable) or employment_record_id (FK, nullable) or licensure_result_id (FK, nullable)
- evidence_type (employer verification, graduate confirmation, email, letter, survey, employment documentation, licensure result, school record, other)
- file_reference, description
- uploaded_by, uploaded_at
- verification_status
- CHECK: exactly one target FK is non-null

See Design Decisions §13 for why real nullable FKs were chosen over a generic `(entity_type, entity_id)` pair for both tables above.

**CommunicationEvent** — denormalized append-only feed backing the Unified Student Communication Timeline (spec §47)

- id (PK)
- student_id (FK)
- event_type (follow_up_attempt | survey_sent | survey_response | verification_contact | notification)
- source_id (id of the underlying FollowUpAttempt / Survey record / etc.)
- occurred_at
- summary_text

## 9. Surveys

**GraduateSurvey** / **GraduateSurveyResponse**

- survey: id, student_id, sent_at, channel
- response: id, survey_id (FK), employment_status, employer, job_title, related_to_training_response, continuing_education, satisfaction_rating, skills_preparedness_rating, comments, submitted_at

**EmployerSurvey** / **EmployerSurveyResponse**

- survey: id, employer_id, student_id (which graduate this concerns), sent_at
- response: id, survey_id (FK), employment_verification, technical_preparedness_rating, communication_rating, problem_solving_rating, professionalism_rating, overall_satisfaction_rating, skills_gap_notes, likelihood_to_hire_again_rating, comments, submitted_at

Survey responses feed `StudentOutcomeRecord` / `EmploymentRecord` only through an explicit review step — they are never auto-promoted to verified accreditation data (spec §43).

## 10. Improvement plans & governance

**ImprovementPlan**

- id (PK)
- program_id (FK)
- metric, reporting_period_id (FK)
- current_result, target
- problem_description, root_cause
- responsible_user_id (FK -> User)
- due_date, status (Draft, Active, Monitoring, Completed, Closed)

**ImprovementPlanUpdate**

- id (PK)
- improvement_plan_id (FK)
- update_text, corrective_action, supporting_evidence_id (FK -> Evidence, nullable)
- created_by, created_at

**AuditLogEntry** — generic, applies across entities (spec §15)

- id (PK)
- entity_type, entity_id
- action (create | update | delete | merge | finalize | reopen)
- field_changed, previous_value, new_value
- user_id (FK), occurred_at, reason

**StudentMergeLog** — specific record of the Duplicate Student Resolution workflow (spec §23)

- id (PK)
- surviving_student_id (FK), merged_student_id (FK)
- performed_by, performed_at, reason

## 11. Operations

**ImportBatch**

- id (PK)
- source_system, uploaded_by, uploaded_at
- mapping_profile_id (FK -> ImportMappingProfile, nullable)
- status (uploaded, mapped, validated, previewed, imported, failed)

**ImportMappingProfile** — reusable column mapping per source system (spec §51)

- id (PK)
- institution_id (FK), source_system_name
- column_mapping (structured: source column -> target field)

**ImportRowError**

- id (PK)
- import_batch_id (FK)
- row_number, error_message, raw_row_data

**Notification**

- id (PK)
- user_id (FK)
- type (Follow-up due, Follow-up overdue, Verification required, Licensure result required, Validation error, Improvement-plan task due, Program below threshold)
- reference_entity_type, reference_entity_id
- created_at, read_at

## 12. ERD (core relationships)

```mermaid
erDiagram
    INSTITUTION ||--o{ CAMPUS : has
    INSTITUTION ||--o{ PROGRAM : has
    CAMPUS ||--o{ PROGRAM : hosts
    PROGRAM ||--o{ COHORT : has
    PROGRAM ||--o{ STUDENT_ENROLLMENT : enrolls

    STUDENT ||--o{ STUDENT_ENROLLMENT : has
    STUDENT ||--o| STUDENT_COMMUNICATION_PREFERENCE : has
    STUDENT_ENROLLMENT ||--o{ STUDENT_OUTCOME_RECORD : produces
    STUDENT_ENROLLMENT ||--o{ STUDENT_CLASSIFICATION : "classified_as (one per metric)"

    ACCREDITATION_FRAMEWORK ||--o{ RULE_SET : versions
    RULE_SET ||--o{ REPORTING_PERIOD : governs
    REPORTING_PERIOD ||--o{ STUDENT_CLASSIFICATION : scopes
    REPORTING_PERIOD ||--o{ CPL_CALCULATION_RESULT : produces
    REPORTING_PERIOD ||--o{ VALIDATION_ISSUE : raises
    STUDENT_CLASSIFICATION ||--o{ CPL_CALCULATION_EXPLANATION : explains

    STUDENT ||--o{ EMPLOYMENT_RECORD : has
    EMPLOYER ||--o{ EMPLOYMENT_RECORD : employs
    EMPLOYER ||--o{ EMPLOYER_CONTACT : has
    STUDENT ||--o{ LICENSURE_RESULT : attempts

    STUDENT ||--o{ FOLLOW_UP_ATTEMPT : receives
    STUDENT ||--o{ COMMUNICATION_EVENT : has
    STUDENT_OUTCOME_RECORD ||--o{ EVIDENCE : supported_by
    EMPLOYMENT_RECORD ||--o{ EVIDENCE : supported_by

    STUDENT ||--o{ GRADUATE_SURVEY : sent
    EMPLOYER ||--o{ EMPLOYER_SURVEY : sent

    PROGRAM ||--o{ IMPROVEMENT_PLAN : has
    IMPROVEMENT_PLAN ||--o{ IMPROVEMENT_PLAN_UPDATE : has

    STUDENT ||--o{ STUDENT_MERGE_LOG : merged_via
```

## 13. Design decisions

1. **Polymorphic targets (`VerificationRecord`, `Evidence`): real nullable FKs, not `(entity_type, entity_id)`.**
   Decision: keep dedicated nullable FK columns per possible target, enforced with a `CHECK` that exactly one is set.
   Rationale: the spec's central theme is traceability and auditability (§3, §49) — a generic polymorphic pair loses referential integrity at the database level, which is the wrong tradeoff for tables that back "sufficient evidence exists" checks and verification-status validation (§14, §22). A few nullable columns per table is a small, honest cost; it also keeps ORM relations (Sequelize) straightforward instead of requiring manual polymorphic association handling.

2. **`RuleSet.rule_definition` shape: deliberately deferred.**
   Decision: model it as an opaque structured config with a `rule_definition_schema_version` placeholder for now; do not design its internal shape yet.
   Rationale: spec §67 explicitly forbids guessing accreditation rules or their structure before reviewing official COE documentation for the target reporting year. Designing the rule schema now would mean designing it twice — once from assumptions, once from the real rules. The rest of the schema (StudentClassification, CplCalculationResult, ValidationIssue) is deliberately decoupled from this internal shape so that work can proceed in parallel.

3. **`StudentClassification` granularity: one row per (student enrollment, reporting period, metric).**
   Decision: classification is now scoped per metric (Completion / Placement / Licensure), not one classification per student per period. Reflected above with an added `metric` column, a uniqueness constraint, and `CplCalculationExplanation` simplified to a 1:1 relationship with `StudentClassification` (metric no longer duplicated there).
   Rationale: COE-style rules routinely include/exclude a student differently per metric — e.g., a student pursuing continuing education is commonly excluded from the Placement denominator while still counting toward Completion. Modeling one classification per student per period would force artificial multi-valued fields or lossy conflation of independent eligibility decisions. This is the one place where getting the granularity wrong would be expensive to unwind later, since it's the join point for every drill-down (§20-21).

4. **`Cohort` is descriptive only; it does not drive reporting-period cohort-window logic.**
   Decision: `Cohort` (entry term/year grouping) and `ReportingPeriod.cohort_window_definition` are independent. A student's assignment to a reporting period is derived purely from date fields evaluated against the rule set's window definition.
   Rationale: conflating the two would mean a change to how a program groups students for internal cohort analysis (§30) could accidentally shift accreditation reporting-period membership — an integrity risk the drill-down/traceability principle (§49) is specifically meant to prevent.

5. **Multi-tenancy: single institution per deployment, but `institution_id` scoping kept throughout.**
   Decision: OutcomeLink is designed as one deployment per institution (matching the demo, Mountain West Technical College, §61), not a multi-tenant SaaS product. Row-level tenant isolation is out of scope for this project.
   Rationale: full multi-tenant isolation (RLS, tenant-scoped auth claims, cross-tenant leakage testing) is a large orthogonal feature that isn't part of the stated portfolio objectives (§65: domain modeling, rules engines, auditability — not multi-tenant architecture). `institution_id` is still threaded through top-level tables at no real cost, so the door isn't closed if that changes later; it just isn't a feature being actively built or tested now.
