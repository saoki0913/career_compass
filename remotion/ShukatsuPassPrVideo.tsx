import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
export const DURATION_IN_FRAMES = 30 * FPS;

const colors = {
  blue: "#0b7fe8",
  cta: "#b7131a",
  ink: "#071432",
  muted: "#5f6b7a",
  navy: "#000666",
  page: "#f6f9fc",
  softBlue: "#eaf5ff",
  white: "#ffffff",
};

const assets = {
  calendar: staticFile("/marketing/LP/screenshots/calendar.png"),
  esReview: staticFile("/marketing/LP/screenshots/es-review.png"),
  featureFlow: staticFile("/marketing/LP/assets/flow/create-prepare-manage.png"),
  heroDashboard: staticFile("/marketing/LP/screenshots/hero-dashboard.png"),
  laptopMockup: staticFile("/marketing/LP/assets/mockups/laptop-dashboard.png"),
  logo: staticFile("/marketing/LP/screenshots/logo-icon.png"),
  mobileMockup: staticFile("/marketing/LP/assets/mockups/mobile-app-colorful.png"),
  motivation: staticFile("/marketing/LP/screenshots/motivation.png"),
  painEs: staticFile("/marketing/LP/assets/pain-cards/pain-es-barabara.png"),
};

const fontFamily =
  '"Inter", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "YuGothic", system-ui, sans-serif';

function clamp(input: number, inputRange: [number, number], outputRange: [number, number]) {
  return interpolate(input, inputRange, outputRange, {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function useSceneEntrance() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    fps,
    frame,
    config: {
      damping: 24,
      mass: 0.9,
      stiffness: 120,
    },
  });

  return {
    opacity: clamp(frame, [0, 12], [0, 1]),
    progress,
    translateY: interpolate(progress, [0, 1], [26, 0]),
  };
}

function AmbientBackground() {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${colors.white} 0%, #eef7ff 100%)` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 78% 16%, rgba(11, 127, 232, 0.12), transparent 28%), radial-gradient(circle at 14% 84%, rgba(0, 6, 102, 0.08), transparent 30%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 76,
          height: 2,
          left: -120,
          opacity: 0.36,
          right: -120,
          transform: "rotate(-3deg)",
          background:
            "linear-gradient(90deg, transparent, rgba(11, 127, 232, 0.4), rgba(11, 127, 232, 0.08), transparent)",
        }}
      />
    </AbsoluteFill>
  );
}

