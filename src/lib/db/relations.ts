import { relations } from "drizzle-orm";
import {
  accounts,
  aiMessages,
  aiThreads,
  applications,
  calendarEvents,
  calendarSettings,
  companies,
  creditTransactions,
  credits,
  deadlines,
  documents,
  documentVersions,
  gakuchikaContents,
  gakuchikaConversations,
  guestUsers,
  interviewConversations,
  interviewFeedbackHistories,
  interviewTurnEvents,
  jobTypes,
  loginPrompts,
  motivationConversations,
  notificationSettings,
  notifications,
  sessions,
  submissionItems,
  subscriptions,
  tasks,
  userProfiles,
  users,
} from "./schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  credits: one(credits, {
    fields: [users.id],
    references: [credits.userId],
  }),
  creditTransactions: many(creditTransactions),
  companies: many(companies),
  applications: many(applications),
  submissionItems: many(submissionItems),
  documents: many(documents),
  tasks: many(tasks),
  notifications: many(notifications),
  notificationSettings: one(notificationSettings, {
    fields: [users.id],
    references: [notificationSettings.userId],
  }),
  calendarSettings: one(calendarSettings, {
    fields: [users.id],
    references: [calendarSettings.userId],
  }),
  calendarEvents: many(calendarEvents),
  gakuchikaContents: many(gakuchikaContents),
  motivationConversations: many(motivationConversations),
  interviewConversations: many(interviewConversations),
  interviewFeedbackHistories: many(interviewFeedbackHistories),
  interviewTurnEvents: many(interviewTurnEvents),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const guestUsersRelations = relations(guestUsers, ({ many, one }) => ({
  migratedToUser: one(users, {
    fields: [guestUsers.migratedToUserId],
    references: [users.id],
  }),
  companies: many(companies),
  applications: many(applications),
  submissionItems: many(submissionItems),
  documents: many(documents),
  tasks: many(tasks),
  notifications: many(notifications),
  loginPrompts: many(loginPrompts),
  gakuchikaContents: many(gakuchikaContents),
  motivationConversations: many(motivationConversations),
  interviewConversations: many(interviewConversations),
  interviewFeedbackHistories: many(interviewFeedbackHistories),
  interviewTurnEvents: many(interviewTurnEvents),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const loginPromptsRelations = relations(loginPrompts, ({ one }) => ({
  guest: one(guestUsers, {
    fields: [loginPrompts.guestId],
    references: [guestUsers.id],
  }),
}));

export const companiesRelations = relations(companies, ({ many, one }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [companies.guestId],
    references: [guestUsers.id],
  }),
  applications: many(applications),
  deadlines: many(deadlines),
  documents: many(documents),
  tasks: many(tasks),
  motivationConversations: many(motivationConversations),
  interviewConversations: many(interviewConversations),
}));

