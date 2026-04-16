import { Check, X, Minus } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const rows = [
  {
    label: "月額コスト",
    pass: { text: "¥0〜¥2,980", status: "good" as const },
    aiService: { text: "¥0〜¥3,000", status: "neutral" as const },
    juku: { text: "対面指導のため高額", status: "bad" as const },
  },
  {
    label: "ES添削",
    pass: { text: "設問に沿った具体的改善", status: "good" as const },
    aiService: { text: "汎用的なフィードバック", status: "neutral" as const },
    juku: { text: "講師に依存・遅い", status: "bad" as const },
  },
  {
    label: "設問タイプ別添削",
    pass: { text: "8 種の専用テンプレート", status: "good" as const },
    aiService: { text: "汎用的な回答", status: "bad" as const },
    juku: { text: "講師の判断による", status: "neutral" as const },
  },
  {
    label: "AI表現の検出",
    pass: {
      text: "辞書とスコアで検出・書き直し候補提示",
      status: "good" as const,
    },
    aiService: { text: "対策なし", status: "bad" as const },
    juku: { text: "講師が確認", status: "neutral" as const },
  },
  {
    label: "企業情報活用",
    pass: {
      text: "自動収集して対話・添削に反映",
      status: "good" as const,
    },
    aiService: { text: "ユーザーが入力", status: "bad" as const },
    juku: { text: "講師の知見による", status: "neutral" as const },
  },
  {
    label: "志望動機・ガクチカ",
    pass: { text: "対話で深掘り＋自動生成", status: "good" as const },
    aiService: { text: "プロンプト設計が必要", status: "neutral" as const },
    juku: { text: "講師と一緒に作成", status: "neutral" as const },
  },
  {
    label: "面接対策",
    pass: { text: "企業別AI模擬面接", status: "good" as const },
    aiService: { text: "ロールプレイ可能", status: "neutral" as const },
    juku: { text: "対面（別料金の場合も）", status: "bad" as const },
  },
  {
    label: "スケジュール管理",
    pass: { text: "カレンダー連動", status: "good" as const },
    aiService: { text: "機能なし", status: "bad" as const },
    juku: { text: "なし（自己管理）", status: "bad" as const },
  },
  {
    label: "就活特化の知識",
    pass: { text: "業界・選考データ搭載", status: "good" as const },
    aiService: { text: "汎用AI（就活特化なし）", status: "bad" as const },
    juku: { text: "講師の知見による", status: "neutral" as const },
  },
  {
    label: "利用可能時間",
    pass: { text: "24時間いつでも", status: "good" as const },
    aiService: { text: "24時間いつでも", status: "good" as const },
    juku: { text: "予約制 / 平日のみ", status: "bad" as const },
  },
];

function StatusIcon({ status }: { status: "good" | "neutral" | "bad" }) {
  if (status === "good")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-badge-bg)]">
        <Check className="h-3 w-3 text-[var(--lp-navy)]" strokeWidth={3} />
      </span>
    );
  if (status === "neutral")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <Minus className="h-3 w-3 text-slate-400" strokeWidth={3} />
      </span>
    );
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
      <X className="h-3 w-3 text-slate-400" strokeWidth={3} />
    </span>
  );
}

export function ComparisonSection() {
  return (
    <section className="bg-slate-50/50 px-6 py-24 md:py-32" id="comparison">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-16 text-center md:mb-20">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            他サービスとの違い
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500" style={{ lineHeight: 1.7 }}>
            汎用AIサービスの万能さでも就活塾の高額サポートでもない、
            <br className="hidden md:block" />
            就活に特化したAIアシスタントです。
          </p>
        </LandingSectionMotion>

        <LandingSectionMotion>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th
                      className="w-[22%] border-b border-slate-100 p-5 text-left text-sm text-slate-400"
                      style={{ fontWeight: 500 }}
                    />
                    <th className="w-[26%] border-b-2 border-[var(--lp-navy)] bg-[var(--lp-tint-navy-soft)] p-5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-navy)] px-3 py-1 text-xs text-white"
                          style={{ fontWeight: 700 }}
                        >
                          おすすめ
                        </span>
                        <span className="text-sm text-[var(--lp-navy)]" style={{ fontWeight: 700 }}>
                          就活Pass
                        </span>
                      </div>
                    </th>
                    <th
                      className="w-[26%] border-b border-slate-100 p-5 text-center text-sm text-slate-400"
                      style={{ fontWeight: 500 }}
                    >
                      汎用AIサービス
                    </th>
                    <th
                      className="w-[26%] border-b border-slate-100 p-5 text-center text-sm text-slate-400"
                      style={{ fontWeight: 500 }}
                    >
                      就活塾・スクール
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.label}
                      className={i < rows.length - 1 ? "border-b border-slate-50" : ""}
                    >
                      <td className="p-5 text-sm text-slate-600" style={{ fontWeight: 600 }}>
                        {row.label}
                      </td>
                      <td className="bg-[var(--lp-tint-navy-soft)]/70 p-5">
                        <div className="flex items-center justify-center gap-2">
                          <StatusIcon status={row.pass.status} />
                          <span className="text-sm text-[var(--lp-navy)]" style={{ fontWeight: 600 }}>
                            {row.pass.text}
                          </span>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          <StatusIcon status={row.aiService.status} />
                          <span className="text-sm text-slate-500">{row.aiService.text}</span>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          <StatusIcon status={row.juku.status} />
                          <span className="text-sm text-slate-500">{row.juku.text}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
