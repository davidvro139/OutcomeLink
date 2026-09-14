-- CreateTable
CREATE TABLE `institutions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `zip` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `programs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `campus_id` INTEGER NOT NULL,
    `department_id` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `cip_code` VARCHAR(191) NULL,
    `credential_type` VARCHAR(191) NOT NULL,
    `program_length` VARCHAR(191) NULL,
    `clock_hours` INTEGER NULL,
    `credit_hours` INTEGER NULL,
    `licensure_required` BOOLEAN NOT NULL DEFAULT false,
    `accreditation_reporting_status` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `effective_start_date` DATETIME(3) NULL,
    `effective_end_date` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cohorts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `entry_term` VARCHAR(191) NULL,
    `entry_year` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('SYSTEM_ADMINISTRATOR', 'INSTITUTIONAL_ADMINISTRATOR', 'PROGRAM_ADMINISTRATOR', 'CAREER_SERVICES_STAFF', 'INSTRUCTOR_STAFF', 'READ_ONLY_AUDITOR') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_program_access` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `program_id` INTEGER NOT NULL,

    UNIQUE INDEX `user_program_access_user_id_program_id_key`(`user_id`, `program_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_campus_access` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `campus_id` INTEGER NOT NULL,

    UNIQUE INDEX `user_campus_access_user_id_campus_id_key`(`user_id`, `campus_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `internal_student_id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `preferred_name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `students_institution_id_internal_student_id_key`(`institution_id`, `internal_student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_communication_preferences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `preferred_contact_method` ENUM('PHONE', 'EMAIL', 'SMS', 'SURVEY', 'IN_PERSON', 'EMPLOYER_CONTACT', 'OTHER') NULL,
    `sms_consent_status` BOOLEAN NULL,
    `sms_consent_date` DATETIME(3) NULL,
    `do_not_contact` BOOLEAN NOT NULL DEFAULT false,
    `do_not_contact_reason` TEXT NULL,

    UNIQUE INDEX `student_communication_preferences_student_id_key`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_enrollments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `program_id` INTEGER NOT NULL,
    `campus_id` INTEGER NOT NULL,
    `cohort_id` INTEGER NULL,
    `start_date` DATETIME(3) NOT NULL,
    `expected_completion_date` DATETIME(3) NULL,
    `actual_completion_date` DATETIME(3) NULL,
    `enrollment_status` ENUM('ACTIVE', 'GRADUATE_COMPLETER', 'NON_GRADUATE_COMPLETER', 'WITHDRAWN', 'TRANSFERRED', 'OTHER') NOT NULL,
    `credential_earned` VARCHAR(191) NULL,
    `exit_reason` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accreditation_frameworks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `accreditation_frameworks_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rule_sets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `framework_id` INTEGER NOT NULL,
    `version_label` VARCHAR(191) NOT NULL,
    `effective_start_date` DATETIME(3) NOT NULL,
    `effective_end_date` DATETIME(3) NULL,
    `rule_definition_schema_version` VARCHAR(191) NULL,
    `rule_definition` JSON NOT NULL,

    UNIQUE INDEX `rule_sets_framework_id_version_label_key`(`framework_id`, `version_label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reporting_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `rule_set_id` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `cohort_window_definition` JSON NULL,
    `status` ENUM('OPEN', 'READY_FOR_REVIEW', 'FINALIZED', 'SUBMITTED', 'REOPENED') NOT NULL DEFAULT 'OPEN',
    `finalized_at` DATETIME(3) NULL,
    `finalized_by` VARCHAR(191) NULL,
    `reopened_at` DATETIME(3) NULL,
    `reopened_by` VARCHAR(191) NULL,
    `reopen_reason` TEXT NULL,

    UNIQUE INDEX `reporting_periods_institution_id_label_key`(`institution_id`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_classifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_enrollment_id` INTEGER NOT NULL,
    `reporting_period_id` INTEGER NOT NULL,
    `metric` ENUM('COMPLETION', 'PLACEMENT', 'LICENSURE') NOT NULL,
    `classification_code` VARCHAR(191) NOT NULL,
    `determined_by_rule_set_id` INTEGER NOT NULL,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `student_classifications_student_enrollment_id_reporting_peri_key`(`student_enrollment_id`, `reporting_period_id`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cpl_calculation_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program_id` INTEGER NULL,
    `reporting_period_id` INTEGER NOT NULL,
    `metric` ENUM('COMPLETION', 'PLACEMENT', 'LICENSURE') NOT NULL,
    `numerator` INTEGER NOT NULL,
    `denominator` INTEGER NOT NULL,
    `percentage` DECIMAL(5, 2) NOT NULL,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cpl_calculation_results_program_id_reporting_period_id_metri_key`(`program_id`, `reporting_period_id`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cpl_calculation_explanations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_classification_id` INTEGER NOT NULL,
    `counts_in_numerator` BOOLEAN NOT NULL,
    `counts_in_denominator` BOOLEAN NOT NULL,
    `reason_text` TEXT NOT NULL,

    UNIQUE INDEX `cpl_calculation_explanations_student_classification_id_key`(`student_classification_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `validation_issues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reporting_period_id` INTEGER NOT NULL,
    `student_id` INTEGER NULL,
    `program_id` INTEGER NULL,
    `issue_type` VARCHAR(191) NOT NULL,
    `severity` ENUM('ERROR', 'WARNING', 'INFORMATION') NOT NULL,
    `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_outcome_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_enrollment_id` INTEGER NOT NULL,
    `reporting_period_id` INTEGER NOT NULL,
    `completion_classification` VARCHAR(191) NULL,
    `employment_status` VARCHAR(191) NULL,
    `employer_id` INTEGER NULL,
    `job_title` VARCHAR(191) NULL,
    `employment_start_date` DATETIME(3) NULL,
    `related_to_training` BOOLEAN NULL,
    `related_to_training_justification` TEXT NULL,
    `continuing_education_status` VARCHAR(191) NULL,
    `military_status` VARCHAR(191) NULL,
    `availability_for_employment_status` VARCHAR(191) NULL,
    `licensure_required` BOOLEAN NOT NULL DEFAULT false,
    `verification_status` VARCHAR(191) NULL,
    `verification_method` VARCHAR(191) NULL,
    `verified_by` VARCHAR(191) NULL,
    `verification_date` DATETIME(3) NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employment_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `employer_id` INTEGER NOT NULL,
    `job_title` VARCHAR(191) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `full_time` BOOLEAN NOT NULL,
    `related_to_training` BOOLEAN NOT NULL,
    `relationship_determination_method` VARCHAR(191) NULL,
    `salary_or_wage` DECIMAL(10, 2) NULL,
    `employment_status` VARCHAR(191) NOT NULL,
    `verification_status` VARCHAR(191) NULL,
    `verification_date` DATETIME(3) NULL,
    `verification_source` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `licensure_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `program_id` INTEGER NOT NULL,
    `exam_name` VARCHAR(191) NOT NULL,
    `scheduled_date` DATETIME(3) NULL,
    `exam_date` DATETIME(3) NULL,
    `result` ENUM('PASSED', 'FAILED', 'UNKNOWN', 'WAITING', 'SCHEDULED') NOT NULL,
    `attempt_number` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `industry` VARCHAR(191) NULL,
    `naics_code` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `zip` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employer_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employer_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `is_primary_contact` BOOLEAN NOT NULL DEFAULT false,
    `is_verification_contact` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `follow_up_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `staff_user_id` INTEGER NOT NULL,
    `attempted_at` DATETIME(3) NOT NULL,
    `method` ENUM('PHONE', 'EMAIL', 'SMS', 'SURVEY', 'IN_PERSON', 'EMPLOYER_CONTACT', 'OTHER') NOT NULL,
    `outcome` ENUM('NO_RESPONSE', 'STUDENT_CONTACTED', 'EMPLOYMENT_REPORTED', 'EMPLOYMENT_VERIFIED', 'SEEKING_EMPLOYMENT', 'CONTINUING_EDUCATION', 'UNAVAILABLE', 'INCORRECT_CONTACT_INFORMATION', 'FOLLOW_UP_REQUIRED', 'COMPLETE') NOT NULL,
    `notes` TEXT NULL,
    `next_follow_up_date` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `outcome_record_id` INTEGER NULL,
    `employment_record_id` INTEGER NULL,
    `verification_method` VARCHAR(191) NULL,
    `verified_by` VARCHAR(191) NULL,
    `verification_date` DATETIME(3) NULL,
    `verification_status` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `outcome_record_id` INTEGER NULL,
    `employment_record_id` INTEGER NULL,
    `licensure_result_id` INTEGER NULL,
    `evidence_type` ENUM('EMPLOYER_VERIFICATION', 'GRADUATE_CONFIRMATION', 'EMAIL', 'LETTER', 'SURVEY', 'EMPLOYMENT_DOCUMENTATION', 'LICENSURE_RESULT', 'SCHOOL_RECORD', 'OTHER') NOT NULL,
    `file_reference` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `uploaded_by` VARCHAR(191) NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verification_status` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `communication_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `event_type` ENUM('FOLLOW_UP_ATTEMPT', 'SURVEY_SENT', 'SURVEY_RESPONSE', 'VERIFICATION_CONTACT', 'NOTIFICATION') NOT NULL,
    `source_id` INTEGER NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `summary_text` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `graduate_surveys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `sent_at` DATETIME(3) NOT NULL,
    `channel` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `graduate_survey_responses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `survey_id` INTEGER NOT NULL,
    `employment_status` VARCHAR(191) NULL,
    `employer` VARCHAR(191) NULL,
    `job_title` VARCHAR(191) NULL,
    `related_to_training_response` VARCHAR(191) NULL,
    `continuing_education` VARCHAR(191) NULL,
    `satisfaction_rating` INTEGER NULL,
    `skills_preparedness_rating` INTEGER NULL,
    `comments` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `graduate_survey_responses_survey_id_key`(`survey_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employer_surveys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employer_id` INTEGER NOT NULL,
    `student_id` INTEGER NOT NULL,
    `sent_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employer_survey_responses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `survey_id` INTEGER NOT NULL,
    `employment_verification` VARCHAR(191) NULL,
    `technical_preparedness_rating` INTEGER NULL,
    `communication_rating` INTEGER NULL,
    `problem_solving_rating` INTEGER NULL,
    `professionalism_rating` INTEGER NULL,
    `overall_satisfaction_rating` INTEGER NULL,
    `skills_gap_notes` TEXT NULL,
    `likelihood_to_hire_again_rating` INTEGER NULL,
    `comments` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employer_survey_responses_survey_id_key`(`survey_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `improvement_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program_id` INTEGER NOT NULL,
    `metric` ENUM('COMPLETION', 'PLACEMENT', 'LICENSURE') NOT NULL,
    `reporting_period_id` INTEGER NOT NULL,
    `current_result` DECIMAL(5, 2) NULL,
    `target` DECIMAL(5, 2) NULL,
    `problem_description` TEXT NULL,
    `root_cause` TEXT NULL,
    `responsible_user_id` INTEGER NOT NULL,
    `due_date` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'MONITORING', 'COMPLETED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `improvement_plan_updates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `improvement_plan_id` INTEGER NOT NULL,
    `update_text` TEXT NOT NULL,
    `corrective_action` TEXT NULL,
    `supporting_evidence_id` INTEGER NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'FINALIZE', 'REOPEN') NOT NULL,
    `field_changed` VARCHAR(191) NULL,
    `previous_value` TEXT NULL,
    `new_value` TEXT NULL,
    `user_id` INTEGER NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` TEXT NULL,

    INDEX `audit_log_entries_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_merge_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `surviving_student_id` INTEGER NOT NULL,
    `merged_student_id` INTEGER NOT NULL,
    `performed_by` VARCHAR(191) NOT NULL,
    `performed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_system` VARCHAR(191) NOT NULL,
    `uploaded_by` VARCHAR(191) NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mapping_profile_id` INTEGER NULL,
    `status` ENUM('UPLOADED', 'MAPPED', 'VALIDATED', 'PREVIEWED', 'IMPORTED', 'FAILED') NOT NULL DEFAULT 'UPLOADED',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_mapping_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `source_system_name` VARCHAR(191) NOT NULL,
    `column_mapping` JSON NOT NULL,

    UNIQUE INDEX `import_mapping_profiles_institution_id_source_system_name_key`(`institution_id`, `source_system_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_row_errors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `import_batch_id` INTEGER NOT NULL,
    `row_number` INTEGER NOT NULL,
    `error_message` TEXT NOT NULL,
    `raw_row_data` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` ENUM('FOLLOW_UP_DUE', 'FOLLOW_UP_OVERDUE', 'VERIFICATION_REQUIRED', 'LICENSURE_RESULT_REQUIRED', 'VALIDATION_ERROR', 'IMPROVEMENT_PLAN_TASK_DUE', 'PROGRAM_BELOW_THRESHOLD') NOT NULL,
    `reference_entity_type` VARCHAR(191) NULL,
    `reference_entity_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `campuses` ADD CONSTRAINT `campuses_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `programs` ADD CONSTRAINT `programs_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `programs` ADD CONSTRAINT `programs_campus_id_fkey` FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `programs` ADD CONSTRAINT `programs_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cohorts` ADD CONSTRAINT `cohorts_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_program_access` ADD CONSTRAINT `user_program_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_program_access` ADD CONSTRAINT `user_program_access_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_campus_access` ADD CONSTRAINT `user_campus_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_campus_access` ADD CONSTRAINT `user_campus_access_campus_id_fkey` FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_communication_preferences` ADD CONSTRAINT `student_communication_preferences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_campus_id_fkey` FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_cohort_id_fkey` FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rule_sets` ADD CONSTRAINT `rule_sets_framework_id_fkey` FOREIGN KEY (`framework_id`) REFERENCES `accreditation_frameworks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reporting_periods` ADD CONSTRAINT `reporting_periods_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reporting_periods` ADD CONSTRAINT `reporting_periods_rule_set_id_fkey` FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_classifications` ADD CONSTRAINT `student_classifications_student_enrollment_id_fkey` FOREIGN KEY (`student_enrollment_id`) REFERENCES `student_enrollments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_classifications` ADD CONSTRAINT `student_classifications_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_classifications` ADD CONSTRAINT `student_classifications_determined_by_rule_set_id_fkey` FOREIGN KEY (`determined_by_rule_set_id`) REFERENCES `rule_sets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpl_calculation_results` ADD CONSTRAINT `cpl_calculation_results_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpl_calculation_results` ADD CONSTRAINT `cpl_calculation_results_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpl_calculation_explanations` ADD CONSTRAINT `cpl_calculation_explanations_student_classification_id_fkey` FOREIGN KEY (`student_classification_id`) REFERENCES `student_classifications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_issues` ADD CONSTRAINT `validation_issues_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_issues` ADD CONSTRAINT `validation_issues_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_issues` ADD CONSTRAINT `validation_issues_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_outcome_records` ADD CONSTRAINT `student_outcome_records_student_enrollment_id_fkey` FOREIGN KEY (`student_enrollment_id`) REFERENCES `student_enrollments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_outcome_records` ADD CONSTRAINT `student_outcome_records_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_outcome_records` ADD CONSTRAINT `student_outcome_records_employer_id_fkey` FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employment_records` ADD CONSTRAINT `employment_records_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employment_records` ADD CONSTRAINT `employment_records_employer_id_fkey` FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licensure_results` ADD CONSTRAINT `licensure_results_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licensure_results` ADD CONSTRAINT `licensure_results_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employers` ADD CONSTRAINT `employers_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_contacts` ADD CONSTRAINT `employer_contacts_employer_id_fkey` FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_up_attempts` ADD CONSTRAINT `follow_up_attempts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_up_attempts` ADD CONSTRAINT `follow_up_attempts_staff_user_id_fkey` FOREIGN KEY (`staff_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_records` ADD CONSTRAINT `verification_records_outcome_record_id_fkey` FOREIGN KEY (`outcome_record_id`) REFERENCES `student_outcome_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_records` ADD CONSTRAINT `verification_records_employment_record_id_fkey` FOREIGN KEY (`employment_record_id`) REFERENCES `employment_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_outcome_record_id_fkey` FOREIGN KEY (`outcome_record_id`) REFERENCES `student_outcome_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_employment_record_id_fkey` FOREIGN KEY (`employment_record_id`) REFERENCES `employment_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_licensure_result_id_fkey` FOREIGN KEY (`licensure_result_id`) REFERENCES `licensure_results`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `communication_events` ADD CONSTRAINT `communication_events_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `graduate_surveys` ADD CONSTRAINT `graduate_surveys_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `graduate_survey_responses` ADD CONSTRAINT `graduate_survey_responses_survey_id_fkey` FOREIGN KEY (`survey_id`) REFERENCES `graduate_surveys`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_surveys` ADD CONSTRAINT `employer_surveys_employer_id_fkey` FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_surveys` ADD CONSTRAINT `employer_surveys_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_survey_responses` ADD CONSTRAINT `employer_survey_responses_survey_id_fkey` FOREIGN KEY (`survey_id`) REFERENCES `employer_surveys`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_plans` ADD CONSTRAINT `improvement_plans_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_plans` ADD CONSTRAINT `improvement_plans_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_plans` ADD CONSTRAINT `improvement_plans_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_plan_updates` ADD CONSTRAINT `improvement_plan_updates_improvement_plan_id_fkey` FOREIGN KEY (`improvement_plan_id`) REFERENCES `improvement_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_plan_updates` ADD CONSTRAINT `improvement_plan_updates_supporting_evidence_id_fkey` FOREIGN KEY (`supporting_evidence_id`) REFERENCES `evidence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log_entries` ADD CONSTRAINT `audit_log_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_merge_logs` ADD CONSTRAINT `student_merge_logs_surviving_student_id_fkey` FOREIGN KEY (`surviving_student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_merge_logs` ADD CONSTRAINT `student_merge_logs_merged_student_id_fkey` FOREIGN KEY (`merged_student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_mapping_profile_id_fkey` FOREIGN KEY (`mapping_profile_id`) REFERENCES `import_mapping_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_mapping_profiles` ADD CONSTRAINT `import_mapping_profiles_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_row_errors` ADD CONSTRAINT `import_row_errors_import_batch_id_fkey` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
