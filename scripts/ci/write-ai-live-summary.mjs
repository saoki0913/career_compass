#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT_NAME_RE = /^(live_[^/]+?)_(\d{8}T\d{6}Z)\.json$/;
const FEATURE_DISPLAY = {
  es_review: "ES添削",
  company_info_search: "企業情報検索",
  rag_ingest: "企業RAG取り込み",
  selection_schedule: "選考スケジュール取得",
  gakuchika: "ガクチカ作成",
  motivation: "志望動機作成",
  interview: "面接対策",
  calendar: "カレンダー",
  tasks_deadlines: "タスク・締切管理",
  notifications: "通知",
  company_crud: "企業CRUD",
  billing: "課金・クレジット",
  search_query: "検索",
  pages_smoke: "ページ表示確認",
};
const FEATURE_ORDER = [
  "es_review",
  "company_info_search",
  "rag_ingest",
  "selection_schedule",
  "gakuchika",
  "motivation",
  "interview",
  "calendar",
  "tasks_deadlines",
  "notifications",
  "company_crud",
  "billing",
  "search_query",
  "pages_smoke",
];

function normalizeExpectedFeatures(expectedFeatures) {
  const raw =
    Array.isArray(expectedFeatures)
      ? expectedFeatures
      : typeof expectedFeatures === "string"
        ? expectedFeatures.split(",")
        : FEATURE_ORDER;

  const requested = new Set(
    raw
      .map((feature) => String(feature || "").trim())
      .filter(Boolean),
  );

  if (requested.size === 0) {
    return [...FEATURE_ORDER];
  }

  const unknown = [...requested].filter((feature) => !FEATURE_ORDER.includes(feature));
  if (unknown.length > 0) {
    throw new Error(`Unknown expected feature(s): ${unknown.join(", ")}`);
  }

  return FEATURE_ORDER.filter((feature) => requested.has(feature));
}

