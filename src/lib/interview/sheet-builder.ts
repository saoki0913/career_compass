import type {
  InterviewFormat,
  InterviewRoundStage,
  InterviewSelectionType,
  InterviewStrictnessMode,
  InterviewerType,
} from "@/lib/interview/session";
import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_STAGE_LABELS,
  INTERVIEWER_TYPE_LABELS,
  SELECTION_TYPE_LABELS,
  STRICTNESS_MODE_LABELS,
  labelWeakestQuestionType,
  type Feedback,
  type Message,
} from "@/lib/interview/ui";

export interface SheetBuildInput {
  companyName: string;
  setup: {
    interviewFormat: InterviewFormat;
    selectionType: InterviewSelectionType;
    interviewStage: InterviewRoundStage;
    interviewerType: InterviewerType;
    strictnessMode: InterviewStrictnessMode;
  };
  selectedRole: string | null;
  messages: Message[];
  feedback: Feedback;
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Structured sheet data (SSOT for SheetViewer UI)
// ---------------------------------------------------------------------------

export interface InterviewSheetScoreEntry {
  axis: string;
  axisKey: keyof Feedback["scores"];
  score: number;
  evidence: string[];
  rationale: string | null;
  confidence: string | null;
}

export interface InterviewSheetQAPair {
  questionNumber: number;
  question: string;
  answer: string;
}

export interface InterviewSheetWeakest {
  questionType: string;
  question: string;
  answer: string;
}

export interface InterviewSheetData {
  companyName: string;
  selectedRole: string | null;
  generatedAt: string;
  setup: {
    interviewFormat: string;
    selectionType: string;
    interviewStage: string;
    interviewerType: string;
    strictnessMode: string;
  };
  scores: InterviewSheetScoreEntry[];
  overallComment: string;
  strengths: string[];
  improvements: string[];
  consistencyRisks: string[];
  qaPairs: InterviewSheetQAPair[];
  improvedAnswer: string;
  weakestQuestion: InterviewSheetWeakest | null;
  nextPreparation: string[];
  premiseConsistency: number | null;
}

const SCORE_AXES: Array<[keyof Feedback["scores"], string]> = [
  ["company_fit", "企業適合"],
  ["role_fit", "職種適合"],
  ["specificity", "具体性"],
  ["logic", "論理性"],
  ["persuasiveness", "説得力"],
  ["consistency", "一貫性"],
  ["credibility", "信頼性"],
];

function formatDate(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildQAPairs(messages: Message[]): string {
  const lines: string[] = [];
  let questionNum = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      questionNum++;
      lines.push(`**Q${questionNum}**: ${msg.content}`);
    } else if (msg.role === "user") {
      lines.push(`**A${questionNum}**: ${msg.content}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildScoreTable(scores: Feedback["scores"]): string {
  const header = "| 評価軸 | スコア |";
  const separator = "|--------|--------|";
  const rows = SCORE_AXES.map(([key, label]) => {
    const score = scores[key];
    return `| ${label} | ${typeof score === "number" ? `${score}/5` : "-"} |`;
  });
  return [header, separator, ...rows].join("\n");
}

export function buildInterviewSheetMarkdown(input: SheetBuildInput): string {
  const { companyName, setup, selectedRole, messages, feedback, generatedAt } = input;
  const sections: string[] = [];

  sections.push(`# 面接確認シート: ${companyName}`);
  sections.push(`生成日時: ${formatDate(generatedAt)}`);

  sections.push("");
  sections.push("## 面接設定");
  sections.push(`- 企業: ${companyName}`);
  sections.push(`- 職種: ${selectedRole || "未設定"}`);
  sections.push(`- 面接方式: ${INTERVIEW_FORMAT_LABELS[setup.interviewFormat]}`);
  sections.push(`- 選考種別: ${SELECTION_TYPE_LABELS[setup.selectionType]}`);
  sections.push(`- 面接段階: ${INTERVIEW_STAGE_LABELS[setup.interviewStage]}`);
  sections.push(`- 面接官: ${INTERVIEWER_TYPE_LABELS[setup.interviewerType]}`);
  sections.push(`- 厳しさ: ${STRICTNESS_MODE_LABELS[setup.strictnessMode]}`);

  if (messages.length > 0) {
    sections.push("");
    sections.push("## 質疑応答");
    sections.push(buildQAPairs(messages));
  }

  sections.push("");
  sections.push("## 評価");
  sections.push(feedback.overall_comment);
  sections.push("");
  sections.push(buildScoreTable(feedback.scores));

  if (feedback.weakest_question_type) {
    sections.push("");
    sections.push(`最も弱かった設問タイプ: ${labelWeakestQuestionType(feedback.weakest_question_type)}`);
  }

  if (feedback.strengths.length > 0) {
    sections.push("");
    sections.push("## 良かった点");
    for (const item of feedback.strengths) {
      sections.push(`- ${item}`);
    }
  }

  if (feedback.improvements.length > 0) {
    sections.push("");
    sections.push("## 改善点");
    for (const item of feedback.improvements) {
      sections.push(`- ${item}`);
    }
  }

  if (feedback.consistency_risks.length > 0) {
    sections.push("");
    sections.push("## 一貫性リスク");
    for (const item of feedback.consistency_risks) {
      sections.push(`- ${item}`);
    }
  }

  if (feedback.improved_answer) {
    sections.push("");
    sections.push("## 言い換え例");
    sections.push(feedback.improved_answer);
  }

  if (feedback.next_preparation.length > 0) {
    sections.push("");
    sections.push("## 次に準備すべき論点");
    for (const item of feedback.next_preparation) {
      sections.push(`- ${item}`);
    }
  }

  sections.push("");
  return sections.join("\n");
}

function buildQAPairsStructured(messages: Message[]): InterviewSheetQAPair[] {
  const pairs: InterviewSheetQAPair[] = [];
  let questionNum = 0;
  let pendingQuestion: string | null = null;

  for (const msg of messages) {
    if (msg.role === "assistant") {
      questionNum++;
      pendingQuestion = msg.content;
    } else if (msg.role === "user" && pendingQuestion !== null) {
      pairs.push({
        questionNumber: questionNum,
        question: pendingQuestion,
        answer: msg.content,
      });
      pendingQuestion = null;
    }
  }
  return pairs;
}

export function buildInterviewSheetData(input: SheetBuildInput): InterviewSheetData {
  const { companyName, setup, selectedRole, messages, feedback, generatedAt } = input;

  const evidenceMap = feedback.score_evidence_by_axis ?? {};
  const rationaleMap = feedback.score_rationale_by_axis ?? {};
  const confidenceMap = feedback.confidence_by_axis ?? {};

  const scores: InterviewSheetScoreEntry[] = SCORE_AXES.map(([key, label]) => ({
    axis: label,
    axisKey: key,
    score: typeof feedback.scores[key] === "number" ? feedback.scores[key] : 0,
    evidence: evidenceMap[key] ?? [],
    rationale: rationaleMap[key] ?? null,
    confidence: confidenceMap[key] ?? null,
  }));

  const hasWeakest = feedback.weakest_question_type || feedback.weakest_question_snapshot;
  const weakestQuestion: InterviewSheetWeakest | null = hasWeakest
    ? {
        questionType: labelWeakestQuestionType(feedback.weakest_question_type) ?? "",
        question: feedback.weakest_question_snapshot ?? "",
        answer: feedback.weakest_answer_snapshot ?? "",
      }
    : null;

  return {
    companyName,
    selectedRole,
    generatedAt: generatedAt.toISOString(),
    setup: {
      interviewFormat: INTERVIEW_FORMAT_LABELS[setup.interviewFormat],
      selectionType: SELECTION_TYPE_LABELS[setup.selectionType],
      interviewStage: INTERVIEW_STAGE_LABELS[setup.interviewStage],
      interviewerType: INTERVIEWER_TYPE_LABELS[setup.interviewerType],
      strictnessMode: STRICTNESS_MODE_LABELS[setup.strictnessMode],
    },
    scores,
    overallComment: feedback.overall_comment,
    strengths: feedback.strengths,
    improvements: feedback.improvements,
    consistencyRisks: feedback.consistency_risks,
    qaPairs: buildQAPairsStructured(messages),
    improvedAnswer: feedback.improved_answer,
    weakestQuestion,
    nextPreparation: feedback.next_preparation,
    premiseConsistency: typeof feedback.premise_consistency === "number" ? feedback.premise_consistency : null,
  };
}
