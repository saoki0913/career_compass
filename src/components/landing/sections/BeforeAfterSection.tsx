"use client";

import { useEffect, useRef, useState } from "react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";

/* ────────────────────────────── Before SVG Icons ────────────────────────────── */

function IconTangle() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <path
        d="M14 18c-3 3-3 8 0 11s8 3 11 0c2-2 2-5 0-7-2-2-5-2-7 0-1 1-1 3 0 4"
        stroke="#3a3f47"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M22 12c4-2 9-1 12 2 3 4 2 9-1 12-3 2-7 2-10-1-2-2-2-6 1-8 2-1 5-1 6 1"
        stroke="#3a3f47"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M30 30c2 3 2 6-1 8-3 2-7 1-9-2"
        stroke="#3a3f47"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPapers() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <rect
        x="10"
        y="14"
        width="18"
        height="22"
        rx="2"
        transform="rotate(-8 19 25)"
        stroke="#3a3f47"
        strokeWidth="1.6"
        fill="#fff"
      />
      <rect
        x="18"
        y="10"
        width="18"
        height="22"
        rx="2"
        transform="rotate(6 27 21)"
        stroke="#3a3f47"
        strokeWidth="1.6"
        fill="#fff"
      />
      <line
        x1="22"
        y1="16"
        x2="32"
        y2="16"
        stroke="#3a3f47"
        strokeWidth="1.4"
        strokeLinecap="round"
        transform="rotate(6 27 21)"
      />
      <line
        x1="22"
        y1="20"
        x2="32"
        y2="20"
        stroke="#3a3f47"
        strokeWidth="1.4"
        strokeLinecap="round"
        transform="rotate(6 27 21)"
      />
      <line
        x1="22"
        y1="24"
        x2="29"
        y2="24"
        stroke="#3a3f47"
        strokeWidth="1.4"
        strokeLinecap="round"
        transform="rotate(6 27 21)"
      />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <circle cx="24" cy="24" r="13" stroke="#3a3f47" strokeWidth="1.8" />
      <path
        d="M24 16v9l6 4"
        stroke="#3a3f47"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSad() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <circle cx="24" cy="24" r="13" stroke="#3a3f47" strokeWidth="1.8" />
      <circle cx="19" cy="22" r="1.4" fill="#3a3f47" />
      <circle cx="29" cy="22" r="1.4" fill="#3a3f47" />
      <path
        d="M18 31c2-2 4-3 6-3s4 1 6 3"
        stroke="#3a3f47"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 19c1-1 3-2 4-2"
        stroke="#3a3f47"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M32 19c-1-1-3-2-4-2"
        stroke="#3a3f47"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ────────────────────────────── After SVG Icons ─────────────────────────────── */

function IconCheckSparkle() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <circle cx="24" cy="25" r="11" stroke="#2d6eff" strokeWidth="1.8" />
      <path
        d="M19 25l4 4 7-8"
        stroke="#2d6eff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M37 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#2d6eff" />
      <path
        d="M34 11l.6 1.4 1.4.6-1.4.6L34 15l-.6-1.4-1.4-.6 1.4-.6z"
        fill="#2d6eff"
      />
    </svg>
  );
}

function IconDocCheck() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <path
        d="M14 11h14l6 6v20a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z"
        stroke="#2d6eff"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M28 11v6h6"
        stroke="#2d6eff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M17 27l3 3 7-7"
        stroke="#2d6eff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChartUp() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <line
        x1="11"
        y1="37"
        x2="38"
        y2="37"
        stroke="#2d6eff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="28"
        width="5"
        height="9"
        rx="1"
        stroke="#2d6eff"
        strokeWidth="1.6"
      />
      <rect
        x="22"
        y="22"
        width="5"
        height="15"
        rx="1"
        stroke="#2d6eff"
        strokeWidth="1.6"
      />
      <rect
        x="30"
        y="16"
        width="5"
        height="21"
        rx="1"
        stroke="#2d6eff"
        strokeWidth="1.6"
      />
      <path
        d="M14 22l8-6 6 4 8-8"
        stroke="#2d6eff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M32 12h6v6"
        stroke="#2d6eff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 11l.6 1.4 1.4.6-1.4.6L11 15l-.6-1.4-1.4-.6 1.4-.6z"
        fill="#2d6eff"
      />
    </svg>
  );
}

