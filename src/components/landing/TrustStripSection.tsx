import { trustPoints } from "@/lib/marketing/landing-content";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function TrustStripSection() {
  return (
    <section className="border-b border-slate-100 bg-white px-6 py-10">
      <LandingSectionMotion className="mx-auto max-w-[1100px]">
        <p
          className="mb-6 text-center text-xs uppercase tracking-[0.2em] text-slate-400"
          style={{ fontWeight: 600 }}
        >
          運営・決済まわりの信頼性
        </p>
        <div className="flex flex-col items-stretch justify-center gap-6 sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-slate-200">
          {trustPoints.map((text) => (
            <div
              key={text}
              className="flex flex-1 justify-center px-4 text-center text-sm text-[var(--lp-navy)] sm:px-8"
              style={{ fontWeight: 600 }}
            >
              {text}
            </div>
          ))}
        </div>
      </LandingSectionMotion>
    </section>
  );
}
