import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// Better Auth required tables
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified"),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_ux").on(t.providerId, t.accountId),
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
);

// Better Auth expects singular model names
export const user = users;
export const session = sessions;
export const account = accounts;
export const verification = verifications;

// Guest users table - for anonymous sessions
export const guestUsers = pgTable("guest_users", {
  id: text("id").primaryKey(),
  deviceToken: text("device_token").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  migratedToUserId: text("migrated_to_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// User profiles table - plan selection and onboarding status
export const userProfiles = pgTable("user_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["free", "standard", "pro"] }).notNull().default("free"),
  planSelectedAt: timestamptz("plan_selected_at"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  // Onboarding fields
  university: text("university"),
  faculty: text("faculty"), // 学部・学科
  graduationYear: integer("graduation_year"),
  targetIndustries: text("target_industries"), // JSON string array
  targetJobTypes: text("target_job_types"), // JSON string array (志望職種)
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// Login prompts table - track shown login prompts per feature (show only once)
export const loginPrompts = pgTable(
  "login_prompts",
  {
    id: text("id").primaryKey(),
    guestId: text("guest_id")
      .notNull()
      .references(() => guestUsers.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(), // e.g., "calendar", "ai_review", "settings"
    shownAt: timestamptz("shown_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("login_prompts_guest_feature_ux").on(t.guestId, t.feature)]
);

// Companies table - registered companies for tracking
export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    recruitmentUrl: text("recruitment_url"),
    corporateUrl: text("corporate_url"),
    // Multiple corporate info URLs for RAG (9-category contentType) - JSON array
    corporateInfoUrls: text("corporate_info_urls"),
    // Mypage credentials (password is encrypted)
    mypageUrl: text("mypage_url"),
    mypageLoginId: text("mypage_login_id"),
    mypagePassword: text("mypage_password"),
    notes: text("notes"),
    status: text("status", {
      enum: [
        // Not started
        "inbox",
        "needs_confirmation",
        // In progress
        "info_session",
        "es",
        "web_test",
        "coding_test",
        "case_study",
        "group_discussion",
        "interview_1",
        "interview_2",
        "final_interview",
        "waiting_result",
        // Completed
        "offer",
        "summer_pass",
        "autumn_pass",
        "winter_pass",
        "es_rejected",
        "gd_rejected",
        "interview_1_rejected",
        "interview_2_rejected",
        "withdrawn",
        "archived",
      ],
    }).default("inbox"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPinned: boolean("is_pinned").notNull().default(false),
    infoFetchedAt: timestamptz("info_fetched_at"),
    corporateInfoFetchedAt: timestamptz("corporate_info_fetched_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("companies_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("companies_user_id_idx").on(t.userId),
    index("companies_guest_id_idx").on(t.guestId),
  ]
);

// Applications table - track application rounds (summer intern, main selection, etc.)
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // 夏インターン、本選考など
    type: text("type", {
      enum: ["summer_intern", "fall_intern", "winter_intern", "early", "main", "other"],
    }).notNull(),
    status: text("status", { enum: ["active", "completed", "withdrawn"] })
      .default("active")
      .notNull(),
    phase: text("phase"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("applications_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("applications_company_id_idx").on(t.companyId),
  ]
);

// Job types table - track job types within an application
export const jobTypes = pgTable(
  "job_types",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_types_application_sort_order_idx").on(t.applicationId, t.sortOrder)]
);

// Deadlines table - ES submissions, interviews, etc.
export const deadlines = pgTable(
  "deadlines",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
    jobTypeId: text("job_type_id").references(() => jobTypes.id, { onDelete: "set null" }),
    type: text("type", {
      enum: [
        "es_submission",
        "web_test",
        "aptitude_test",
        "interview_1",
        "interview_2",
        "interview_3",
        "interview_final",
        "briefing",
        "internship",
        "offer_response",
        "other",
      ],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    memo: text("memo"),
    dueDate: timestamptz("due_date").notNull(),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }),
    sourceUrl: text("source_url"),
    completedAt: timestamptz("completed_at"),
    autoCompletedTaskIds: text("auto_completed_task_ids"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("deadlines_company_id_idx").on(t.companyId),
    index("deadlines_application_id_idx").on(t.applicationId),
    index("deadlines_job_type_id_idx").on(t.jobTypeId),
    index("deadlines_due_date_idx").on(t.dueDate),
    index("deadlines_confirm_completed_due_idx").on(t.isConfirmed, t.completedAt, t.dueDate),
  ]
);

// Stripe subscription table
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: text("status"),
    currentPeriodEnd: timestamptz("current_period_end"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Frequently queried from Stripe webhooks.
    uniqueIndex("subscriptions_stripe_subscription_id_ux").on(t.stripeSubscriptionId),
  ]
);

// Credits table - track user credit balance
export const credits = pgTable("credits", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  monthlyAllocation: integer("monthly_allocation").notNull().default(30),
  partialCreditAccumulator: integer("partial_credit_accumulator").notNull().default(0),
  lastResetAt: timestamptz("last_reset_at").notNull().defaultNow(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// Credit transactions table - audit log for credit changes
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    type: text("type", {
      enum: [
        "monthly_grant",
        "plan_change",
        "company_fetch",
        "es_review",
        "gakuchika",
        "gakuchika_draft",
        "motivation",
        "motivation_draft",
        "refund",
      ],
    }).notNull(),
    referenceId: text("reference_id"),
    description: text("description"),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("credit_transactions_user_id_idx").on(t.userId),
    index("credit_transactions_user_created_at_idx").on(t.userId, t.createdAt),
    index("credit_transactions_reference_id_idx").on(t.referenceId),
  ]
);

// Daily free usage table - track daily free operations
export const dailyFreeUsage = pgTable(
  "daily_free_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in JST
    companyFetchCount: integer("company_fetch_count").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("daily_free_usage_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    uniqueIndex("daily_free_usage_user_date_ux").on(t.userId, t.date),
    uniqueIndex("daily_free_usage_guest_date_ux").on(t.guestId, t.date),
  ]
);

// Tasks table - task management
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
    deadlineId: text("deadline_id").references(() => deadlines.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type", { enum: ["es", "web_test", "self_analysis", "gakuchika", "video", "other"] }).notNull(),
    status: text("status", { enum: ["open", "done"] }).default("open").notNull(),
    dueDate: timestamptz("due_date"),
    isAutoGenerated: boolean("is_auto_generated").notNull().default(false),
    sortOrder: integer("sort_order").default(0),
    completedAt: timestamptz("completed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("tasks_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_guest_id_idx").on(t.guestId),
    index("tasks_company_id_idx").on(t.companyId),
    index("tasks_application_id_idx").on(t.applicationId),
    index("tasks_deadline_id_idx").on(t.deadlineId),
    index("tasks_status_idx").on(t.status),
    index("tasks_user_status_due_idx").on(t.userId, t.status, t.dueDate),
    index("tasks_guest_status_due_idx").on(t.guestId, t.status, t.dueDate),
  ]
);

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["deadline_reminder", "deadline_near", "company_fetch", "es_review", "daily_summary"] }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    data: text("data"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at"),
  },
  (t) => [
    check("notifications_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_guest_id_idx").on(t.guestId),
    index("notifications_is_read_idx").on(t.isRead),
    index("notifications_user_created_at_idx").on(t.userId, t.createdAt.desc()),
    index("notifications_guest_created_at_idx").on(t.guestId, t.createdAt.desc()),
    index("notifications_user_unread_created_at_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.isRead} = false`),
    index("notifications_guest_unread_created_at_idx")
      .on(t.guestId, t.createdAt.desc())
      .where(sql`${t.isRead} = false`),
  ]
);

// Documents table - ES, Tips, Company Analysis
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
    jobTypeId: text("job_type_id").references(() => jobTypes.id, { onDelete: "set null" }),
    type: text("type", { enum: ["es", "tips", "company_analysis"] }).notNull(),
    title: text("title").notNull(),
    content: text("content"),
    status: text("status", { enum: ["draft", "published", "deleted"] }).default("draft"),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("documents_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("documents_user_id_idx").on(t.userId),
    index("documents_guest_id_idx").on(t.guestId),
    index("documents_company_id_idx").on(t.companyId),
    index("documents_application_id_idx").on(t.applicationId),
    index("documents_job_type_id_idx").on(t.jobTypeId),
    index("documents_status_idx").on(t.status),
    index("documents_user_updated_at_active_idx")
      .on(t.userId, t.updatedAt.desc())
      .where(sql`${t.status} != 'deleted'`),
    index("documents_guest_updated_at_active_idx")
      .on(t.guestId, t.updatedAt.desc())
      .where(sql`${t.status} != 'deleted'`),
  ]
);

// Document versions table - version history
export const documentVersions = pgTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("document_versions_document_created_at_idx").on(t.documentId, t.createdAt.desc())]
);

// Gakuchika contents table - store gakuchika materials
export const gakuchikaContents = pgTable(
  "gakuchika_contents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    charLimitType: text("char_limit_type", { enum: ["300", "400", "500"] }),
    summary: text("summary"),
    linkedCompanyIds: text("linked_company_ids"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("gakuchika_contents_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("gakuchika_contents_user_id_idx").on(t.userId),
    index("gakuchika_contents_guest_id_idx").on(t.guestId),
  ]
);

// Gakuchika conversations table - Q&A sessions
export const gakuchikaConversations = pgTable(
  "gakuchika_conversations",
  {
    id: text("id").primaryKey(),
    gakuchikaId: text("gakuchika_id")
      .notNull()
      .references(() => gakuchikaContents.id, { onDelete: "cascade" }),
    messages: text("messages").notNull(),
    questionCount: integer("question_count").notNull().default(0),
    status: text("status", { enum: ["in_progress", "completed"] }).default("in_progress"),
    starScores: text("star_scores"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("gakuchika_conversations_gakuchika_created_at_idx").on(t.gakuchikaId, t.createdAt.desc())]
);

// AI threads table - chat threads for ES review
export const aiThreads = pgTable(
  "ai_threads",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    gakuchikaId: text("gakuchika_id").references(() => gakuchikaContents.id, { onDelete: "set null" }),
    title: text("title"),
    status: text("status", { enum: ["active", "archived"] }).default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ai_threads_document_created_at_idx").on(t.documentId, t.createdAt.desc())]
);

// AI messages table - chat messages
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    metadata: text("metadata"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_messages_thread_created_at_idx").on(t.threadId, t.createdAt)]
);

// Calendar settings table
export const calendarSettings = pgTable("calendar_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["google", "app"] }).notNull(),
  targetCalendarId: text("target_calendar_id"),
  freebusyCalendarIds: text("freebusy_calendar_ids"),
  preferredTimeSlots: text("preferred_time_slots"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamptz("google_token_expires_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// Calendar events table - track events created by Ukarun
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deadlineId: text("deadline_id").references(() => deadlines.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id"),
    type: text("type", { enum: ["deadline", "work_block"] }).notNull(),
    title: text("title").notNull(),
    startAt: timestamptz("start_at").notNull(),
    endAt: timestamptz("end_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("calendar_events_user_start_at_idx").on(t.userId, t.startAt),
    index("calendar_events_deadline_id_idx").on(t.deadlineId),
  ]
);

// ES templates table
export const esTemplates = pgTable(
  "es_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    questions: text("questions").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    language: text("language", { enum: ["ja", "en"] }).notNull().default("ja"),
    tags: text("tags"),
    industry: text("industry"),
    likeCount: integer("like_count").notNull().default(0),
    copyCount: integer("copy_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    authorDisplayName: text("author_display_name"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    shareToken: text("share_token"),
    sharedAt: timestamptz("shared_at"),
    shareExpiresAt: timestamptz("share_expires_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("es_templates_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("es_templates_user_id_idx").on(t.userId),
    index("es_templates_guest_id_idx").on(t.guestId),
  ]
);

// Template likes table
export const templateLikes = pgTable(
  "template_likes",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => esTemplates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("template_likes_user_template_ux").on(t.userId, t.templateId)]
);

// Template favorites table
export const templateFavorites = pgTable(
  "template_favorites",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => esTemplates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("template_favorites_user_template_ux").on(t.userId, t.templateId)]
);

// Submission items table - required documents for applications
export const submissionItems = pgTable(
  "submission_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["resume", "es", "photo", "transcript", "certificate", "portfolio", "other"],
    }).notNull(),
    name: text("name").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] }).default("not_started"),
    fileUrl: text("file_url"),
    notes: text("notes"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("submission_items_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("submission_items_user_id_idx").on(t.userId),
    index("submission_items_guest_id_idx").on(t.guestId),
    index("submission_items_application_id_idx").on(t.applicationId),
  ]
);

// Notification settings table
export const notificationSettings = pgTable("notification_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  deadlineReminder: boolean("deadline_reminder").notNull().default(true),
  deadlineNear: boolean("deadline_near").notNull().default(true),
  companyFetch: boolean("company_fetch").notNull().default(true),
  esReview: boolean("es_review").notNull().default(true),
  dailySummary: boolean("daily_summary").notNull().default(true),
  reminderTiming: text("reminder_timing"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// Motivation conversations table - Q&A sessions for ES motivation drafts
export const motivationConversations = pgTable(
  "motivation_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: text("guest_id").references(() => guestUsers.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    messages: text("messages").notNull(),
    questionCount: integer("question_count").notNull().default(0),
    status: text("status", { enum: ["in_progress", "completed"] }).default("in_progress"),
    motivationScores: text("motivation_scores"),
    generatedDraft: text("generated_draft"),
    charLimitType: text("char_limit_type", { enum: ["300", "400", "500"] }),
    lastSuggestions: text("last_suggestions"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("motivation_conversations_owner_xor", sql`(${t.userId} is null) <> (${t.guestId} is null)`),
    index("motivation_conversations_company_id_idx").on(t.companyId),
    uniqueIndex("motivation_conversations_company_user_ux").on(t.companyId, t.userId),
    uniqueIndex("motivation_conversations_company_guest_ux").on(t.companyId, t.guestId),
  ]
);

// Processed Stripe events table - webhook idempotency protection
export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamptz("processed_at").notNull().defaultNow(),
});

// Waitlist signups (pre-launch acquisition)
export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    graduationYear: integer("graduation_year"),
    targetIndustry: text("target_industry"),
    source: text("source"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("waitlist_signups_email_lower_ux").on(sql`lower(${t.email})`)]
);

// Contact messages (support/inquiries)
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    subject: text("subject"),
    message: text("message").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("contact_messages_created_at_idx").on(t.createdAt)]
);
