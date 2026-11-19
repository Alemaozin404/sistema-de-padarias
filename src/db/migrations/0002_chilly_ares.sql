CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'UN' NOT NULL,
	"cost_per_unit_cents" integer DEFAULT 0 NOT NULL,
	"min_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"supplier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "ingredients_tenant_name_unit_key" UNIQUE("tenant_id","name","unit"),
	CONSTRAINT "ingredients_cost_non_negative" CHECK ("ingredients"."cost_per_unit_cents" >= 0),
	CONSTRAINT "ingredients_min_stock_non_negative" CHECK ("ingredients"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"tenant_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_pkey" PRIMARY KEY("tenant_id","item_type","item_id"),
	CONSTRAINT "stock_balances_item_type_valid" CHECK ("stock_balances"."item_type" in ('INGREDIENT', 'PRODUCT')),
	CONSTRAINT "stock_balances_quantity_non_negative" CHECK ("stock_balances"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"adjustment_direction" text,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"reference_type" text,
	"reference_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_item_type_valid" CHECK ("stock_movements"."item_type" in ('INGREDIENT', 'PRODUCT')),
	CONSTRAINT "stock_movements_type_valid" CHECK ("stock_movements"."movement_type" in (
        'IN', 'OUT', 'ADJUSTMENT', 'LOSS', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_OUTPUT'
      )),
	CONSTRAINT "stock_movements_quantity_positive" CHECK ("stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_unit_cost_non_negative" CHECK ("stock_movements"."unit_cost_cents" >= 0),
	CONSTRAINT "stock_movements_reason_required" CHECK ("stock_movements"."movement_type" not in ('ADJUSTMENT', 'LOSS')
          or ("stock_movements"."reason" is not null and length(btrim("stock_movements"."reason")) > 0)),
	CONSTRAINT "stock_movements_adjustment_direction" CHECK (("stock_movements"."movement_type" = 'ADJUSTMENT'
            and "stock_movements"."adjustment_direction" in ('INCREASE', 'DECREASE'))
          or ("stock_movements"."movement_type" <> 'ADJUSTMENT' and "stock_movements"."adjustment_direction" is null))
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredients_tenant_active_name_idx" ON "ingredients" USING btree ("tenant_id","is_active","name");--> statement-breakpoint
CREATE INDEX "stock_balances_tenant_type_idx" ON "stock_balances" USING btree ("tenant_id","item_type");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_item_created_idx" ON "stock_movements" USING btree ("tenant_id","item_type","item_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_created_idx" ON "stock_movements" USING btree ("tenant_id","created_at");