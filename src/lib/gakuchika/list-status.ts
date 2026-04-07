/**
 * Map API `conversationStatus` (possibly missing or malformed from JSON) to list filter / grouping keys.
 */
export function getGakuchikaListStatusKey(
  status: unknown
): "not_started" | "in_progress" | "completed" {
  if (status == null) return "not_started";
  if (typeof status === "string") {
    const t = status.trim();
    if (t === "") return "not_started";
    if (t === "in_progress") return "in_progress";
    if (t === "completed") return "completed";
  }
  return "not_started";
}
