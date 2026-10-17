// 强调层：扁平矢量文字（DOM，1920 坐标系）。
//
// 保留人类明确说喜欢的「末尾弹出」方式（HANDOFF §2 视觉偏好）。
//
// 注意：这一层的配色**故意不走 theme** —— 它压在写实照片（房间）上，
// 不压在屏幕上。屏幕上那套主题 token 是为 9.38% 的小面积设计的，
// 直接套到全屏文字上，浅色主题会变得无法在深色照片上阅读。
// 所以这里是一套固定的、跨镜头一致的文字配色，这是有意的例外。

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotSpec } from "./types";
import { resolveOverlayAt } from "./types";

const EASE_OUT = (v: number) => 1 - Math.pow(1 - v, 3);

export const OverlayLayer: React.FC<{ spec: ShotSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spec.overlay;

  if (!o) return null;

  const at = resolveOverlayAt(spec) * fps;

  // 时间压缩：镜头越短，入场后剩下的时间越少。
  // 不压缩的话，6 秒镜头里最后一条 bullet 会在片子结束之后才浮上来（永远看不见）。
  // 用「剩余时长 / 3 秒」作为系数，长镜头不受影响。
  const total = spec.durationInFrames / fps;
  const remain = Math.max(0.2, total - resolveOverlayAt(spec));
  const k = Math.max(0.25, Math.min(1, remain / 3.0));

  const inA = interpolate(frame, [at, at + 1.2 * k * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const scrim = interpolate(frame, [at - 0.5 * k * fps, at + 0.9 * k * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <AbsoluteFill
        style={{
          // 压暗别太重：这一段是整片的暗部，压太狠会把平均亮度拉穿验收下限
          background: `linear-gradient(to top, rgba(4,7,12,${0.56 * scrim}) 0%, rgba(4,7,12,${0.24 * scrim}) 25%, rgba(4,7,12,0) 42%)`,
          pointerEvents: "none",
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
        <div style={{ opacity: inA }}>
          {o.kicker ? (
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
              {o.kicker}
            </div>
          ) : null}
          <div
            style={{
              color: "#f2f5f9",
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: 0.5,
              marginBottom: o.bullets && o.bullets.length > 0 ? 20 : 0,
              transform: `translateY(${(1 - inA) * 18}px)`,
              textShadow: "0 2px 24px rgba(0,0,0,0.45)",
            }}
          >
            {o.title}
          </div>
          {(o.bullets ?? []).map((l, i) => {
            const a = interpolate(frame, [at + (0.9 + i * 0.5) * k * fps, at + (1.9 + i * 0.5) * k * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_OUT,
            });
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
    </>
  );
};