const FEATURE_RECOMMENDATIONS = {
  es_review: [
    {
      id: "length-control",
      match: (reason) => reason.includes("char_count") || reason.includes("length_shortfall"),
      title: "文字数制御を優先確認",
      description: "length-fix か prompt 制約が弱く、指定文字数帯に届いていないケースが多い。",
      nextStep: "失敗 case の target window と rewrite/repair prompt を確認する。",
    },
    {
      id: "grounding",
      match: (reason) => reason.includes("company") || reason.includes("grounding"),
      title: "企業根拠の反映を確認",
      description: "企業 grounding 系の理由が多く、志望理由の根拠が薄い可能性がある。",
      nextStep: "RAG / evidence selection / grounding policy のログを確認する。",
    },
    {
      id: "judge",
      match: (reason) => reason.includes("judge"),
      title: "judge 低評価ケースを精査",
      description: "deterministic は通っても、自然さや設問適合で評価を落としている。",
      nextStep: "低評価 case の生成文を見て prompt と model routing を見直す。",
    },
  ],
  company_info_search: [
    {
      id: "official-rank",
      match: (reason) =>
        reason.includes("no_official_in_top_n") ||
        reason.includes("company_name_mismatch"),
      title: "公式サイト到達率を確認",
      description: "公式サイトに十分到達できず、企業名一致の判定でも落としている。",
      nextStep: "query expansion、domain pattern、official 判定のログを確認する。",
    },
    {
      id: "metadata",
      match: (reason) =>
        reason.includes("wrong_source_type") ||
        reason.includes("url_pattern_mismatch") ||
        reason.includes("year_mismatch"),
      title: "metadata 精度を確認",
      description: "source type や URL pattern、年度一致の判定で品質を落としている。",
      nextStep: "judge metadata score と result normalization を確認する。",
    },
    {
      id: "search-errors",
      match: (reason) => reason.includes("search_error") || reason.includes("error"),
      title: "検索実行エラーを確認",
      description: "検索または評価実行時のエラーで nightly が不安定になっている。",
      nextStep: "runner error、rate limit、search backend のログを確認する。",
    },
  ],
  rag_ingest: [
    {
      id: "crawl",
      match: (reason) =>
        reason.includes("crawl_failure") ||
        reason.includes("fetch_failure") ||
        reason.includes("http_error"),
      title: "クロール経路を確認",
      description: "公開ページ取得に失敗し、nightly の入口でつまずいている。",
      nextStep: "対象 URL の疎通、fetcher、許可ドメイン条件を確認する。",
    },
    {
      id: "storage",
      match: (reason) =>
        reason.includes("chunks_stored_zero") ||
        reason.includes("embedding_failure") ||
        reason.includes("store_failure"),
      title: "埋め込み保存を確認",
      description: "取得はできても RAG 保存まで完了していない可能性がある。",
      nextStep: "embedding backend、chunking、vector store 保存結果を確認する。",
    },
    {
      id: "cleanup",
      match: (reason) => reason.includes("cleanup"),
      title: "cleanup 失敗を確認",
      description: "nightly 実行後の RAG データ削除に失敗している。",
      nextStep: "delete-by-urls と company 単位 cleanup の実行ログを確認する。",
    },
    {
      id: "retrieval-weak",
      match: (reason) => reason.includes("retrieval_weak"),
      title: "取り込み後の検索再現を確認",
      description: "クロール後の追検索で候補件数が足りず、クエリ拡張や検索ゲートが弱い可能性がある。",
      nextStep: "post_ingest_query の語、strict_company_match / allow_aggregators、検索 runner のログを確認する。",
    },
  ],
  selection_schedule: [
    {
      id: "search-candidates-missing",
      match: (reason) => reason.includes("search_candidate_missing"),
      title: "採用ページ探索の入口を確認",
      description: "Web 検索で候補 URL が取れておらず、スケジュール抽出の前段で止まっている。",
      nextStep: "SearchPagesRequest の query 生成、DDGS、会社名正規化を確認する。",
    },
    {
      id: "schedule-fetch",
      match: (reason) => reason.includes("schedule_fetch_failed"),
      title: "ページ取得と抽出パイプラインを確認",
      description: "候補 URL はあるが本文取得または LLM 抽出で失敗している。",
      nextStep: "fetch timeout、HTML→text、selection_type 別プロンプトを確認する。",
    },
    {
      id: "deadline-missing",
      match: (reason) => reason.includes("deadline_missing") || reason.includes("deadlines_found_false"),
      title: "締切抽出の入口を確認",
      description: "対象ページから締切候補を拾えていない。",
      nextStep: "schedule source、follow link、抽出対象本文の圧縮結果を確認する。",
    },
    {
      id: "date-parse",
      match: (reason) => reason.includes("date_parse_failed") || reason.includes("year_mismatch"),
      title: "日付解釈を確認",
      description: "締切候補は見つかっても、年度や日付の解釈で崩れている。",
      nextStep: "graduation year、date parser、year match 判定を確認する。",
    },
    {
      id: "source-follow",
      match: (reason) => reason.includes("source_follow_failed") || reason.includes("confidence_low_only"),
      title: "根拠 source と confidence を確認",
      description: "抽出できても confidence が低いか、follow link が弱い。",
      nextStep: "trusted source 判定、follow-up fetch、confidence downgrade 条件を確認する。",
    },
  ],
  gakuchika: [
    {
      id: "draft-ready-gate",
      match: (reason) =>
        reason.includes("draft_ready") ||
        reason.includes("did not reach") ||
        reason.includes("DraftReady"),
      title: "draft_ready までの会話完走を確認",
      description: "ES 下書き準備状態に到達する前に会話が止まっている。",
      nextStep: "FastAPI の gakuchika ステージ遷移、`GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY`、tests/ai_eval/gakuchika_cases.json の回答シナリオを確認する。",
    },
    {
      id: "llm-judge-blocking",
      match: (reason) => reason.includes("llm_judge_blocking_fail"),
      title: "LLM judge の blocking 失敗を精査",
      description: "決定論チェックは通過したが judge が不合格とした。",
      nextStep: "LIVE_AI_CONVERSATION_LLM_JUDGE と judge プロンプト、ケース期待を突き合わせる。",
    },
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "会話の深掘りを強化",
      description: "役割・工夫・改善の掘り下げ質問が不足している。",
      nextStep: "質問遷移と follow-up 条件を確認し、役割/改善を必須化する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding"),
      title: "要約/ES draft への反映を改善",
      description: "会話で得た要点が最終生成文に十分残っていない。",
      nextStep: "summary 生成と draft prompt の入力マッピングを確認する。",
    },
    {
      id: "forbidden-token",
      match: (reason) => reason.includes("forbidden_token:"),
      title: "禁止フレーズ混入を確認",
      description: "ドラフトまたは会話に含めたくない定型句が出ている。",
      nextStep: "tests/ai_eval の expectedForbiddenTokens とプロンプト安全化を確認する。",
    },
    {
      id: "required-groups",
      match: (reason) => reason.includes("required_question_group_miss"),
      title: "質問側の網羅性を確認",
      description: "期待した観点の質問トークン群が揃っていない。",
      nextStep: "requiredQuestionTokenGroups と質問ステージ遷移を突き合わせる。",
    },
    {
      id: "draft-length",
      match: (reason) =>
        reason.includes("draft_too_short") || reason.includes("draft_too_long"),
      title: "ドラフト文字数レンジを確認",
      description: "生成ドラフトが短すぎる/長すぎる。",
      nextStep: "charLimit、repair ループ、要約圧縮の挙動を確認する。",
    },
  ],
  motivation: [
    {
      id: "generate-draft-http",
      match: (reason) =>
        reason.includes("503") ||
        reason.includes("500") ||
        reason.includes("Service Unavailable") ||
        reason.includes("generate-draft") ||
        reason.includes("ES生成"),
      title: "generate-draft / ES 生成 API を確認",
      description: "会話後ドラフト生成で upstream エラーや 5xx が返っている。",
      nextStep: "Next の `/api/motivation/.../generate-draft`、FastAPI 連携、レート制限と `fastapi.log` を確認する。",
    },
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "企業理解を問う深掘りを増やす",
      description: "企業理由や差別化を引き出す質問が弱い。",
      nextStep: "question stage と company-specific follow-up を確認する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding") || reason.includes("company-fit"),
      title: "企業理解と経験接続の反映を改善",
      description: "企業理解や本人経験との接続が draft に残り切っていない。",
      nextStep: "draft 生成の入力 context と evidence summary を確認する。",
    },
    {
      id: "forbidden-token",
      match: (reason) => reason.includes("forbidden_token:"),
      title: "禁止フレーズ混入を確認",
      description: "志望動機ドラフトに含めたくない定型句が出ている。",
      nextStep: "expectedForbiddenTokens と refusal/安全系プロンプトを確認する。",
    },
    {
      id: "required-groups",
      match: (reason) => reason.includes("required_question_group_miss"),
      title: "質問トピックの網羅を確認",
      description: "業界・企業・経験など、期待した観点の質問が揃っていない。",
      nextStep: "requiredQuestionTokenGroups と slot 設計を確認する。",
    },
    {
      id: "draft-length",
      match: (reason) =>
        reason.includes("draft_too_short") || reason.includes("draft_too_long"),
      title: "ドラフト文字数を確認",
      description: "draftCharLimit と実出力の乖離。",
      nextStep: "generate-draft の charLimit と本文圧縮を確認する。",
    },
  ],
  interview: [
    {
      id: "prerequisite-gakuchika",
      match: (reason) =>
        reason.includes("draft_ready") ||
        reason.includes("gakuchika conversation") ||
        reason.includes("did not reach"),
      title: "面接ケースの前提（ガクチカ側）完走を確認",
      description: "面接フローの前段でガクチカ会話が draft_ready に至っていない。",
      nextStep: "interview_cases.json の依存と gakuchika シナリオを成套で見直し、必要なら面接専用の下準備パスを分離する。",
    },
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "追質問の深さを改善",
      description: "初手質問や follow-up が浅く、面接らしい掘り下げになっていない。",
      nextStep: "質問生成条件と会話履歴の参照量を確認する。",
    },
    {
      id: "forbidden-feedback",
      match: (reason) => reason.includes("forbidden_token:"),
      title: "フィードバック文の品質を確認",
      description: "面接フィードバックに含めたくない定型句が混入している。",
      nextStep: "interview.expectedForbiddenTokens と feedback 生成プロンプトを確認する。",
    },
    {
      id: "required-groups",
      match: (reason) => reason.includes("required_question_group_miss"),
      title: "面接質問の観点網羅を確認",
      description: "志望動機・ガクチカ・企業理解など、期待した観点の質問が揃っていない。",
      nextStep: "requiredQuestionTokenGroups と interview flow を確認する。",
    },
    {
      id: "feedback-length",
      match: (reason) =>
        reason.includes("feedback_too_short") || reason.includes("feedback_too_long"),
      title: "フィードバック量を確認",
      description: "フィードバック本文が短すぎる/長すぎる。",
      nextStep: "minFeedbackCharCount 設定と feedback API の出力制約を確認する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding"),
      title: "フィードバックの具体性を改善",
      description: "feedback が抽象的で、改善ポイントが弱い。",
      nextStep: "feedback prompt と評価観点の入力を確認する。",
    },
  ],
};

