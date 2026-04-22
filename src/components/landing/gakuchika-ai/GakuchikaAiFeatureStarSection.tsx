"use client";

import { Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "課題が抽象語で終わらず、具体的な内容が言語化されているか",
  "行動に自分の行動が少なくとも 1 つ含まれているか",
  "結果に数字がなくても前後差・反応・変化のいずれかがあるか",
] as const;

const STAR_PROGRESS_ROWS: readonly {
  label: string;
  snippet: string;
  status: "done" | "current" | "pending";
}[] = [
  {
    label: "状況",
    snippet: "大学3年の春、20人規模の学生団体で広報を担当",
    status: "done",
  },
  {
    label: "課題",
    snippet: "広報誌の読者数が前年比30%減。原因はSNSへの移行",
    status: "done",
  },
  {
    label: "行動",
    snippet: "読者アンケートを実施し、デジタル版を企画・制作",
    status: "current",
  },
  {
    label: "結果",
    snippet: "\u2014",
    status: "pending",
  },
];

const DONE_COUNT = STAR_PROGRESS_ROWS.filter((r) => r.status === "done").length;
const CONFIRMED_COUNT = STAR_PROGRESS_ROWS.filter((r) => r.status !== "pending").length;

function statusBadgeStyle(status: "done" | "current" | "pending") {
  if (status === "done")
    return { backgroundColor: "#ecfdf5", color: "#065f46" } as const;
  if (status === "current")
    return { backgroundColor: "#f0f9ff", color: "#0369a1" } as const;
  return { backgroundColor: "#f8fafc", color: "#64748b" } as const;
}

function statusLabel(status: "done" | "current" | "pending") {
  if (status === "done") return "完了";
  if (status === "current") return "進行中";
  return "未着手";
}

export function GakuchikaAiFeatureStarSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-20">
          {/* Left column: text */}
          <LandingSectionMotion className="lg:w-1/2">
            <p
              className="mb-3 text-sm text-slate-400"
              style={{ fontWeight: 600 }}
            >
              Feature 02
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              STAR 4 要素の合格基準と、因果欠落チェック
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              ES 作成可の判定は 4 要素が埋まっているだけでは足りません。課題が抽象語で終わっていないか、自分の具体行動があるか、結果に前後差や反応があるかまで見ます。加えて課題→行動、行動→結果の因果欠落をサーバー側で判定します。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          {/* Right column: app-like STAR progress display */}
          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="overflow-hidden rounded-2xl border bg-white"
              style={{
                borderColor: "rgba(226,232,240,0.5)",
                boxShadow: "0 20px 80px rgba(10,15,92,0.08)",
              }}
              aria-hidden
            >
              <div className="p-6">
                {/* Card header */}
                <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                  <span
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    STAR 要素チェック
                  </span>
                  <span className="text-xs" style={{ color: "#94a3b8" }}>
                    ES 材料フェーズ
                  </span>
                </div>

                {/* STAR rows */}
                <div className="space-y-3">
                  {STAR_PROGRESS_ROWS.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start gap-3 rounded-xl border p-3.5"
                      style={{
                        borderColor:
                          row.status === "done"
                            ? "rgba(34,197,94,0.25)"
                            : row.status === "current"
                              ? "rgba(14,165,233,0.3)"
                              : "#e2e8f0",
                        backgroundColor:
                          row.status === "done"
                            ? "rgba(34,197,94,0.04)"
                            : row.status === "current"
                              ? "rgba(14,165,233,0.04)"
                              : "white",
                      }}
                    >
                      {/* Status indicator */}
                      <span className="mt-0.5 shrink-0">
                        {row.status === "done" ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lp-success)]">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </span>
                        ) : row.status === "current" ? (
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full border-2"
                            style={{
                              borderColor: "#0ea5e9",
                              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: "#0ea5e9" }}
                            />
                          </span>
                        ) : (
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full border"
                            style={{ borderColor: "#e2e8f0" }}
                          />
                        )}
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <span
                          className="text-sm"
                          style={{
                            fontWeight: 600,
                            color:
                              row.status === "pending"
                                ? "#94a3b8"
                                : "var(--lp-navy)",
                          }}
                        >
                          {row.label}
                        </span>
                        <p
                          className="mt-0.5 text-xs"
                          style={{
                            lineHeight: 1.6,
                            color: row.status === "pending" ? "#cbd5e1" : "#64748b",
                          }}
                        >
                          {row.snippet}
                        </p>
                      </div>

                      {/* Status badge */}
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px]"
                        style={{
                          fontWeight: 600,
                          ...statusBadgeStyle(row.status),
                        }}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs" style={{ fontWeight: 600, color: "#64748b" }}>
                      STAR {CONFIRMED_COUNT} / 4 要素 確認済み
                    </span>
                    <span className="text-[11px]" style={{ color: "#94a3b8" }}>
                      {DONE_COUNT} 完了
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {STAR_PROGRESS_ROWS.map((row) => (
                      <div
                        key={row.label}
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                          backgroundColor:
                            row.status === "done"
                              ? "var(--lp-success)"
                              : row.status === "current"
                                ? "#0ea5e9"
                                : "#e2e8f0",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
