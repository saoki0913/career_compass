CREATE TABLE "company_info_monthly_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"month_key" text NOT NULL,
	"rag_ingest_units" integer DEFAULT 0 NOT NULL,
	"rag_overflow_units" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "company_info_monthly_usage" ADD CONSTRAINT "company_info_monthly_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_info_monthly_usage_user_month_ux" ON "company_info_monthly_usage" USING btree ("user_id","month_key");--> statement-breakpoint
CREATE INDEX "company_info_monthly_usage_user_idx" ON "company_info_monthly_usage" USING btree ("user_id");--> statement-breakpoint
UPDATE "credits"
SET
	"balance" = "balance" * 2,
	"monthly_allocation" = "monthly_allocation" * 2;--> statement-breakpoint
ALTER TABLE "credits" DROP COLUMN "partial_credit_accumulator";--> statement-breakpoint