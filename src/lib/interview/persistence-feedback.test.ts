import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_PATH = path.resolve(__dirname, "persistence-feedback.ts");
const source = fs.readFileSync(SRC_PATH, "utf-8");

describe("persistence-feedback module", () => {
  it("exports saveInterviewFeedbackHistory", () => {
    expect(source).toContain("export async function saveInterviewFeedbackHistory");
  });

  it("exports saveInterviewFeedbackSatisfaction", () => {
    expect(source).toContain("export async function saveInterviewFeedbackSatisfaction");
  });

  it("exports saveInterviewFeedbackSheet", () => {
    expect(source).toContain("export async function saveInterviewFeedbackSheet");
  });

  it("saveInterviewFeedbackSheet sets sheetContent and sheetGeneratedAt", () => {
    expect(source).toContain("sheetContent: args.sheetContent");
    expect(source).toContain("sheetGeneratedAt:");
  });

  it("saveInterviewFeedbackSheet uses owner-scoped where clause", () => {
    const sheetFnStart = source.indexOf("async function saveInterviewFeedbackSheet");
    const sheetFnEnd = source.indexOf("export async function", sheetFnStart + 1);
    const sheetFn = source.slice(sheetFnStart, sheetFnEnd);
    expect(sheetFn).toContain("args.identity.userId");
    expect(sheetFn).toContain("args.identity.guestId");
  });
});
