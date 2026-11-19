CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'SUPPORT' NOT NULL,
	"mfa_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_mfa_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'STAFF' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'STAFF' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"invited_by" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_tenant_key" UNIQUE("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"trade_name" text NOT NULL,
	"document" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"logo_key" text,
	"brand_color" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feature_definitions" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value_type" text NOT NULL,
	"unit_label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_id" uuid NOT NULL,
	"feature_key" varchar(64) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"limit_value" integer,
	CONSTRAINT "plan_features_plan_id_feature_key_pk" PRIMARY KEY("plan_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"activation_fee_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_price_non_negative" CHECK ("plans"."price_cents" >= 0),
	CONSTRAINT "plans_activation_non_negative" CHECK ("plans"."activation_fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_activation_fee_cents" integer NOT NULL,
	"fine_percent" numeric(5, 2) NOT NULL,
	"interest_percent_month" numeric(5, 2) NOT NULL,
	"dunning_schedule" jsonb NOT NULL,
	"restrict_after_days" integer NOT NULL,
	"suspend_after_days" integer NOT NULL,
	"cancel_after_days" integer NOT NULL,
	"enforce_restrictions" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_single_row" CHECK ("billing_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"discount_type" text NOT NULL,
	"value" integer NOT NULL,
	"applies_to_plan_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"max_redemptions" integer,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_value_positive" CHECK ("coupons"."value" > 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"incurred_at" date NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_non_negative" CHECK ("expenses"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"plan_amount_cents" integer DEFAULT 0 NOT NULL,
	"activation_amount_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"fine_cents" integer DEFAULT 0 NOT NULL,
	"interest_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"gateway" text,
	"gateway_invoice_id" text,
	"pix_payload" text,
	"pix_expires_at" timestamp with time zone,
	"invoice_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_gateway_invoice_key" UNIQUE("gateway_invoice_id"),
	CONSTRAINT "invoices_total_non_negative" CHECK ("invoices"."total_cents" >= 0),
	CONSTRAINT "invoices_amounts_non_negative" CHECK ("invoices"."plan_amount_cents" >= 0 AND "invoices"."activation_amount_cents" >= 0 AND "invoices"."discount_cents" >= 0 AND "invoices"."fine_cents" >= 0 AND "invoices"."interest_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"gateway_payment_id" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_gateway_payment_key" UNIQUE("gateway","gateway_payment_id"),
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"price_cents" integer NOT NULL,
	"activation_fee_cents" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"next_due_date" date,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"restricted_at" timestamp with time zone,
	"gateway_customer_id" text,
	"gateway_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_gateway_subscription_key" UNIQUE("gateway_subscription_id"),
	CONSTRAINT "subscriptions_price_non_negative" CHECK ("subscriptions"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"discount_type" text NOT NULL,
	"value" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_discounts_value_positive" CHECK ("tenant_discounts"."value" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gateway" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_gateway_event_key" UNIQUE("gateway","event_id")
);
--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"size_bytes" bigint,
	"storage_key" text,
	"checksum" text,
	"error" text,
	"restore_tested_at" timestamp with time zone,
	"restore_tested_by" text
);
--> statement-breakpoint
CREATE TABLE "platform_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"severity" text DEFAULT 'MINOR' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"summary" text,
	"postmortem" text,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"actor_id" text,
	"ip" text,
	"user_agent" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_health_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" text,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_key_feature_definitions_key_fk" FOREIGN KEY ("feature_key") REFERENCES "public"."feature_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_applies_to_plan_id_plans_id_fk" FOREIGN KEY ("applies_to_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_discounts" ADD CONSTRAINT "tenant_discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_admins_role_idx" ON "platform_admins" USING btree ("role");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_role_idx" ON "memberships" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_incurred_idx" ON "expenses" USING btree ("incurred_at");--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_due_idx" ON "invoices" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "notification_log_tenant_idx" ON "notification_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "subscription_history_tenant_idx" ON "subscription_status_history" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_open_per_tenant" ON "subscriptions" USING btree ("tenant_id") WHERE "subscriptions"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "subscriptions_status_due_idx" ON "subscriptions" USING btree ("status","next_due_date");--> statement-breakpoint
CREATE INDEX "tenant_discounts_tenant_idx" ON "tenant_discounts" USING btree ("tenant_id","valid_from");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "backup_runs_started_idx" ON "backup_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "platform_incidents" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "security_events_created_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_type_created_idx" ON "security_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "health_checks_target_checked_idx" ON "system_health_checks" USING btree ("target","checked_at");