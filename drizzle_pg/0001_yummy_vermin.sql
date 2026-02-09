DROP INDEX "waitlist_signups_email_ux";--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_ux" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "ai_messages_thread_created_at_idx" ON "ai_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_threads_document_created_at_idx" ON "ai_threads" USING btree ("document_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calendar_events_user_start_at_idx" ON "calendar_events" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_deadline_id_idx" ON "calendar_events" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "deadlines_application_id_idx" ON "deadlines" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "deadlines_job_type_id_idx" ON "deadlines" USING btree ("job_type_id");--> statement-breakpoint
CREATE INDEX "document_versions_document_created_at_idx" ON "document_versions" USING btree ("document_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_guest_id_idx" ON "documents" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "documents_application_id_idx" ON "documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "documents_job_type_id_idx" ON "documents" USING btree ("job_type_id");--> statement-breakpoint
CREATE INDEX "documents_user_updated_at_active_idx" ON "documents" USING btree ("user_id","updated_at" DESC NULLS LAST) WHERE "documents"."status" != 'deleted';--> statement-breakpoint
CREATE INDEX "documents_guest_updated_at_active_idx" ON "documents" USING btree ("guest_id","updated_at" DESC NULLS LAST) WHERE "documents"."status" != 'deleted';--> statement-breakpoint
CREATE INDEX "es_templates_user_id_idx" ON "es_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "es_templates_guest_id_idx" ON "es_templates" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "gakuchika_contents_guest_id_idx" ON "gakuchika_contents" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "gakuchika_conversations_gakuchika_created_at_idx" ON "gakuchika_conversations" USING btree ("gakuchika_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_types_application_sort_order_idx" ON "job_types" USING btree ("application_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "login_prompts_guest_feature_ux" ON "login_prompts" USING btree ("guest_id","feature");--> statement-breakpoint
CREATE UNIQUE INDEX "motivation_conversations_company_user_ux" ON "motivation_conversations" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "motivation_conversations_company_guest_ux" ON "motivation_conversations" USING btree ("company_id","guest_id");--> statement-breakpoint
CREATE INDEX "notifications_guest_id_idx" ON "notifications" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_at_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_guest_created_at_idx" ON "notifications" USING btree ("guest_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_created_at_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "notifications"."is_read" = false;--> statement-breakpoint
CREATE INDEX "notifications_guest_unread_created_at_idx" ON "notifications" USING btree ("guest_id","created_at" DESC NULLS LAST) WHERE "notifications"."is_read" = false;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submission_items_user_id_idx" ON "submission_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submission_items_guest_id_idx" ON "submission_items" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "submission_items_application_id_idx" ON "submission_items" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_ux" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "tasks_guest_id_idx" ON "tasks" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "tasks_application_id_idx" ON "tasks" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "tasks_deadline_id_idx" ON "tasks" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_due_idx" ON "tasks" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_guest_status_due_idx" ON "tasks" USING btree ("guest_id","status","due_date");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_email_lower_ux" ON "waitlist_signups" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_xor" CHECK (("applications"."user_id" is null) <> ("applications"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_xor" CHECK (("companies"."user_id" is null) <> ("companies"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "daily_free_usage" ADD CONSTRAINT "daily_free_usage_owner_xor" CHECK (("daily_free_usage"."user_id" is null) <> ("daily_free_usage"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_xor" CHECK (("documents"."user_id" is null) <> ("documents"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "es_templates" ADD CONSTRAINT "es_templates_owner_xor" CHECK (("es_templates"."user_id" is null) <> ("es_templates"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "gakuchika_contents" ADD CONSTRAINT "gakuchika_contents_owner_xor" CHECK (("gakuchika_contents"."user_id" is null) <> ("gakuchika_contents"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD CONSTRAINT "motivation_conversations_owner_xor" CHECK (("motivation_conversations"."user_id" is null) <> ("motivation_conversations"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_xor" CHECK (("notifications"."user_id" is null) <> ("notifications"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "submission_items" ADD CONSTRAINT "submission_items_owner_xor" CHECK (("submission_items"."user_id" is null) <> ("submission_items"."guest_id" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_xor" CHECK (("tasks"."user_id" is null) <> ("tasks"."guest_id" is null));