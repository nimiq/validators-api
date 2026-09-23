CREATE TABLE `score_backfill_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_scanned_epoch` integer NOT NULL,
	CONSTRAINT "score_backfill_state_singleton_check" CHECK("score_backfill_state"."id" = 1)
);
