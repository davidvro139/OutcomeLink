-- AlterTable
ALTER TABLE `notifications`
    MODIFY `type` ENUM('FOLLOW_UP_DUE', 'FOLLOW_UP_OVERDUE', 'VERIFICATION_REQUIRED', 'LICENSURE_RESULT_REQUIRED', 'VALIDATION_ERROR', 'IMPROVEMENT_PLAN_TASK_DUE', 'PROGRAM_BELOW_THRESHOLD', 'MISSING_OUTCOMES_DIGEST', 'SCHEDULED_REPORT_READY', 'REPORT_EXPORT_READY') NOT NULL;

-- CreateTable
CREATE TABLE `report_export_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `requested_by` INTEGER NOT NULL,
    `definition` JSON NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `file_reference` VARCHAR(191) NULL,
    `row_count` INTEGER NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `report_export_jobs` ADD CONSTRAINT `report_export_jobs_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_export_jobs` ADD CONSTRAINT `report_export_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
