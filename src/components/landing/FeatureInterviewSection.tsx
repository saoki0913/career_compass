import { Check } from "lucide-react";
import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FeatureInterviewSection() {
  return (
    <section className="bg-slate-50/50 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p className="mb-3 text-sm text-slate-400" style={{ fontWeight: 600 }}>
              志望動機・ガクチカ作成
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              AIとの対話で、自分の言葉にする。
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              志望動機やガクチカを、AIとの会話で言語化。頭の中の曖昧な考えが、ESに書ける材料に変わります。
            </p>
            <ul className="space-y-3">
              {[
                "質問に答えるだけで考えが整理される",
                "「何を書けばいいか」が自然と見えてくる",
                "整理した内容からES下書きを自動生成",
              ].map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-slate-600" style={{ fontWeight: 500, lineHeight: 1.6 }}>{text}</span>
                </li>
              ))}
            </ul>
          </LandingSectionMotion>

          <LandingSectionMotion className="lg:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
              <Image
                src={landingMedia.motivation.src}
                alt={landingMedia.motivation.alt}
                width={800}
                height={540}
                className="block w-full"
              />
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