export const applicationsRelations = relations(applications, ({ many, one }) => ({
  company: one(companies, {
    fields: [applications.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [applications.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [applications.guestId],
    references: [guestUsers.id],
  }),
  jobTypes: many(jobTypes),
  deadlines: many(deadlines),
  submissionItems: many(submissionItems),
  documents: many(documents),
  tasks: many(tasks),
}));

export const jobTypesRelations = relations(jobTypes, ({ many, one }) => ({
  application: one(applications, {
    fields: [jobTypes.applicationId],
    references: [applications.id],
  }),
  deadlines: many(deadlines),
  documents: many(documents),
}));

export const deadlinesRelations = relations(deadlines, ({ many, one }) => ({
  company: one(companies, {
    fields: [deadlines.companyId],
    references: [companies.id],
  }),
  application: one(applications, {
    fields: [deadlines.applicationId],
    references: [applications.id],
  }),
  jobType: one(jobTypes, {
    fields: [deadlines.jobTypeId],
    references: [jobTypes.id],
  }),
  tasks: many(tasks),
  calendarEvents: many(calendarEvents),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const creditsRelations = relations(credits, ({ one }) => ({
  user: one(users, {
    fields: [credits.userId],
    references: [users.id],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [tasks.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [tasks.companyId],
    references: [companies.id],
  }),
  application: one(applications, {
    fields: [tasks.applicationId],
    references: [applications.id],
  }),
  deadline: one(deadlines, {
    fields: [tasks.deadlineId],
    references: [deadlines.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [notifications.guestId],
    references: [guestUsers.id],
  }),
}));

export const documentsRelations = relations(documents, ({ many, one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [documents.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [documents.companyId],
    references: [companies.id],
  }),
  application: one(applications, {
    fields: [documents.applicationId],
    references: [applications.id],
  }),
  jobType: one(jobTypes, {
    fields: [documents.jobTypeId],
    references: [jobTypes.id],
  }),
  versions: many(documentVersions),
  aiThreads: many(aiThreads),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
}));

export const gakuchikaContentsRelations = relations(gakuchikaContents, ({ many, one }) => ({
  user: one(users, {
    fields: [gakuchikaContents.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [gakuchikaContents.guestId],
    references: [guestUsers.id],
  }),
  conversations: many(gakuchikaConversations),
  aiThreads: many(aiThreads),
}));

export const gakuchikaConversationsRelations = relations(gakuchikaConversations, ({ one }) => ({
  gakuchika: one(gakuchikaContents, {
    fields: [gakuchikaConversations.gakuchikaId],
    references: [gakuchikaContents.id],
  }),
}));

export const aiThreadsRelations = relations(aiThreads, ({ many, one }) => ({
  document: one(documents, {
    fields: [aiThreads.documentId],
    references: [documents.id],
  }),
  gakuchika: one(gakuchikaContents, {
    fields: [aiThreads.gakuchikaId],
    references: [gakuchikaContents.id],
  }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  thread: one(aiThreads, {
    fields: [aiMessages.threadId],
    references: [aiThreads.id],
  }),
}));

export const calendarSettingsRelations = relations(calendarSettings, ({ one }) => ({
  user: one(users, {
    fields: [calendarSettings.userId],
    references: [users.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id],
  }),
  deadline: one(deadlines, {
    fields: [calendarEvents.deadlineId],
    references: [deadlines.id],
  }),
}));

export const submissionItemsRelations = relations(submissionItems, ({ one }) => ({
  user: one(users, {
    fields: [submissionItems.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [submissionItems.guestId],
    references: [guestUsers.id],
  }),
  application: one(applications, {
    fields: [submissionItems.applicationId],
    references: [applications.id],
  }),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, {
    fields: [notificationSettings.userId],
    references: [users.id],
  }),
}));

export const motivationConversationsRelations = relations(motivationConversations, ({ one }) => ({
  user: one(users, {
    fields: [motivationConversations.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [motivationConversations.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [motivationConversations.companyId],
    references: [companies.id],
  }),
}));

export const interviewConversationsRelations = relations(interviewConversations, ({ many, one }) => ({
  user: one(users, {
    fields: [interviewConversations.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [interviewConversations.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [interviewConversations.companyId],
    references: [companies.id],
  }),
  feedbackHistories: many(interviewFeedbackHistories),
  turnEvents: many(interviewTurnEvents),
}));

export const interviewFeedbackHistoriesRelations = relations(interviewFeedbackHistories, ({ one }) => ({
  conversation: one(interviewConversations, {
    fields: [interviewFeedbackHistories.conversationId],
    references: [interviewConversations.id],
  }),
  user: one(users, {
    fields: [interviewFeedbackHistories.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [interviewFeedbackHistories.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [interviewFeedbackHistories.companyId],
    references: [companies.id],
  }),
}));

export const interviewTurnEventsRelations = relations(interviewTurnEvents, ({ one }) => ({
  conversation: one(interviewConversations, {
    fields: [interviewTurnEvents.conversationId],
    references: [interviewConversations.id],
  }),
  user: one(users, {
    fields: [interviewTurnEvents.userId],
    references: [users.id],
  }),
  guest: one(guestUsers, {
    fields: [interviewTurnEvents.guestId],
    references: [guestUsers.id],
  }),
  company: one(companies, {
    fields: [interviewTurnEvents.companyId],
    references: [companies.id],
  }),
}));
