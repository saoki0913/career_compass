import { describe, expect, it } from "vitest";

import {
  getInterviewCompanySeed,
  getInterviewIndustrySeed,
  hasCompleteInterviewIndustrySeeds,
  INTERVIEW_INDUSTRY_SEEDS,
} from "./company-seeds";

describe("interview company seeds", () => {
  it("covers all industries with three representative companies each", () => {
    expect(hasCompleteInterviewIndustrySeeds()).toBe(true);
    expect(INTERVIEW_INDUSTRY_SEEDS.every((seed) => seed.commonTopics.length > 0)).toBe(true);
  });

  it("returns industry and company specific profiles", () => {
    const industrySeed = getInterviewIndustrySeed("商社");
    const companySeed = getInterviewCompanySeed("商社", "三井物産");

    expect(industrySeed?.commonTopics).toContain("なぜ商社か");
    expect(companySeed?.companyTopics).toContain("事業経営力");
  });
});
