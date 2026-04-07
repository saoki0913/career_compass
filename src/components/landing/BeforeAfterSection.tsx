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
];

export function BeforeAfterSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-28">
      <div className="mx-auto max-w-5xl">
        <LandingSectionMotion>
          <div className="mb-12 text-center md:mb-16">
            <h2
              className="mb-3 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
              style={{ fontWeight: 600 }}
            >
              就活Passを使うと、何が変わる？
            </h2>
            <p className="text-base text-[var(--lp-body-muted)]">
              よくある「困った」を、具体的な体験の変化に置き換えます。
            </p>
          </div>

          <div
            className="overflow-hidden rounded-xl border bg-white"
            style={{ borderColor: "var(--lp-border-default)" }}
          >
            <div
              className="grid grid-cols-12 gap-0 border-b text-xs uppercase tracking-wider text-[var(--lp-body-muted)] md:text-sm"
              style={{
                borderColor: "var(--lp-border-default)",
                backgroundColor: "var(--lp-surface-muted)",
                fontWeight: 600,
              }}
            >
              <div className="col-span-12 border-b py-3 pl-4 pr-2 md:col-span-5 md:border-b-0 md:border-r md:py-4 md:pl-6">
                これまで
              </div>
              <div className="col-span-12 py-3 pl-4 pr-2 md:col-span-7 md:py-4 md:pl-6">
                就活Passで
              </div>
            </div>
            {items.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-12 border-b last:border-b-0"
                style={{ borderColor: "var(--lp-border-default)" }}
              >
                <div
                  className="col-span-12 flex items-start gap-3 border-b py-5 pl-4 pr-4 md:col-span-5 md:border-b-0 md:border-r md:py-6 md:pl-6 md:pr-6"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-[var(--lp-cta)]"
                    style={{
                      fontWeight: 700,
                      backgroundColor: "var(--lp-tint-cta-soft)",
                    }}
                  >
                    —
                  </span>
                  <p className="text-sm leading-relaxed text-[var(--lp-body-muted)]">
                    {item.before}
                  </p>
                </div>
                <div className="col-span-12 flex items-start gap-3 py-5 pl-4 pr-4 md:col-span-7 md:py-6 md:pl-6 md:pr-8">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-[var(--lp-navy)]"
                    style={{
                      fontWeight: 700,
                      backgroundColor: "var(--lp-tint-navy-soft)",
                    }}
                  >
                    ✓
                  </span>
                  <p
                    className="text-sm leading-relaxed text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
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
