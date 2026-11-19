CREATE TABLE "platform_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"last_reauth_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_sessions_user_idx" ON "platform_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_sessions_expires_idx" ON "platform_sessions" USING btree ("expires_at");