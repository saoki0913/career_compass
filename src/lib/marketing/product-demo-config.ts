export const HERO_PRODUCT_DEMO_VIDEO_PATH = "/marketing/videos/product-demo.mp4";

export const PRODUCT_DEMO_VIDEO_WIDTH = 1440;
export const PRODUCT_DEMO_VIDEO_HEIGHT = 900;
export const PRODUCT_DEMO_FRAME_RATE = 30;

export type ProductDemoSegment = {
  id: string;
  label: string;
  captureTestName: string;
  durationInFrames: number;
};

export const PRODUCT_DEMO_SEGMENTS: ProductDemoSegment[] = [
  {
    id: "company-register",
    label: "企業を追加",
    captureTestName: "01-demo-company-register",
    durationInFrames: 4 * PRODUCT_DEMO_FRAME_RATE,
  },
  {
    id: "company-import",
    label: "企業情報を取得",
    captureTestName: "02-demo-company-import",
    durationInFrames: 5 * PRODUCT_DEMO_FRAME_RATE,
  },
  {
    id: "es-create",
    label: "ESを作成",
    captureTestName: "03-demo-es-create",
    durationInFrames: 5 * PRODUCT_DEMO_FRAME_RATE,
  },
  {
    id: "es-review",
    label: "ESを添削",
    captureTestName: "04-demo-es-review",
    durationInFrames: 8 * PRODUCT_DEMO_FRAME_RATE,
  },
];

export const PRODUCT_DEMO_TOTAL_FRAMES = PRODUCT_DEMO_SEGMENTS.reduce(
  (total, segment) => total + segment.durationInFrames,
  0,
);
