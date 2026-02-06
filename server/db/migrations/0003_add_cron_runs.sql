CREATE TABLE `cron_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cron` text NOT NULL,
	`network` text NOT NULL,
	`git_branch` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_message` text,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `idx_cron_runs_started_at` ON `cron_runs` (`started_at`);

