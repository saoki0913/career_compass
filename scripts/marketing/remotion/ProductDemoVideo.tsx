import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { ProductDemoSegment } from "../../../src/lib/marketing/product-demo-config";

export type ProductDemoRenderSegment = ProductDemoSegment & {
  src: string;
};

export type ProductDemoVideoProps = {
  segments: ProductDemoRenderSegment[];
};

const shellStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 30,
  border: "1px solid rgba(255, 255, 255, 0.65)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 42px 120px -60px rgba(15,23,42,0.42)",
  inset: 24,
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: 38,
  padding: "0 20px",
  borderBottom: "1px solid rgba(226,232,240,0.7)",
  background: "#020617",
  color: "rgba(226,232,240,0.8)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
};

const dotColors = ["#FF5F56", "#FFBD2E", "#27C93F"];

function SegmentLabel({ label, durationInFrames }: { label: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeDuration = Math.min(Math.floor(fps * 0.35), Math.floor(durationInFrames / 4));
  const opacity = interpolate(
    frame,
    [0, fadeDuration, durationInFrames - fadeDuration, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 72,
        left: 52,
        opacity,
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 9999,
          padding: "10px 18px",
          background: "rgba(15, 23, 42, 0.82)",
          color: "white",
          backdropFilter: "blur(14px)",
          boxShadow: "0 18px 48px -24px rgba(15,23,42,0.6)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: "#3b82f6",
          }}
        />
        <span
          style={{
            fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

function SegmentVideo({ src, durationInFrames }: { src: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const presence = spring({
    fps,
    frame,
    config: {
      damping: 200,
      stiffness: 100,
      mass: 0.6,
    },
  });

  const scale = interpolate(presence, [0, 1], [1.035, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(
    frame,
    [0, Math.floor(fps * 0.25), durationInFrames - Math.floor(fps * 0.2), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <OffthreadVideo
      src={src}
      muted
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "top center",
        transform: `scale(${scale})`,
        opacity,
      }}
    />
  );
}

export function ProductDemoVideo({ segments }: ProductDemoVideoProps) {
  const sequences = segments.reduce<Array<React.ReactNode>>((items, segment, index) => {
    const from = segments
      .slice(0, index)
      .reduce((total, item) => total + item.durationInFrames, 0);

    items.push(
      <Sequence key={segment.id} from={from} durationInFrames={segment.durationInFrames}>
        <AbsoluteFill>
          <SegmentVideo
            src={segment.src}
            durationInFrames={segment.durationInFrames}
          />
          <SegmentLabel
            label={segment.label}
            durationInFrames={segment.durationInFrames}
          />
        </AbsoluteFill>
      </Sequence>,
    );

    return items;
  }, []);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at top, rgba(63,114,255,0.16), transparent 34%), radial-gradient(circle at 85% 20%, rgba(148,163,184,0.16), transparent 26%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)",
      }}
    >
      <div style={shellStyle}>
        <div style={topBarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dotColors.map((color) => (
              <span
                key={color}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 9999,
                  background: color,
                }}
              />
            ))}
          </div>
          <span>Shukatsu Pass</span>
        </div>

        <div
          style={{
            position: "absolute",
            inset: "38px 0 0 0",
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(238,244,255,1) 0%, rgba(248,251,255,1) 100%)",
          }}
        >
          {sequences}
        </div>
      </div>
    </AbsoluteFill>
  );
}
