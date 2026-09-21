-- AlterTable
ALTER TABLE `notifications`
    MODIFY `type` ENUM('FOLLOW_UP_DUE', 'FOLLOW_UP_OVERDUE', 'VERIFICATION_REQUIRED', 'LICENSURE_RESULT_REQUIRED', 'VALIDATION_ERROR', 'IMPROVEMENT_PLAN_TASK_DUE', 'PROGRAM_BELOW_THRESHOLD', 'MISSING_OUTCOMES_DIGEST', 'SCHEDULED_REPORT_READY') NOT NULL;

-- CreateTable
CREATE TABLE `scheduled_report_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY') NOT NULL,
    `report_source` ENUM('SAVED_REPORT', 'BUILT_IN') NOT NULL,
    `saved_report_id` INTEGER NULL,
    `built_in_report_type` ENUM('OUTCOME_FUNNEL', 'UNKNOWN_OUTCOMES', 'EMPLOYER_ANALYTICS', 'CPL_READINESS') NULL,
    `reporting_period_id` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_run_at` DATETIME(3) NULL,
    `next_run_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `scheduled_report_subscriptions_institution_id_name_key`(`institution_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_report_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `run_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL,
    `error_message` TEXT NULL,
    `file_reference` VARCHAR(191) NULL,
    `row_count` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `scheduled_report_subscriptions` ADD CONSTRAINT `scheduled_report_subscriptions_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_report_subscriptions` ADD CONSTRAINT `scheduled_report_subscriptions_saved_report_id_fkey` FOREIGN KEY (`saved_report_id`) REFERENCES `saved_reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_report_subscriptions` ADD CONSTRAINT `scheduled_report_subscriptions_reporting_period_id_fkey` FOREIGN KEY (`reporting_period_id`) REFERENCES `reporting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_report_subscriptions` ADD CONSTRAINT `scheduled_report_subscriptions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_report_runs` ADD CONSTRAINT `scheduled_report_runs_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `scheduled_report_subscriptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
