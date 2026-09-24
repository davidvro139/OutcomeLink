-- AlterTable
ALTER TABLE `users` ADD COLUMN `email_notifications` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `email_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `purpose` ENUM('INVITATION', 'PASSWORD_RESET', 'GRADUATE_SURVEY', 'EMPLOYER_SURVEY', 'STAFF_NOTIFICATION') NOT NULL,
    `to_address` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `status` ENUM('SENT', 'FAILED') NOT NULL,
    `error_message` TEXT NULL,
    `related_entity_type` VARCHAR(191) NULL,
    `related_entity_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_deliveries_institution_id_created_at_idx`(`institution_id`, `created_at`),
    INDEX `email_deliveries_related_idx`(`related_entity_type`, `related_entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
