import { Composition } from "remotion";
import { DURATION_IN_FRAMES, FPS, ShukatsuPassPrVideo } from "./ShukatsuPassPrVideo";

export const RemotionRoot = () => {
  return (
    <Composition
      component={ShukatsuPassPrVideo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      height={1080}
      id="ShukatsuPassPrVideo"
      width={1920}
    />
  );
};
