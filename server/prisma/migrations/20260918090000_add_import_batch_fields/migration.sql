-- AlterTable
ALTER TABLE `import_batches`
    ADD COLUMN `institution_id` INTEGER NOT NULL,
    ADD COLUMN `original_filename` VARCHAR(191) NULL,
    ADD COLUMN `file_reference` VARCHAR(191) NOT NULL,
    ADD COLUMN `column_mapping` JSON NULL,
    ADD COLUMN `total_rows` INTEGER NULL,
    ADD COLUMN `imported_row_count` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
