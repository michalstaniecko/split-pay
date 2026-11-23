CREATE TABLE "group_links" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "group_links" ADD CONSTRAINT "group_links_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;