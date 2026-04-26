/**
 * Deadline type → reminder tier mapping.
 *
 * Tiers: "7d" | "3d" | "1d" | "0d"
 *
 * - aggressive: ES提出, 面接全般, Webテスト, 適性検査, 内定返答 → 7d, 3d, 1d, 0d
 * - standard:   説明会, インターン                             → 3d, 1d, 0d
 * - light:      その他                                       → 1d, 0d
 */

export type ReminderTier = "7d" | "3d" | "1d" | "0d";

type ImportanceLevel = "aggressive" | "standard" | "light";

const IMPORTANCE_TIERS: Record<ImportanceLevel, ReminderTier[]> = {
  aggressive: ["7d", "3d", "1d", "0d"],
  standard: ["3d", "1d", "0d"],
  light: ["1d", "0d"],
};

const DEADLINE_TYPE_IMPORTANCE: Record<string, ImportanceLevel> = {
  es_submission: "aggressive",
  web_test: "aggressive",
  aptitude_test: "aggressive",
  interview_1: "aggressive",
  interview_2: "aggressive",
  interview_3: "aggressive",
  interview_final: "aggressive",
  offer_response: "aggressive",
  briefing: "standard",
  internship: "standard",
  other: "light",
};

/** Tier → hour range for classification */
export const TIER_HOUR_RANGES: Record<ReminderTier, { min: number; max: number }> = {
  "0d": { min: 0, max: 12 },
  "1d": { min: 12, max: 36 },
  "3d": { min: 36, max: 84 },
  "7d": { min: 84, max: 180 },
};

/** Tier → user-facing message */
export const TIER_MESSAGES: Record<ReminderTier, string> = {
  "0d": "今日が締切です",
  "1d": "締切が明日です",
  "3d": "締切が3日以内です",
  "7d": "締切まで1週間です",
};

/**
 * Get the effective reminder tiers for a deadline type.
 * If user overrides are provided for this type, use those instead of defaults.
 */
export function getEffectiveTiers(
  deadlineType: string,
  userOverrides?: Readonly<Record<string, readonly ReminderTier[]>> | null,
): ReminderTier[] {
  if (userOverrides?.[deadlineType]) {
    return [...userOverrides[deadlineType]];
  }

  const importance = DEADLINE_TYPE_IMPORTANCE[deadlineType] ?? "light";
  return [...IMPORTANCE_TIERS[importance]];
}

/**
 * Classify hours-until-due into a reminder tier.
 */
export function classifyTier(hoursUntilDue: number): ReminderTier | null {
  for (const [tier, range] of Object.entries(TIER_HOUR_RANGES) as [ReminderTier, { min: number; max: number }][]) {
    if (hoursUntilDue >= range.min && hoursUntilDue < range.max) {
      return tier;
    }
  }
  return null;
}