function parseTimestamp(value) {
  const match = /^(\d{8})T(\d{6})Z$/.exec(value);
  if (!match) return null;
  const [, ymd, hms] = match;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function toJstDate(value) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(value));
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object");
  }
  if (payload && typeof payload === "object") {
    const nested = payload.rows || payload.runs_detail || payload.reports;
    if (Array.isArray(nested)) {
      return nested.filter((row) => row && typeof row === "object");
    }
  }
  return [];
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function inferReportType(report) {
  if (report.payload?.reportType) return String(report.payload.reportType);
  const base = path.basename(report.path);
  if (base.startsWith("live_es_review_")) return "es_review";
  if (base.startsWith("live_company_info_search_")) return "company_info_search";
  if (base.startsWith("live_rag_ingest_")) return "rag_ingest";
  if (base.startsWith("live_selection_schedule_")) return "selection_schedule";
  if (base.startsWith("live_gakuchika_")) return "gakuchika";
  if (base.startsWith("live_motivation_")) return "motivation";
  if (base.startsWith("live_interview_")) return "interview";
  return "unknown";
}

function countRows(rows) {
  const counts = { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    counts.total += 1;
    const severity = String(row.severity || row.status || "").toLowerCase();
    if (severity === "passed") counts.passed += 1;
    else if (severity === "degraded") counts.degraded += 1;
    else if (severity === "failed") counts.failed += 1;

    const status = String(row.status || "").toLowerCase();
    if (status === "skipped") counts.skipped += 1;
  }
  return counts;
}

