import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  createOwnedCompany,
  createOwnedDocument,
  deleteOwnedCompany,
  deleteOwnedDocument,
  expectOkResponse,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

const LIVE_AI_ENV_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
] as const;

function hasAnyLiveAiCredential() {
  if (LIVE_AI_ENV_NAMES.some((name) => Boolean(process.env[name]?.trim()))) {
    return true;
  }

  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocalPath)) {
    return false;
  }

  const envLocal = readFileSync(envLocalPath, "utf8");
  return LIVE_AI_ENV_NAMES.some((name) =>
    new RegExp(`^${name}=.+$`, "m").test(envLocal)
  );
}

test.describe("Live AI major flow", () => {
  test.beforeAll(() => {
    expect(
      hasAnyLiveAiCredential(),
      `live AI suite requires one of ${LIVE_AI_ENV_NAMES.join(", ")}`,
    ).toBeTruthy();
  });

  test.skip("guest motivation and gakuchika AI flows work end-to-end", async () => {
    // ゲスト: PLAN_METADATA.guest.gakuchika=0 で POST /api/gakuchika は 403。
    // 志望動機の conversation/start・stream・generate-draft はログイン必須（401）。
    // 復帰する場合はプロダクト制限と API を揃えたうえでシナリオを再構成する。
  });

  test("logged-in user can complete live ES review stream", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");
    test.setTimeout(240_000);

    const runId = `live-es-${Date.now()}`;
    const companyName = `AI添削会社_${runId}`;
    const reviewContent =
      "顧客の業務課題を仕組みから改善し、事業成長に直結する提案を実現したい。大学ゼミでは地域店舗の予約導線を調査し、利用者インタビューと売上データを照合して改善案をまとめた。貴社では企画職として、現場の声とデータをつなぎ、継続的に成果を検証する姿勢を活かしたい。";

    let companyId: string | null = null;
    let documentId: string | null = null;

    try {
      await signInAsAuthenticatedUser(page, "/dashboard");
      await expect(page.locator("main")).toBeVisible();

      const company = await createOwnedCompany(page, {
        name: companyName,
        industry: "IT・通信",
      });
      companyId = company.id;

      const document = await createOwnedDocument(page, {
        title: `AI添削ES_${runId}`,
        type: "es",
        companyId,
        content: [
          {
            id: `${runId}-heading`,
            type: "h2",
            content: "志望動機",
            charLimit: 400,
          },
          {
            id: `${runId}-body`,
            type: "paragraph",
            content: reviewContent,
          },
        ],
      });
      documentId = document.id;

      const reviewStreamBody = await expectOkResponse(
        await apiRequestAsAuthenticatedUser(page, "POST", `/api/documents/${documentId}/review/stream`, {
          content: reviewContent,
          companyId,
          hasCompanyRag: false,
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
          templateType: "company_motivation",
          industryOverride: "IT・通信",
          roleName: "企画職",
        }),
        "live es review stream",
      );
      expect(reviewStreamBody).toContain('"type":"complete"');

      await page.goto(`/es/${documentId}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText("志望動機");
    } finally {
      if (documentId) {
        await deleteOwnedDocument(page, documentId);
      }
      if (companyId) {
        await deleteOwnedCompany(page, companyId);
      }
    }
  });
});
