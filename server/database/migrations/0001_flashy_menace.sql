PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_validators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Unknown validator' NOT NULL,
	`address` text NOT NULL,
	`description` text,
	`fee` real DEFAULT -1,
	`payout_type` text DEFAULT 'none',
	`payout_schedule` text DEFAULT '',
	`is_maintained_by_nimiq` integer DEFAULT false,
	`icon` text NOT NULL,
	`has_default_icon` integer DEFAULT true NOT NULL,
	`accent_color` text NOT NULL,
	`website` text,
	`contact` text,
	CONSTRAINT "enum_check" CHECK("__new_validators"."payout_type" IN ('none', 'restake', 'direct'))
);
--> statement-breakpoint
INSERT INTO `__new_validators`("id", "name", "address", "description", "fee", "payout_type", "payout_schedule", "is_maintained_by_nimiq", "icon", "has_default_icon", "accent_color", "website", "contact") SELECT "id", "name", "address", "description", "fee", "payout_type", "payout_schedule", "is_maintained_by_nimiq", "icon", "has_default_icon", "accent_color", "website", "contact" FROM `validators`;--> statement-breakpoint
DROP TABLE `validators`;--> statement-breakpoint
ALTER TABLE `__new_validators` RENAME TO `validators`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `validators_address_unique` ON `validators` (`address`);