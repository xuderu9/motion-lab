// 内容层：单应变换容器 + 画布绘制。
//
// 这一层做三件事，且**只做**这三件事：
//   1. 把 1600×1200 画布用 matrix3d 贴到背景板的梯形屏幕上
//   2. 画布内圆角裁剪（不裁的话四角会戳到屏幕外面）
//   3. 主题底色 → 虚拟相机 → 交给版式 → 全屏后处理（掠光/色温/扫描线）
//
// 版式自己不知道自己在被透视变换，也不知道有掠光和扫描线 —— 这样 M2 加版式时
// 这些"看起来高级"的东西是白送的，不会漏。

import React, { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { sheen, scanlines, screenNoise, tintBreath } from "./chrome";
import { homographyMatrix3d } from "./homography";
import { paintLayout } from "./layouts";
import type { ShotSpec, Theme } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/** 整块画布画一遍。导出以便 test/still 脚本直接调用。 */
export function paintScreen(g: CanvasRenderingContext2D, frame: number, fps: number, spec: ShotSpec, theme: Theme) {
  const t = frame / fps;
  const R = spec.env.cornerRadius;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 注意：这里**不要**先整块 fillRect 垫深色。
  // 试过，会画布四角露出「黑色直角」——fillRect 是方角，圆角裁剪在外面，
  // 于是每个角都有一个 90° 的深色尖角压在设备边框上，用户一眼就看到了。
  // 边缘露白的问题在背景板那一侧解决（见 darken-screen.py：把占位屏涂暗），
  // 这样缝隙里透出来的是背景板自己的暗色，过渡是自然的。

  // 圆角裁剪：在画布内部裁比 CSS border-radius 可靠 ——
  // 透视变换后不出锯齿，而且画布四角变透明，透出的是背景板上真实的屏幕反光。
  g.save();
  g.beginPath();
  g.roundRect(0, 0, CANVAS_W, CANVAS_H, R);
  g.clip();

  // 验收专用：纯品红探针，配合 check-overflow.py 数溢出像素
  if (spec.debug === "solid") {
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.restore();
    return;
  }

  // 主题底色
  const bg = g.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, theme.bg[0]);
  bg.addColorStop(1, theme.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 虚拟相机：极缓漂移 + 轻微推拉。
  // 参考片相机位移为零，动的是屏幕里的应用 —— 所以这里幅度必须很小，
  // 它的作用是让整屏像素每帧都有微小位移，撑起帧差底噪。
  const camScale = 1.01 + 0.012 * Math.sin(t * 0.35);
  const camX = 14 * Math.sin(t * 0.31 + 1.2);
  const camY = 9 * Math.sin(t * 0.43);
  g.save();
  g.translate(CANVAS_W / 2 + camX, CANVAS_H / 2 + camY);
  g.scale(camScale, camScale);
  g.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  paintLayout(g, t, spec.layout, spec.variant, spec.content, theme);

  g.restore();

  // 全屏后处理：大面积、低幅度、永不停止 —— 帧差底噪的来源
  sheen(g, t, CANVAS_W, CANVAS_H, theme);
  tintBreath(g, t, CANVAS_W, CANVAS_H, theme);
  scanlines(g, frame, CANVAS_W, CANVAS_H, theme);
  // 最后一层：逐帧伪随机抖动（模拟录屏底噪，参考片实测 1.5~3）
  screenNoise(g, frame, CANVAS_W, CANVAS_H, theme);

  g.restore();
}

export const ScreenLayer: React.FC<{ spec: ShotSpec; theme: Theme }> = ({ spec, theme }) => {
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
    paintScreen(g, frame, fps, spec, theme);
  }, [frame, fps, spec, theme]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        transformOrigin: "0 0",
        transform: homographyMatrix3d(spec.env.quad, CANVAS_W, CANVAS_H),
      }}
    >
      <canvas
        ref={ref}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ width: CANVAS_W, height: CANVAS_H, display: "block" }}
      />
    </div>
  );
};
