import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, logWarn } from "./logger";

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts common secrets and identifiers from logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("security-test", new Error("Bearer abcdefghijklmnopqrstuvwxyz and test@example.com"), {
      deviceToken: "x-device-token=abcdefghijklmnopqrstuvwxyz",
      session: "better-auth.session_token=abcdefghijklmnopqrstuvwxyz",
      nested: {
        headers: {
          cookie: "guest_device_token=abcdefghijklmnopqrstuvwxyz",
        },
        prompt: "ES本文",
      },
    });

    const payload = String(spy.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("[REDACTED]");
    expect(payload).toContain("[DROPPED]");
    expect(payload).not.toContain("test@example.com");
    expect(payload).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(payload).not.toContain("ES本文");
    expect(() => JSON.parse(payload)).not.toThrow();
  });

  it("redacts development stacks before logging", () => {
    vi.stubEnv("NODE_ENV", "development");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("failed");
    error.stack = "Error: failed\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz\nstudent@example.com";

    logError("stack-test", error);

    const payload = String(spy.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("[REDACTED]");
    expect(payload).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(payload).not.toContain("student@example.com");
    expect(() => JSON.parse(payload)).not.toThrow();
  });

  it("logs sanitized info and warning events", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logInfo("cron-complete", {
      event: "daily_notifications",
      count: 2,
      prompt: "ES本文",
      route: "/api/cron/daily-notifications?token=secret",
    });
    logWarn("cron-partial", {
      event: "daily_notifications",
      status: 207,
      cookie: "guest_device_token=abcdefghijklmnopqrstuvwxyz",
    });

    const infoPayload = String(infoSpy.mock.calls[0]?.[0] ?? "");
    const warnPayload = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(infoPayload).toContain("[DROPPED]");
    expect(infoPayload).not.toContain("ES本文");
    expect(infoPayload).not.toContain("token=secret");
    expect(warnPayload).toContain("[DROPPED]");
    expect(warnPayload).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(() => JSON.parse(infoPayload)).not.toThrow();
    expect(() => JSON.parse(warnPayload)).not.toThrow();
  });
});
