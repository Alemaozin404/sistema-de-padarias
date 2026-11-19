CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"planned_quantity" numeric(12, 3) NOT NULL,
	"produced_quantity" numeric(12, 3),
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"planned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "production_batches_planned_positive" CHECK ("production_batches"."planned_quantity" > 0),
	CONSTRAINT "production_batches_produced_positive" CHECK ("production_batches"."produced_quantity" is null or "production_batches"."produced_quantity" > 0),
	CONSTRAINT "production_batches_status_valid" CHECK ("production_batches"."status" in ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
	CONSTRAINT "production_batches_unit_cost_non_negative" CHECK ("production_batches"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_losses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"reason" text NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_losses_quantity_positive" CHECK ("production_losses"."quantity" > 0),
	CONSTRAINT "production_losses_cost_non_negative" CHECK ("production_losses"."cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_items_tenant_recipe_ingredient_key" UNIQUE("tenant_id","recipe_id","ingredient_id"),
	CONSTRAINT "recipe_items_quantity_positive" CHECK ("recipe_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"yield_quantity" numeric(12, 3) NOT NULL,
	"yield_unit" text DEFAULT 'UN' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "recipes_yield_positive" CHECK ("recipes"."yield_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_tenant_recipe_fk" FOREIGN KEY ("tenant_id","recipe_id") REFERENCES "public"."recipes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_losses" ADD CONSTRAINT "production_losses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_losses" ADD CONSTRAINT "production_losses_tenant_batch_fk" FOREIGN KEY ("tenant_id","batch_id") REFERENCES "public"."production_batches"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenant_recipe_fk" FOREIGN KEY ("tenant_id","recipe_id") REFERENCES "public"."recipes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenant_ingredient_fk" FOREIGN KEY ("tenant_id","ingredient_id") REFERENCES "public"."ingredients"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tenant_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_batches_tenant_status_idx" ON "production_batches" USING btree ("tenant_id","status","planned_at");--> statement-breakpoint
CREATE INDEX "production_losses_tenant_batch_idx" ON "production_losses" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "recipe_items_tenant_recipe_idx" ON "recipe_items" USING btree ("tenant_id","recipe_id");--> statement-breakpoint
CREATE INDEX "recipes_tenant_active_idx" ON "recipes" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "recipes_tenant_product_idx" ON "recipes" USING btree ("tenant_id","product_id");