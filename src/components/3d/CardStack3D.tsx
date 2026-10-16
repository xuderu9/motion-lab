/**
 * 3D 卡片扇面展开
 * 
 * 整合 remotion-bits 的 StaggeredMotion
 * 实现 3D 空间中卡片依次飞入并展开的效果
 */

import React from "react";
import { useVideoConfig } from "remotion";
import { StaggeredMotion, useViewportRect } from "remotion-bits";

interface CardStack3DProps {
  count?: number;
  colors?: string[];
  labels?: string[];
}

export const CardStack3D: React.FC<CardStack3DProps> = ({
  count = 8,
  colors = ["#f6a45c", "#68431e"],
  labels,
}) => {
  const { vmin } = useViewportRect();

  const cardWidth = vmin * 30;
  const cardHeight = cardWidth * 1.5;
  const cards = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      style={{
        position: "relative",
        width: cardWidth,
        height: cardHeight,
        transformStyle: "preserve-3d",
      }}
    >
      <StaggeredMotion
        transition={{
          y: [800, 0],
          frames: [0, 50],
          stagger: 3,
          easing: "spring",
        }}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          transformStyle: "preserve-3d",
          pointerEvents: "none",
        }}
      >
        {cards.map((i) => {
          // 计算最终扇面展开位置
          const angle = (i - (count - 1) / 2) * 8;
          const xOffset = (i - (count - 1) / 2) * 60;
          const zOffset = i * -10; // 堆叠深度

          const color = colors[i % colors.length];
          const label = labels ? labels[i] : `${i + 1}`;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transformStyle: "preserve-3d",
                zIndex: -i,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: color,
                  borderRadius: 24,
                  border: "4px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: cardWidth * 0.4,
                  color: "white",
                  fontWeight: "bold",
                  transform: `translateZ(${zOffset}px) translateX(${xOffset}px) rotateZ(${angle}deg)`,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </StaggeredMotion>
    </div>
  );
};
