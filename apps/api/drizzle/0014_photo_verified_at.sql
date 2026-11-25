ALTER TABLE "photos" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
-- Photos already in use were uploaded with a POST policy that enforced the size and type in the bucket.
UPDATE "photos" SET "verified_at" = "attached_at" WHERE "attached_at" IS NOT NULL;
