CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"coupon_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text,
	"grant_id" uuid,
	"invoice_id" uuid,
	"original_amount_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"final_amount_cents" integer DEFAULT 0 NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"tenant_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"coupon_id" uuid,
	"secret_key_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'SENT' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "promotion_recipients_campaign_tenant_key" UNIQUE("campaign_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "secret_key_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_key_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text,
	"grant_id" uuid,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_key_redemptions_key_tenant_key" UNIQUE("secret_key_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "secret_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"code_prefix" varchar(16) NOT NULL,
	"name" text,
	"plan_id" uuid,
	"any_plan" boolean DEFAULT false NOT NULL,
	"grant_type" text DEFAULT 'FREE' NOT NULL,
	"value" integer DEFAULT 100 NOT NULL,
	"waive_activation_fee" boolean DEFAULT true NOT NULL,
	"duration_days" integer,
	"duration_cycles" integer,
	"lifetime" boolean DEFAULT false NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_keys_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "subscription_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"plan_id" uuid,
	"grant_type" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"waive_activation_fee" boolean DEFAULT false NOT NULL,
	"duration_cycles" integer,
	"cycles_used" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text,
	"revoked_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_value_positive";--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "value" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "duration_cycles" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "applies_to_activation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "max_per_tenant" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "applied_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_grant_id_subscription_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."subscription_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_audit_logs" ADD CONSTRAINT "promotion_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_secret_key_id_secret_keys_id_fk" FOREIGN KEY ("secret_key_id") REFERENCES "public"."secret_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_recipients" ADD CONSTRAINT "promotion_recipients_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_recipients" ADD CONSTRAINT "promotion_recipients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_key_redemptions" ADD CONSTRAINT "secret_key_redemptions_secret_key_id_secret_keys_id_fk" FOREIGN KEY ("secret_key_id") REFERENCES "public"."secret_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_key_redemptions" ADD CONSTRAINT "secret_key_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_key_redemptions" ADD CONSTRAINT "secret_key_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_key_redemptions" ADD CONSTRAINT "secret_key_redemptions_grant_id_subscription_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."subscription_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_keys" ADD CONSTRAINT "secret_keys_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_grants" ADD CONSTRAINT "subscription_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_grants" ADD CONSTRAINT "subscription_grants_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_grants" ADD CONSTRAINT "subscription_grants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_tenant_idx" ON "coupon_redemptions" USING btree ("tenant_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "promotion_audit_logs_created_idx" ON "promotion_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promotion_campaigns_created_idx" ON "promotion_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "secret_key_redemptions_tenant_idx" ON "secret_key_redemptions" USING btree ("tenant_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "secret_keys_status_idx" ON "secret_keys" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subscription_grants_tenant_idx" ON "subscription_grants" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "subscription_grants_subscription_idx" ON "subscription_grants" USING btree ("subscription_id","status");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_value_positive" CHECK ("coupons"."value" >= 0);