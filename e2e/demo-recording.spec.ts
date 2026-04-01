/**
 * LP 埋め込み用プロダクトデモ動画 — セグメント別録画スクリプト
 *
 * ストーリー構成:
 *   企業登録 → 企業情報取得 → ES作成 → ES添削 → ガクチカ深掘り → 志望動機作成
 *
 * 各セグメントは個別テスト（= 個別 WebM）として録画し、後段の編集パイプラインで結合する。
 *
 * 実行:
 *   npx playwright test e2e/demo-recording.spec.ts --project=chromium --workers=1
 */

import { test, type Page } from "@playwright/test";
import {
  createGuestCompany,
  createGuestGakuchika,
  ensureGuestSession,
  loginAsGuest,
  mockCredits,
  navigateTo,
} from "./fixtures/auth";

const GUEST_DEVICE_TOKEN_KEY = "ukarun_device_token";
const DEMO_COMPANY_NAME = "株式会社グローバルテック";
const DEMO_INDUSTRY = "IT・通信";
const DEMO_ES_TITLE = "グローバルテック 本選考ES";
const DEMO_GAKUCHIKA_TITLE = "国際交流サークルでの企画運営";
const DEMO_GAKUCHIKA_CONTENT =
  "大学2年次から国際交流サークルの副代表として、留学生歓迎イベントの企画運営に取り組みました。参加者を30名から80名に増やした経験があります。";

// 録画設定
test.use({
  video: { mode: "on", size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});

test.describe.configure({ mode: "serial" });

async function initGuest(page: Page) {
  await loginAsGuest(page);
  await ensureGuestSession(page);
  await mockCredits(page, {
    type: "guest",
    plan: "standard",
    balance: 80,
    monthlyAllocation: 100,
  });
}

async function tryCreateCompany(page: Page, name: string, industry: string): Promise<string | null> {
  try {
    const company = await createGuestCompany(page, { name, industry });
    return company.id;
  } catch {
    return null;
  }
}

async function getFirstCompanyId(page: Page): Promise<string | null> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const token = await page.evaluate((key: string) => localStorage.getItem(key), GUEST_DEVICE_TOKEN_KEY);
  const listRes = await page.request.get(`${baseURL}/api/companies`, {
    headers: token ? { "x-device-token": token } : {},
  });

  if (!listRes.ok()) {
    return null;
  }

  const data = (await listRes.json()) as {
    companies?: Array<{ id: string }>;
  };
  return data.companies?.[0]?.id ?? null;
}

async function ensureCompany(page: Page, name: string, industry: string): Promise<string> {
  const createdId = await tryCreateCompany(page, name, industry);
  if (createdId) return createdId;

  const fallbackId = await getFirstCompanyId(page);
  if (!fallbackId) {
    throw new Error(`Unable to resolve company id for ${name}`);
  }

  return fallbackId;
}

async function waitForShot(page: Page, ms = 500) {
  await page.waitForTimeout(ms);
}

