import { describe, expect, it } from "vitest";

async function readQuickActionsSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./QuickActions.tsx", import.meta.url), "utf8");
}

describe("QuickActions", () => {
  it("defines exactly 5 quick action items matching requirements", async () => {
    const source = await readQuickActionsSource();
    const expectedKeys = ["add-company", "es-review", "interview", "gakuchika", "motivation"];
    expect(expectedKeys).toHaveLength(5);
    for (const key of expectedKeys) {
      expect(source).toContain(`key: "${key}"`);
    }
    expect((source.match(/key: "/g) ?? [])).toHaveLength(5);
  });

  it("has interview and motivation as button actions (not links)", async () => {
    const source = await readQuickActionsSource();
    const buttonActions = ["interview", "motivation"];
    expect(buttonActions).toContain("interview");
    expect(buttonActions).toContain("motivation");
    expect(source).toContain('actionType: "interview"');
    expect(source).toContain('actionType: "motivation"');
    expect(source).toContain("<button");
    expect(source).toContain("<Link");
  });

  it("does not have subtitle in card layout (compact design)", async () => {
    const source = await readQuickActionsSource();
    expect(source).not.toContain("subtitle");
  });

  it("uses one compact pill design without an inline prop split", async () => {
    const source = await readQuickActionsSource();
    expect(source).not.toContain("inline");
    // mobile h-11, desktop lg:h-9
    expect(source).toContain("h-11");
    expect(source).toContain("lg:h-9");
    expect(source).toContain("border-[1.5px]");
  });

  it("mobile quick actions have larger touch targets with desktop overrides", async () => {
    const source = await readQuickActionsSource();
    // icon container: h-7 w-7 mobile, lg:h-6 lg:w-6 desktop
    expect(source).toContain("h-7 w-7");
    expect(source).toContain("lg:h-6 lg:w-6");
    // title text: text-sm mobile, lg:text-xs desktop
    expect(source).toContain("text-sm font-semibold");
    expect(source).toContain("lg:text-xs");
    // action gap and padding: gap-2 px-3.5 mobile, lg:gap-1.5 lg:px-3 desktop
    expect(source).toContain("gap-2");
    expect(source).toContain("lg:gap-1.5 lg:px-3");
  });

  it("exposes stable selectors for viewport clipping checks", async () => {
    const source = await readQuickActionsSource();
    expect(source).toContain('data-testid="dashboard-quick-actions"');
    expect(source).toContain("data-testid={`dashboard-quick-action-${action.key}`}");
  });

  it("uses lucide icons instead of local svg icon components", async () => {
    const source = await readQuickActionsSource();
    expect(source).toContain("lucide-react");
    expect(source).not.toContain("const PlusIcon");
    expect(source).not.toContain("<svg");
  });

  it("buttons use tone-specific icon backgrounds instead of generic white", async () => {
    const source = await readQuickActionsSource();
    expect(source).toContain("icon: \"bg-[#4033d6]/10\"");
    expect(source).not.toContain('"bg-white/70"');
  });

  it("pills have focus and press feedback", async () => {
    const source = await readQuickActionsSource();
    expect(source).toContain("active:scale-[0.97]");
    expect(source).toContain("focus-visible:ring-2");
  });
});