function collectReasons(row) {
  const reasons = [];
  if (Array.isArray(row.deterministic_fail_reasons)) reasons.push(...row.deterministic_fail_reasons);
  if (Array.isArray(row.deterministicFailReasons)) reasons.push(...row.deterministicFailReasons);
  if (Array.isArray(row.judge_blocking_reasons)) reasons.push(...row.judge_blocking_reasons);
  if (Array.isArray(row.judgeFailReasons)) reasons.push(...row.judgeFailReasons);
  if (Array.isArray(row.judge?.reasons)) reasons.push(...row.judge.reasons);
  if (typeof row.representative_error === "string" && row.representative_error.trim()) {
    reasons.push(row.representative_error);
  }
  if (typeof row.representativeError === "string" && row.representativeError.trim()) {
    reasons.push(row.representativeError);
  }
  if (typeof row.representative_log === "string" && row.representative_log.trim()) {
    reasons.push(row.representative_log);
  }
  if (typeof row.representativeLog === "string" && row.representativeLog.trim()) {
    reasons.push(row.representativeLog);
  }
  return reasons.map((reason) => String(reason));
}

function collectWarnings(row) {
  const warnings = [];
  if (Array.isArray(row.judge?.warnings)) warnings.push(...row.judge.warnings);
  return warnings.map((warning) => String(warning));
}

