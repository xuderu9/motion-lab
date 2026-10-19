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
import { ScreenLayer, FULL_SIZE, SCREEN_SIZE, screenTransform } from "./ScreenLayer";
import { getTheme } from "./themes";
import type { ShotSpec } from "./types";
import { CANVAS_H, CANVAS_W, FRAME_H, FRAME_W } from "./types";
import { homographyMatrix3d, quadCenter } from "./homography";
import { defineDemoShots } from "../shots/demo";

export type ShotProps = { spec: ShotSpec };

/**
 * 天生按 size 参数绘制的新版式（M5）。
 * 其余版式按 1600×1200 硬写，整帧模式下走「等比覆盖」适配。
 */
const SIZE_AWARE = new Set(["title", "stat", "quote", "atmosphere", "page", "panel", "mix", "space"]);

export const ShotRenderer: React.FC<ShotProps> = ({ spec }) => {
  const theme = getTheme(spec.theme);
  const { width, height } = useVideoConfig();
  const [cx, cy] = quadCenter(spec.env.quad);
  const presentation = spec.presentation ?? "screen";

  // ── full：整帧。不贴背景板，画布就是画面本身 ──
  // 参考片里 ~40% 是这一类（全屏图表/表格/文档/浏览器），
  // ~30% 是纯氛围/大字卡。所以这是「默认呈现方式」，screen 反而是特例。
  if (presentation === "full") {
    // 新版式天生按 1920×1080 设计，直接用整帧尺寸；
    // 老版式（doc/chart/...）是按 1600×1200 硬写的，若直接铺进 16:9 会被裁掉底部，
    // 所以先按「等比覆盖」缩放：scale=1.2 得 1920×1440，再上下各裁 180。
    // 这点裁切落在版式的上下留白里，实测不伤内容。
    const sized = SIZE_AWARE.has(spec.layout);
    // 等比**容纳**（contain），不是覆盖：覆盖会把版式的标题裁掉（实测顶部被切）。
    // 容纳后左右各留 240px 主题色边距，读起来像安全边距，不丢内容。
    const fit = Math.min(FRAME_W / CANVAS_W, FRAME_H / CANVAS_H);
    const dx = (FRAME_W - CANVAS_W * fit) / 2;
    return (
      <AbsoluteFill style={{ background: theme.bg[1] }}>
        <ScreenLayer
          spec={spec}
          theme={theme}
          size={sized ? FULL_SIZE : SCREEN_SIZE}
          transform={sized ? undefined : `translate(${dx}px, 0px) scale(${fit})`}
        />
        <OverlayLayer spec={spec} />
      </AbsoluteFill>
    );
  }

  // ── overlay：即梦底板 + 透明内容层（推荐的默认形态）──
  // 底板的质感、光效、景深全部来自即梦，canvas 只画卡片和文字。
  // 这样背景不再是「我用渐变糊出来的」，而是真的画面。
  if (presentation === "overlay") {
    return (
      <AbsoluteFill style={{ background: "#05070b" }}>
        <EnvLayer env={spec.env} />
        <ScreenLayer spec={spec} theme={theme} size={FULL_SIZE} transparent />
        <OverlayLayer spec={spec} />
      </AbsoluteFill>
    );
  }

  // ── plate：深色底 + 悬浮卡片（参考片「实拍底片 + 卡片」的简化版）──
  if (presentation === "plate") {
    const pad = 132;
    const cw = FRAME_W - pad * 2;
    const ch = Math.round(cw * (CANVAS_H / CANVAS_W));
    const top = Math.round((FRAME_H - ch) / 2);
    const quad: [number, number][] = [
      [pad, top],
      [pad + cw, top],
      [pad + cw, top + ch],
      [pad, top + ch],
    ];
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 90% 80% at 50% 42%, ${theme.bg[0]} 0%, ${theme.bg[1]} 55%, #05070b 100%)`,
        }}
      >
        <ScreenLayer spec={spec} theme={theme} transform={homographyMatrix3d(quad, CANVAS_W, CANVAS_H)} />
        <OverlayLayer spec={spec} />
      </AbsoluteFill>
    );
  }

  // ── screen：房间里的平板（现有行为，定场镜头）──
  return (
    <AbsoluteFill style={{ background: "#05080d" }}>
      {/* 环境层 */}
      <EnvLayer env={spec.env} />

      {/* 内容层 */}
      <ScreenLayer spec={spec} theme={theme} transform={screenTransform(spec.env.quad)} />

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
