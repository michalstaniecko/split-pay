CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"uploaded_by" uuid,
	"group_id" uuid,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_at" timestamp with time zone,
	CONSTRAINT "photos_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "photos_kind_check" CHECK ("photos"."kind" in ('receipt', 'avatar'))
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_group_id_idx" ON "photos" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "photos_entry_id_idx" ON "photos" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "photos_uploaded_by_created_at_idx" ON "photos" USING btree ("uploaded_by","created_at");