function rankEntries(entries, limit = 5) {
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildIssueLines(rows, targetSeverity, maxItems = 5) {
  const lines = [];
  for (const row of rows) {
    const severity = String(row.severity || row.status || "").toLowerCase();
    if (severity !== targetSeverity) continue;
    const caseId = String(row.case_id || row.caseId || "unknown");
    const reasons = collectReasons(row);
    lines.push(`- \`${caseId}\`${reasons.length ? ` - ${reasons.slice(0, 3).join(", ")}` : ""}`);
    if (lines.length >= maxItems) break;
  }
  return lines;
}

function collectLatestAiLiveFiles(dir) {
  const walk = (target) => {
    const entries = readdirSync(target, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const resolved = path.join(target, entry.name);
      if (entry.isDirectory()) files.push(...walk(resolved));
      else if (entry.isFile()) files.push(resolved);
    }
    return files;
  };

  return walk(dir)
    .filter((filePath) => path.basename(filePath).startsWith("live_") && filePath.endsWith(".json"))
    .filter((filePath) => !path.basename(filePath).includes("_aggregate_"));
}

export function collectLatestAiLiveReports(outputDir) {
  const entries = collectLatestAiLiveFiles(outputDir);
  const latestByPrefix = new Map();

  for (const filePath of entries) {
    const name = path.basename(filePath);
    const match = REPORT_NAME_RE.exec(name);
    if (!match) continue;
    const [, prefix, stamp] = match;
    const ts = parseTimestamp(stamp);
    if (ts === null) continue;
    const current = latestByPrefix.get(prefix);
    if (!current || ts > current.timestamp) {
      latestByPrefix.set(prefix, { path: filePath, timestamp: ts });
    }
  }

  return [...latestByPrefix.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => {
      const payload = readJsonFile(item.path);
      return { path: item.path, rows: normalizeRows(payload), payload };
    });
}

function normalizeReports(reports) {
  return reports.map((report) => {
    const reportType = inferReportType(report);
    const displayName = report.payload?.displayName || FEATURE_DISPLAY[reportType] || reportType;
    const counts = countRows(report.rows || []);
    const reasonCounts = new Map();
    const warningCounts = new Map();
    const failureKindCounts = new Map();

    for (const row of report.rows || []) {
      for (const reason of collectReasons(row)) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
      for (const warning of collectWarnings(row)) {
        warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1);
      }
      const failureKind =
        typeof row.failure_kind === "string"
          ? row.failure_kind
          : typeof row.failureKind === "string"
            ? row.failureKind
            : "";
      if (failureKind) {
        failureKindCounts.set(failureKind, (failureKindCounts.get(failureKind) || 0) + 1);
      }
    }

    return {
      ...report,
      reportType,
      displayName,
      counts,
      topReasons: rankEntries(reasonCounts),
      topWarnings: rankEntries(warningCounts),
      topFailureKinds: rankEntries(failureKindCounts),
      degradedLines: buildIssueLines(report.rows || [], "degraded"),
      failedLines: buildIssueLines(report.rows || [], "failed"),
    };
  });
}

function createMissingFeature(reportType) {
  const workflowImpact = isAlwaysReportOnlyFeature(reportType) ? "report_only" : "blocking";
  return {
    reportType,
    displayName: FEATURE_DISPLAY[reportType] || reportType,
    counts: { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 },
    topReasons: [{ value: "missing_report", count: 1 }],
    topWarnings: [],
    topFailureKinds: [],
    degradedLines: [],
    failedLines: [],
    priority: "high",
    recommendations: [
      {
        id: "missing-report",
        title: "report 未生成の原因を確認",
        description: "feature report が生成されておらず、失敗内容を朝の issue だけでは追えない。",
        nextStep: "対象 job log と artifact の回収経路を確認し、report 出力失敗を先に直す。",
        signals: [{ value: "missing_report", count: 1 }],
      },
    ],
    reportFile: "(missing)",
    status: "missing_report",
    workflowImpact,
  };
}

