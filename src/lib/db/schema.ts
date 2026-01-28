import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Better Auth required tables
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Better Auth expects singular model names
export const user = users;
export const session = sessions;
export const account = accounts;
export const verification = verifications;

// Guest users table - for anonymous sessions
export const guestUsers = sqliteTable("guest_users", {
  id: text("id").primaryKey(),
  deviceToken: text("device_token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  migratedToUserId: text("migrated_to_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// User profiles table - plan selection and onboarding status
export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["free", "standard", "pro"] }).notNull().default("free"),
  planSelectedAt: integer("plan_selected_at", { mode: "timestamp" }),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).default(false),
  // Onboarding fields
  university: text("university"),
  faculty: text("faculty"), // 学部・学科
  graduationYear: integer("graduation_year"),
  targetIndustries: text("target_industries"), // JSON string array
  targetJobTypes: text("target_job_types"), // JSON string array (志望職種)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Login prompts table - track shown login prompts per feature (show only once)
export const loginPrompts = sqliteTable("login_prompts", {
  id: text("id").primaryKey(),
  guestId: text("guest_id")
    .notNull()
    .references(() => guestUsers.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(), // e.g., "calendar", "ai_review", "settings"
  shownAt: integer("shown_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Companies table - registered companies for tracking
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  industry: text("industry"),
  recruitmentUrl: text("recruitment_url"),
  corporateUrl: text("corporate_url"),
  notes: text("notes"),
  status: text("status", {
    enum: ["interested", "applied", "interview", "offer", "rejected", "withdrawn"]
  }).default("interested"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  infoFetchedAt: integer("info_fetched_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Applications table - track application rounds (summer intern, main selection, etc.)
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // 夏インターン、本選考など
  type: text("type", {
    enum: ["summer_intern", "fall_intern", "winter_intern", "early", "main", "other"]
  }).notNull(),
  status: text("status", {
    enum: ["active", "completed", "withdrawn"]
  }).default("active").notNull(),
  phase: text("phase"), // 現在のフェーズ (JSON)
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Job types table - track job types within an application
export const jobTypes = sqliteTable("job_types", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // 総合職、エンジニアなど
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Deadlines table - ES submissions, interviews, etc.
export const deadlines = sqliteTable("deadlines", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  applicationId: text("application_id")
    .references(() => applications.id, { onDelete: "cascade" }),
  jobTypeId: text("job_type_id")
    .references(() => jobTypes.id, { onDelete: "set null" }),
  type: text("type", {
    enum: [
      "es_submission",      // ES提出
      "web_test",           // WEBテスト
      "aptitude_test",      // 適性検査
      "interview_1",        // 一次面接
      "interview_2",        // 二次面接
      "interview_3",        // 三次面接
      "interview_final",    // 最終面接
      "briefing",           // 説明会
      "internship",         // インターン参加
      "offer_response",     // 内定返答
      "other"               // その他
    ]
  }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  memo: text("memo"), // ユーザーメモ
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  isConfirmed: integer("is_confirmed", { mode: "boolean" }).default(false),
  confidence: text("confidence", { enum: ["high", "medium", "low"] }),
  sourceUrl: text("source_url"),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  autoCompletedTaskIds: text("auto_completed_task_ids"), // JSON array of task IDs auto-completed when submission marked complete
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Stripe subscription table
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  status: text("status"), // active, canceled, past_due, etc.
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Credits table - track user credit balance
export const credits = sqliteTable("credits", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  monthlyAllocation: integer("monthly_allocation").notNull().default(30),
  partialCreditAccumulator: integer("partial_credit_accumulator").notNull().default(0),
  lastResetAt: integer("last_reset_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Credit transactions table - audit log for credit changes
export const creditTransactions = sqliteTable("credit_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // positive = grant, negative = consume
  type: text("type", {
    enum: ["monthly_grant", "plan_change", "company_fetch", "es_review", "gakuchika", "refund"]
  }).notNull(),
  referenceId: text("reference_id"), // related entity ID (companyId, documentId, etc.)
  description: text("description"),
  balanceAfter: integer("balance_after").notNull(), // balance after transaction
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Daily free usage table - track daily free operations
export const dailyFreeUsage = sqliteTable("daily_free_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD in JST
  companyFetchCount: integer("company_fetch_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tasks table - task management
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
  deadlineId: text("deadline_id").references(() => deadlines.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", {
    enum: ["es", "web_test", "self_analysis", "gakuchika", "video", "other"]
  }).notNull(),
  status: text("status", { enum: ["open", "done"] }).default("open").notNull(),
  dueDate: integer("due_date", { mode: "timestamp" }),
  isAutoGenerated: integer("is_auto_generated", { mode: "boolean" }).default(false),
  sortOrder: integer("sort_order").default(0),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Notifications table
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["deadline_reminder", "deadline_near", "company_fetch", "es_review", "daily_summary"]
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data"), // JSON: { companyId, deadlineId, creditsConsumed, etc. }
  isRead: integer("is_read", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }), // 90 days
});

// Documents table - ES, Tips, Company Analysis
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
  jobTypeId: text("job_type_id").references(() => jobTypes.id, { onDelete: "set null" }),
  type: text("type", { enum: ["es", "tips", "company_analysis"] }).notNull(),
  title: text("title").notNull(),
  content: text("content"), // JSON: Notion-style blocks
  status: text("status", { enum: ["draft", "published", "deleted"] }).default("draft"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // Trash (30 days)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Document versions table - version history
export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Gakuchika contents table - store gakuchika materials
export const gakuchikaContents = sqliteTable("gakuchika_contents", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // サークル活動、アルバイト等
  content: text("content"), // ガクチカ本文
  charLimitType: text("char_limit_type", {
    enum: ["300", "400", "500"]
  }), // 文字数制限タイプ
  summary: text("summary"), // 深掘り結果のサマリー
  linkedCompanyIds: text("linked_company_ids"), // JSON array
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Gakuchika conversations table - Q&A sessions
export const gakuchikaConversations = sqliteTable("gakuchika_conversations", {
  id: text("id").primaryKey(),
  gakuchikaId: text("gakuchika_id")
    .notNull()
    .references(() => gakuchikaContents.id, { onDelete: "cascade" }),
  messages: text("messages").notNull(), // JSON: Q&A array
  questionCount: integer("question_count").default(0),
  status: text("status", { enum: ["in_progress", "completed"] }).default("in_progress"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// AI threads table - chat threads for ES review
export const aiThreads = sqliteTable("ai_threads", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  gakuchikaId: text("gakuchika_id").references(() => gakuchikaContents.id, { onDelete: "set null" }),
  title: text("title"),
  status: text("status", { enum: ["active", "archived"] }).default("active"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// AI messages table - chat messages
export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => aiThreads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON: { scores, top3, rewrites, etc. }
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Calendar settings table
export const calendarSettings = sqliteTable("calendar_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["google", "app"] }).notNull(),
  targetCalendarId: text("target_calendar_id"), // Destination calendar
  freebusyCalendarIds: text("freebusy_calendar_ids"), // JSON array
  preferredTimeSlots: text("preferred_time_slots"), // JSON: preferred times
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: integer("google_token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Calendar events table - track events created by Ukarun
export const calendarEvents = sqliteTable("calendar_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deadlineId: text("deadline_id").references(() => deadlines.id, { onDelete: "cascade" }),
  externalEventId: text("external_event_id"), // Google Calendar event ID
  type: text("type", { enum: ["deadline", "work_block"] }).notNull(),
  title: text("title").notNull(),
  startAt: integer("start_at", { mode: "timestamp" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ES templates table
export const esTemplates = sqliteTable("es_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), // null = system template
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  questions: text("questions").notNull(), // JSON array
  isPublic: integer("is_public", { mode: "boolean" }).default(false),
  language: text("language", { enum: ["ja", "en"] }).default("ja"),
  tags: text("tags"), // JSON array
  industry: text("industry"),
  likeCount: integer("like_count").default(0),
  copyCount: integer("copy_count").default(0),
  viewCount: integer("view_count").default(0),
  authorDisplayName: text("author_display_name"),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).default(false),
  shareToken: text("share_token"),
  sharedAt: integer("shared_at", { mode: "timestamp" }),
  shareExpiresAt: integer("share_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Template likes table
export const templateLikes = sqliteTable("template_likes", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => esTemplates.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Template favorites table
export const templateFavorites = sqliteTable("template_favorites", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => esTemplates.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Submission items table - required documents for applications
export const submissionItems = sqliteTable("submission_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["resume", "es", "photo", "transcript", "certificate", "portfolio", "other"]
  }).notNull(),
  name: text("name").notNull(),
  isRequired: integer("is_required", { mode: "boolean" }).default(false),
  status: text("status", { enum: ["not_started", "in_progress", "completed"] }).default("not_started"),
  fileUrl: text("file_url"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Notification settings table
export const notificationSettings = sqliteTable("notification_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  deadlineReminder: integer("deadline_reminder", { mode: "boolean" }).default(true),
  deadlineNear: integer("deadline_near", { mode: "boolean" }).default(true),
  companyFetch: integer("company_fetch", { mode: "boolean" }).default(true),
  esReview: integer("es_review", { mode: "boolean" }).default(true),
  dailySummary: integer("daily_summary", { mode: "boolean" }).default(true),
  reminderTiming: text("reminder_timing"), // JSON: [{ type: "day_before" }, { type: "hour_before", hours: 1 }]
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
