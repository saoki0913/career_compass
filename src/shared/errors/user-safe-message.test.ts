import { describe, expect, it } from "vitest";
import { hasJapanese, isTechnicalMessage, isLikelyUserSafeMessage, sanitizeSSEErrorMessage } from "./user-safe-message";

describe("user-safe-message", () => {
  describe("hasJapanese", () => {
    it("detects Japanese characters", () => {
      expect(hasJapanese("送信に失敗しました。")).toBe(true);
      expect(hasJapanese("Something went wrong")).toBe(false);
    });
  });

  describe("isTechnicalMessage", () => {
    it("detects technical patterns", () => {
      expect(isTechnicalMessage("requestId=req-1")).toBe(true);
      expect(isTechnicalMessage("authorization token")).toBe(true);
      expect(isTechnicalMessage("もう一度お試しください。")).toBe(false);
    });
  });

  describe("isLikelyUserSafeMessage", () => {
    it("returns true for Japanese user-safe messages", () => {
      expect(isLikelyUserSafeMessage("送信に失敗しました。")).toBe(true);
      expect(isLikelyUserSafeMessage("もう一度お試しください。")).toBe(true);
    });
    it("returns false for English technical messages", () => {
      expect(isLikelyUserSafeMessage("Internal Server Error")).toBe(false);
      expect(isLikelyUserSafeMessage("Failed to fetch")).toBe(false);
      expect(isLikelyUserSafeMessage("SQL error in query")).toBe(false);
    });
    it("returns false for Japanese messages containing technical terms", () => {
      expect(isLikelyUserSafeMessage("リクエストIDが不正です")).toBe(false);
      expect(isLikelyUserSafeMessage("SQL エラーが発生しました")).toBe(false);
      expect(isLikelyUserSafeMessage("デバッグ情報を確認してください")).toBe(false);
      expect(isLikelyUserSafeMessage("バックエンドに接続できません")).toBe(false);
    });
    it("returns false for pure English without Japanese", () => {
      expect(isLikelyUserSafeMessage("Something went wrong")).toBe(false);
    });
  });

  describe("sanitizeSSEErrorMessage", () => {
    it("passes through Japanese user-safe messages", () => {
      expect(sanitizeSSEErrorMessage("処理に失敗しました。")).toBe("処理に失敗しました。");
    });
    it("returns fallback for English technical messages", () => {
      expect(sanitizeSSEErrorMessage("Internal Server Error")).toBe("AIサービスでエラーが発生しました。");
    });
    it("returns fallback for undefined/null/empty", () => {
      expect(sanitizeSSEErrorMessage(undefined)).toBe("AIサービスでエラーが発生しました。");
      expect(sanitizeSSEErrorMessage(null)).toBe("AIサービスでエラーが発生しました。");
      expect(sanitizeSSEErrorMessage("")).toBe("AIサービスでエラーが発生しました。");
      expect(sanitizeSSEErrorMessage("  ")).toBe("AIサービスでエラーが発生しました。");
    });
    it("uses custom fallback when provided", () => {
      expect(sanitizeSSEErrorMessage("error", "カスタムフォールバック")).toBe("カスタムフォールバック");
    });
    it("trims whitespace from valid messages", () => {
      expect(sanitizeSSEErrorMessage("  処理に失敗しました。  ")).toBe("処理に失敗しました。");
    });
  });
});
