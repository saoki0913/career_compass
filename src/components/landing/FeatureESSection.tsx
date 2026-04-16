import { Check } from "lucide-react";
import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FeatureESSection() {
  return (
    <section
      className="bg-slate-50/50 px-6 py-24 md:py-32"
      id="features"
    >
      <div className="mx-auto max-w-[1200px]">
        <LandingSectionMotion className="mb-20 text-center">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            就活に必要な機能を、ひとつに
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-slate-500" style={{ lineHeight: 1.7 }}>
            ES・志望動機・スケジュール管理をまとめて対応。
            <br className="hidden md:block" />
            ツールを行き来する必要はもうありません。
          </p>
        </LandingSectionMotion>

        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p className="mb-3 text-sm text-slate-400" style={{ fontWeight: 600 }}>
              ES添削
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              ES添削AIが設問ごとに改善案を提示。
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              ESの下書きを貼り付けるだけで、AIが設問タイプに合わせた改善点を提示。書き換え案を見ながらその場で修正できるので、何度でもブラッシュアップできます。
            </p>
            <ul className="space-y-3">
              {[
                "志望動機・自己PR・ガクチカ・入社後やりたいこと・研究内容など、設問ごとに専用テンプレートで添削",
                "「幅広い視野」「新たな価値」など AI が使いがちな定番フレーズを見つけて、あなたの言葉への書き直し案を提示",
                "指定文字数に合わせた構成・改善ポイントを提案",
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
                src={landingMedia.esReview.src}
                alt={landingMedia.esReview.alt}
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
