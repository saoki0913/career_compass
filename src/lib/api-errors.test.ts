import { describe, expect, it, vi } from "vitest";

const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

describe("getUserFacingErrorMessage", () => {
  it("returns the fallback user message for technical errors", async () => {
    const { getUserFacingErrorMessage } = await import("./api-errors");

    const message = getUserFacingErrorMessage(
      new Error("server exploded"),
      {
        code: "CONTACT_SUBMIT_FAILED",
        userMessage: "お問い合わせを送信できませんでした。",
      },
      "ContactForm:submit"
    );

    expect(message).toBe("お問い合わせを送信できませんでした。");
  });
});
