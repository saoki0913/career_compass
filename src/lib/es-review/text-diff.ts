export interface DiffSegment {
  type: "same" | "added" | "removed";
  text: string;
}

/**
 * Split Japanese text into sentences by 。！？ boundaries,
 * preserving the delimiter with the preceding sentence.
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/(?<=[。！？])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Compute LCS (Longest Common Subsequence) table for two arrays.
 * Returns the 2D DP table.
 */
function lcsTable<T>(a: T[], b: T[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack through LCS table to produce diff segments.
 */
function diffFromLCS<T>(
  a: T[],
  b: T[],
  dp: number[][],
  toString: (item: T) => string,
): DiffSegment[] {
  const result: DiffSegment[] = [];
  let i = a.length;
  let j = b.length;

  const segments: DiffSegment[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      segments.push({ type: "same", text: toString(a[i - 1]) });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.push({ type: "added", text: toString(b[j - 1]) });
      j--;
    } else {
      segments.push({ type: "removed", text: toString(a[i - 1]) });
      i--;
    }
  }

  segments.reverse();

  // Merge adjacent segments of the same type
  for (const seg of segments) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }

  return result;
}

/**
 * Compute character-level diff within changed sentences.
 */
function charLevelDiff(original: string, revised: string): DiffSegment[] {
  const aChars = [...original];
  const bChars = [...revised];
  const dp = lcsTable(aChars, bChars);
  return diffFromLCS(aChars, bChars, dp, (c) => c);
}

/**
 * Compute a Japanese sentence-level diff between original and revised text.
 * Changed sentences get character-level sub-diffs.
 *
 * @returns Array of DiffSegment for rendering
 */
export function computeJapaneseDiff(
  original: string,
  revised: string,
): DiffSegment[] {
  const origTrimmed = (original || "").trim();
  const revTrimmed = (revised || "").trim();

  if (origTrimmed === revTrimmed) {
    return origTrimmed ? [{ type: "same", text: origTrimmed }] : [];
  }
  if (!origTrimmed) {
    return revTrimmed ? [{ type: "added", text: revTrimmed }] : [];
  }
  if (!revTrimmed) {
    return [{ type: "removed", text: origTrimmed }];
  }

  const origSentences = splitSentences(origTrimmed);
  const revSentences = splitSentences(revTrimmed);

  const dp = lcsTable(origSentences, revSentences);
  const sentenceDiff = diffFromLCS(
    origSentences,
    revSentences,
    dp,
    (s) => s,
  );

  // For sentence-level changes, do character-level sub-diff
  // by pairing up adjacent removed+added blocks
  const result: DiffSegment[] = [];
  let idx = 0;
  while (idx < sentenceDiff.length) {
    const seg = sentenceDiff[idx];
    if (
      seg.type === "removed" &&
      idx + 1 < sentenceDiff.length &&
      sentenceDiff[idx + 1].type === "added"
    ) {
      // Paired change: do character-level diff
      const charDiffs = charLevelDiff(seg.text, sentenceDiff[idx + 1].text);
      result.push(...charDiffs);
      idx += 2;
    } else {
      result.push(seg);
      idx++;
    }
  }

  return result;
}

/**
 * Count the number of changed segments (added + removed).
 */
export function countChanges(segments: DiffSegment[]): number {
  return segments.filter((s) => s.type !== "same").length;
}
