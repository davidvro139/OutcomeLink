-- CreateTable
CREATE TABLE `student_demographics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `gender` VARCHAR(191) NULL,
    `race_ethnicity` VARCHAR(191) NULL,
    `economically_disadvantaged` BOOLEAN NULL,
    `first_generation_student` BOOLEAN NULL,
    `disability_status` BOOLEAN NULL,

    UNIQUE INDEX `student_demographics_student_id_key`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student_demographics` ADD CONSTRAINT `student_demographics_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
