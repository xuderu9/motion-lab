import React from "react";
import { Composition } from "remotion";
import { VideoRenderer } from "./VideoRenderer";
import { VideoSpecSchema } from "./schema/video-spec";
import demoSpec from "./data/demo-spec.json";

export const RemotionRoot: React.FC = () => {
  // 验证 spec
  const parsed = VideoSpecSchema.safeParse(demoSpec);
  if (!parsed.success) {
    console.error("Invalid video spec:", parsed.error);
  }

  const spec = parsed.success ? parsed.data : demoSpec;
  const durationInFrames = Math.round(spec.duration * spec.fps);

  return (
    <>
      <Composition
        id="DemoVideo"
        component={VideoRenderer}
        durationInFrames={durationInFrames}
        fps={spec.fps}
        width={spec.resolution.width}
        height={spec.resolution.height}
        defaultProps={{ spec }}
        schema={VideoSpecSchema}
      />
    </>
  );
};
