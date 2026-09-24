-- AlterTable
ALTER TABLE `notifications`
    MODIFY `type` ENUM('FOLLOW_UP_DUE', 'FOLLOW_UP_OVERDUE', 'VERIFICATION_REQUIRED', 'LICENSURE_RESULT_REQUIRED', 'VALIDATION_ERROR', 'IMPROVEMENT_PLAN_TASK_DUE', 'PROGRAM_BELOW_THRESHOLD', 'MISSING_OUTCOMES_DIGEST', 'SCHEDULED_REPORT_READY', 'REPORT_EXPORT_READY', 'BACKUP_STALE') NOT NULL;

-- AlterTable
ALTER TABLE `email_deliveries`
    MODIFY `purpose` ENUM('TEST', 'INVITATION', 'PASSWORD_RESET', 'GRADUATE_SURVEY', 'EMPLOYER_SURVEY', 'STAFF_NOTIFICATION') NOT NULL;

-- CreateTable
CREATE TABLE `institution_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `smtp_host` VARCHAR(191) NULL,
    `smtp_port` INTEGER NULL,
    `smtp_secure` BOOLEAN NOT NULL DEFAULT false,
    `smtp_user` VARCHAR(191) NULL,
    `smtp_password_encrypted` TEXT NULL,
    `mail_from` VARCHAR(191) NULL,
    `retention_job_run_days` INTEGER NULL,
    `retention_email_log_days` INTEGER NULL,
    `retention_notification_days` INTEGER NULL,
    `retention_export_days` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `institution_settings_institution_id_key`(`institution_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backup_checkins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('SUCCESS', 'FAILED') NOT NULL,
    `note` TEXT NULL,
    `size_mb` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `backup_checkins_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
