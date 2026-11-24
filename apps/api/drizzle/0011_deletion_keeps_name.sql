ALTER TABLE "members" ALTER COLUMN "display_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "claimer_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "created_by_member" uuid;--> statement-breakpoint
-- "Added by" (ADR-0019): the author's member in the entry's group. Authors whose account is already gone stay unknown (null).
UPDATE "entries" SET "created_by_member" = "members"."id"
FROM "members"
WHERE "members"."group_id" = "entries"."group_id"
  AND "members"."user_id" = "entries"."created_by"
  AND "entries"."created_by_member" IS NULL;
