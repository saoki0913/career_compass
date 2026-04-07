import { Check } from "lucide-react";
import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FeatureESSection() {
  return (
    <section
      className="bg-[var(--lp-surface-section)] px-6 py-24 md:py-28"
      id="features"
    >
      <div className="mx-auto max-w-7xl">
        <LandingSectionMotion className="flex flex-col items-center gap-14 lg:flex-row lg:items-start lg:gap-20">
          <div className="w-full max-w-xl lg:w-1/2 lg:max-w-none">
            <span
              className="mb-3 block text-xs uppercase tracking-[0.2em] text-[var(--lp-cta)]"
              style={{ fontWeight: 600 }}
            >
              Feature 01
            </span>
            <h2
              className="mb-5 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl lg:text-[2rem] lg:leading-snug"
              style={{ fontWeight: 600 }}
            >
              AIがあなたのESを
              <br />
              具体的に改善
            </h2>
            <p
              className="mb-8 text-base leading-relaxed text-[var(--lp-body-muted)] md:text-lg"
              style={{ fontWeight: 400 }}
            >
              下書きから添削、書き直しまでを同一画面で。添削結果を見ながらその場で修正でき、改善案もすぐに反映できます。
            </p>
            <ul className="space-y-4">
              {[
                "設問に合わせた改善案をAIが提示",
                "書き換え案を見ながらその場で更新",
                "途中のメモや下書きからでも始められる",
              ].map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span
                    className="text-sm text-[var(--lp-navy)] md:text-base"
                    style={{ fontWeight: 500 }}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full lg:w-1/2">
            <Image
              src={landingMedia.esReview.src}
              alt={landingMedia.esReview.alt}
              width={800}
              height={540}
              className="w-full rounded-xl border bg-white"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow: "var(--lp-shadow-screenshot)",
              }}
            />
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
