-- AlterTable
ALTER TABLE `graduate_surveys` ADD COLUMN `response_token` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `employer_surveys` ADD COLUMN `response_token` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `graduate_surveys_response_token_key` ON `graduate_surveys`(`response_token`);

-- CreateIndex
CREATE UNIQUE INDEX `employer_surveys_response_token_key` ON `employer_surveys`(`response_token`);
