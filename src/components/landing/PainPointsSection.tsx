import { FileText, CalendarDays, MessageSquareText } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const painPoints = [
  {
    icon: FileText,
    title: "ESが書けない",
    description:
      "何をアピールすればいいか分からない。→ 設問タイプ別のAI添削で、具体的な改善点を指摘します。",
  },
  {
    icon: MessageSquareText,
    title: "志望動機が浮かばない",
    description:
      "企業のどこが良いか言語化できない。→ 企業情報を踏まえた対話で、固有の志望動機を整理します。",
  },
  {
    icon: CalendarDays,
    title: "締切を忘れそう",
    description:
      "複数社の選考が重なって管理しきれない。→ 選考日程の自動管理とカレンダー連携で漏れを防ぎます。",
  },
];

export function PainPointsSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            こんなお悩み、ありませんか？
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500" style={{ lineHeight: 1.7 }}>
            多くの就活生が抱える課題を、ひとつずつ解消するために設計されています。
          </p>
        </LandingSectionMotion>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {painPoints.map((point, i) => (
            <LandingSectionMotion key={point.title}>
              <div className="group h-full rounded-2xl border border-slate-100 bg-white p-8 transition-all duration-400 hover:border-slate-200 hover:shadow-xl hover:shadow-slate-100/80">
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 transition-colors duration-400 group-hover:border-[var(--lp-navy)]/10 group-hover:bg-[var(--lp-navy)]/5">
                  <point.icon className="h-5 w-5 text-[var(--lp-navy)]" strokeWidth={1.5} />
                </div>
                <h3
                  className="mb-3 text-lg text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  {point.title}
                </h3>
                <p className="text-sm text-slate-500" style={{ lineHeight: 1.7 }}>
                  {point.description}
                </p>
              </div>
            </LandingSectionMotion>
          ))}
        </div>
      </div>
    </section>
  );
}
