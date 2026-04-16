import { Check, MessageSquareQuote, Sparkles, UsersRound } from "lucide-react";
import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

const motivationPoints = [
  "「なぜその業界か／なぜその会社か／そこで何をしたいか」など、志望動機に必要な観点を会話で順に整理",
  "会社の事業内容や採用ページの情報を踏まえて、あなたらしい志望動機に近づける",
  "「成長できる」「学べる」など、どの会社でも言えそうな表現は追加質問で具体化を促す",
] as const;

const interviewPoints = [
  "会社の事業や採用ページの情報をふまえて質問を生成",
  "あなたの回答に応じて、深掘り質問 or 次の論点へ自動で切り替え",
  "終了後に、良かった点・改善点・改善後の回答例・次に準備したい論点を提示",
  "職種や面接方式（技術／ケース／人生史 など）、選考段階に合わせた質問",
] as const;

const interviewHighlights = [
  {
    icon: MessageSquareQuote,
    label: "企業ごとの質問",
    detail: "登録した会社情報から質問を生成",
  },
  {
    icon: Sparkles,
    label: "深掘り or 次の論点",
    detail: "回答に応じて自動で切り替え",
  },
  {
    icon: UsersRound,
    label: "終了後のフィードバック",
    detail: "改善点と改善後の回答例を提示",
  },
] as const;

export function FeatureInterviewSection() {
  return (
    <section className="bg-slate-50/50 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        {/* Part 1: 志望動機・ガクチカ対話 */}
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p className="mb-3 text-sm text-slate-400" style={{ fontWeight: 600 }}>
              志望動機・ガクチカ作成
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              志望動機もガクチカも、AI との対話で自分の言葉に。
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              志望動機やガクチカを、AIとの会話で言語化。頭の中の曖昧な考えが、ESに書ける材料に変わります。
            </p>
            <ul className="space-y-3">
              {motivationPoints.map((text) => (
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

        {/* Part 2: 企業別 AI 模擬面接 */}
        <div className="mt-16 border-t border-slate-100 pt-16 md:mt-20 md:pt-20">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
            <LandingSectionMotion className="lg:w-1/2">
              <p
                className="mb-3 text-sm text-slate-400"
                style={{ fontWeight: 600 }}
              >
                企業別 AI 模擬面接
              </p>
              <h3
                className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
                style={{ fontWeight: 800, lineHeight: 1.3 }}
              >
                その会社に合わせて、AI 面接官が 1 問ずつ深掘り。
              </h3>
              <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
                登録した企業情報をふまえて、AI 面接官が質問。あなたの回答を受けて、さらに深掘るか次の論点に移るかを判断します。終了後には、良かった点と改善点、改善後の回答例まで提示。
              </p>
              <ul className="space-y-3">
                {interviewPoints.map((text) => (
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
            </LandingSectionMotion>

            <LandingSectionMotion className="lg:w-1/2">
              <div
                className="relative rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)]"
                aria-hidden
              >
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lp-tint-navy-soft)]">
                    <UsersRound
                      className="h-5 w-5 text-[var(--lp-navy)]"
                      strokeWidth={1.75}
                    />
                  </span>
                  <div>
                    <p
                      className="text-sm text-[var(--lp-navy)]"
                      style={{ fontWeight: 700 }}
                    >
                      AI 面接官との模擬面接
                    </p>
                    <p className="text-xs text-slate-400">
                      企業情報 × 職種 × 面接方式
                    </p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {interviewHighlights.map(({ icon: Icon, label, detail }) => (
                    <li key={label} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                        <Icon
                          className="h-4 w-4 text-[var(--lp-navy)]"
                          strokeWidth={1.75}
                        />
                      </span>
                      <div>
                        <p
                          className="text-sm text-[var(--lp-navy)]"
                          style={{ fontWeight: 700, lineHeight: 1.5 }}
                        >
                          {label}
                        </p>
                        <p
                          className="text-xs text-slate-500"
                          style={{ lineHeight: 1.6 }}
                        >
                          {detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </LandingSectionMotion>
          </div>
        </div>
      </div>
    </section>
  );
}
