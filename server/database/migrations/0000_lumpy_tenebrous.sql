CREATE TABLE `events` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`validator_id` integer NOT NULL,
	`hash` text NOT NULL,
	`timestamp` integer NOT NULL,
	`block_number` integer NOT NULL,
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`score_id` integer PRIMARY KEY NOT NULL,
	`validator_id` integer NOT NULL,
	`score` real NOT NULL,
	`liveness` real NOT NULL,
	`size` real NOT NULL,
	`reliability` real NOT NULL,
	FOREIGN KEY (`validator_id`) REFERENCES `validators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `validators` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`fee` real NOT NULL,
	`payoutType` text NOT NULL,
	`description` text,
	`icon` text NOT NULL,
	`tag` text NOT NULL,
	`website` text,
	`state` text NOT NULL,
	`balance` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_hash_unique` ON `events` (`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `scores_validator_id_unique` ON `scores` (`validator_id`);