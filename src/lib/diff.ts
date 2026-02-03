/**
 * Text Diff Utility
 *
 * Simple diff algorithm for comparing ES text content.
 * Uses a word-based approach suitable for Japanese text.
 */

export type DiffSegmentType = "unchanged" | "added" | "removed";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

/**
 * Tokenize Japanese text into segments (sentences or meaningful chunks)
 * This handles Japanese text better than word-based tokenization
 */
function tokenize(text: string): string[] {
  // Split by sentence-ending punctuation while keeping the punctuation
  // Also split by newlines and common delimiters
  const tokens: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    // Split on Japanese punctuation, newlines, or when we hit a good breaking point
    if (
      char === "。" ||
      char === "、" ||
      char === "\n" ||
      char === "．" ||
      char === "，" ||
      char === "！" ||
      char === "？"
    ) {
      if (current.trim()) {
        tokens.push(current);
      }
      current = "";
    }
  }

  // Don't forget the last segment
  if (current.trim()) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Compute the Longest Common Subsequence (LCS) of two token arrays
 */
function computeLCS(tokens1: string[], tokens2: string[]): string[] {
  const m = tokens1.length;
  const n = tokens2.length;

  // Create DP table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tokens1[i - 1] === tokens2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (tokens1[i - 1] === tokens2[j - 1]) {
      lcs.unshift(tokens1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Compute diff between two texts
 * Returns an array of segments indicating unchanged, added, or removed parts
 *
 * @param originalText - The original text
 * @param newText - The new/modified text
 * @returns Array of diff segments
 */
export function computeDiff(originalText: string, newText: string): DiffSegment[] {
  // Handle edge cases
  if (originalText === newText) {
    return [{ type: "unchanged", text: originalText }];
  }

  if (!originalText) {
    return [{ type: "added", text: newText }];
  }

  if (!newText) {
    return [{ type: "removed", text: originalText }];
  }

  const originalTokens = tokenize(originalText);
  const newTokens = tokenize(newText);

  const lcs = computeLCS(originalTokens, newTokens);

  const result: DiffSegment[] = [];
  let originalIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (originalIdx < originalTokens.length || newIdx < newTokens.length) {
    // Current LCS token we're looking for
    const currentLCS = lcsIdx < lcs.length ? lcs[lcsIdx] : null;

    // Collect removed tokens (in original but not matching current LCS)
    const removed: string[] = [];
    while (
      originalIdx < originalTokens.length &&
      originalTokens[originalIdx] !== currentLCS
    ) {
      removed.push(originalTokens[originalIdx]);
      originalIdx++;
    }

    // Collect added tokens (in new but not matching current LCS)
    const added: string[] = [];
    while (
      newIdx < newTokens.length &&
      newTokens[newIdx] !== currentLCS
    ) {
      added.push(newTokens[newIdx]);
      newIdx++;
    }

    // Add removed segment
    if (removed.length > 0) {
      result.push({ type: "removed", text: removed.join("") });
    }

    // Add added segment
    if (added.length > 0) {
      result.push({ type: "added", text: added.join("") });
    }

    // Add the matching LCS token as unchanged
    if (currentLCS !== null && originalIdx < originalTokens.length && newIdx < newTokens.length) {
      result.push({ type: "unchanged", text: currentLCS });
      originalIdx++;
      newIdx++;
      lcsIdx++;
    }
  }

  // Merge consecutive segments of the same type
  return mergeConsecutiveSegments(result);
}

/**
 * Merge consecutive segments of the same type
 */
function mergeConsecutiveSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return [];

  const merged: DiffSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].type === current.type) {
      current.text += segments[i].text;
    } else {
      merged.push(current);
      current = { ...segments[i] };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Get statistics about the diff
 */
export interface DiffStats {
  addedChars: number;
  removedChars: number;
  unchangedChars: number;
  changePercentage: number;
}

export function getDiffStats(segments: DiffSegment[]): DiffStats {
  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;

  for (const segment of segments) {
    const len = segment.text.length;
    switch (segment.type) {
      case "added":
        addedChars += len;
        break;
      case "removed":
        removedChars += len;
        break;
      case "unchanged":
        unchangedChars += len;
        break;
    }
  }

  const totalOriginal = removedChars + unchangedChars;
  const changePercentage = totalOriginal > 0
    ? Math.round(((addedChars + removedChars) / (totalOriginal + addedChars)) * 100)
    : 100;

  return {
    addedChars,
    removedChars,
    unchangedChars,
    changePercentage,
  };
}
