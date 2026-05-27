import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_PATH = path.resolve(__dirname, "persistence-feedback.ts");
const source = fs.readFileSync(SRC_PATH, "utf-8");

describe("persistence-feedback module", () => {
  it("exports saveInterviewFeedbackHistory", () => {
    expect(source).toContain("export async function saveInterviewFeedbackHistory");
  });

  it("exports a tx-bound saveInterviewFeedbackHistoryTx that runs insert+update+select on the passed tx", () => {
    expect(source).toContain("export async function saveInterviewFeedbackHistoryTx");
    const txFnStart = source.indexOf("async function saveInterviewFeedbackHistoryTx");
    const txFnEnd = source.indexOf("export async function", txFnStart + 1);
    const txFn = source.slice(txFnStart, txFnEnd);
    // insert + update + select all share the transaction handle (read-your-writes).
    expect(txFn).toContain("tx.insert(");
    expect(txFn).toContain("tx\n      .update(");
    expect(txFn).toContain("tx\n      .select(");
    // The non-tx wrapper delegates to db.transaction.
    expect(source).toContain("return db.transaction((tx) => saveInterviewFeedbackHistoryTx(tx, args))");
  });

  it("exports saveInterviewFeedbackSatisfaction", () => {
    expect(source).toContain("export async function saveInterviewFeedbackSatisfaction");
  });

  it("exports saveInterviewFeedbackSheet", () => {
    expect(source).toContain("export async function saveInterviewFeedbackSheet");
  });

  it("saveInterviewFeedbackSheet sets sheetContent, sheetDataJson and sheetGeneratedAt", () => {
    expect(source).toContain("sheetContent: args.sheetContent");
    expect(source).toContain("sheetDataJson:");
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
