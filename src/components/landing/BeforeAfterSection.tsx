import { Check, Minus } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const items = [
  {
    before: "ESを何度書き直しても、何が足りないか分からない",
    after: "AIが具体的な改善点を指摘し、書き換え案もその場で確認",
  },
  {
    before: "企業ごとの締切をスプレッドシートで追いきれない",
    after: "企業・締切・選考状況がひとつの画面で一覧管理",
  },
  {
    before: "志望動機を聞かれると、頭が真っ白になる",
    after: "AIとの対話で自分の考えが言語化され、ES下書きも自動生成",
  },
  {
    before: "面接練習の相手がいない",
    after: "企業ごとの模擬面接で、本番前に練習できる",
  },
  {
    before: "AIらしい定型文が残って、ES が「それっぽい」だけで終わる",
    after: "AIが出しがちな表現を辞書で検出し、自分の言葉に書き直す候補を提示",
  },
];

export function BeforeAfterSection() {
  return (
    <section className="bg-slate-50/60 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[900px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            就活Passを使うと、何が変わる？
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-slate-500" style={{ lineHeight: 1.7 }}>
            よくある「困った」を、具体的な体験の変化に置き換えます。
          </p>
        </LandingSectionMotion>

        <LandingSectionMotion>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-2">
              <div className="border-b border-slate-100 px-6 py-4">
                <span className="text-sm text-slate-400" style={{ fontWeight: 600 }}>これまで</span>
              </div>
              <div className="border-b border-slate-100 bg-[var(--lp-tint-navy-soft)] px-6 py-4">
                <span className="text-sm text-[var(--lp-navy)]" style={{ fontWeight: 600 }}>就活Passで</span>
              </div>
            </div>

            {items.map((item, i) => (
              <div
                key={i}
                className={`grid grid-cols-2 ${i < items.length - 1 ? "border-b border-slate-50" : ""}`}
              >
                <div className="flex items-start gap-3 px-6 py-5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    <Minus className="h-3 w-3 text-slate-400" strokeWidth={3} />
                  </span>
                  <p className="text-sm text-slate-400" style={{ lineHeight: 1.6 }}>{item.before}</p>
                </div>
                <div className="flex items-start gap-3 bg-[var(--lp-tint-navy-soft)]/70 px-6 py-5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-badge-bg)]">
                    <Check className="h-3 w-3 text-[var(--lp-navy)]" strokeWidth={3} />
                  </span>
                  <p className="text-sm text-[var(--lp-navy)]" style={{ fontWeight: 600, lineHeight: 1.6 }}>
                    {item.after}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
