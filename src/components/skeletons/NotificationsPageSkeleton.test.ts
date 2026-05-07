import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("NotificationsPageSkeleton", () => {
  it("does not show header action buttons in initial loading state", async () => {
    const source = await readFile(
      new URL("./NotificationsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    // In the most common initial state (no notifications loaded yet),
    // the header buttons should not be shown
    const pageSkeletonMatch = source.match(
      /function NotificationsPageSkeleton\b[\s\S]*?^}/m,
    );
    expect(pageSkeletonMatch).not.toBeNull();
    if (pageSkeletonMatch) {
      expect(pageSkeletonMatch[0]).not.toContain("SkeletonButton");
    }
  });

  it("uses max-w-3xl layout", async () => {
    const source = await readFile(
      new URL("./NotificationsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("max-w-3xl");
  });
});
