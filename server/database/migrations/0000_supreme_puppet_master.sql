CREATE TABLE `activity` (
	`validator_id` integer NOT NULL,
	`epoch_number` integer NOT NULL,
	`likelihood` integer NOT NULL,
	`rewarded` integer NOT NULL,
	`missed` integer NOT NULL,
	`size_ratio` integer NOT NULL,
	`size_ratio_via_slots` integer NOT NULL,
	PRIMARY KEY(`validator_id`, `epoch_number`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`validator_id` integer NOT NULL,
	`from_epoch` integer NOT NULL,
	`to_epoch` integer NOT NULL,
	`total` real NOT NULL,
	`liveness` real NOT NULL,
	`size` real NOT NULL,
	`reliability` real NOT NULL,
	PRIMARY KEY(`validator_id`, `from_epoch`, `to_epoch`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `validators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Unknown validator' NOT NULL,
	`address` text NOT NULL,
	`description` text,
	`fee` real DEFAULT -1,
	`payout_type` text DEFAULT 'none',
	`is_maintained_by_nimiq` integer DEFAULT false,
	`icon` text NOT NULL,
	`website` text
);
--> statement-breakpoint
CREATE INDEX `idx_election_block` ON `activity` (`epoch_number`);--> statement-breakpoint
CREATE INDEX `idx_validator_id` ON `scores` (`validator_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `validators_address_unique` ON `validators` (`address`);