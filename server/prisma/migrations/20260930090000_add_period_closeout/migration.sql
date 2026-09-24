-- AlterTable
ALTER TABLE `reporting_periods`
    ADD COLUMN `validated_at` DATETIME(3) NULL,
    ADD COLUMN `signed_off_at` DATETIME(3) NULL,
    ADD COLUMN `signed_off_by` VARCHAR(191) NULL,
    ADD COLUMN `signed_off_note` TEXT NULL,
    ADD COLUMN `signed_off_results_at` DATETIME(3) NULL,
    ADD COLUMN `finalize_override_reason` TEXT NULL;
