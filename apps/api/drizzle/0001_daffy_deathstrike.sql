CREATE TABLE "run_invite" (
	"token" text PRIMARY KEY NOT NULL,
	"inviter_user_id" text NOT NULL,
	"inviter_activity_id" bigint NOT NULL,
	"invitee_user_id" text,
	"invitee_activity_id" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_text" text,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_invite_inviter_idx" ON "run_invite" USING btree ("inviter_user_id","inviter_activity_id");--> statement-breakpoint
CREATE INDEX "run_invite_invitee_idx" ON "run_invite" USING btree ("invitee_user_id");