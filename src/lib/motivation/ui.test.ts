import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import type {
  RoleGroup as ContractRoleGroup,
  RoleOption as ContractRoleOption,
  RoleOptionSource as ContractRoleOptionSource,
  RoleOptionsResponse as ContractRoleOptionsResponse,
  RoleSelectionSource as ContractRoleSelectionSource,
} from "@/shared/contracts/interview/role-options";
import { deriveMotivationModeLabel, findRoleOption } from "./ui";
import type {
  RoleGroup,
  RoleOption,
  RoleOptionSource,
  RoleOptionsResponse,
  RoleSelectionSource,
} from "./ui";

describe("deriveMotivationModeLabel", () => {
  it("returns initial message for slot_fill with low question count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 1,
      isDraftReady: false,
      causalGapCount: 0,
    });
    expect(label).toBe("志望動機の土台を整えています");
  });

  it("returns mid-progress message for slot_fill with moderate count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 4,
      isDraftReady: false,
      causalGapCount: 0,
    });
    expect(label).toBe("材料をもう少し揃えています");
  });

  it("returns ready message when isDraftReady in slot_fill", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 6,
      isDraftReady: true,
      causalGapCount: 0,
    });
    expect(label).toBe("材料が揃いました");
  });

  it("returns deepdive with gap count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "deepdive",
      questionCount: 8,
      isDraftReady: true,
      causalGapCount: 2,
    });
    expect(label).toBe("補強中（残り2件）");
  });

  it("returns completed for deepdive with no gaps", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "deepdive",
      questionCount: 10,
      isDraftReady: true,
      causalGapCount: 0,
    });
    expect(label).toBe("追加で補強できます");
  });
});

describe("motivation ui lifecycle cleanup", () => {
  it("does not export MOTIVATION_LIFECYCLE_PHASES, getMotivationLifecyclePhase, or getMotivationPhaseStatus", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain("MOTIVATION_LIFECYCLE_PHASES");
    expect(source).not.toContain("getMotivationLifecyclePhase");
    expect(source).not.toContain("getMotivationPhaseStatus");
    expect(source).not.toContain("MotivationLifecyclePhase");
  });
});

describe("motivation ui role option types", () => {
  it("re-exports the SSOT contract types (compile-time identity)", () => {
    const option: RoleOption = { value: "v", label: "l", source: "document_job_type" };
    const optionFromContract: ContractRoleOption = option;
    expect(optionFromContract).toEqual(option);

    const group: RoleGroup = { id: "g", label: "L", options: [option] };
    const groupFromContract: ContractRoleGroup = group;
    expect(groupFromContract.options[0]).toEqual(option);

    const source: RoleOptionSource = "application_job_type";
    const sourceFromContract: ContractRoleOptionSource = source;
    expect(sourceFromContract).toBe("application_job_type");

    const selectionSource: RoleSelectionSource = "custom";
    const selectionFromContract: ContractRoleSelectionSource = selectionSource;
    expect(selectionFromContract).toBe("custom");

    const response: RoleOptionsResponse = {
      companyId: "c",
      companyName: "n",
      industry: "銀行",
      requiresIndustrySelection: false,
      industryOptions: ["銀行"],
      roleGroups: [group],
    };
    const responseFromContract: ContractRoleOptionsResponse = response;
    expect(responseFromContract.companyName).toBe("n");
  });

  it("findRoleOption locates an option across groups by value", () => {
    const groups: RoleGroup[] = [
      {
        id: "course",
        label: "採用コース",
        options: [{ value: "総合職", label: "総合職", source: "industry_default" }],
      },
      {
        id: "application",
        label: "応募中の職種",
        options: [{ value: "エンジニア", label: "エンジニア", source: "application_job_type" }],
      },
    ];
    expect(findRoleOption(groups, "総合職")?.label).toBe("総合職");
    // 後続グループまで横断して検索し、source 込みで返す
    expect(findRoleOption(groups, "エンジニア")?.source).toBe("application_job_type");
    expect(findRoleOption(groups, "missing")).toBeNull();
    expect(findRoleOption(groups, null)).toBeNull();
    expect(findRoleOption([], "総合職")).toBeNull();
  });

  it("no longer defines local role option types or RoleOptionItem", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain("RoleOptionItem");
    expect(source).not.toContain("export type RoleOptionSource =");
    expect(source).not.toContain("export interface RoleGroup");
    expect(source).toContain("@/shared/contracts/interview/role-options");
  });
});
