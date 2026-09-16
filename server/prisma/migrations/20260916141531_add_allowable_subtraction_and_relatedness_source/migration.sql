-- AlterTable
ALTER TABLE `student_enrollments` ADD COLUMN `allowable_subtraction_reason` ENUM('FULL_REFUND_OR_FIRST_DAY_ONLY', 'DOCUMENTED_UNAVAILABLE', 'MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION') NULL;

-- AlterTable
ALTER TABLE `student_outcome_records` ADD COLUMN `related_to_training_source` VARCHAR(191) NULL;
