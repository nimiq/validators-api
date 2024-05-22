CREATE TABLE `activity` (
	`validator_id` integer NOT NULL,
	`epoch_index` integer NOT NULL,
	`assigned` integer NOT NULL,
	`missed` integer NOT NULL,
	PRIMARY KEY(`epoch_index`, `validator_id`),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`score_id` integer PRIMARY KEY NOT NULL,
	`validator_id` integer NOT NULL,
	`total` real NOT NULL,
	`liveness` real NOT NULL,
	`size` real NOT NULL,
	`reliability` real NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `validators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Unknown validator',
	`address` text NOT NULL,
	`fee` real DEFAULT -1,
	`payout_type` text DEFAULT 'unknown',
	`description` text,
	`icon` text NOT NULL,
	`tag` text DEFAULT 'unknown',
	`website` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_validator_id_unique` ON `scores` (`validator_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `validators_address_unique` ON `validators` (`address`);