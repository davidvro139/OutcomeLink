-- DropForeignKey
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_employment_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_licensure_result_id_fkey`;

-- DropForeignKey
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_outcome_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `verification_records` DROP FOREIGN KEY `verification_records_employment_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `verification_records` DROP FOREIGN KEY `verification_records_outcome_record_id_fkey`;

-- AddForeignKey
ALTER TABLE `verification_records` ADD CONSTRAINT `verification_records_outcome_record_id_fkey` FOREIGN KEY (`outcome_record_id`) REFERENCES `student_outcome_records`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `verification_records` ADD CONSTRAINT `verification_records_employment_record_id_fkey` FOREIGN KEY (`employment_record_id`) REFERENCES `employment_records`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_outcome_record_id_fkey` FOREIGN KEY (`outcome_record_id`) REFERENCES `student_outcome_records`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_employment_record_id_fkey` FOREIGN KEY (`employment_record_id`) REFERENCES `employment_records`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_licensure_result_id_fkey` FOREIGN KEY (`licensure_result_id`) REFERENCES `licensure_results`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Enforce "exactly one target FK is set" for these polymorphic tables, per
-- docs/DATA_MODEL.md §13. Prisma's schema language has no way to express a
-- cross-column CHECK, so this part is hand-written rather than schema-derived.
-- Requires both FK actions above to be RESTRICT (not Prisma's SetNull/Cascade
-- defaults for optional relations) since MySQL forbids a CHECK on a column
-- driven by a cascading ON DELETE or ON UPDATE action.

ALTER TABLE `verification_records`
  ADD CONSTRAINT `verification_records_exactly_one_target`
  CHECK (
    (`outcome_record_id` IS NOT NULL) + (`employment_record_id` IS NOT NULL) = 1
  );

ALTER TABLE `evidence`
  ADD CONSTRAINT `evidence_exactly_one_target`
  CHECK (
    (`outcome_record_id` IS NOT NULL)
    + (`employment_record_id` IS NOT NULL)
    + (`licensure_result_id` IS NOT NULL) = 1
  );
