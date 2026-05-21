import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import type { RoleOption as ContractRoleOption } from "@/shared/contracts/interview/role-options";
import type { RoleOption } from "./ui";

describe("features/motivation/domain/ui re-exports", () => {
  it("does not re-export removed lifecycle utilities", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain("getMotivationLifecyclePhase");
    expect(source).not.toContain("getMotivationPhaseStatus");
    expect(source).not.toContain("MOTIVATION_LIFECYCLE_PHASES");
  });

  it("re-exports core motivation utilities", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).toContain("deriveMotivationModeLabel");
    expect(source).toContain("getMotivationSlotPillStatus");
    expect(source).toContain("STAGE_ORDER");
    expect(source).toContain("SLOT_PILL_LABELS");
    expect(source).toContain("STAGE_LABELS");
  });

  it("re-exports RoleOption instead of the removed RoleOptionItem", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain("RoleOptionItem");
    expect(source).toContain("RoleOption");
  });

  it("exposes RoleOption identical to the SSOT shape", () => {
    const sample: RoleOption = { value: "v", label: "l", source: "industry_default" };
    const fromContract: ContractRoleOption = sample;
    expect(fromContract.source).toBe("industry_default");
  });
});
