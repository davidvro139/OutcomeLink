-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `password_set_token` VARCHAR(191) NULL,
  ADD COLUMN `password_set_token_expires_at` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_password_set_token_key` ON `users`(`password_set_token`);
