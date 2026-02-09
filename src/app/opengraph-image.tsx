import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(1000px 500px at 20% 20%, rgba(59,130,246,0.20), transparent), radial-gradient(900px 500px at 80% 80%, rgba(16,185,129,0.18), transparent), #0b0f17",
          color: "white",
          padding: 64,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 32,
            padding: 56,
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              U
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.2 }}>
              ウカルン
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: -1.2, lineHeight: 1.05 }}>
              ESも締切も、
              <br />
              AIが見逃さない。
            </div>
            <div style={{ fontSize: 26, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
              AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, fontSize: 20, color: "rgba(255,255,255,0.78)" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              締切管理
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              ES添削
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              ガクチカ深掘り
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