function buildRecommendations(report) {
  if (report.status === "missing_report") {
    return report.recommendations;
  }
  const rules = FEATURE_RECOMMENDATIONS[report.reportType] || [];
  const recommendations = [];
  for (const rule of rules) {
    const matchedReasons = report.topReasons.filter((entry) => rule.match(entry.value));
    if (matchedReasons.length === 0) continue;
    recommendations.push({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      nextStep: rule.nextStep,
      signals: matchedReasons,
    });
  }

  if (recommendations.length === 0 && (report.counts.failed > 0 || report.counts.degraded > 0)) {
    recommendations.push({
      id: "manual-review",
      title: "代表ケースの手動確認が必要",
      description: "典型的な reason へのマッピングができていないため、まず transcript と生成文を確認する。",
      nextStep: "feature report の failed/degraded case を 1 件ずつ確認する。",
      signals: report.topReasons,
    });
  }

  return recommendations.slice(0, 3);
}

function priorityForReport(report) {
  if (report.status === "missing_report") return "high";
  if (report.counts.failed > 0) return "high";
  if (report.counts.degraded > 0) return "medium";
  return "low";
}

function statusForReport(report) {
  if (report.counts.failed > 0) return "failed";
  if (report.counts.degraded > 0) return "degraded";
  return "ok";
}

function isAlwaysReportOnlyFeature(reportType) {
  return reportType === "company_info_search" || reportType === "rag_ingest" || reportType === "selection_schedule";
}

function isExtendedEsQualityReportOnly(report, suite) {
  if (suite !== "extended" || report.reportType !== "es_review" || report.counts.failed === 0) {
    return false;
  }
  if (report.topFailureKinds.length === 0) {
    return false;
  }
  return report.topFailureKinds.every((entry) => entry.value === "quality");
}

function workflowImpactForReport(report, suite) {
  if (isAlwaysReportOnlyFeature(report.reportType)) return "report_only";
  if (report.status === "missing_report") return "blocking";
  if (report.counts.failed === 0) return "none";
  if (isExtendedEsQualityReportOnly(report, suite)) return "report_only";
  return "blocking";
}

export function buildAiLiveSummaryMarkdown(reports, options = {}) {
  return buildAiLiveArtifacts(reports, options).summaryMarkdown;
}

