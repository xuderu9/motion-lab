/**
 * 故障风转场效果
 * 
 * RGB 分离 + 随机位移 + 扫描线
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface GlitchEffectProps {
  children: React.ReactNode;
  intensity?: number;
  duration?: number;
}

export const GlitchEffect: React.FC<GlitchEffectProps> = ({
  children,
  intensity = 1,
  duration = 30,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 故障效果只在特定帧出现
  const shouldGlitch = frame % 10 < 3;
  const glitchIntensity = shouldGlitch ? intensity : 0;

  // RGB 分离
  const offsetX = interpolate(frame, [0, duration / 2, duration], [0, 20 * glitchIntensity, 0]);
  const offsetY = interpolate(frame, [0, duration / 2, duration], [0, 5 * glitchIntensity, 0]);

  // 扫描线
  const scanLineY = (frame * 20) % 1080;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* 红色层 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: offsetX,
          filter: "hue-rotate(0deg) saturate(2)",
          mixBlendMode: "screen",
          opacity: 0.7,
        }}
      >
        {children}
      </div>
      {/* 青色层 */}
      <div
        style={{
          position: "absolute",
          top: offsetY,
          left: -offsetX,
          filter: "hue-rotate(180deg) saturate(2)",
          mixBlendMode: "screen",
          opacity: 0.7,
        }}
      >
        {children}
      </div>
      {/* 主层 */}
      <div style={{ position: "relative" }}>{children}</div>
      {/* 扫描线 */}
      {shouldGlitch && (
        <div
          style={{
            position: "absolute",
            top: scanLineY,
            left: 0,
            width: "100%",
            height: 2,
            background: "rgba(255, 255, 255, 0.8)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
