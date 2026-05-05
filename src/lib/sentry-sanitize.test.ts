import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-sanitize";

describe("scrubSentryEvent", () => {
  it("scrubs request, breadcrumb, and exception data", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        headers: {
          authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
          cookie: "guest_device_token=abcdefghijklmnopqrstuvwxyz",
        },
      },
      breadcrumbs: [
        {
          message: "学生時代にサークル運営で成果を出しました",
          data: { prompt: "ES本文" },
        },
      ],
      exception: {
        values: [{ value: "志望動機の本文が混ざりました" }],
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).toContain("[SCRUBBED_TEXT]");
    expect(serialized).toContain("[DROPPED]");
    expect(serialized).not.toContain("学生時代");
    expect(serialized).not.toContain("志望動機");
    expect(serialized).not.toContain("ES本文");
  });
});
