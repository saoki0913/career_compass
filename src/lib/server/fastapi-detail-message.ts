/**
 * FastAPI の HTTPException detail（文字列 / オブジェクト / 配列）からユーザー向け短文を取り出す。
 */
export function messageFromFastApiDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && !Array.isArray(detail)) {
    const o = detail as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
  }
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const msg = (item as { msg?: unknown }).msg;
        if (typeof msg === "string") return msg;
      }
    }
  }
  return undefined;
}
