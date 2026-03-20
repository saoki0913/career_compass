import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "./logger";

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts common secrets and identifiers from logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("security-test", new Error("Bearer abcdefghijklmnopqrstuvwxyz and test@example.com"), {
      deviceToken: "x-device-token=abcdefghijklmnopqrstuvwxyz",
      session: "better-auth.session_token=abcdefghijklmnopqrstuvwxyz",
    });

    const payload = String(spy.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("[REDACTED]");
    expect(payload).not.toContain("test@example.com");
    expect(payload).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
