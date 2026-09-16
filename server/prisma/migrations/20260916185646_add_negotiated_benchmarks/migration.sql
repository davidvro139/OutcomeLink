-- CreateTable
CREATE TABLE `negotiated_benchmarks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program_id` INTEGER NOT NULL,
    `metric` ENUM('COMPLETION', 'PLACEMENT', 'LICENSURE') NOT NULL,
    `approved_percentage` DECIMAL(5, 2) NOT NULL,
    `effective_start_date` DATETIME(3) NOT NULL,
    `effective_end_date` DATETIME(3) NULL,
    `approval_reference` TEXT NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `negotiated_benchmarks` ADD CONSTRAINT `negotiated_benchmarks_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
