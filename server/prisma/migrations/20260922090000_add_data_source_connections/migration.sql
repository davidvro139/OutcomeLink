-- CreateTable
CREATE TABLE `data_source_connections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `institution_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'DATAVERSE_ODATA',
    `environment_url` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret_encrypted` TEXT NOT NULL,
    `entity_logical_name` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_tested_at` DATETIME(3) NULL,
    `last_test_status` VARCHAR(191) NULL,
    `last_test_error` TEXT NULL,

    UNIQUE INDEX `data_source_connections_institution_id_name_key`(`institution_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `data_source_connections` ADD CONSTRAINT `data_source_connections_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `import_batches` ADD COLUMN `data_source_connection_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_data_source_connection_id_fkey` FOREIGN KEY (`data_source_connection_id`) REFERENCES `data_source_connections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
