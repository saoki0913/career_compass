import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-sanitize";

describe("scrubSentryEvent", () => {
  it("scrubs request, breadcrumb, and exception data", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        url: "https://www.shupass.jp/es?draft=志望動機#token",
        query_string: "draft=志望動機",
        headers: {
          authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
          cookie: "guest_device_token=abcdefghijklmnopqrstuvwxyz",
          referer: "https://www.shupass.jp/es?draft=志望動機",
          "user-agent": "Browser",
        },
      },
      breadcrumbs: [
        {
          message: "学生時代にサークル運営で成果を出しました",
          data: {
            durationMs: 120,
            route: "/es?draft=志望動機#token",
            name: "志望動機の添削",
            prompt: "ES本文",
            rawBody: "志望動機",
            userId: "user-1",
          },
        },
      ],
      exception: {
        values: [{ value: "志望動機の本文が混ざりました" }],
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).toContain("[SCRUBBED_TEXT]");
    expect(serialized).toContain("[DROPPED]");
    expect(serialized).toContain("durationMs");
    expect(serialized).toContain("/es");
    expect(serialized).toContain("https://www.shupass.jp/es");
    expect(serialized).not.toContain("draft=");
    expect(serialized).not.toContain("referer");
    expect(serialized).not.toContain("user-agent");
    expect(serialized).not.toContain("user-1");
    expect(serialized).not.toContain("学生時代");
    expect(serialized).not.toContain("志望動機");
    expect(serialized).not.toContain("ES本文");
  });

  it("strips query and hash from relative request URLs", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        url: "/dashboard?guest_device_token=abcdefghijklmnopqrstuvwxyz#section",
      },
    });

    expect(scrubbed).toEqual({
      request: {
        url: "/dashboard",
      },
    });
  });
});
