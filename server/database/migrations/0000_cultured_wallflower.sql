CREATE TABLE `activity` (
	`validator_id` integer NOT NULL,
	`epoch_number` integer NOT NULL,
	`likelihood` integer NOT NULL,
	`rewarded` integer NOT NULL,
	`missed` integer NOT NULL,
	`dominance_ratio_via_balance` integer NOT NULL,
	`dominance_ratio_via_slots` integer NOT NULL,
	`balance` real DEFAULT -1 NOT NULL,
	PRIMARY KEY(`validator_id`, `epoch_number`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_election_block` ON `activity` (`epoch_number`);--> statement-breakpoint
CREATE TABLE `scores` (
	`validator_id` integer NOT NULL,
	`epoch_number` integer NOT NULL,
	`total` real NOT NULL,
	`availability` real NOT NULL,
	`dominance` real NOT NULL,
	`reliability` real NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`validator_id`, `epoch_number`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_validator_id` ON `scores` (`validator_id`);--> statement-breakpoint
CREATE TABLE `validators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Unknown validator' NOT NULL,
	`address` text NOT NULL,
	`description` text,
	`fee` real DEFAULT -1,
	`payout_type` text DEFAULT 'none',
	`payout_schedule` text,
	`is_maintained_by_nimiq` integer DEFAULT false,
	`logo` text NOT NULL,
	`has_default_logo` integer DEFAULT true NOT NULL,
	`accent_color` text NOT NULL,
	`website` text,
	`contact` text,
	CONSTRAINT "enum_check" CHECK("validators"."payout_type" IN ('none', 'restake', 'direct'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `validators_address_unique` ON `validators` (`address`);