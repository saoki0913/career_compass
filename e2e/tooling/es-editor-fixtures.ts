import type { Page } from "@playwright/test";

export const ES_EDITOR_UI_REVIEW_DOCUMENT_ID = "ui-review-es-1";
export const ES_EDITOR_UI_REVIEW_COMPANY_ID = "ui-review-company";

const now = "2026-05-21T11:34:25.000Z";

const esEditorDocument = {
  id: ES_EDITOR_UI_REVIEW_DOCUMENT_ID,
  userId: "ui-review-user",
  guestId: null,
  companyId: ES_EDITOR_UI_REVIEW_COMPANY_ID,
  applicationId: null,
  jobTypeId: null,
  type: "es",
  esCategory: "standard",
  title: "三菱商事 志望動機",
  content: [
    { id: "section-1", type: "h2", content: "志望動機（なぜ当社を志望するのか）", charLimit: 400 },
    {
      id: "answer-1",
      type: "paragraph",
      content:
        "事業の新陳代謝を前提に成長し続ける経営力こそが、三菱商事を選んだ決め手である。資源・非資源の両面で大規模な事業基盤を持ちながら、ポートフォリオを組み替えて新たな収益源を創出し続けるダイナミズムは、他商社にはない「経営で価値を生む」姿勢の表れだと捉えている。私はインターンでエラー処理の仕組みを設計した際、理想的な網羅性よりも現場で頻出するケースに絞り、誰でも迷わず使えるシンプルな分岐を採用することで、チームに定着する設計を実現した。この「机上の最適ではなく現場で回る形に落とす」観点は、制度・オペレーション・関係者調整が複雑に絡む事業投資・運営においても直結すると考える。",
    },
  ],
  status: "draft",
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  company: {
    id: ES_EDITOR_UI_REVIEW_COMPANY_ID,
    name: "三菱商事",
    infoFetchedAt: now,
    corporateInfoFetchedAt: now,
  },
  application: null,
};

const reviewStreamBody =
  'data: {"type":"progress","step":"analysis","progress":30,"label":"分析中"}\n\n' +
  'data: {"type":"string_chunk","path":"streaming_rewrite","text":"事業の新陳代謝を前提に成長し続ける経営力こそが、三菱商事を選んだ決め手である。"}\n\n' +
  'data: {"type":"string_chunk","path":"streaming_rewrite","text":"資源・非資源の両面で大規模な事業基盤を持ちながら、ポートフォリオを組み替えて新たな収益源を創出し続ける姿勢に強く惹かれた。"}\n\n' +
  'data: {"type":"complete","creditCost":6,"result":{"top3":[],"rewrites":["事業の新陳代謝を前提に成長し続ける経営力こそが、三菱商事を選んだ決め手である。資源・非資源の両面で大規模な事業基盤を持ちながら、ポートフォリオを組み替えて新たな収益源を創出し続ける姿勢に強く惹かれた。"],"rewriteText":"事業の新陳代謝を前提に成長し続ける経営力こそが、三菱商事を選んだ決め手である。資源・非資源の両面で大規模な事業基盤を持ちながら、ポートフォリオを組み替えて新たな収益源を創出し続ける姿勢に強く惹かれた。","explanation":"{\\"improvement_points\\":[{\\"axis\\":\\"結論\\",\\"point\\":\\"志望理由の強化\\",\\"detail\\":\\"冒頭で理由を明確にしました。\\"},{\\"axis\\":\\"具体性\\",\\"point\\":\\"企業接続を補強\\",\\"detail\\":\\"事業運営との接続を整理しました。\\"}],\\"main_changes\\":[{\\"before_summary\\":\\"抽象的\\",\\"after_summary\\":\\"理由が明確\\",\\"change\\":\\"結論から始める構成にしました。\\"}]}","template_review":{"template_type":"motivation","keyword_sources":[{"title":"採用ページ","source_url":"https://www.mitsubishicorp.com/jp/ja/recruit/","domain":"mitsubishicorp.com","content_type_label":"企業情報","excerpt":"事業投資と事業経営を通じて価値創造に取り組む姿勢を参照しました。"}]},"review_meta":{"llm_provider":"anthropic","llm_model_alias":"Claude","review_variant":"standard","grounding_mode":"company_general","primary_role":"総合職","evidence_coverage_level":"weak","weak_evidence_notice":true,"rewrite_validation_status":"degraded","rewrite_validation_user_hint":"厳密な品質チェックをすべて満たせませんでしたが、最も近い改善案を表示しています。","concrete_marker_count":2,"ai_smell_tier":1,"opening_conclusion_chars":34,"rewrite_sentence_count":3}}}\n\n';

export async function mockEsEditorUiReviewApis(page: Page) {
  await page.route(`**/api/documents/${ES_EDITOR_UI_REVIEW_DOCUMENT_ID}`, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ document: esEditorDocument }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ document: esEditorDocument }),
    });
  });

  await page.route(`**/api/documents/${ES_EDITOR_UI_REVIEW_DOCUMENT_ID}/versions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        versions: [
          {
            id: "version-1",
            version: 1,
            content: JSON.stringify(esEditorDocument.content),
            createdAt: now,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/documents/${ES_EDITOR_UI_REVIEW_DOCUMENT_ID}/threads`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: [] }),
    });
  });

  await page.route(`**/api/documents/${ES_EDITOR_UI_REVIEW_DOCUMENT_ID}/review/stream`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: reviewStreamBody,
    });
  });

  await page.route(`**/api/companies/${ES_EDITOR_UI_REVIEW_COMPANY_ID}/es-review-status**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: ES_EDITOR_UI_REVIEW_COMPANY_ID,
        companyName: "三菱商事",
        status: "company_fetched_but_not_ready",
        hasCompanyRag: false,
      }),
    });
  });

  await page.route(`**/api/companies/${ES_EDITOR_UI_REVIEW_COMPANY_ID}/es-role-options**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: ES_EDITOR_UI_REVIEW_COMPANY_ID,
        companyName: "三菱商事",
        industry: "商社",
        requiresIndustrySelection: false,
        industryOptions: ["商社", "IT・通信"],
        roleGroups: [
          {
            id: "default",
            label: "職種候補",
            options: [{ value: "総合職", label: "総合職", source: "industry_default" }],
          },
        ],
      }),
    });
  });
}
