CREATE TABLE "changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"undoes_change_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_group_id_seq_idx" ON "changes" USING btree ("group_id","seq");--> statement-breakpoint
CREATE INDEX "changes_group_id_target_id_idx" ON "changes" USING btree ("group_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "changes_undoes_change_id_key" ON "changes" USING btree ("undoes_change_id");