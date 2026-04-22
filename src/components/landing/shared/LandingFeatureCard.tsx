import type { LucideIcon } from "lucide-react";

type LandingFeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** "→ ..." 形式のソリューション行（任意） */
  solution?: string;
};

/**
 * PainPoints / Feature グリッド用のカード。
 * LP トークン準拠: `--lp-border-default` / `--lp-shadow-card` / `rounded-2xl` 固定。
 * motion は呼び出し側の `LandingSectionMotion` に任せる。
 */
export function LandingFeatureCard({
  icon: Icon,
  title,
  description,
  solution,
}: LandingFeatureCardProps) {
  return (
    <div className="group flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-8 transition-all duration-400 hover:border-slate-200 hover:shadow-xl hover:shadow-slate-100/80">
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 transition-colors duration-400 group-hover:border-[var(--lp-navy)]/10 group-hover:bg-[var(--lp-navy)]/5">
        <Icon className="h-5 w-5 text-[var(--lp-navy)]" strokeWidth={1.5} />
      </div>
      <h3
        className="mb-3 text-lg text-[var(--lp-navy)]"
        style={{ fontWeight: 700 }}
      >
        {title}
      </h3>
      <p
        className="text-sm text-slate-500"
        style={{ lineHeight: 1.7 }}
      >
        {description}
      </p>
      {solution && (
        <p
          className="mt-4 text-sm text-[var(--lp-navy)]"
          style={{ fontWeight: 600, lineHeight: 1.6 }}
        >
          {solution}
        </p>
      )}
    </div>
  );
}
