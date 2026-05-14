export function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

export function isTechnicalMessage(text: string): boolean {
  return (
    /(internal server error|failed to fetch|authentication required|permission denied|api|response|server log|trace|stack|sql|backend|request failed|request id|requestId|debug|developer|migration|schema|table|db\b|secret|token|provider|exception|api key|authorization)/i.test(
      text,
    ) ||
    /サーバーログ|API 応答|SQL|バックエンド|内部|開発|デバッグ|マイグレーション|migration|schema|スキーマ|テーブル|DB|requestId|リクエストID/i.test(
      text,
    )
  );
}

export function isLikelyUserSafeMessage(text: string): boolean {
  return hasJapanese(text) && !isTechnicalMessage(text);
}

export function sanitizeSSEErrorMessage(
  rawMessage: unknown,
  fallback = "AIサービスでエラーが発生しました。",
): string {
  if (typeof rawMessage !== "string") {
    return fallback;
  }
  const message = rawMessage.trim();
  if (!message) {
    return fallback;
  }
  return isLikelyUserSafeMessage(message) ? message : fallback;
}
