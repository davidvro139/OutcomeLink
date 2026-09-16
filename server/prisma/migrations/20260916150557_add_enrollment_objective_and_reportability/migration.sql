-- AlterTable
ALTER TABLE `student_enrollments` ADD COLUMN `enrollment_objective` VARCHAR(191) NULL,
    ADD COLUMN `reportable_for_accreditation` BOOLEAN NOT NULL DEFAULT true;