function IconSmile() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-6 w-6">
      <circle cx="24" cy="24" r="13" stroke="#2d6eff" strokeWidth="1.8" />
      <circle cx="19" cy="22" r="1.6" fill="#2d6eff" />
      <circle cx="29" cy="22" r="1.6" fill="#2d6eff" />
      <path
        d="M18 27c2 3 4 4 6 4s4-1 6-4"
        stroke="#2d6eff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ────────────────────────────── Data ────────────────────────────────────────── */

const FONT_FAMILY =
  "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

interface ListItem {
  icon: React.ReactNode;
  text: string[];
}

const beforeItems: ListItem[] = [
  {
    icon: <IconTangle />,
    text: ["やることが多くて、", "何から手をつければ", "いいか分からない"],
  },
  {
    icon: <IconPapers />,
    text: ["ES作成・面接対策・", "締切管理がバラバラ"],
  },
  {
    icon: <IconClock />,
    text: ["情報収集や企業管理に", "時間がかかる"],
  },
  {
    icon: <IconSad />,
    text: ["面接前に不安が残り、", "自信が持ちづらい"],
  },
];

const afterItems: ListItem[] = [
  {
    icon: <IconCheckSparkle />,
    text: ["AIが次にやることを", "整理してくれる"],
  },
  {
    icon: <IconDocCheck />,
    text: ["ES・面接・締切を", "ひとつにまとめて", "管理できる"],
  },
  {
    icon: <IconChartUp />,
    text: ["企業情報や進捗が", "見やすくなり、", "効率的に進められる"],
  },
  {
    icon: <IconSmile />,
    text: ["練習と準備が整い、", "自信を持って", "本番に向かえる"],
  },
];

/* ────────────────────────────── Stage dimensions ────────────────────────────── */

const STAGE_W = 1200;
const STAGE_H = 600;

