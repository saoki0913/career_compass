import { LandingSectionMotion } from "./LandingSectionMotion";
import { LandingCheckList } from "./shared/LandingCheckList";
import { ScaleFit } from "./mocks/ScaleFit";
import { MotivationMock } from "./mocks/MotivationMock";
import { InterviewMock } from "./mocks/InterviewMock";

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


export function FeatureInterviewSection() {
  return (
    <section className="bg-slate-50/50 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        {/* Part 1: 志望動機・ガクチカ対話 */}
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="w-full lg:w-1/2">
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
            <LandingCheckList items={motivationPoints} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <ScaleFit
              naturalWidth={960}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            >
              <MotivationMock />
            </ScaleFit>
          </LandingSectionMotion>
        </div>

        {/* Part 2: 企業別 AI 模擬面接 */}
        <div className="mt-16 border-t border-slate-100 pt-16 md:mt-20 md:pt-20">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
            <LandingSectionMotion className="w-full lg:w-1/2">
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
              <LandingCheckList items={interviewPoints} />
            </LandingSectionMotion>

            <LandingSectionMotion className="w-full lg:w-1/2">
              <ScaleFit
                naturalWidth={960}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              >
                <InterviewMock />
              </ScaleFit>
            </LandingSectionMotion>
          </div>
        </div>
      </div>
    </section>
  );
}
