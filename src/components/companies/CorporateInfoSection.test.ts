import { describe, expect, it } from "vitest";

import {
  formatEstimateSummary,
  getBatchItemStatusMeta,
  getExtractionMethodLabel,
  getSourceStatusMeta,
  mergePdfDraftFiles,
  parseUrlListInput,
  pdfFileKey,
  removePdfDraftFile,
} from "@/components/companies/corporate-info-section/workflow-helpers";
import { DEFAULT_PDF_UPLOAD_CONTENT_TYPE, type PdfDraft } from "@/components/companies/corporate-info-section/workflow-config";

describe("getExtractionMethodLabel", () => {
  it("keeps legacy and new OCR method labels compatible", () => {
    expect(getExtractionMethodLabel("pypdf")).toBe("PDF内の埋め込みテキストを抽出");
    expect(getExtractionMethodLabel("openai_pdf_ocr")).toBe("OCRで本文を抽出");
    expect(getExtractionMethodLabel("ocr")).toBe("OCRで本文を抽出");
    expect(getExtractionMethodLabel("ocr_high_accuracy")).toBe("高精度OCRで本文を抽出");
    expect(getExtractionMethodLabel("deferred_ocr")).toBe("遅延OCR（廃止・旧データ）");
  });
});

describe("corporate info workflow helpers", () => {
  it("normalizes URL textarea input and reports invalid rows", () => {
    const parsed = parseUrlListInput([
      "https://example.com/recruit",
      "https://example.com/recruit",
      "ftp://example.com/blocked",
      "not a url",
      "https://example.com/ir?x=1",
    ].join("\n"));

    expect(parsed.urls).toEqual([
      "https://example.com/recruit",
      "https://example.com/ir?x=1",
    ]);
    expect(parsed.invalidLines).toEqual([
      { lineNumber: 3, value: "ftp://example.com/blocked" },
      { lineNumber: 4, value: "not a url" },
    ]);
    expect(parsed.totalLines).toBe(5);
  });

  it("merges PDF files without duplicates and assigns default content types", () => {
    const first = new File(["a"], "company.pdf", {
      type: "application/pdf",
      lastModified: 1,
    });
    const duplicate = new File(["a"], "company.pdf", {
      type: "application/pdf",
      lastModified: 1,
    });
    const nonPdf = new File(["a"], "memo.txt", {
      type: "text/plain",
      lastModified: 2,
    });
    const initial: PdfDraft = {
      uploadFiles: [],
      uploadFileContentTypes: {},
    };

    const merged = mergePdfDraftFiles(initial, [first, duplicate, nonPdf]);

    expect(merged.uploadFiles).toEqual([first]);
    expect(merged.uploadFileContentTypes[pdfFileKey(first)]).toBe(DEFAULT_PDF_UPLOAD_CONTENT_TYPE);
  });

  it("removes PDF files and their content type entries together", () => {
    const first = new File(["a"], "company.pdf", {
      type: "application/pdf",
      lastModified: 1,
    });
    const second = new File(["b"], "ir.pdf", {
      type: "application/pdf",
      lastModified: 2,
    });
    const initial: PdfDraft = {
      uploadFiles: [first, second],
      uploadFileContentTypes: {
        [pdfFileKey(first)]: "corporate_site",
        [pdfFileKey(second)]: "ir_materials",
      },
    };

    const next = removePdfDraftFile(initial, first);

    expect(next.uploadFiles).toEqual([second]);
    expect(next.uploadFileContentTypes).toEqual({
      [pdfFileKey(second)]: "ir_materials",
    });
  });

  it("formats estimate summaries and status labels", () => {
    expect(formatEstimateSummary({
      totalPages: 10,
      localPages: 6,
      googlePages: 2,
      mistralPages: 2,
      freePages: 4,
      credits: 6,
      willTruncate: true,
    })).toBe("総ページ 10 / local 6 / Google OCR 2 / Mistral OCR 2 / 無料枠 4 / credits 6 / 切り詰めあり");

    expect(getSourceStatusMeta("processing").label).toBe("処理中");
    expect(getBatchItemStatusMeta("skipped_limit").label).toBe("上限超過");
  });
});
