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

  it("preserves exception type and stack frames while dropping frame vars", () => {
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "ReferenceError",
            value: "window is not defined",
            stacktrace: {
              frames: [
                {
                  filename: "app/(marketing)/page.tsx",
                  function: "Home",
                  lineno: 19,
                  vars: {
                    prompt: "志望動機の本文",
                    token: "Bearer abcdefghijklmnopqrstuvwxyz",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    expect(scrubbed).toEqual({
      exception: {
        values: [
          {
            type: "ReferenceError",
            value: "window is not defined",
            stacktrace: {
              frames: [
                {
                  filename: "app/(marketing)/page.tsx",
                  function: "Home",
                  lineno: 19,
                  vars: "[DROPPED]",
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain("志望動機");
    expect(JSON.stringify(scrubbed)).not.toContain("Bearer");
  });

  it("scrubs English free-text exception values unless they are known technical messages", () => {
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "I led the debate club and wrote my motivation essay about fintech.",
          },
          {
            type: "ReferenceError",
            value: "window is not defined",
          },
        ],
      },
    });

    expect(scrubbed).toEqual({
      exception: {
        values: [
          {
            type: "Error",
            value: "[SCRUBBED_TEXT]",
          },
          {
            type: "ReferenceError",
            value: "window is not defined",
          },
        ],
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain("debate club");
    expect(JSON.stringify(scrubbed)).not.toContain("fintech");
  });
});
