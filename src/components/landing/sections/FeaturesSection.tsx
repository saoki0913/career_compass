import { lpSectionAsset } from "@/lib/marketing/lp-assets";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

type FeatureCard = {
  readonly src: string;
  readonly alt: string;
};

const features: readonly FeatureCard[] = [
  { src: "features/card-es-review.png", alt: "ES添削" },
  { src: "features/card-motivation-gakuchika.png", alt: "志望動機・ガクチカ" },
  { src: "features/card-interview-prep.png", alt: "AI模擬面接" },
  { src: "features/card-schedule-deadline.png", alt: "スケジュール管理" },
  { src: "features/card-company-application-management.png", alt: "企業管理" },
  {
    src: "features/google-calendar-integration.png",
    alt: "Googleカレンダー連携",
  },
] as const;

const flowSteps = [
  { icon: "hero/icon-document-check.png", title: "作成", desc: "AIで効率的に作成" },
  { icon: "hero/icon-star.png", title: "対策", desc: "AIで万全の準備" },
  {
    icon: "hero/icon-growth-chart.png",
    title: "管理",
    desc: "スケジュールを一元管理",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Shared style constants                                             */
/* ------------------------------------------------------------------ */

const FONT: React.CSSProperties = {
  fontFamily:
    "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFeatureSettings: '"palt"',
};

/* ------------------------------------------------------------------ */
/*  Scoped CSS for hover + responsive (cannot do :hover in inline)     */
/* ------------------------------------------------------------------ */

const SCOPED_CSS = `
.feat-card-v2:hover {
  transform: translateY(-6px);
  box-shadow: 0 30px 60px rgba(0,34,104,0.12);
}
@media (max-width: 1099px) {
  .feat-top-v2 {
    grid-template-columns: 1fr !important;
    gap: 32px !important;
  }
  .feat-heading-v2 {
    text-align: center !important;
  }
  .feat-lead-v2 {
    margin-left: auto !important;
    margin-right: auto !important;
  }
  .feat-flow-v2 {
    justify-content: center !important;
  }
}
@media (max-width: 1099px) and (min-width: 769px) {
  .feat-grid-v2 {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .feat-grid-v2 > * {
    grid-column: auto !important;
  }
  .feat-card-visual-v2 {
    height: 230px !important;
  }
}
@media (max-width: 768px) {
  .feat-grid-v2 {
    grid-template-columns: 1fr !important;
  }
  .feat-grid-v2 > * {
    grid-column: auto !important;
  }
  .feat-section-v2 {
    padding: 64px 0 80px !important;
  }
  .feat-flow-inner-v2 {
    flex-direction: column !important;
    gap: 24px !important;
  }
  .feat-connector-v2 {
    display: none !important;
  }
  .feat-flow-v2 {
    height: auto !important;
    padding: 20px 0 !important;
  }
  .feat-card-v2 {
    padding: 14px !important;
  }
  .feat-card-visual-v2 {
    height: 220px !important;
  }
}
`;

/* ------------------------------------------------------------------ */
/*  FlowConnector (dotted line + CSS arrowhead)                        */
/* ------------------------------------------------------------------ */

function FlowConnector() {
  return (
    <div
      className="feat-connector-v2"
      style={{
        position: "relative",
        width: 38,
        borderTop: "4px dotted rgba(38,128,255,0.5)",
        marginTop: -22,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          position: "absolute",
          right: -6,
          top: -8,
          width: 0,
          height: 0,
          borderTop: "6px solid transparent",
          borderBottom: "6px solid transparent",
          borderLeft: "8px solid rgba(38,128,255,0.7)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlowDiagram                                                        */
/* ------------------------------------------------------------------ */

function FlowDiagram() {
  return (
    <div
      className="feat-flow-v2"
      style={{
        position: "relative",
        height: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Decorative dot patterns inside the flow area */}
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        style={{
          position: "absolute",
          left: 12,
          top: 8,
          width: 56,
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        style={{
          position: "absolute",
          right: 12,
          bottom: 8,
          width: 56,
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />

      <div
        className="feat-flow-inner-v2"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          position: "relative",
          zIndex: 1,
        }}
      >
        {flowSteps.map((step, i) => (
          <div key={step.title} style={{ display: "contents" }}>
            <div
              style={{
                width: 110,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "1.5px solid rgba(38,128,255,0.18)",
                  boxShadow: "0 14px 30px rgba(0,102,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={lpSectionAsset(step.icon)}
                  alt=""
                  role="presentation"
                  style={{ width: 44, height: 44, objectFit: "contain" }}
                />
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 17,
                  fontWeight: 800,
                  color: "#0a2540",
                  lineHeight: 1,
                }}
              >
                {step.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: "#6b7280",
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                {step.desc}
              </div>
            </div>
            {i < flowSteps.length - 1 && <FlowConnector />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FeatureCardItem                                                    */
/* ------------------------------------------------------------------ */

function FeatureCardItem({
  feature,
  index,
}: {
  feature: FeatureCard;
  index: number;
}) {
  const colStart = (index % 3) * 2 + 1;

  return (
    <article
      className="feat-card-v2"
      style={{
        gridColumn: `${colStart} / span 2`,
        borderRadius: 22,
        border: "1px solid #e1ebfa",
        background: "#fff",
        padding: "14px",
        boxShadow:
          "0 22px 50px rgba(0,34,104,0.07), 0 4px 12px rgba(0,34,104,0.04)",
        transition: "transform 0.28s ease, box-shadow 0.28s ease",
        cursor: "default",
      }}
    >
      <div className="feat-card-visual-v2" style={{ borderRadius: 14, height: 238, overflow: "hidden" }}>
        <img
          src={lpSectionAsset(feature.src)}
          alt={feature.alt}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
        />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  FeaturesSection (exported)                                         */
/* ------------------------------------------------------------------ */

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="feat-section-v2"
      style={{
        ...FONT,
        position: "relative",
        overflow: "hidden",
        padding: "110px 0 130px",
        background: "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
      }}
    >
      {/* Scoped responsive + hover CSS */}
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      {/* Decorative dot patterns (section-level) */}
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        style={{
          position: "absolute",
          left: 24,
          top: 60,
          width: 90,
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        style={{
          position: "absolute",
          right: 32,
          top: 60,
          width: 56,
          opacity: 0.65,
          pointerEvents: "none",
        }}
      />

      {/* Content container */}
      <div
        style={{
          position: "relative",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 20px",
        }}
      >
        {/* Top area: 2-column grid (heading | flow diagram) */}
        <div
          className="feat-top-v2"
          style={{
            display: "grid",
            gridTemplateColumns: "460px 1fr",
            gap: 60,
            alignItems: "center",
            marginBottom: 56,
          }}
        >
          {/* Left column: heading + lead */}
          <div className="feat-heading-v2">
            <h2
              style={{
                fontSize: "clamp(34px, 3.4vw, 44px)",
                fontWeight: 800,
                lineHeight: 1.3,
                color: "#0a2540",
                margin: 0,
              }}
            >
              就活を加速させる、
              <br />
              <span style={{ color: "var(--lp-cta)", fontSize: "1.1em" }}>
                6つ
              </span>
              の主要機能
            </h2>
            <p
              className="feat-lead-v2"
              style={{
                margin: "18px 0 0",
                color: "#4b5563",
                fontSize: 16,
                lineHeight: 1.7,
                maxWidth: 460,
              }}
            >
              書類作成から面接対策、管理まで。必要な準備をひとつにつなぐ。
            </p>
          </div>

          {/* Right column: flow diagram */}
          <FlowDiagram />
        </div>

        {/* Card grid: 6 columns, each card spans 2 cols */}
        <div
          className="feat-grid-v2"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 24,
          }}
        >
          {features.map((feature, i) => (
            <FeatureCardItem key={feature.src} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
