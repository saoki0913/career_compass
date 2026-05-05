import { describe, expect, it } from "vitest";
import { redactSensitive, scrubObject } from "./sanitize";

describe("redactSensitive", () => {
  it("redacts common secrets and emails", () => {
    const text = [
      "Bearer abcdefghijklmnopqrstuvwxyz",
      "test@example.com",
      "guest_device_token=abcdefghijklmnopqrstuvwxyz",
      "sk-ant-abcdefghijklmnopqrstuvwxyz",
    ].join(" ");

    const redacted = redactSensitive(text);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("test@example.com");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});

describe("scrubObject", () => {
  it("drops sensitive keys and recursively redacts nested values", () => {
    const scrubbed = scrubObject({
      requestId: "req-1",
      headers: {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
        cookie: "guest_device_token=abcdefghijklmnopqrstuvwxyz",
      },
      nested: {
        email: "student@example.com",
        prompt: "ES本文です",
      },
    });

    expect(scrubbed).toEqual({
      requestId: "req-1",
      headers: {
        authorization: "[DROPPED]",
        cookie: "[DROPPED]",
      },
      nested: {
        email: "[REDACTED]",
        prompt: "[DROPPED]",
      },
    });
  });

  it("returns JSON-safe values for errors", () => {
    const scrubbed = scrubObject(new Error("token=abcdefghijklmnopqrstuvwxyz"));

    expect(JSON.stringify(scrubbed)).toContain("[REDACTED]");
    expect(JSON.stringify(scrubbed)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
