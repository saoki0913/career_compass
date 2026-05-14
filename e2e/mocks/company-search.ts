import type { Page } from "@playwright/test";
import { mockJsonRoute } from "./sse-helpers";

export const COMPANY_SEARCH_MOCK_COMPANY_ID = "company-search-mock-company";

const SEARCH_PAGES_RESPONSE = {
  candidates: [
    {
      url: "https://example.com/recruit",
      title: "新卒採用 | 株式会社テスト",
      snippet: "新卒採用情報をご紹介します。",
      confidence: 0.92,
      category: "new_grad_recruitment",
    },
    {
      url: "https://example.com/about",
      title: "会社概要 | 株式会社テスト",
      snippet: "株式会社テストの会社概要です。",
      confidence: 0.85,
      category: "corporate",
    },
  ],
};

const CORPORATE_PAGES_RESPONSE = {
  candidates: [
    {
      url: "https://example.com/corporate",
      title: "企業情報 | 株式会社テスト",
      snippet: "事業内容と企業理念をご紹介します。",
      confidence: 0.88,
      category: "corporate_info",
    },
  ],
};

const FETCH_INFO_RESPONSE = {
  scheduleItems: [
    {
      id: "schedule-1",
      title: "エントリーシート提出締切",
      deadline: "2025-06-30T23:59:00+09:00",
      confidence: 0.85,
      source: "https://example.com/recruit",
    },
  ],
  companyProfile: {
    industry: "IT・通信",
    employees: "1000名",
    founded: "2000年",
  },
};

const RAG_INGEST_RESPONSE = {
  status: "completed",
  pagesProcessed: 3,
  chunksStored: 12,
  embeddingsGenerated: 12,
};

export async function mockCompanySearchApis(
  page: Page,
  companyId: string = COMPANY_SEARCH_MOCK_COMPANY_ID,
): Promise<void> {
  await mockJsonRoute(page, `**/api/companies/${companyId}`, {
    company: {
      id: companyId,
      name: "株式会社テスト",
      industry: "IT・通信",
    },
  });

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/search-pages`,
    SEARCH_PAGES_RESPONSE,
    "POST",
  );

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/search-corporate-pages`,
    CORPORATE_PAGES_RESPONSE,
    "POST",
  );

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/fetch-info`,
    FETCH_INFO_RESPONSE,
    "POST",
  );

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/fetch-corporate`,
    RAG_INGEST_RESPONSE,
    "POST",
  );

  await mockJsonRoute(page, `**/api/companies/${companyId}/fetch-corporate`, {
    status: "idle",
    pagesProcessed: 0,
    chunksStored: 0,
  });

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/upload-pdf`,
    { status: "completed", chunksStored: 8 },
    "POST",
  );
}
