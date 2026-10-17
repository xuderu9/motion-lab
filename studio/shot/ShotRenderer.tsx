// 镜头渲染器 —— 一个镜头 = 一份 JSON。
//
//   <ShotRenderer spec={shot} />
//   ├─ <EnvLayer />      环境层：即梦背景板（静帧，可烘焙）
//   ├─ <ScreenLayer />   内容层：单应变换 + 实时画布
//   └─ <OverlayLayer />  强调层：扁平矢量文字
//
// 三层各自独立可替换，是 M6 烘焙（把不变的部分预渲染成序列）的前提。

import React from "react";
import { AbsoluteFill, Composition, useVideoConfig } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { EnvLayer } from "./EnvLayer";
import { OverlayLayer } from "./OverlayLayer";
import { ScreenLayer } from "./ScreenLayer";
import { getTheme } from "./themes";
import type { ShotSpec } from "./types";
import { FRAME_H, FRAME_W } from "./types";
import { quadCenter } from "./homography";
import { defineDemoShots } from "../shots/demo";

export type ShotProps = { spec: ShotSpec };

export const ShotRenderer: React.FC<ShotProps> = ({ spec }) => {
  const theme = getTheme(spec.theme);
  const { width, height } = useVideoConfig();
  const [cx, cy] = quadCenter(spec.env.quad);

  return (
    <AbsoluteFill style={{ background: "#05080d" }}>
      {/* 环境层 */}
      <EnvLayer env={spec.env} />

      {/* 内容层 */}
      <ScreenLayer spec={spec} theme={theme} />

      {/* 屏幕外溢的冷光：让 UI 和背景板发生关系（位置从 quad 中心推） */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 46% 40% at ${(cx / FRAME_W) * 100}% ${(cy / FRAME_H) * 100}%, rgba(90,140,220,0.10) 0%, rgba(90,140,220,0.03) 45%, rgba(0,0,0,0) 72%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
          width,
          height,
        }}
      />

      {/* 强调层 */}
      <OverlayLayer spec={spec} />
    </AbsoluteFill>
  );
};

/**
 * 从 spec 推出合成参数。
 *
 * 这样「一条命令渲 3 个镜头」成为可能：时长、帧率都由 JSON 决定，
 * 不需要为每个镜头手写一个 <Composition>。
 */
const calculateShotMetadata: CalculateMetadataFunction<ShotProps> = ({ props }) => {
  return {
    durationInFrames: props.spec.durationInFrames,
    fps: props.spec.fps,
    width: FRAME_W,
    height: FRAME_H,
  };
};

const demo = defineDemoShots();

export const ShotRoot: React.FC = () => (
  <Composition
    id="Shot"
    component={ShotRenderer}
    calculateMetadata={calculateShotMetadata}
    defaultProps={{ spec: demo[0] }}
    durationInFrames={demo[0].durationInFrames}
    fps={demo[0].fps}
    width={FRAME_W}
    height={FRAME_H}
  />
);