function Caption({
  children,
  fontSize = 68,
  kicker,
  lineHeight = 1.16,
  style,
}: {
  children: ReactNode;
  fontSize?: number;
  kicker?: string;
  lineHeight?: number;
  style?: CSSProperties;
}) {
  const { opacity, translateY } = useSceneEntrance();

  return (
    <div
      style={{
        color: colors.navy,
        fontFamily,
        opacity,
        transform: `translateY(${translateY}px)`,
        ...style,
      }}
    >
      {kicker ? (
        <div
          style={{
            color: colors.blue,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 0,
            marginBottom: 20,
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontSize,
          fontWeight: 800,
          letterSpacing: 0,
          lineHeight,
          whiteSpace: "pre-line",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ScreenshotCard({
  children,
  height,
  style,
  width,
}: {
  children: ReactNode;
  height: number;
  style?: CSSProperties;
  width: number;
}) {
  return (
    <div
      style={{
        background: colors.white,
        border: "1px solid rgba(163, 190, 219, 0.48)",
        borderRadius: 28,
        boxShadow: "0 30px 90px rgba(14, 47, 84, 0.16)",
        height,
        overflow: "hidden",
        position: "relative",
        width,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ImageFill({
  objectFit = "cover",
  objectPosition = "center",
  src,
  transform,
}: {
  objectFit?: CSSProperties["objectFit"];
  objectPosition?: CSSProperties["objectPosition"];
  src: string;
  transform?: string;
}) {
  return (
    <Img
      src={src}
      style={{
        height: "100%",
        objectFit,
        objectPosition,
        transform,
        width: "100%",
      }}
    />
  );
}

function BrandOpen() {
  const frame = useCurrentFrame();
  const logoScale = clamp(frame, [0, 24], [0.86, 1]);
  const subtitleOpacity = clamp(frame, [18, 36], [0, 1]);

  return (
    <AbsoluteFill>
      <AmbientBackground />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          inset: 0,
          justifyContent: "center",
          position: "absolute",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 30,
            transform: `scale(${logoScale})`,
          }}
        >
          <Img src={assets.logo} style={{ height: 126, width: 126 }} />
          <div style={{ color: colors.ink, fontFamily, fontSize: 86, fontWeight: 800, letterSpacing: 0 }}>
            就活Pass
          </div>
        </div>
        <div
          style={{
            color: colors.navy,
            fontFamily,
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: 0,
            marginTop: 48,
            opacity: subtitleOpacity,
          }}
        >
          散らばる就活を、ひとつずつ前へ。
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ProblemScene() {
  const frame = useCurrentFrame();
  const imageX = clamp(frame, [0, 24], [-70, 0]);
  const imageOpacity = clamp(frame, [0, 16], [0, 1]);

  return (
    <AbsoluteFill style={{ background: colors.page }}>
      <ScreenshotCard
        height={760}
        style={{
          left: 92,
          opacity: imageOpacity,
          position: "absolute",
          top: 160,
          transform: `translateX(${imageX}px)`,
        }}
        width={940}
      >
        <ImageFill objectFit="contain" objectPosition="center" src={assets.painEs} transform="scale(1.06)" />
        <div style={{ background: "rgba(255, 255, 255, 0.18)", inset: 0, position: "absolute" }} />
      </ScreenshotCard>
      <Caption fontSize={56} style={{ left: 1015, position: "absolute", top: 292, width: 880 }}>
        {"ES、志望動機、締切。\n就活は、やることが多すぎる。"}
      </Caption>
    </AbsoluteFill>
  );
}

function PromiseScene() {
  const frame = useCurrentFrame();
  const laptopScale = clamp(frame, [0, 120], [0.94, 1]);
  const mobileY = clamp(frame, [16, 60], [34, 0]);

  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${colors.white}, #eef7ff)` }}>
      <Caption style={{ left: 110, position: "absolute", top: 310, width: 800 }}>
        {"就活を、AIと一緒に\n迷わず進める。"}
      </Caption>
      <Img
        src={assets.laptopMockup}
        style={{
          height: 760,
          objectFit: "contain",
          position: "absolute",
          right: 90,
          top: 210,
          transform: `scale(${laptopScale})`,
          width: 980,
        }}
      />
      <Img
        src={assets.mobileMockup}
        style={{
          height: 500,
          objectFit: "contain",
          opacity: clamp(frame, [18, 44], [0, 1]),
          position: "absolute",
          right: 120,
          top: 430,
          transform: `translateY(${mobileY}px)`,
          width: 250,
        }}
      />
    </AbsoluteFill>
  );
}

function WorkspaceScene() {
  const frame = useCurrentFrame();
  const pan = clamp(frame, [0, 150], [0, -58]);
  const scale = clamp(frame, [0, 150], [1.02, 1.08]);

  return (
    <AbsoluteFill style={{ background: colors.white }}>
      <Caption fontSize={54} kicker="Workspace" style={{ left: 92, position: "absolute", top: 96, width: 760 }}>
        {"書くことも、管理することも、\n同じ流れで。"}
      </Caption>
      <ScreenshotCard height={690} style={{ bottom: 70, left: 470, position: "absolute" }} width={1310}>
        <ImageFill objectPosition="center top" src={assets.heroDashboard} transform={`translateY(${pan}px) scale(${scale})`} />
      </ScreenshotCard>
      <FeaturePill left={112} top={760}>
        企業・ES・締切をまとめて確認
      </FeaturePill>
    </AbsoluteFill>
  );
}

function FeaturePill({ children, left, top }: { children: ReactNode; left: number; top: number }) {
  const frame = useCurrentFrame();
  const opacity = clamp(frame, [20, 42], [0, 1]);
  const y = clamp(frame, [20, 42], [18, 0]);

  return (
    <div
      style={{
        background: colors.softBlue,
        border: "1px solid rgba(11, 127, 232, 0.24)",
        borderRadius: 999,
        color: colors.blue,
        fontFamily,
        fontSize: 28,
        fontWeight: 700,
        left,
        letterSpacing: 0,
        opacity,
        padding: "18px 28px",
        position: "absolute",
        top,
        transform: `translateY(${y}px)`,
      }}
    >
      {children}
    </div>
  );
}

function EsReviewScene() {
  const frame = useCurrentFrame();
  const x = clamp(frame, [0, 120], [-120, -190]);
  const scale = clamp(frame, [0, 120], [1.06, 1.14]);

  return (
    <ProductScene
      copy="改善点と書き換え案を、その場で確認。"
      kicker="ES添削"
      pill="企業情報を踏まえた添削にも対応"
    >
      <ImageFill src={assets.esReview} transform={`translateX(${x}px) scale(${scale})`} />
      <HighlightBox height={470} left={730} top={125} width={660} />
    </ProductScene>
  );
}

function MotivationScene() {
  const frame = useCurrentFrame();
  const y = clamp(frame, [0, 105], [-30, -95]);
  const scale = clamp(frame, [0, 105], [1.05, 1.12]);

  return (
    <ProductScene
      copy="対話しながら、自分の言葉に整理。"
      kicker="志望動機・ガクチカ"
      pill="質問に答えるだけで材料がまとまる"
    >
      <ImageFill objectPosition="center top" src={assets.motivation} transform={`translateY(${y}px) scale(${scale})`} />
      <HighlightBox height={430} left={870} top={135} width={380} />
    </ProductScene>
  );
}

function CalendarScene() {
  const frame = useCurrentFrame();
  const y = clamp(frame, [0, 90], [-20, -72]);
  const scale = clamp(frame, [0, 90], [1.03, 1.1]);

  return (
    <ProductScene copy="企業ごとの締切を、見落としにくく。" kicker="締切管理" pill="Googleカレンダー連携にも対応">
      <ImageFill objectPosition="center top" src={assets.calendar} transform={`translateY(${y}px) scale(${scale})`} />
      <HighlightBox height={210} left={1000} top={250} width={280} />
    </ProductScene>
  );
}

function ProductScene({
  children,
  copy,
  kicker,
  pill,
}: {
  children: ReactNode;
  copy: string;
  kicker: string;
  pill: string;
}) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${colors.white}, ${colors.page})` }}>
      <Caption kicker={kicker} style={{ left: 92, position: "absolute", top: 92, width: 840 }}>
        {copy}
      </Caption>
      <ScreenshotCard height={680} style={{ bottom: 70, left: 150, position: "absolute" }} width={1620}>
        {children}
      </ScreenshotCard>
      <FeaturePill left={112} top={875}>
        {pill}
      </FeaturePill>
    </AbsoluteFill>
  );
}

function HighlightBox({ height, left, top, width }: { height: number; left: number; top: number; width: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [16, 30, 86, 104], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        border: `6px solid ${colors.blue}`,
        borderRadius: 28,
        boxShadow: "0 0 0 999px rgba(255, 255, 255, 0.22)",
        height,
        left,
        opacity,
        position: "absolute",
        top,
        width,
      }}
    />
  );
}

function FeatureSummaryScene() {
  const frame = useCurrentFrame();
  const x = clamp(frame, [0, 75], [0, -130]);

  return (
    <AbsoluteFill style={{ background: colors.white }}>
      <ScreenshotCard height={730} style={{ left: 150, position: "absolute", top: 185 }} width={1620}>
        <ImageFill objectFit="contain" objectPosition="center center" src={assets.featureFlow} transform={`translateX(${x}px) scale(1.08)`} />
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.48))",
            inset: 0,
            position: "absolute",
          }}
        />
      </ScreenshotCard>
      <Caption fontSize={54} style={{ left: 150, position: "absolute", top: 92, width: 1600 }}>
        ES添削 / 志望動機 / ガクチカ / 面接対策 / 締切管理
      </Caption>
    </AbsoluteFill>
  );
}

function FinalCtaScene() {
  const frame = useCurrentFrame();
  const ctaScale = clamp(frame, [24, 48], [0.92, 1]);

  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <div
        style={{
          background:
            "radial-gradient(circle at 72% 28%, rgba(72, 165, 255, 0.24), transparent 30%), radial-gradient(circle at 24% 72%, rgba(255,255,255,0.11), transparent 28%)",
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 24,
          left: 120,
          position: "absolute",
          top: 98,
        }}
      >
        <Img src={assets.logo} style={{ height: 72, width: 72 }} />
        <div style={{ color: colors.white, fontFamily, fontSize: 44, fontWeight: 800, letterSpacing: 0 }}>
          就活Pass
        </div>
      </div>
      <div
        style={{
          color: colors.white,
          fontFamily,
          fontSize: 78,
          fontWeight: 800,
          left: 120,
          letterSpacing: 0,
          lineHeight: 1.16,
          position: "absolute",
          top: 315,
          whiteSpace: "pre-line",
        }}
      >
        {"就活を、迷わず\n続けられる状態へ。"}
      </div>
      <div
        style={{
          background: colors.cta,
          borderRadius: 22,
          boxShadow: "0 24px 70px rgba(183, 19, 26, 0.34)",
          color: colors.white,
          fontFamily,
          fontSize: 42,
          fontWeight: 800,
          left: 120,
          letterSpacing: 0,
          padding: "26px 46px",
          position: "absolute",
          top: 660,
          transform: `scale(${ctaScale})`,
          transformOrigin: "left center",
        }}
      >
        無料で始める
      </div>
      <ScreenshotCard height={610} style={{ position: "absolute", right: 120, top: 240 }} width={890}>
        <ImageFill objectPosition="center top" src={assets.heroDashboard} transform="scale(1.08)" />
      </ScreenshotCard>
    </AbsoluteFill>
  );
}

export const ShukatsuPassPrVideo = () => {
  return (
    <AbsoluteFill style={{ background: colors.white }}>
      <Sequence durationInFrames={75} from={0}>
        <BrandOpen />
      </Sequence>
      <Sequence durationInFrames={105} from={75}>
        <ProblemScene />
      </Sequence>
      <Sequence durationInFrames={120} from={180}>
        <PromiseScene />
      </Sequence>
      <Sequence durationInFrames={150} from={300}>
        <WorkspaceScene />
      </Sequence>
      <Sequence durationInFrames={120} from={450}>
        <EsReviewScene />
      </Sequence>
      <Sequence durationInFrames={105} from={570}>
        <MotivationScene />
      </Sequence>
      <Sequence durationInFrames={90} from={675}>
        <CalendarScene />
      </Sequence>
      <Sequence durationInFrames={75} from={765}>
        <FeatureSummaryScene />
      </Sequence>
      <Sequence durationInFrames={60} from={840}>
        <FinalCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
