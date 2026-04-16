import { trustPoints } from "@/lib/marketing/landing-content";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function TrustStripSection() {
  return (
    <section className="border-b border-slate-100 bg-white px-6 py-10">
      <LandingSectionMotion className="mx-auto max-w-[1100px]">
        <h2 className="sr-only">就活Passの特長</h2>
        <p
          className="mb-6 text-center text-xs uppercase tracking-[0.2em] text-slate-400"
          style={{ fontWeight: 600 }}
        >
          就活Passの特長
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {trustPoints.map((text) => (
            <div
              key={text}
              className="text-center text-sm text-[var(--lp-navy)]"
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
