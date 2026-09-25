-- CreateTable
CREATE TABLE `job_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NULL,
    `job_type` VARCHAR(191) NOT NULL,
    `trigger` ENUM('SCHEDULE', 'MANUAL') NOT NULL,
    `requested_by` INTEGER NULL,
    `status` ENUM('RUNNING', 'RETRY_PENDING', 'SUCCESS', 'FAILED') NOT NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `max_attempts` INTEGER NOT NULL DEFAULT 1,
    `params` JSON NULL,
    `result` JSON NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `next_attempt_at` DATETIME(3) NULL,

    INDEX `job_runs_institution_id_created_at_idx`(`institution_id`, `created_at`),
    INDEX `job_runs_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
