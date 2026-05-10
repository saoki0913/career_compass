import { describe, expect, it } from "vitest";
import {
  COMPANY_SELECTION_PHASE_COLUMNS,
  VALID_STATUSES,
  getDefaultStatusForPhase,
  getSelectionPhaseForStatus,
} from "./status";

describe("company selection phase columns", () => {
  it("uses the shared dashboard/company kanban labels", () => {
    expect(COMPANY_SELECTION_PHASE_COLUMNS.map((phase) => phase.label)).toEqual([
      "未応募",
      "ES・テスト",
      "面接・GD",
      "結果待ち",
      "内定・インターン合格",
    ]);
  });

  it("maps every company status to exactly one phase", () => {
    for (const status of VALID_STATUSES) {
      const matches = COMPANY_SELECTION_PHASE_COLUMNS.filter((phase) => phase.statuses.includes(status));
      expect(matches, status).toHaveLength(1);
      expect(getSelectionPhaseForStatus(status).key).toBe(matches[0].key);
    }
  });

  it("defines a valid default status for every phase", () => {
    for (const phase of COMPANY_SELECTION_PHASE_COLUMNS) {
      expect(phase.statuses).toContain(getDefaultStatusForPhase(phase.key));
    }
  });
});
