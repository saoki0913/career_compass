CREATE TABLE "interview_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "guest_id" text,
  "company_id" text NOT NULL,
  "messages" text NOT NULL,
  "status" text DEFAULT 'setup_pending' NOT NULL,
  "current_stage" text DEFAULT 'industry_reason' NOT NULL,
  "question_count" integer DEFAULT 0 NOT NULL,
  "stage_question_counts" text DEFAULT '{}' NOT NULL,
  "completed_stages" text DEFAULT '[]' NOT NULL,
  "last_question_focus" text,
  "question_flow_completed" boolean DEFAULT false NOT NULL,
  "selected_industry" text,
  "selected_role" text,
  "selected_role_source" text,
  "active_feedback_draft" text,
  "current_feedback_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interview_conversations_owner_xor" CHECK (("interview_conversations"."user_id" is null) <> ("interview_conversations"."guest_id" is null))
);
--> statement-breakpoint
CREATE TABLE "interview_feedback_histories" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "user_id" text,
  "guest_id" text,
  "company_id" text NOT NULL,
  "overall_comment" text NOT NULL,
  "scores" text DEFAULT '{}' NOT NULL,
  "strengths" text DEFAULT '[]' NOT NULL,
  "improvements" text DEFAULT '[]' NOT NULL,
  "improved_answer" text DEFAULT '' NOT NULL,
  "preparation_points" text DEFAULT '[]' NOT NULL,
  "premise_consistency" integer DEFAULT 0 NOT NULL,
  "source_question_count" integer DEFAULT 0 NOT NULL,
  "source_messages_snapshot" text DEFAULT '[]' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interview_feedback_histories_owner_xor" CHECK (("interview_feedback_histories"."user_id" is null) <> ("interview_feedback_histories"."guest_id" is null))
);
--> statement-breakpoint
ALTER TABLE "interview_conversations" ADD CONSTRAINT "interview_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_conversations" ADD CONSTRAINT "interview_conversations_guest_id_guest_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_conversations" ADD CONSTRAINT "interview_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD CONSTRAINT "interview_feedback_histories_conversation_id_interview_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."interview_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD CONSTRAINT "interview_feedback_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD CONSTRAINT "interview_feedback_histories_guest_id_guest_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD CONSTRAINT "interview_feedback_histories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "interview_conversations_company_idx" ON "interview_conversations" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_conversations_company_user_ux" ON "interview_conversations" USING btree ("company_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_conversations_company_guest_ux" ON "interview_conversations" USING btree ("company_id","guest_id");
--> statement-breakpoint
CREATE INDEX "interview_feedback_histories_company_idx" ON "interview_feedback_histories" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX "interview_feedback_histories_conversation_idx" ON "interview_feedback_histories" USING btree ("conversation_id","created_at");
