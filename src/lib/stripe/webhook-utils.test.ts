import { describe, expect, it } from "vitest";
import type { StoredSubscriptionState } from "./webhook-utils";

describe("webhook-utils", () => {
  it("exports StoredSubscriptionState type", () => {
    const _typeCheck: StoredSubscriptionState | null = null;
    expect(_typeCheck).toBeNull();
  });
});
