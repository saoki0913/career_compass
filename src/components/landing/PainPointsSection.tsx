import { FileEdit, Calendar, MessageSquare } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const painPoints = [
  {
    icon: FileEdit,
    title: "ESが書けない",
    description:
      "自己分析が足りず、何をアピールすればいいか分からない。文章をまとめるのが苦手。",
  },
  {
    icon: Calendar,
    title: "期限管理が大変",
    description:
      "複数社の選考が重なり、提出期限や面接の日程調整で頭がいっぱいになる。",
  },
  {
    icon: MessageSquare,
    title: "面接が不安",
    description:
      "想定質問への回答が準備できていない。模擬面接の相手が周りにいない。",
  },
];

export function PainPointsSection() {
  return (
    <section className="bg-[var(--lp-surface-section)] px-6 py-24 md:py-28">
      <div className="mx-auto max-w-7xl">
        <LandingSectionMotion>
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
              style={{ fontWeight: 600 }}
            >
              こんなお悩み、ありませんか？
            </h2>
            <p className="text-base text-[var(--lp-body-muted)]">
              多くの就活生が抱える課題を、ひとつずつ解消するために設計されています。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {painPoints.map((point) => (
              <div
                key={point.title}
                className="flex flex-col rounded-xl border bg-white p-8 transition-shadow duration-200 hover:shadow-md"
                style={{
                  borderColor: "var(--lp-border-default)",
                  boxShadow: "var(--lp-shadow-card)",
                }}
              >
                <div
                  className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border bg-[var(--lp-surface-muted)]"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <point.icon
                    className="h-5 w-5 text-[var(--lp-cta)]"
                    strokeWidth={2}
                  />
                </div>
                <h3
                  className="mb-3 text-lg text-[var(--lp-navy)]"
                  style={{ fontWeight: 600 }}
                >
                  {point.title}
                </h3>
                <p
                  className="flex-1 text-sm leading-relaxed text-[var(--lp-body-muted)]"
                  style={{ fontWeight: 400 }}
                >
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
