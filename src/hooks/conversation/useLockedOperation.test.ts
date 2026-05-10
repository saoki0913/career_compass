import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/hooks/conversation/useLockedOperation.ts"),
  "utf8",
);
const indexSource = readFileSync(
  resolve(process.cwd(), "src/hooks/conversation/index.ts"),
  "utf8",
);
const gakuchikaControllerSource = readFileSync(
  resolve(process.cwd(), "src/features/gakuchika/hooks/useGakuchikaConversationController.ts"),
  "utf8",
);

describe("useLockedOperation source contract", () => {
  it("centralizes lock, structured API parsing, user-facing reporting, and release", () => {
    expect(source).toContain("acquireLock(operation.label)");
    expect(source).toContain("parseApiErrorResponse(");
    expect(source).toContain("reportUserFacingError(");
    expect(source).toContain("releaseLock()");
  });

  it("reports the user-facing error even when a feature onError callback fails", () => {
    const catchBlock = source.slice(
      source.indexOf("} catch (error) {"),
      source.indexOf("return null;", source.indexOf("} catch (error) {")),
    );

    expect(catchBlock).toContain("try {");
    expect(catchBlock).toContain("await operation.onError?.(error)");
    expect(catchBlock).toContain("finally {");
    expect(catchBlock).toContain("reportUserFacingError(");
  });

  it("is exported from the conversation hook barrel", () => {
    expect(indexSource).toContain('from "./useLockedOperation"');
  });

  it("is applied to the gakuchika resume operation", () => {
    const resumeBlock = gakuchikaControllerSource.slice(
      gakuchikaControllerSource.indexOf("const resumeSession"),
      gakuchikaControllerSource.indexOf("const discardDraftAndResumeSession"),
    );

    expect(resumeBlock).toContain("runLockedOperation({");
    expect(resumeBlock).toContain('label: "深掘りを再開中"');
    expect(resumeBlock).not.toContain("releaseLock()");
    expect(resumeBlock).not.toContain("reportUserFacingError(");
  });
});
