import { describe, expect, it } from "vitest";

import { getExtractionMethodLabel } from "@/components/companies/CorporateInfoSection";

describe("getExtractionMethodLabel", () => {
  it("keeps legacy and new OCR method labels compatible", () => {
    expect(getExtractionMethodLabel("pypdf")).toBe("PDF内の埋め込みテキストを抽出");
    expect(getExtractionMethodLabel("openai_pdf_ocr")).toBe("OCRで本文を抽出");
    expect(getExtractionMethodLabel("ocr")).toBe("OCRで本文を抽出");
    expect(getExtractionMethodLabel("ocr_high_accuracy")).toBe("高精度OCRで本文を抽出");
    expect(getExtractionMethodLabel("deferred_ocr")).toBe("遅延OCR（廃止・旧データ）");
  });
});
