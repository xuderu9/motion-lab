// 合成：即梦背景板 + LiveUI（单应变换贴到平板上）+ 扁平矢量文字层
//
// 为什么必须用单应变换：背景板上的屏幕是个梯形（下边比上边宽 14%），
// 简单的 scale/rotate 贴不上，四角必然错位。CSS matrix3d 可以表达 2D 单应。
//
// 渲染：
//   npx remotion render studio/index.ts Composite out/composite.mp4 --concurrency=1

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { draw } from "./LiveUI";

const UIW = 1600;
const UIH = 1200;

/**
 * 背景板上屏幕四角的坐标（1920×1080 画面空间，从带网格的底图上量出来的）。
 * 顺序：左上 → 右上 → 右下 → 左下。贴不准就微调这四个点。
 */
const QUAD: Array<[number, number]> = [
  [464, 405],
  [872, 407],
  [978, 765],
  [504, 774],
];

/**
 * 把「单位正方形 → 四边形」的单应矩阵求出来（Heckbert 闭式解），
 * 再折算成元素自身坐标系（宽 w、高 h），最后组装成 CSS matrix3d。
 *
 * CSS matrix3d 是列主序；2D 单应的齐次分量落在第 3 行，对应 CSS 的 m14/m24/m44。
 */
function homographyMatrix3d(quad: Array<[number, number]>, w: number, h: number): string {
  const [p0, p1, p2, p3] = quad; // TL, TR, BR, BL
  const x0 = p0[0], y0 = p0[1];
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];

  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;

  let a: number, b: number, c: number, d: number, e: number, f: number, g2: number, h2: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // 仿射退化：没有透视
    a = x1 - x0; b = x2 - x1; c = x0;
    d = y1 - y0; e = y2 - y1; f = y0;
    g2 = 0; h2 = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g2 = (dx3 * dy2 - dx2 * dy3) / den;
    h2 = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g2 * x1;
    b = x3 - x0 + h2 * x3;
    c = x0;
    d = y1 - y0 + g2 * y1;
    e = y3 - y0 + h2 * y3;
    f = y0;
  }
  // 上面的解定义在单位正方形上，元素坐标是 [0,w]×[0,h]，所以横向除以 w、纵向除以 h
  const h11 = a / w, h12 = b / h, h13 = c;
  const h21 = d / w, h22 = e / h, h23 = f;
  const h31 = g2 / w, h32 = h2 / h;

  const m = [h11, h21, 0, h31, h12, h22, 0, h32, 0, 0, 1, 0, h13, h23, 0, 1];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toFixed(10))).join(",")})`;
}

/** 调试：把映射用的四边形画出来，用来对齐平板屏幕 */
const SHOW_QUAD = false;

const CompositeComp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement | null>(null);

  // 必须 useLayoutEffect：Remotion 截图不会等 useEffect
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, UIW, UIH);
    draw(g, frame, fps);
  }, [frame, fps]);

  const transform = homographyMatrix3d(QUAD, UIW, UIH);

  // 文字层：第三幕压上来（保留 —— 这是人类明确说喜欢的部分）
  const overlayIn = interpolate(frame, [17.5 * fps, 19.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (v) => 1 - Math.pow(1 - v, 3),
  });
  const scrim = interpolate(frame, [17.5 * fps, 20 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lines = [
    "环境层：即梦生成的写实背景板（相机锁死）",
    "内容层：实时绘制的工作区界面 + 单应变换贴合",
    "强调层：扁平矢量文字",
  ];

  return (
    <AbsoluteFill style={{ background: "#05080d", opacity: fadeIn }}>
      {/* 环境层：即梦背景板 */}
      <Img
        src={staticFile("plates/desk-night.png")}
        style={{ position: "absolute", inset: 0, width, height, objectFit: "cover" }}
      />

      {/* 内容层：贴到平板屏幕上 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: UIW,
          height: UIH,
          transformOrigin: "0 0",
          transform,
          // 屏幕本身是发光的，轻微提亮让 UI 和背景板的曝光对上
          filter: "brightness(1.06) contrast(1.04)",
        }}
      >
        <canvas ref={ref} width={UIW} height={UIH} style={{ width: UIW, height: UIH, display: "block" }} />
      </div>

      {/* 调试：四边形轮廓 */}
      {SHOW_QUAD ? (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <polygon
            points={QUAD.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#ff2d55"
            strokeWidth={4}
          />
          {QUAD.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={9} fill="#ff2d55" />
          ))}
        </svg>
      ) : null}

      {/* 屏幕外溢的冷光，让 UI 和背景板发生关系 */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 46% 40% at 43% 50%, rgba(90,140,220,0.10) 0%, rgba(90,140,220,0.03) 45%, rgba(0,0,0,0) 72%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* 强调层：扁平矢量文字 */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to top, rgba(4,7,12,${0.7 * scrim}) 0%, rgba(4,7,12,${0.3 * scrim}) 26%, rgba(4,7,12,0) 46%)`,
          opacity: overlayIn,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: "0 88px 76px",
          fontFamily: "'Microsoft YaHei', system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        <div style={{ opacity: overlayIn }}>
          <div
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              background: "rgba(45,108,246,0.22)",
              border: "1px solid rgba(90,150,255,0.4)",
              color: "#9dc0ff",
              fontSize: 15,
              letterSpacing: 1.6,
              marginBottom: 16,
            }}
          >
            COMPOSITE · 三层合成
          </div>
          <div
            style={{
              color: "#f2f5f9",
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: 0.5,
              marginBottom: 20,
              transform: `translateY(${(1 - overlayIn) * 18}px)`,
            }}
          >
            写实环境 + 活体界面 + 扁平文字
          </div>
          {lines.map((l, i) => {
            const a = interpolate(
              frame,
              [(19 + i * 0.9) * fps, (20.4 + i * 0.9) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (v) => 1 - Math.pow(1 - v, 3) },
            );
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: a,
                  transform: `translateX(${(1 - a) * -14}px)`,
                  marginBottom: 10,
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: 4, background: "#37d6a8" }} />
                <span style={{ color: "rgba(226,236,248,0.92)", fontSize: 22 }}>{l}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CompositeRoot: React.FC = () => (
  <Composition id="Composite" component={CompositeComp} durationInFrames={900} fps={30} width={1920} height={1080} />
);
