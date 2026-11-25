ALTER TABLE "photos" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
-- Every existing upload went through the POST policy, which enforced the size and type in the bucket.
UPDATE "photos" SET "verified_at" = coalesce("attached_at", "created_at");
