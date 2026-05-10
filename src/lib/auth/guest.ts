/**
 * Guest User Management (Server-side)
 *
 * Functions for managing guest user sessions with 7-day retention.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  documents,
  gakuchikaContents,
  guestUsers,
  interviewConversations,
  interviewDrillAttempts,
  interviewFeedbackHistories,
  interviewTurnEvents,
  loginPrompts,
  motivationConversations,
  notifications,
  submissionItems,
  tasks,
  userPins,
} from "@/lib/db/schema";
import { eq, and, lt, isNull, gte, or, sql } from "drizzle-orm";

const GUEST_RETENTION_DAYS = 7;

// UUID v4 format validation
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate device token format (must be UUID v4)
 */
export function isValidDeviceToken(token: string): boolean {
  return UUID_V4_REGEX.test(token);
}

/**
 * Hash a device token using SHA-256 for secure storage.
 * Raw tokens are never stored in the database.
 */
function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a unique ID for database records
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Create or retrieve a guest user by device token
 */
export async function getOrCreateGuestUser(deviceToken: string) {
  if (!isValidDeviceToken(deviceToken)) {
    return null;
  }
  const hashedToken = hashDeviceToken(deviceToken);

  // Check if guest exists (search by hash, fall back to plaintext for migration)
  let existing = (await db
    .select()
    .from(guestUsers)
    .where(eq(guestUsers.deviceToken, hashedToken))
    .limit(1))[0];

  // Fallback: check for un-hashed token (existing guests before migration)
  if (!existing) {
    existing = (await db
      .select()
      .from(guestUsers)
      .where(eq(guestUsers.deviceToken, deviceToken))
      .limit(1))[0];

    // Migrate to hashed token if found
    if (existing) {
      await db
        .update(guestUsers)
        .set({ deviceToken: hashedToken, updatedAt: new Date() })
        .where(eq(guestUsers.id, existing.id));
    }
  }

  if (existing) {
    // Check if expired
    if (existing.expiresAt < new Date()) {
      // Delete expired guest and create new one
      await db.delete(guestUsers).where(eq(guestUsers.id, existing.id));
    } else if (!existing.migratedToUserId) {
      // Valid guest, extend expiration
      const newExpiration = new Date();
      newExpiration.setDate(newExpiration.getDate() + GUEST_RETENTION_DAYS);

      await db
        .update(guestUsers)
        .set({
          expiresAt: newExpiration,
          updatedAt: new Date()
        })
        .where(eq(guestUsers.id, existing.id));

      return { ...existing, expiresAt: newExpiration };
    } else {
      // Already migrated
      return existing;
    }
  }

  // Create new guest (store hashed token)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + GUEST_RETENTION_DAYS);

  const newGuest = {
    id: generateId(),
    deviceToken: hashedToken,
    expiresAt,
    migratedToUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(guestUsers).values(newGuest);

  return newGuest;
}

/**
 * Get guest user by device token (without creating)
 */
export async function getGuestUser(deviceToken: string) {
  if (!isValidDeviceToken(deviceToken)) {
    return null;
  }
  const hashedToken = hashDeviceToken(deviceToken);
  let guest = (await db
    .select()
    .from(guestUsers)
    .where(eq(guestUsers.deviceToken, hashedToken))
    .limit(1))[0];

  // Fallback for un-hashed tokens
  if (!guest) {
    guest = (await db
      .select()
      .from(guestUsers)
      .where(eq(guestUsers.deviceToken, deviceToken))
      .limit(1))[0];
  }

  if (!guest) return null;
  if (guest.expiresAt < new Date()) return null;
  if (guest.migratedToUserId) return null;

  return guest;
}

/**
 * Migrate guest data to a registered user
 */
export async function migrateGuestToUser(deviceToken: string, userId: string) {
  if (!isValidDeviceToken(deviceToken)) {
    return null;
  }
  const hashedToken = hashDeviceToken(deviceToken);

  const now = new Date();

  return db.transaction(async (tx) => {
    const [guest] = await tx
      .update(guestUsers)
      .set({
        deviceToken: hashedToken,
        migratedToUserId: userId,
        updatedAt: now,
      })
      .where(
        and(
          or(eq(guestUsers.deviceToken, hashedToken), eq(guestUsers.deviceToken, deviceToken)),
          isNull(guestUsers.migratedToUserId),
          gte(guestUsers.expiresAt, now),
        ),
      )
      .returning({ id: guestUsers.id });

    if (!guest) {
      return null;
    }

    const deleteGuestDuplicates = async () => {
      const motivationConflicts = await tx
        .delete(motivationConversations)
        .where(
          and(
            eq(motivationConversations.guestId, guest.id),
            sql`exists (
              select 1
              from "motivation_conversations" as "user_row"
              where "user_row"."company_id" = ${motivationConversations.companyId}
                and "user_row"."user_id" = ${userId}
            )`,
          ),
        )
        .returning({ id: motivationConversations.id });
      const interviewConflicts = await tx
        .delete(interviewConversations)
        .where(
          and(
            eq(interviewConversations.guestId, guest.id),
            sql`exists (
              select 1
              from "interview_conversations" as "user_row"
              where "user_row"."company_id" = ${interviewConversations.companyId}
                and "user_row"."user_id" = ${userId}
            )`,
          ),
        )
        .returning({ id: interviewConversations.id });
      const pinConflicts = await tx
        .delete(userPins)
        .where(
          and(
            eq(userPins.guestId, guest.id),
            sql`exists (
              select 1
              from "user_pins" as "user_row"
              where "user_row"."entity_type" = ${userPins.entityType}
                and "user_row"."entity_id" = ${userPins.entityId}
                and "user_row"."user_id" = ${userId}
            )`,
          ),
        )
        .returning({ id: userPins.id });

      return {
        motivationConversations: motivationConflicts.length,
        interviewConversations: interviewConflicts.length,
        userPins: pinConflicts.length,
      };
    };

    const conflicts = await deleteGuestDuplicates();

    const migrateOwner = async (
      table:
        | typeof companies
        | typeof applications
        | typeof documents
        | typeof tasks
        | typeof notifications
        | typeof gakuchikaContents
        | typeof motivationConversations
        | typeof interviewConversations
        | typeof interviewFeedbackHistories
        | typeof interviewTurnEvents
        | typeof interviewDrillAttempts
        | typeof submissionItems
        | typeof userPins,
    ) => {
      const ownerTable = table as typeof table & {
        guestId: typeof companies.guestId;
        userId: typeof companies.userId;
      };
      await tx
        .update(table)
        .set({
          guestId: null,
          userId,
        } as never)
        .where(eq(ownerTable.guestId, guest.id));
    };

    await migrateOwner(companies);
    await migrateOwner(applications);
    await migrateOwner(documents);
    await migrateOwner(tasks);
    await migrateOwner(notifications);
    await migrateOwner(gakuchikaContents);
    await migrateOwner(motivationConversations);
    await migrateOwner(interviewConversations);
    await migrateOwner(interviewFeedbackHistories);
    await migrateOwner(interviewTurnEvents);
    await migrateOwner(interviewDrillAttempts);
    await migrateOwner(submissionItems);
    await migrateOwner(userPins);

    return { guestId: guest.id, userId, conflicts };
  });
}

/**
 * Check if a login prompt has been shown for a feature
 */
export async function hasShownLoginPrompt(guestId: string, feature: string) {
  const [prompt] = await db
    .select()
    .from(loginPrompts)
    .where(
      and(
        eq(loginPrompts.guestId, guestId),
        eq(loginPrompts.feature, feature)
      )
    )
    .limit(1);

  return !!prompt;
}

/**
 * Record that a login prompt was shown
 */
export async function recordLoginPrompt(guestId: string, feature: string) {
  await db.insert(loginPrompts).values({
    id: generateId(),
    guestId,
    feature,
    shownAt: new Date(),
  });
}

/**
 * Clean up expired guest users (for cron job)
 */
export async function cleanupExpiredGuests() {
  const now = new Date();

  // Delete expired guests that haven't been migrated
  const deleted = await db
    .delete(guestUsers)
    .where(
      and(
        lt(guestUsers.expiresAt, now),
        isNull(guestUsers.migratedToUserId)
      )
    );

  return deleted;
}
