-- CreateTable
CREATE TABLE `saved_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `created_by` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `definition` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `saved_reports_institution_id_name_key`(`institution_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saved_reports` ADD CONSTRAINT `saved_reports_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_reports` ADD CONSTRAINT `saved_reports_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
