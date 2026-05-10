import { describe, expect, it } from "vitest";
import type { BaseMessage, JsonValue, RawMessage } from "./types";

describe("shared/types", () => {
  it("BaseMessage satisfies structural contract", () => {
    const msg: BaseMessage = { id: "1", role: "user", content: "hello" };
    expect(msg.id).toBe("1");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
  });

  it("RawMessage allows optional id and loose role", () => {
    const raw: RawMessage = { role: "system", content: 42 };
    expect(raw.id).toBeUndefined();
    expect(raw.role).toBe("system");
  });

  it("JsonValue supports nested structures", () => {
    const value: JsonValue = {
      name: "test",
      nested: { items: [1, "two", true, null] },
      optional: undefined,
    };
    expect(value).toBeDefined();
  });
});
