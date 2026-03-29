import React from "react";
import { Composition } from "remotion";

import {
  PRODUCT_DEMO_FRAME_RATE,
  PRODUCT_DEMO_SEGMENTS,
  PRODUCT_DEMO_TOTAL_FRAMES,
  PRODUCT_DEMO_VIDEO_HEIGHT,
  PRODUCT_DEMO_VIDEO_WIDTH,
} from "../../../src/lib/marketing/product-demo-config";
import { ProductDemoVideo, type ProductDemoVideoProps } from "./ProductDemoVideo";

const defaultProps: ProductDemoVideoProps = {
  segments: PRODUCT_DEMO_SEGMENTS.map((segment) => ({
    ...segment,
    src: "",
  })),
};

export function RemotionRoot() {
  return (
    <Composition<ProductDemoVideoProps>
      id="ProductDemo"
      component={ProductDemoVideo}
      durationInFrames={PRODUCT_DEMO_TOTAL_FRAMES}
      fps={PRODUCT_DEMO_FRAME_RATE}
      width={PRODUCT_DEMO_VIDEO_WIDTH}
      height={PRODUCT_DEMO_VIDEO_HEIGHT}
      defaultProps={defaultProps}
    />
  );
}
