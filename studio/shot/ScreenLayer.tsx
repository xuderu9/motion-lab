// 内容层：把某一版式画成一张画布，再放进画面。
//
// 两种呈现方式共用这一套代码（M5 的 presentation 轴）：
//   screen —— 画在 1600×1200，经单应变换贴到背景板里那块屏幕上（现有行为）
//   full   —— 画在 1920×1080，直接铺满整帧（参考片里占 ~40% 的那一类）
//
// 关键设计：**画布尺寸是参数**，不是常量。
// 老版式（doc/chart/...）按 1600×1200 写死，所以传 1600×1200 给它们就行为不变；
// 新版式（title/stat/quote/atmosphere）收 size 参数，两种尺寸都能画。

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotSpec, Theme, LayoutSize } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";
import { paintLayout } from "./layouts";
import { getScene } from "./scenes";
import { toItems } from "./scenes/types";
import { homographyMatrix3d } from "./homography";
import { scanlines, screenNoise } from "./chrome";
import { useLayoutEffect, useRef } from "react";
import { drawSafeGuides } from "./safezone";

export const SCREEN_SIZE: LayoutSize = { w: CANVAS_W, h: CANVAS_H };
export const FULL_SIZE: LayoutSize = { w: 1920, h: 1080 };

/** 整块画布画一遍。导出以便 test/still 脚本直接调用。 */
export function paintScreen(
  g: CanvasRenderingContext2D,
  frame: number,
  fps: number,
  spec: ShotSpec,
  theme: Theme,
  size: LayoutSize = SCREEN_SIZE,
  /** true = 不画主题底色（透明画布），用于「即梦底板 + 内容浮层」的呈现方式 */
  transparent = false,
) {
  const t = frame / fps;
  const R = spec.env.cornerRadius;
  const W = size.w;
  const H = size.h;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);

  // 注意：这里**不要**先整块 fillRect 垫深色。
  // 试过，会画布四角露出「黑色直角」——fillRect 是方角，圆角裁剪在外面，
  // 于是每个角都有一个 90° 的深色尖角压在设备边框上，用户一眼就看到了。
  // 边缘露白的问题在背景板那一侧解决（见 darken-screen.py）。

  g.save();
  g.beginPath();
  // 整帧模式不需要圆角：它就是画面本身，圆角反而会露出背景
  if (size === SCREEN_SIZE) g.roundRect(0, 0, W, H, R);
  else g.rect(0, 0, W, H);
  g.clip();

  // 验收专用：纯品红探针，配合 check-canvas-overflow.py 数溢出像素
  if (spec.debug === "solid") {
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, W, H);
    g.restore();
    return;
  }

  // 主题底色（透明模式下不画：让底下的即梦底板透上来）
  if (!transparent) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, theme.bg[0]);
    bg.addColorStop(1, theme.bg[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }

  // ⚠️ 这里**故意不做整屏呼吸**。
  // 之前有一层「虚拟相机缓慢推拉 + 轻微漂移」，本质是用周期性缩放制造活动感；
  // 用户明确讨厌这种呼吸感，且严禁用它充抵静止帧。
  // 现在整屏固定，运动必须来自内容本身（卡片位移、数字变化、相机推进）。


  // 有场景就用场景（吃条目，与内容解耦）；否则按 layout 画
  const scene = getScene(spec.scene);
  // 场景的 variant 只有 0/1/2 三档；mix/page 这类版式才用到 3~5
    if (scene) scene.draw(g, t, toItems(spec.content), theme, size, (spec.variant % 3) as 0 | 1 | 2);
  else paintLayout(g, t, spec.layout, spec.variant, spec.content, theme, size);

  g.restore();

  // 每帧末尾叠安全区参考线（仅调试）
  if (spec.debug === "safe") drawSafeGuides(g, W, H);

  // 全屏后处理。透明模式跳过：这些是「屏幕质感」，压在照片底板上会显脏。
  if (!transparent) {
    // 只保留静态质感（扫描线是纹理，不是呼吸）。sheen / tintBreath 已删除。
    scanlines(g, frame, W, H, theme);
    // 最后一层：逐帧伪随机抖动（模拟录屏底噪，参考片实测 1.5~3）
    screenNoise(g, frame, W, H, theme);
  }

  g.restore();
}

/**
 * 内容层。
 *
 * transform 为空 = 原样铺在左上角（整帧模式）；
 * 给了 3D 矩阵 = 贴到背景板的屏幕四边形里（现有行为）。
 */
export const ScreenLayer: React.FC<{
  spec: ShotSpec;
  theme: Theme;
  size?: LayoutSize;
  transform?: string;
  transparent?: boolean;
}> = ({ spec, theme, size = SCREEN_SIZE, transform, transparent = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement | null>(null);

  // 必须 useLayoutEffect：Remotion 截图在 paint 之后、useEffect 之前，
  // 用 useEffect 会画到下一帧才生效（R3F 相机就栽在这上面，见 PLAYBOOK）。
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    paintScreen(g, frame, fps, spec, theme, size, transparent);
  }, [frame, fps, spec, theme, size, transparent]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size.w,
        height: size.h,
        transformOrigin: "0 0",
        transform: transform ?? undefined,
      }}
    >
      <canvas
        ref={ref}
        width={size.w}
        height={size.h}
        style={{ width: size.w, height: size.h, display: "block" }}
      />
    </div>
  );
};

/** 贴到背景板屏幕里的默认变换 */
export function screenTransform(quad: [number, number][]): string {
  return homographyMatrix3d(quad, CANVAS_W, CANVAS_H);
}
