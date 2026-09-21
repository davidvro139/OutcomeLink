-- Deleting a subscription should delete its run history with it — nothing
-- else needs an orphaned ScheduledReportRun to survive its subscription.
-- DropForeignKey
ALTER TABLE `scheduled_report_runs` DROP FOREIGN KEY `scheduled_report_runs_subscription_id_fkey`;

-- AddForeignKey
ALTER TABLE `scheduled_report_runs` ADD CONSTRAINT `scheduled_report_runs_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `scheduled_report_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
