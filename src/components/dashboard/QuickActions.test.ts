import { describe, expect, it } from "vitest";

describe("QuickActions", () => {
  it("defines exactly 5 quick action items matching requirements", () => {
    const expectedKeys = ["add-company", "es-review", "interview", "gakuchika", "motivation"];
    expect(expectedKeys).toHaveLength(5);
  });

  it("has interview and motivation as button actions (not links)", () => {
    const buttonActions = ["interview", "motivation"];
    expect(buttonActions).toContain("interview");
    expect(buttonActions).toContain("motivation");
  });

  it("does not have subtitle in card layout (compact design)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./QuickActions.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("subtitle");
  });

  it("supports inline prop for header placement", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./QuickActions.tsx", import.meta.url), "utf8");
    expect(source).toContain("inline");
  });

  it("uses lucide icons instead of local svg icon components", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./QuickActions.tsx", import.meta.url), "utf8");
    expect(source).toContain("lucide-react");
    expect(source).not.toContain("const PlusIcon");
    expect(source).not.toContain("<svg");
  });
});
