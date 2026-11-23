CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"rate_to_base" text NOT NULL,
	"title" text,
	"category" text,
	"split" jsonb,
	"payers" jsonb,
	"recipients" jsonb,
	"from_member_id" uuid,
	"to_member_id" uuid,
	"receipt_photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entries_kind_check" CHECK ("entries"."kind" in ('expense', 'income', 'settlement')),
	CONSTRAINT "entries_amount_positive_check" CHECK ("entries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_group_id_updated_at_idx" ON "entries" USING btree ("group_id","updated_at");--> statement-breakpoint
CREATE INDEX "entries_group_id_date_created_at_idx" ON "entries" USING btree ("group_id","date","created_at");