CREATE TABLE "payout_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bank_account" text,
	"blik_phone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_details" ADD CONSTRAINT "payout_details_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;