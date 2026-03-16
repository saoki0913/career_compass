CREATE TABLE "user_pins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_pins_owner_xor" CHECK (("user_pins"."user_id" is null) <> ("user_pins"."guest_id" is null))
);
--> statement-breakpoint
ALTER TABLE "user_pins" ADD CONSTRAINT "user_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pins" ADD CONSTRAINT "user_pins_guest_id_guest_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_pins_user_entity_ux" ON "user_pins" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_pins_guest_entity_ux" ON "user_pins" USING btree ("guest_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "user_pins_user_type_idx" ON "user_pins" USING btree ("user_id","entity_type");--> statement-breakpoint
CREATE INDEX "user_pins_guest_type_idx" ON "user_pins" USING btree ("guest_id","entity_type");