async function openCompanyInfoModal(page: Page) {
  const trigger = page.getByRole("button", { name: "企業情報を取得" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByRole("heading", { name: "企業情報を取得" }).waitFor({
    state: "visible",
  });
}

async function selectFirstComboboxOption(page: Page, triggerIndex: number) {
  const combobox = page.getByRole("combobox").nth(triggerIndex);
  await combobox.click();
  const option = page.getByRole("option").first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

// 01: 企業登録
test("01-demo-company-register", async ({ page }) => {
  test.setTimeout(60_000);
  await initGuest(page);

  await navigateTo(page, "/companies/new");
  const companyNameInput = page.getByPlaceholder("株式会社〇〇").first();
  await companyNameInput.waitFor({ state: "visible" });

  await companyNameInput.click();
  await companyNameInput.pressSequentially(DEMO_COMPANY_NAME, { delay: 28 });
  await waitForShot(page, 250);

  const industryTrigger = page.getByRole("combobox").first();
  await industryTrigger.click();
  await page.getByRole("option", { name: DEMO_INDUSTRY }).click();
  await waitForShot(page, 200);

  await page.getByRole("button", { name: "企業を登録" }).click();
  await page.waitForURL(/\/companies$/);
  await waitForShot(page, 700);
});

// 02: 企業情報取得
test("02-demo-company-import", async ({ page }) => {
  test.setTimeout(90_000);
  await initGuest(page);

  const companyId = await ensureCompany(page, DEMO_COMPANY_NAME, DEMO_INDUSTRY);
  await navigateTo(page, `/companies/${companyId}`);
  await page.waitForSelector("main");

  await openCompanyInfoModal(page);
  const contentTypeSelect = page.locator("select").first();
  await contentTypeSelect.selectOption({ index: 1 });
  await waitForShot(page, 250);

  await page.getByRole("button", { name: "検索" }).first().click();
  await waitForShot(page, 1200);
});

// 03: ES作成
test("03-demo-es-create", async ({ page }) => {
  test.setTimeout(60_000);
  await initGuest(page);

  await tryCreateCompany(page, DEMO_COMPANY_NAME, DEMO_INDUSTRY);

  await navigateTo(page, "/es");
  await page.waitForSelector("main");
  await waitForShot(page, 400);

  const createButton = page.getByRole("button", { name: /新規作成/ }).first();
  await createButton.click();
  await waitForShot(page, 250);

  const titleInput = page.locator("#title");
  if (await titleInput.isVisible()) {
    await titleInput.click();
    await titleInput.pressSequentially(DEMO_ES_TITLE, { delay: 24 });
    await waitForShot(page, 200);
  }

  const submitButton = page.getByRole("button", { name: "ESを作成" });
  if (await submitButton.isVisible()) {
    await submitButton.click();
    await page.waitForURL(/\/es\/[^/]+/);
    await waitForShot(page, 700);
  }
});

// 04: ES添削
test("04-demo-es-review", async ({ page }) => {
  test.setTimeout(90_000);
  await initGuest(page);

  await tryCreateCompany(page, DEMO_COMPANY_NAME, DEMO_INDUSTRY);

  await navigateTo(page, "/es");
  await page.waitForSelector("main");
  await waitForShot(page, 350);

  await page.getByRole("button", { name: /新規作成/ }).first().click();
  await waitForShot(page, 250);

  const titleInput = page.locator("#title");
  if (await titleInput.isVisible()) {
    await titleInput.click();
    await titleInput.pressSequentially(`${DEMO_ES_TITLE} 添削`, { delay: 18 });
    await waitForShot(page, 180);
  }

  const submitButton = page.getByRole("button", { name: "ESを作成" });
  if (await submitButton.isVisible()) {
    await submitButton.click();
    await page.waitForURL(/\/es\/[^/]+/);
    await waitForShot(page, 1000);
  }
});

// 05: ガクチカ深掘り
test("05-demo-gakuchika", async ({ page }) => {
  test.setTimeout(90_000);
  await initGuest(page);

  const gakuchika = await createGuestGakuchika(page, {
    title: DEMO_GAKUCHIKA_TITLE,
    content: DEMO_GAKUCHIKA_CONTENT,
    charLimitType: "400",
  });

  await navigateTo(page, `/gakuchika/${gakuchika.id}`);
  await page.waitForSelector("main");
  await waitForShot(page, 500);

  const startButton = page.getByRole("button", { name: "深掘りを始める" });
  await startButton.click();
  await waitForShot(page, 900);

  const answerInput = page.getByPlaceholder("回答を入力...");
  if (await answerInput.isVisible()) {
    await answerInput.click();
    await answerInput.pressSequentially("イベント運営の責任者として、参加者の体験を少しずつ改善しました。", {
      delay: 22,
    });
    await waitForShot(page, 180);
    await answerInput.press("Enter");
    await waitForShot(page, 1200);
  }
});

// 06: 志望動機作成
test("06-demo-motivation", async ({ page }) => {
  test.setTimeout(90_000);
  await initGuest(page);

  const companyId = await ensureCompany(page, DEMO_COMPANY_NAME, DEMO_INDUSTRY);
  await navigateTo(page, `/companies/${companyId}/motivation`);
  await page.waitForSelector("main");
  await waitForShot(page, 500);

  const startButton = page.getByRole("button", { name: "質問を始める" });
  if (await startButton.isDisabled()) {
    const comboCount = await page.getByRole("combobox").count();
    if (comboCount >= 1) {
      await selectFirstComboboxOption(page, 0);
      await waitForShot(page, 200);
    }
    if (comboCount >= 2) {
      await selectFirstComboboxOption(page, 1);
      await waitForShot(page, 200);
    }
  }

  await startButton.scrollIntoViewIfNeeded();
  await startButton.click();
  await waitForShot(page, 1200);
});