export function buildAiLiveArtifacts(reports, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const runUrl = options.runUrl || "";
  const suite = options.suite || "";
  const expectedFeatures = normalizeExpectedFeatures(options.expectedFeatures);
  const normalizedReports = normalizeReports(reports);
  const overall = normalizedReports.reduce(
    (acc, report) => {
      acc.total += report.counts.total;
      acc.passed += report.counts.passed;
      acc.degraded += report.counts.degraded;
      acc.failed += report.counts.failed;
      acc.skipped += report.counts.skipped;
      return acc;
    },
    { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 },
  );

  const existingFeatures = normalizedReports.map((report) => ({
    reportType: report.reportType,
    displayName: report.displayName,
    counts: report.counts,
    topReasons: report.topReasons,
    topWarnings: report.topWarnings,
    topFailureKinds: report.topFailureKinds,
    degradedLines: report.degradedLines,
    failedLines: report.failedLines,
    priority: priorityForReport(report),
    recommendations: buildRecommendations(report),
    reportFile: path.basename(report.path),
    status: statusForReport(report),
    workflowImpact: workflowImpactForReport(
      {
        reportType: report.reportType,
        counts: report.counts,
        topFailureKinds: report.topFailureKinds,
        status: statusForReport(report),
      },
      suite
    ),
  }));
  const featureMap = new Map(existingFeatures.map((feature) => [feature.reportType, feature]));
  const features = expectedFeatures.map((reportType) => featureMap.get(reportType) || createMissingFeature(reportType));

  const aggregate = {
    generatedAt,
    dateJst: toJstDate(generatedAt),
    runUrl,
    suite,
    overall,
    blockingFailureCount: features.filter((feature) => feature.workflowImpact === "blocking").length,
    features: Object.fromEntries(features.map((feature) => [feature.reportType, feature])),
  };

  const summaryLines = [
    "# AI Live Summary",
    "",
    `Generated: ${generatedAt}`,
    ...(suite ? [`Suite: ${suite}`, ""] : [""]),
    ...(runUrl ? [`Run: ${runUrl}`, ""] : [""]),
    "| report | total | passed | degraded | failed | skipped |",
    "|---|---:|---:|---:|---:|---:|",
    ...features.map(
      (feature) =>
        `| ${feature.reportFile} | ${feature.counts.total} | ${feature.counts.passed} | ${feature.counts.degraded} | ${feature.counts.failed} | ${feature.counts.skipped} |`,
    ),
    "",
    `Overall: total=${overall.total}, passed=${overall.passed}, degraded=${overall.degraded}, failed=${overall.failed}, skipped=${overall.skipped}`,
    "",
  ];

  for (const feature of features) {
    summaryLines.push(`## ${feature.displayName}`, "");
    summaryLines.push(
      `- report artifact: \`${feature.reportFile}\``,
      `- total=${feature.counts.total} passed=${feature.counts.passed} degraded=${feature.counts.degraded} failed=${feature.counts.failed} skipped=${feature.counts.skipped}`,
      `- priority: \`${feature.priority}\``,
      `- status: \`${feature.status}\``,
      `- workflow_impact: \`${feature.workflowImpact}\``,
      "",
    );

    if (feature.status === "missing_report") {
      summaryLines.push("_Latest run did not produce a feature report. Check job logs and artifact upload path first._", "");
      continue;
    }

    if (feature.topFailureKinds.length > 0) {
      summaryLines.push("### Failure kinds", "", ...feature.topFailureKinds.map((item) => `- \`${item.value}\` x ${item.count}`), "");
    }

    if (feature.topReasons.length > 0) {
      summaryLines.push("### Reasons", "", ...feature.topReasons.map((item) => `- \`${item.value}\` x ${item.count}`), "");
    }

    if (feature.topFailureKinds.length === 0 && feature.topReasons.length === 0) {
      summaryLines.push("_No failure kinds or reasons were captured in the latest report._", "");
    }

    if (feature.degradedLines.length > 0) {
      summaryLines.push("### Degraded", "", ...feature.degradedLines, "");
    }

    if (feature.failedLines.length > 0) {
      summaryLines.push("### Failed", "", ...feature.failedLines, "");
    }

    if (feature.degradedLines.length === 0 && feature.failedLines.length === 0) {
      summaryLines.push("_No degraded or failed cases in the latest report._", "");
    }
  }

  const issueLines = [
    `# AI Live Daily Report ${aggregate.dateJst}`,
    "",
    ...(runUrl ? [`- Run: ${runUrl}`] : []),
    ...(suite ? [`- Suite: \`${suite}\``] : []),
    `- Overall: total=${overall.total}, passed=${overall.passed}, degraded=${overall.degraded}, failed=${overall.failed}, skipped=${overall.skipped}`,
    "",
  ];

  for (const feature of features) {
    issueLines.push(`## ${feature.displayName}`, "");
    issueLines.push(
      `- 状態: passed=${feature.counts.passed} degraded=${feature.counts.degraded} failed=${feature.counts.failed}`,
      `- 優先度: \`${feature.priority}\``,
      `- report artifact: \`${feature.reportFile}\``,
      `- report_status: \`${feature.status}\``,
      `- workflow_impact: \`${feature.workflowImpact}\``,
      "",
    );

    if (suite === "extended" && feature.status !== "missing_report" && feature.workflowImpact === "report_only") {
      issueLines.push(
        "_extended suite のため、この feature の quality failure は report-only です。infra/config failure ではない限り workflow の blocking 対象にしません。_",
        "",
      );
    }

    if (feature.status === "missing_report") {
      issueLines.push(
        "### artifact 状態",
        "",
        "- `missing_report` x 1",
        `- artifact: \`${feature.reportFile}\``,
        "",
        "_この機能は report 未生成です。まず artifact と job log の回収経路を確認してください。_",
        "",
      );
      continue;
    }

    if (feature.topFailureKinds.length > 0) {
      issueLines.push("### 主な failure kind", "");
      for (const item of feature.topFailureKinds.slice(0, 3)) {
        issueLines.push(`- \`${item.value}\` x ${item.count}`);
      }
      issueLines.push("");
    }

    if (feature.topReasons.length > 0) {
      issueLines.push("### 主な reason", "");
      for (const item of feature.topReasons.slice(0, 3)) {
        issueLines.push(`- \`${item.value}\` x ${item.count}`);
      }
      issueLines.push("");
    }

    if (feature.failedLines.length > 0) {
      issueLines.push("### failed case", "", ...feature.failedLines, "");
    }
    if (feature.degradedLines.length > 0) {
      issueLines.push("### degraded case", "", ...feature.degradedLines, "");
    }
    if (feature.failedLines.length === 0 && feature.degradedLines.length === 0) {
      issueLines.push("_問題のある case はありません。_", "");
    }
  }

  return {
    aggregate,
    summaryMarkdown: summaryLines.join("\n"),
    issueBody: issueLines.join("\n"),
    recommendations: features.map((feature) => ({
      reportType: feature.reportType,
      displayName: feature.displayName,
      priority: feature.priority,
      recommendations: feature.recommendations,
    })),
  };
}

