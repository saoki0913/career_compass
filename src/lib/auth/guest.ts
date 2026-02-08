/**
 * Guest User Management (Server-side)
 *
 * Functions for managing guest user sessions with 7-day retention.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { guestUsers, loginPrompts } from "@/lib/db/schema";
import { eq, and, lt, isNull } from "drizzle-orm";

const GUEST_RETENTION_DAYS = 7;

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
  const hashedToken = hashDeviceToken(deviceToken);

  // Check if guest exists (search by hash, fall back to plaintext for migration)
  let existing = await db
    .select()
    .from(guestUsers)
    .where(eq(guestUsers.deviceToken, hashedToken))
    .get();

  // Fallback: check for un-hashed token (existing guests before migration)
  if (!existing) {
    existing = await db
      .select()
      .from(guestUsers)
      .where(eq(guestUsers.deviceToken, deviceToken))
      .get();

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
  const hashedToken = hashDeviceToken(deviceToken);
  let guest = await db
    .select()
    .from(guestUsers)
    .where(eq(guestUsers.deviceToken, hashedToken))
    .get();

  // Fallback for un-hashed tokens
  if (!guest) {
    guest = await db
      .select()
      .from(guestUsers)
      .where(eq(guestUsers.deviceToken, deviceToken))
      .get();
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
  const hashedToken = hashDeviceToken(deviceToken);
  let guest = await db
    .select()
    .from(guestUsers)
    .where(eq(guestUsers.deviceToken, hashedToken))
    .get();

  // Fallback for un-hashed tokens
  if (!guest) {
    guest = await db
      .select()
      .from(guestUsers)
      .where(eq(guestUsers.deviceToken, deviceToken))
      .get();
  }

  if (!guest || guest.migratedToUserId) {
    return null;
  }

  // Reject expired guests
  if (guest.expiresAt < new Date()) {
    return null;
  }

  // Mark guest as migrated
  await db
    .update(guestUsers)
    .set({
      migratedToUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(guestUsers.id, guest.id));

  // TODO: Migrate guest's data (companies, etc.) to user
  // This will be implemented when those features are added

  return { guestId: guest.id, userId };
}

/**
 * Check if a login prompt has been shown for a feature
 */
export async function hasShownLoginPrompt(guestId: string, feature: string) {
  const prompt = await db
    .select()
    .from(loginPrompts)
    .where(
      and(
        eq(loginPrompts.guestId, guestId),
        eq(loginPrompts.feature, feature)
      )
    )
    .get();

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
