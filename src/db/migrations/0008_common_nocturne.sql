CREATE TABLE "subscription_upgrades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_plan_id" uuid NOT NULL,
	"to_plan_id" uuid NOT NULL,
	"from_price_cents" integer NOT NULL,
	"to_price_cents" integer NOT NULL,
	"original_amount_cents" integer NOT NULL,
	"discount_percent" integer DEFAULT 25 NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"final_amount_cents" integer NOT NULL,
	"entry_amount_cents" integer NOT NULL,
	"remaining_amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"entry_invoice_id" uuid,
	"remaining_invoice_id" uuid,
	"remaining_scheduled" boolean DEFAULT false NOT NULL,
	"next_due_date" date,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_upgrades_prices_non_negative" CHECK ("subscription_upgrades"."from_price_cents" >= 0 AND "subscription_upgrades"."to_price_cents" >= 0),
	CONSTRAINT "subscription_upgrades_amounts_non_negative" CHECK ("subscription_upgrades"."original_amount_cents" >= 0 AND "subscription_upgrades"."final_amount_cents" >= 0 AND "subscription_upgrades"."entry_amount_cents" >= 0 AND "subscription_upgrades"."remaining_amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_from_plan_id_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_to_plan_id_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_entry_invoice_id_invoices_id_fk" FOREIGN KEY ("entry_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_upgrades" ADD CONSTRAINT "subscription_upgrades_remaining_invoice_id_invoices_id_fk" FOREIGN KEY ("remaining_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_upgrades_tenant_idx" ON "subscription_upgrades" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_upgrades_status_idx" ON "subscription_upgrades" USING btree ("status","created_at");