export function writeAiLiveSummary({ outputDir, summaryFile, runUrl, suite, expectedFeatures } = {}) {
  const resolvedOutputDir = outputDir || process.env.AI_LIVE_OUTPUT_DIR || path.resolve("backend/tests/output");
  const resolvedSummaryFile = summaryFile || process.env.GITHUB_STEP_SUMMARY || "";
  const defaultRunUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";
  const resolvedRunUrl = runUrl || defaultRunUrl;
  const resolvedSuite = suite || process.env.AI_LIVE_SUITE || "";
  const resolvedExpectedFeatures = expectedFeatures || process.env.AI_LIVE_EXPECTED_FEATURES || "";

  const reports = collectLatestAiLiveReports(resolvedOutputDir);
  mkdirSync(resolvedOutputDir, { recursive: true });

  const artifacts = buildAiLiveArtifacts(reports, {
    generatedAt: new Date().toISOString(),
    runUrl: resolvedRunUrl,
    suite: resolvedSuite,
    expectedFeatures: resolvedExpectedFeatures,
  });

  writeFileSync(path.join(resolvedOutputDir, "ai-live-summary.json"), JSON.stringify(artifacts.aggregate, null, 2), "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-summary.md"), `${artifacts.summaryMarkdown}\n`, "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-recommendations.json"), JSON.stringify(artifacts.recommendations, null, 2), "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-issue-body.md"), `${artifacts.issueBody}\n`, "utf8");

  if (resolvedSummaryFile) {
    writeFileSync(resolvedSummaryFile, `${artifacts.summaryMarkdown}\n`, "utf8");
  }

  return artifacts.summaryMarkdown;
}

function parseArgs(argv) {
  const out = {
    outputDir: process.env.AI_LIVE_OUTPUT_DIR || "",
    summaryFile: process.env.GITHUB_STEP_SUMMARY || "",
    runUrl: "",
    suite: "",
    expectedFeatures: process.env.AI_LIVE_EXPECTED_FEATURES || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output-dir") {
      out.outputDir = argv[i + 1] || out.outputDir;
      i += 1;
      continue;
    }
    if (arg === "--summary-file") {
      out.summaryFile = argv[i + 1] || out.summaryFile;
      i += 1;
      continue;
    }
    if (arg === "--run-url") {
      out.runUrl = argv[i + 1] || out.runUrl;
      i += 1;
      continue;
    }
    if (arg === "--suite") {
      out.suite = argv[i + 1] || out.suite;
      i += 1;
      continue;
    }
    if (arg === "--expected-features") {
      out.expectedFeatures = argv[i + 1] || out.expectedFeatures;
      i += 1;
      continue;
    }
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const markdown = writeAiLiveSummary(options);
  process.stdout.write(`${markdown}\n`);
}
