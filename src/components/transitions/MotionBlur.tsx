/**
 * 运动模糊效果
 * 
 * 在镜头快速移动时添加模糊
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

interface MotionBlurProps {
  children: React.ReactNode;
  intensity?: number;
  direction?: "horizontal" | "vertical" | "both";
}

export const MotionBlur: React.FC<MotionBlurProps> = ({
  children,
  intensity = 5,
  direction = "horizontal",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 模拟运动强度（实际应用中应该从相机运动获取）
  const motion = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100 },
    durationInFrames: 30,
  });

  const blurX = direction === "vertical" ? 0 : motion * intensity;
  const blurY = direction === "horizontal" ? 0 : motion * intensity;

  return (
    <div
      style={{
        filter: `blur(${blurX}px, ${blurY}px)`,
      }}
    >
      {children}
    </div>
  );
};
