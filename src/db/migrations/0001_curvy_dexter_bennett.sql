CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "categories_tenant_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_price_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"old_price_cents" integer NOT NULL,
	"new_price_cents" integer NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_history_old_non_negative" CHECK ("product_price_history"."old_price_cents" >= 0),
	CONSTRAINT "price_history_new_non_negative" CHECK ("product_price_history"."new_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"unit" text DEFAULT 'UN' NOT NULL,
	"sku" text,
	"image_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"track_stock" boolean DEFAULT false NOT NULL,
	"min_stock" numeric(12, 3),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_tenant_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price_cents" >= 0),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "price_history_tenant_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_tenant_sort_idx" ON "categories" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_images_tenant_product_idx" ON "product_images" USING btree ("tenant_id","product_id","sort_order");--> statement-breakpoint
CREATE INDEX "price_history_tenant_product_idx" ON "product_price_history" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "products_tenant_active_name_idx" ON "products" USING btree ("tenant_id","is_active","name");--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_id");