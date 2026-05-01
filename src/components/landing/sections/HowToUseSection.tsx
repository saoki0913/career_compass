import { lpSectionAsset } from "@/lib/marketing/lp-assets";

const STEPS = [
  {
    img: "how-to/step-register-company.png",
    alt: "STEP 1: 企業を登録",
    srText:
      "STEP 1: 企業を登録 — 気になる企業を追加して、管理をスタート。気になる企業をすぐに登録。情報を一元管理できます。",
  },
  {
    img: "how-to/step-ai-es-review.png",
    alt: "STEP 2: AIでESを作成・添削",
    srText:
      "STEP 2: AIでESを作成・添削 — 志望動機やガクチカを整理しながら、文章をブラッシュアップ。AIが内容を添削し、伝わるESに仕上げることができます。",
  },
  {
    img: "how-to/step-interview-prep.png",
    alt: "STEP 3: 面接対策を進める",
    srText:
      "STEP 3: 面接対策を進める — LLMとのチャットで模擬面接を進め、受け答えを改善。AIが回答を分析し、改善点や強みをフィードバックします。",
  },
  {
    img: "how-to/step-deadline-schedule.png",
    alt: "STEP 4: 締切・予定を管理",
    srText:
      "STEP 4: 締切・予定を管理 — カレンダー連携で、予定や締切をひと目で確認。締切や面接予定をまとめて管理。うっかり忘れを防げます。",
  },
] as const;

const FONT =
  "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export function HowToUseSection() {
  return (
    <section
      id="how-it-works"
      style={{ padding: "88px 0 112px", background: "#ffffff", fontFamily: FONT, position: "relative", overflow: "hidden" }}
    >
      <div style={{ maxWidth: 1260, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <h2
            style={{ fontSize: 46, fontWeight: 800, color: "#0d1f3a", letterSpacing: "0.02em", lineHeight: 1.3, margin: 0, display: "inline-block", position: "relative" }}
          >
            使い方は、
            <span style={{ color: "#2d6eff" }}>シンプル。</span>
            <span aria-hidden="true" style={{ position: "absolute", top: -10, right: -54, width: 50, height: 50 }}>
              <span style={{ position: "absolute", width: 14, height: 2, background: "#2d6eff", borderRadius: 2, top: 8, left: 8, transform: "rotate(-30deg)" }} />
              <span style={{ position: "absolute", width: 16, height: 2, background: "#2d6eff", borderRadius: 2, top: 0, left: 22, transform: "rotate(-70deg)" }} />
              <span style={{ position: "absolute", width: 14, height: 2, background: "#2d6eff", borderRadius: 2, top: 14, left: 28, transform: "rotate(20deg)" }} />
            </span>
          </h2>
          <p style={{ fontSize: 17, color: "#4a5568", fontWeight: 500, marginTop: 16, margin: "16px auto 0" }}>
            就活の流れに沿って、必要な準備を自然につなげられます。
          </p>
        </div>

        <div className="howto-grid" style={{ marginBottom: 28 }}>
          {STEPS.map((step, idx) => (
            <div key={step.alt} style={{ display: "contents" }}>
            <article
              className="howto-grid__card"
              style={{ alignItems: "center", display: "flex", justifyContent: "center", overflow: "visible", position: "relative" }}
            >
              <img src={lpSectionAsset(step.img)} alt={step.alt} loading="lazy" decoding="async" style={{ display: "block", height: 350, objectFit: "contain", transform: "scale(1.32)", width: "100%" }} />
              <span className="sr-only">{step.srText}</span>
            </article>
            {idx < STEPS.length - 1 && (
              <span className="howto-grid__arrow" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12h16M14 6l6 6-6 6" stroke="#2d6eff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 20px", marginTop: 4, position: "relative" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#2d6eff", margin: 0 }}>
            準備・対策・管理まで、就活Passでまとめて進められます。
          </p>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", lineHeight: 0 }}>
        <svg viewBox="0 0 1440 130" preserveAspectRatio="none" aria-hidden="true" style={{ width: "100%", height: "auto", display: "block" }}>
          <path d="M0 90 C 180 30, 320 80, 480 70 S 760 40, 920 80 1240 100, 1440 60 L1440 130 L0 130 Z" fill="#e2ecff" opacity="0.55" />
          <path d="M0 100 C 200 70, 380 110, 560 95 S 820 70, 1000 100 1280 120, 1440 90 L1440 130 L0 130 Z" fill="#cfdcf7" opacity="0.35" />
          <path d="M0 70 C 200 30, 380 90, 600 70 S 1000 40, 1240 80 1380 70, 1440 65" fill="none" stroke="#7aa3ef" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M0 88 C 220 60, 420 100, 640 86 S 1040 70, 1280 96 1400 88, 1440 84" fill="none" stroke="#9bb8eb" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
          <circle cx="120" cy="58" r="5" fill="#4a90ff" />
          <circle cx="220" cy="78" r="8" fill="#4a90ff" />
          <circle cx="560" cy="92" r="5" fill="#4a90ff" />
          <circle cx="820" cy="74" r="3.5" fill="#7aa3ef" />
          <circle cx="1180" cy="80" r="6" fill="#4a90ff" />
          <circle cx="1320" cy="68" r="4" fill="#7aa3ef" />
          <circle cx="1410" cy="66" r="5" fill="#4a90ff" />
        </svg>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .howto-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr) 54px minmax(0, 1fr) 54px minmax(0, 1fr);
              gap: 0;
              align-items: center;
            }
            .howto-grid__arrow {
              align-items: center;
              background: #ffffff;
              border: 1px solid #eaf0fa;
              border-radius: 999px;
              box-shadow: 0 8px 18px rgba(20, 50, 110, 0.08);
              display: flex;
              height: 38px;
              justify-content: center;
              justify-self: center;
              position: relative;
              width: 38px;
              z-index: 2;
            }
            @media (max-width: 1279px) and (min-width: 1101px) {
              .howto-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 32px;
              }
              .howto-grid__card img {
                height: 340px !important;
                transform: scale(1.22) !important;
              }
              .howto-grid__arrow {
                display: none !important;
              }
            }
            @media (max-width: 1100px) {
              .howto-grid {
                grid-template-columns: 1fr 1fr;
                gap: 32px;
              }
              .howto-grid__card img {
                height: 300px !important;
                transform: scale(1.24) !important;
              }
              .howto-grid__arrow {
                display: none !important;
              }
            }
            @media (max-width: 640px) {
              .howto-grid {
                grid-template-columns: 1fr;
                gap: 28px;
              }
              .howto-grid__card img {
                height: 300px !important;
                transform: scale(1.16) !important;
              }
            }
          `,
        }}
      />
    </section>
  );
}
