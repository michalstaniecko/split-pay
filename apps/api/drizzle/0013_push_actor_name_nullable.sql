ALTER TABLE "push_queue" ALTER COLUMN "actor_name" DROP NOT NULL;--> statement-breakpoint
-- Queued pushes stored a removed name as empty; the marker is null now (ADR-0019).
UPDATE "push_queue" SET "actor_name" = NULL WHERE "actor_name" = '';
