import React from "react";
import { Composition } from "remotion";
import { VideoRenderer } from "./VideoRenderer";
import { VideoSpecSchema } from "./schema/video-spec";
import type { VideoSpecInput } from "./schema/video-spec";
import rawDemoSpec from "./data/demo-spec.json";

/**
 * JSON 里的 "push-in" / "spring" 会被 TS 推断成 string，
 * 这里收窄成 schema 的输入类型。
 */
const demoSpec = rawDemoSpec as unknown as VideoSpecInput;

export const RemotionRoot: React.FC = () => {
  // 用 schema 解析（补齐默认值），失败时回退到原始 JSON，保证 Studio 仍能打开
  const parsed = VideoSpecSchema.safeParse(demoSpec);
  if (!parsed.success) {
    console.error("Invalid video spec:", parsed.error);
  }

  const spec = parsed.success ? parsed.data : null;
  if (!spec) {
    return null;
  }

  const durationInFrames = Math.round(spec.duration * spec.fps);

  return (
    <Composition
      id="DemoVideo"
      component={VideoRenderer}
      durationInFrames={durationInFrames}
      fps={spec.fps}
      width={spec.resolution.width}
      height={spec.resolution.height}
      defaultProps={demoSpec}
      schema={VideoSpecSchema}
    />
  );
};
