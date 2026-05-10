import { describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { captureClientBoundaryError } from "./client";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("captureClientBoundaryError", () => {
  it("captures client boundary errors without user identifiers", () => {
    const error = Object.assign(new Error("test@example.com"), { digest: "digest-1" });

    captureClientBoundaryError(error, { boundary: "product", digest: error.digest });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { boundary: "product" },
      extra: { digest: "digest-1" },
    });
  });

  it("uses a generic error for unknown thrown values", () => {
    captureClientBoundaryError("raw thrown value", { boundary: "global" });

    const [captured] = vi.mocked(Sentry.captureException).mock.calls.at(-1) ?? [];
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe("Unknown client boundary error");
  });
});