function MobileChangeCard({
  tone,
  label,
  image,
  imageAlt,
  items,
}: {
  tone: "before" | "after";
  label: string;
  image: string;
  imageAlt: string;
  items: ListItem[];
}) {
  const isAfter = tone === "after";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        background: "#fff",
        border: isAfter ? "2px solid rgba(45,110,255,0.22)" : "1px solid #e8ecf2",
        boxShadow: isAfter
          ? "0 14px 34px rgba(45,110,255,0.13)"
          : "0 12px 30px rgba(10,37,84,0.07)",
        padding: "18px 18px 20px",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          borderRadius: 22,
          background: isAfter ? "#2d6eff" : "#8a8f96",
          color: "#fff",
          fontSize: 15,
          fontWeight: 800,
          lineHeight: 1,
          padding: "8px 20px",
          marginBottom: 12,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "104px 1fr",
          alignItems: "end",
          gap: 12,
        }}
      >
        <img
          src={image}
          alt={imageAlt}
          style={{ width: 104, height: "auto", alignSelf: "end" }}
        />
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item, index) => (
            <div
              key={`${label}-${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "38px 1fr",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: isAfter ? "#eef5ff" : "#f2f3f5",
                }}
              >
                {item.icon}
              </span>
              <span
                style={{
                  color: isAfter ? "#113a8f" : "#3a3f47",
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {item.text.join("")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Component ───────────────────────────────────── */

export function BeforeAfterSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function updateScale() {
      if (!wrapper) return;
      const containerW = wrapper.clientWidth;
      const s = Math.min(containerW / STAGE_W, 1);
      setScale(s);
    }

    updateScale();

    const ro = new ResizeObserver(() => {
      updateScale();
    });
    ro.observe(wrapper);

    return () => {
      ro.disconnect();
    };
  }, []);

  return (
    <section
      id="before-after"
      style={{
        padding: "110px 0 140px",
        background: "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
        fontFamily: FONT_FAMILY,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
.before-after__mobile{display:none}
@media(max-width:767px){
  #before-after{padding:58px 0 76px!important}
  .before-after__desktop{display:none!important}
  .before-after__mobile{display:grid!important}
}
`,
        }}
      />
      {/* Heading image */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 48,
          padding: "0 20px",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(34px, 5.2vw, 46px)",
            fontWeight: 800,
            color: "#0d1f3a",
            letterSpacing: "0.02em",
            lineHeight: 1.3,
            margin: 0,
            display: "inline-block",
            position: "relative",
          }}
        >
          就活Passで、ここまで
          <span style={{ color: "#2d6eff" }}>変わる。</span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -8,
              right: -40,
              width: 36,
              height: 36,
            }}
          >
            <span style={{ position: "absolute", width: 12, height: 2, background: "#2d6eff", borderRadius: 2, top: 6, left: 6, transform: "rotate(-30deg)" }} />
            <span style={{ position: "absolute", width: 14, height: 2, background: "#2d6eff", borderRadius: 2, top: 0, left: 16, transform: "rotate(-70deg)" }} />
            <span style={{ position: "absolute", width: 12, height: 2, background: "#2d6eff", borderRadius: 2, top: 10, left: 22, transform: "rotate(20deg)" }} />
          </span>
        </h2>
      </div>

      <div
        className="before-after__mobile"
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding: "0 18px",
          gap: 16,
        }}
      >
        <MobileChangeCard
          tone="before"
          label="Before"
          image={lpSectionAsset("before-after/person-worried.png")}
          imageAlt="やることが多くて悩む学生"
          items={beforeItems}
        />
        <MobileChangeCard
          tone="after"
          label="After"
          image={lpSectionAsset("before-after/person-cheerful.png")}
          imageAlt="就活準備が整って前向きな学生"
          items={afterItems}
        />
      </div>

      {/* Stage wrapper */}
      <div
        ref={wrapperRef}
        className="before-after__desktop"
        style={{
          width: "100%",
          maxWidth: STAGE_W,
          margin: "0 auto",
          padding: "0 20px",
        }}
      >
        <div
          style={{
            width: STAGE_W,
            height: STAGE_H,
            position: "relative",
            transformOrigin: "top center",
            transform: `scale(${scale})`,
          }}
        >
          {/* Before panel */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 530,
              height: 510,
              borderRadius: 22,
              background: "#fff",
              border: "1px solid #e8ecf2",
              boxShadow: "0 12px 36px rgba(10,37,84,0.06)",
              overflow: "hidden",
            }}
          >
            {/* Badge */}
            <span
              style={{
                position: "absolute",
                top: 18,
                left: 18,
                padding: "7px 22px",
                borderRadius: 22,
                fontWeight: 700,
                fontSize: 17,
                color: "#fff",
                background: "#8a8f96",
                zIndex: 2,
              }}
            >
              Before
            </span>

            {/* Illustration */}
            <img
              src={lpSectionAsset("before-after/person-worried.png")}
              alt="やることが多くて悩む学生"
              style={{
                position: "absolute",
                bottom: 0,
                left: -18,
                width: 300,
                height: "auto",
                zIndex: 1,
              }}
            />

            {/* List */}
            <div
              style={{
                position: "absolute",
                top: 74,
                right: 28,
                bottom: 28,
                left: 258,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {beforeItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "15px 0",
                    borderBottom:
                      i < beforeItems.length - 1
                        ? "1px solid #eef0f4"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "#f1f2f5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      lineHeight: 1.45,
                      color: "#2a2e35",
                    }}
                  >
                    {item.text.map((line, li) => (
                      <span key={li}>
                        {line}
                        {li < item.text.length - 1 && <br />}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* After panel */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: 530,
              height: 510,
              borderRadius: 22,
              background: "linear-gradient(180deg, #fff 0%, #f4f9ff 100%)",
              border: "1px solid #d6e6ff",
              boxShadow: "0 12px 36px rgba(45,110,255,0.10)",
              overflow: "hidden",
            }}
          >
            {/* Badge */}
            <span
              style={{
                position: "absolute",
                top: 18,
                left: 18,
                padding: "7px 22px",
                borderRadius: 22,
                fontWeight: 700,
                fontSize: 17,
                color: "#fff",
                background: "#2d6eff",
                boxShadow: "0 4px 10px rgba(45,110,255,0.25)",
                zIndex: 2,
              }}
            >
              After
            </span>

            {/* Illustration */}
            <img
              src={lpSectionAsset("before-after/person-cheerful.png")}
              alt="自信を持って準備を進める学生"
              style={{
                position: "absolute",
                bottom: 0,
                left: -18,
                width: 300,
                height: "auto",
                zIndex: 1,
              }}
            />

            {/* List */}
            <div
              style={{
                position: "absolute",
                top: 74,
                right: 28,
                bottom: 28,
                left: 258,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {afterItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "15px 0",
                    borderBottom:
                      i < afterItems.length - 1
                        ? "1px solid #e2ecff"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "#e8f0ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      lineHeight: 1.45,
                      color: "#2d6eff",
                    }}
                  >
                    {item.text.map((line, li) => (
                      <span key={li}>
                        {line}
                        {li < item.text.length - 1 && <br />}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Center arrow */}
          <svg
            viewBox="0 0 120 60"
            fill="none"
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 206,
              left: "50%",
              transform: "translateX(-50%)",
              width: 180,
              height: "auto",
              zIndex: 3,
            }}
          >
            <defs>
              <linearGradient id="ba-arrow-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6aa9ff" />
                <stop offset="100%" stopColor="#2d6eff" />
              </linearGradient>
            </defs>
            <path
              d="M10 30 H90 L75 12 M90 30 L75 48"
              stroke="url(#ba-arrow-grad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Center bottom mockup */}
          <img
            src={lpSectionAsset("before-after/product-mockup.png")}
            alt=""
            role="presentation"
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 380,
              height: "auto",
              zIndex: 3,
            }}
          />

          {/* Sparkles */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 142,
              left: 532,
              fontSize: 22,
              color: "#4a90ff",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            &#10022;
          </span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 286,
              left: 646,
              fontSize: 26,
              color: "#4a90ff",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            &#10022;
          </span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 430,
              left: 546,
              fontSize: 18,
              color: "#4a90ff",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            &#10022;
          </span>
        </div>

        {/* Collapsed height to match scaled stage */}
        <div
          style={{
            height: STAGE_H * scale,
            marginTop: -STAGE_H,
          }}
        />
      </div>

      {/* Footer image */}
      <div
        style={{
          textAlign: "center",
          marginTop: -12,
          padding: "0 20px",
        }}
      >
        <p
          style={{
            fontSize: "clamp(18px, 3vw, 23px)",
            fontWeight: 800,
            color: "#0d1f3a",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          就活の準備を、<span style={{ color: "#2d6eff" }}>迷わず・着実に進める</span>ためのオールインワン。
        </p>
      </div>

      {/* Wave SVG decoration */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          lineHeight: 0,
        }}
      >
        <svg
          viewBox="0 0 1440 130"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <path
            d="M0 90 C 180 30, 320 80, 480 70 S 760 40, 920 80 1240 100, 1440 60 L1440 130 L0 130 Z"
            fill="#e2ecff"
            opacity="0.55"
          />
          <path
            d="M0 100 C 200 70, 380 110, 560 95 S 820 70, 1000 100 1280 120, 1440 90 L1440 130 L0 130 Z"
            fill="#cfdcf7"
            opacity="0.35"
          />
          <path
            d="M0 70 C 200 30, 380 90, 600 70 S 1000 40, 1240 80 1380 70, 1440 65"
            fill="none"
            stroke="#7aa3ef"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M0 88 C 220 60, 420 100, 640 86 S 1040 70, 1280 96 1400 88, 1440 84"
            fill="none"
            stroke="#9bb8eb"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle cx="120" cy="58" r="5" fill="#4a90ff" />
          <circle cx="220" cy="78" r="8" fill="#4a90ff" />
          <circle cx="560" cy="92" r="5" fill="#4a90ff" />
          <circle cx="820" cy="74" r="3.5" fill="#7aa3ef" />
          <circle cx="1180" cy="80" r="6" fill="#4a90ff" />
          <circle cx="1320" cy="68" r="4" fill="#7aa3ef" />
          <circle cx="1410" cy="66" r="5" fill="#4a90ff" />
        </svg>
      </div>
    </section>
  );
}
