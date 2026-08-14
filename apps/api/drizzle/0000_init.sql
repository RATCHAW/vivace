CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_context" (
	"user_id" text PRIMARY KEY NOT NULL,
	"race_name" text,
	"race_date" text,
	"race_distance_m" double precision,
	"target_seconds" integer,
	"long_run_day" smallint,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_debrief" (
	"user_id" text NOT NULL,
	"activity_id" bigint NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_debrief_user_id_activity_id_pk" PRIMARY KEY("user_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "coach_message" (
	"id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"seq" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "coach_message_thread_id_id_pk" PRIMARY KEY("thread_id","id")
);
--> statement-breakpoint
CREATE TABLE "coach_plan" (
	"user_id" text NOT NULL,
	"week_starting" text NOT NULL,
	"label" text,
	"sessions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_plan_user_id_week_starting_pk" PRIMARY KEY("user_id","week_starting")
);
--> statement-breakpoint
CREATE TABLE "coach_thread" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_render" (
	"user_id" text NOT NULL,
	"activity_id" bigint NOT NULL,
	"template" text DEFAULT 'run-video' NOT NULL,
	"render_id" text NOT NULL,
	"bucket_name" text NOT NULL,
	"region" text,
	"function_name" text,
	"serve_url" text,
	"status" text NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"output_url" text,
	"error" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"props_hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_render_user_id_activity_id_template_pk" PRIMARY KEY("user_id","activity_id","template")
);
--> statement-breakpoint
CREATE TABLE "strava_webhook_event" (
	"object_id" bigint NOT NULL,
	"aspect_type" text NOT NULL,
	"event_time" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strava_webhook_event_object_id_aspect_type_event_time_pk" PRIMARY KEY("object_id","aspect_type","event_time")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_debrief" ADD CONSTRAINT "coach_debrief_thread_id_coach_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."coach_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_message" ADD CONSTRAINT "coach_message_thread_id_coach_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."coach_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "coach_message_thread_idx" ON "coach_message" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE INDEX "coach_thread_user_idx" ON "coach_thread" USING btree ("user_id","updated_at" DESC NULLS FIRST);