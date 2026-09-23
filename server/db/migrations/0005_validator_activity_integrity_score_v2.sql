CREATE TABLE `activity_epochs` (
	`epoch_number` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`expected_elected_count` integer,
	`stored_elected_count` integer,
	`elected_set_hash` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`finalized_at` text,
	`last_error` text,
	CONSTRAINT "activity_epochs_status_check" CHECK("activity_epochs"."status" IN ('syncing', 'finalized', 'failed')),
	CONSTRAINT "activity_epochs_counts_check" CHECK(("activity_epochs"."expected_elected_count" IS NULL OR "activity_epochs"."expected_elected_count" >= 0)
      AND ("activity_epochs"."stored_elected_count" IS NULL OR "activity_epochs"."stored_elected_count" >= 0)
      AND "activity_epochs"."attempt_count" >= 0),
	CONSTRAINT "activity_epochs_finalized_check" CHECK("activity_epochs"."status" != 'finalized' OR (
      "activity_epochs"."expected_elected_count" IS NOT NULL
      AND "activity_epochs"."stored_elected_count" IS NOT NULL
      AND "activity_epochs"."expected_elected_count" = "activity_epochs"."stored_elected_count"
      AND "activity_epochs"."elected_set_hash" IS NOT NULL
      AND length(trim("activity_epochs"."elected_set_hash", ' ' || char(9) || char(10) || char(13))) > 0
      AND length(trim("activity_epochs"."started_at", ' ' || char(9) || char(10) || char(13))) > 0
      AND "activity_epochs"."finalized_at" IS NOT NULL
      AND length(trim("activity_epochs"."finalized_at", ' ' || char(9) || char(10) || char(13))) > 0
      AND "activity_epochs"."last_error" IS NULL
    ))
);
--> statement-breakpoint
CREATE INDEX `idx_activity_epochs_status` ON `activity_epochs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_activity_epochs_finalized` ON `activity_epochs` (`status`,`epoch_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scores` (
	`validator_id` integer NOT NULL,
	`epoch_number` integer NOT NULL,
	`score_version` integer DEFAULT 1 NOT NULL,
	`total` real NOT NULL,
	`availability` real NOT NULL,
	`recent_availability` real,
	`long_term_availability` real,
	`dominance` real NOT NULL,
	`reliability` real NOT NULL,
	`data_status` text DEFAULT 'complete' NOT NULL,
	`long_term_coverage` real,
	`long_term_as_of_epoch` integer,
	PRIMARY KEY(`validator_id`, `epoch_number`, `score_version`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scores_version_check" CHECK(score_version IN (1, 2)),
	CONSTRAINT "scores_data_status_check" CHECK(data_status IN ('complete', 'stale'))
);
--> statement-breakpoint
INSERT INTO `__new_scores`("validator_id", "epoch_number", "score_version", "total", "availability", "recent_availability", "long_term_availability", "dominance", "reliability", "data_status", "long_term_coverage", "long_term_as_of_epoch") SELECT "validator_id", "epoch_number", 1, "total", "availability", NULL, NULL, "dominance", "reliability", 'complete', NULL, NULL FROM `scores`;--> statement-breakpoint
DROP TABLE `scores`;--> statement-breakpoint
ALTER TABLE `__new_scores` RENAME TO `scores`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_validator_id` ON `scores` (`validator_id`);--> statement-breakpoint
CREATE INDEX `idx_scores_validator_version_epoch` ON `scores` (`validator_id`,`score_version`,`epoch_number`);
