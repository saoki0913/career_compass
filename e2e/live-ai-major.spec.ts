import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  apiRequest,
  createGuestDocument,
  createOwnedCompany,
  createOwnedGakuchika,
  deleteGuestCompany,
  deleteGuestDocument,
  deleteOwnedGakuchika,
  ensureGuestSession,
  expectOkResponse,
  loginAsGuest,
} from "./fixtures/auth";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

type RoleOptionsResponse = {
  roleGroups: Array<{
    options: Array<{
      value: string;
    }>;
  }>;
};

type MotivationStartResponse = {
  conversation: { id: string };
  nextQuestion?: string | null;
};

type MotivationConversationResponse = {
  nextQuestion?: string | null;
  questionCount: number;
};

type MotivationDraftResponse = {
  draft: string;
  documentId: string;
};

type GakuchikaConversationStartResponse = {
  conversation: { id: string };
  messages: Array<{ role: "assistant" | "user"; content: string }>;
};

const LIVE_AI_ENV_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "COHERE_API_KEY",
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

async function parseOkJson<T>(response: Awaited<ReturnType<typeof apiRequest>>, label: string): Promise<T> {
  return JSON.parse(await expectOkResponse(response, label)) as T;
}

test.describe("Live AI major flow", () => {
  test.beforeAll(() => {
    expect(
      hasAnyLiveAiCredential(),
      `live AI suite requires one of ${LIVE_AI_ENV_NAMES.join(", ")}`,
    ).toBeTruthy();
  });

  test("guest motivation and gakuchika AI flows work end-to-end", async ({ page }) => {
    test.setTimeout(240_000);

    const runId = `live-ai-${Date.now()}`;
    const companyName = `AI主要導線会社_${runId}`;
    const gakuchikaTitle = `AIガクチカ_${runId}`;

    let companyId: string | null = null;
    let motivationDocumentId: string | null = null;
    let gakuchikaId: string | null = null;

    await loginAsGuest(page);
    await ensureGuestSession(page);

    try {
      const company = await createOwnedCompany(page, {
        name: companyName,
        industry: "IT・ソフトウェア",
      });
      companyId = company.id;

      const roleOptionsPayload = await parseOkJson<RoleOptionsResponse>(
        await apiRequest(
          page,
          "GET",
          `/api/companies/${companyId}/es-role-options?industry=${encodeURIComponent("IT・通信")}`,
        ),
        "live motivation role options",
      );
      const selectedRole = roleOptionsPayload.roleGroups.flatMap((group) => group.options)[0]?.value;
      expect(selectedRole).toBeTruthy();

      const motivationStartPayload = await parseOkJson<MotivationStartResponse>(
        await apiRequest(page, "POST", `/api/motivation/${companyId}/conversation/start`, {
          selectedIndustry: "IT・通信",
          selectedRole,
          roleSelectionSource: "industry_default",
        }),
        "live motivation conversation start",
      );
      expect(motivationStartPayload.conversation.id).toBeTruthy();
      expect((motivationStartPayload.nextQuestion ?? "").length).toBeGreaterThan(0);

      const motivationConversationPayload = await parseOkJson<MotivationConversationResponse>(
        await apiRequest(page, "POST", `/api/motivation/${companyId}/conversation`, {
          answer: "顧客の業務改善を支援できる点に魅力を感じています。",
        }),
        "live motivation conversation answer",
      );
      expect(motivationConversationPayload.questionCount).toBeGreaterThan(0);
      expect((motivationConversationPayload.nextQuestion ?? "").length).toBeGreaterThan(0);

      const motivationDraftPayload = await parseOkJson<MotivationDraftResponse>(
        await apiRequest(page, "POST", `/api/motivation/${companyId}/generate-draft`, {
          charLimit: 400,
        }),
        "live motivation draft generation",
      );
      motivationDocumentId = motivationDraftPayload.documentId;
      expect(motivationDraftPayload.draft.length).toBeGreaterThan(50);

      await page.goto(`/companies/${companyId}/motivation`);
      await expect(page.getByRole("heading", { name: "志望動機を作成" })).toBeVisible();
      await expect(page.locator("body")).toContainText(companyName);

      await page.goto(`/es/${motivationDocumentId}`);
      await expect(page.locator("main")).toBeVisible();

      const gakuchika = await createOwnedGakuchika(page, {
        title: gakuchikaTitle,
        content: "大学のゼミでイベント運営を改善し、参加率を向上させました。",
        charLimitType: "400",
      });
      gakuchikaId = gakuchika.id;

      const gakuchikaStartPayload = await parseOkJson<GakuchikaConversationStartResponse>(
        await apiRequest(page, "POST", `/api/gakuchika/${gakuchikaId}/conversation/new`),
        "live gakuchika conversation start",
      );
      expect(gakuchikaStartPayload.conversation.id).toBeTruthy();
      expect(gakuchikaStartPayload.messages.some((message) => message.role === "assistant")).toBeTruthy();

      const gakuchikaStreamBody = await expectOkResponse(
        await apiRequest(page, "POST", `/api/gakuchika/${gakuchikaId}/conversation/stream`, {
          answer: "参加者ごとの離脱理由を整理し、告知文と当日の導線を改善しました。",
          sessionId: gakuchikaStartPayload.conversation.id,
        }),
        "live gakuchika conversation stream",
      );
      expect(gakuchikaStreamBody).toContain('"type":"complete"');

      await page.goto(`/gakuchika/${gakuchikaId}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(/深掘り進捗状況|保存して後で続ける/);
    } finally {
      if (motivationDocumentId) {
        await deleteGuestDocument(page, motivationDocumentId);
      }
      if (gakuchikaId) {
        await deleteOwnedGakuchika(page, gakuchikaId);
      }
      if (companyId) {
        await deleteGuestCompany(page, companyId);
      }
    }
  });

  test("logged-in user can complete live ES review stream", async ({ page }) => {
    test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");
    test.setTimeout(240_000);

    const runId = `live-es-${Date.now()}`;
    const companyName = `AI添削会社_${runId}`;

    let companyId: string | null = null;
    let documentId: string | null = null;

    try {
      await signInWithGoogle(page, "/dashboard");
      await expect(page.locator("main")).toBeVisible();

      const company = await createOwnedCompany(page, {
        name: companyName,
        industry: "IT・ソフトウェア",
      });
      companyId = company.id;

      const document = await createGuestDocument(page, {
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
            content:
              "私が貴社を志望する理由は、顧客課題に近い場所で改善提案を繰り返し、事業成長に貢献できる環境だと感じているためです。",
          },
        ],
      });
      documentId = document.id;

      const reviewStreamBody = await expectOkResponse(
        await apiRequest(page, "POST", `/api/documents/${documentId}/review/stream`, {
          content:
            "私が貴社を志望する理由は、顧客課題に近い場所で改善提案を繰り返し、事業成長に貢献できる環境だと感じているためです。",
          companyId,
          hasCompanyRag: false,
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
          templateType: "company_motivation",
          industryOverride: "IT・ソフトウェア",
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
        await deleteGuestDocument(page, documentId);
      }
      if (companyId) {
        await deleteGuestCompany(page, companyId);
      }
    }
  });
});
