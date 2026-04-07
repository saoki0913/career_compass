import { LandingSectionMotion } from "./LandingSectionMotion";

const rows = [
  { label: "コスト", pass: "月額 ¥1,490〜", other: "20万〜50万円以上" },
  { label: "利用可能時間", pass: "24時間いつでも", other: "予約制 / 平日のみ" },
  { label: "添削スピード", pass: "即時（数秒）", other: "3日〜1週間" },
  { label: "管理機能", pass: "カレンダー連動", other: "なし（各自）" },
  {
    label: "面接対策",
    pass: "AI模擬面接",
    other: "対面（別料金の場合も）",
  },
];

export function ComparisonSection() {
  return (
    <section
      className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-28"
      id="comparison"
    >
      <div className="mx-auto max-w-4xl">
        <LandingSectionMotion>
          <div className="mb-12 text-center md:mb-14">
            <h2
              className="mb-3 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
              style={{ fontWeight: 600 }}
            >
              なぜ「就活Pass」が選ばれるのか
            </h2>
            <p className="mx-auto max-w-2xl text-base text-[var(--lp-body-muted)]">
              就活塾の1/10以下の費用で、AI添削・対話支援・管理機能を24時間利用できます。
            </p>
          </div>

          <div
            className="overflow-hidden rounded-xl border bg-white"
            style={{ borderColor: "var(--lp-border-default)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--lp-border-default)" }}>
                    <th
                      className="px-4 py-4 md:px-6"
                      style={{
                        fontWeight: 600,
                        color: "var(--lp-body-muted)",
                        backgroundColor: "var(--lp-surface-muted)",
                      }}
                    >
                      比較項目
                    </th>
                    <th
                      className="px-4 py-4 text-center md:px-6"
                      style={{
                        fontWeight: 600,
                        color: "var(--lp-navy)",
                        backgroundColor: "var(--lp-tint-navy-soft)",
                        borderBottom: "2px solid var(--lp-navy)",
                      }}
                    >
                      就活Pass
                    </th>
                    <th
                      className="px-4 py-4 text-center md:px-6"
                      style={{
                        fontWeight: 500,
                        color: "var(--lp-body-muted)",
                        backgroundColor: "var(--lp-surface-muted)",
                      }}
                    >
                      就活塾・スクール
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.label}
                      style={{ borderBottom: "1px solid var(--lp-border-default)" }}
                    >
                      <td
                        className="px-4 py-5 md:px-6"
                        style={{ fontWeight: 600, color: "var(--lp-navy)" }}
                      >
                        {row.label}
                      </td>
                      <td
                        className="px-4 py-5 text-center md:px-6"
                        style={{ fontWeight: 600, color: "var(--lp-cta)" }}
                      >
                        {row.pass}
                      </td>
                      <td
                        className="px-4 py-5 text-center text-[var(--lp-body-muted)] md:px-6"
                        style={{ fontWeight: 400 }}
                      >
                        {row.other}
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
