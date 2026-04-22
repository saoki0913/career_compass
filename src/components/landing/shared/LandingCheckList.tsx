import { Check } from "lucide-react";

type LandingCheckListProps = {
  items: readonly string[];
  className?: string;
};

/**
 * 標準 check list（navy 丸背景 + 白 Check）。Feature セクション本文の
 * メリット列挙などで使う。motion は呼び出し側の `LandingSectionMotion` に任せる。
 */
export function LandingCheckList({ items, className }: LandingCheckListProps) {
  return (
    <ul className={className ?? "space-y-3"}>
      {items.map((text) => (
        <li key={text} className="flex items-start gap-3">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)]">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
          <span
            className="text-sm text-slate-600"
            style={{ fontWeight: 500, lineHeight: 1.6 }}
          >
            {text}
          </span>
        </li>
      ))}
    </ul>
  );
}
