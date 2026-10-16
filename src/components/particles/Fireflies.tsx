/**
 * 萤火虫粒子效果
 * 
 * 使用 remotion-bits 的 Particles + Spawner + Behavior
 */

import React from "react";
import { Particles, Spawner, Behavior } from "remotion-bits";
import { useViewportRect } from "remotion-bits";

interface FirefliesProps {
  count?: number;
  color?: string;
  glowSize?: number;
  speed?: number;
}

export const Fireflies: React.FC<FirefliesProps> = ({
  count = 50,
  color = "#ccff00",
  glowSize = 2,
  speed = 0.5,
}) => {
  const rect = useViewportRect();

  return (
    <Particles>
      <Spawner
        rate={count / 100}
        max={count}
        area={{ width: rect.width, height: rect.height }}
        position={{ x: rect.width / 2, y: rect.height / 2 }}
        lifespan={100}
        velocity={{ x: speed, y: speed, varianceX: 1, varianceY: 1 }}
      >
        <div
          style={{
            width: rect.vmin,
            height: rect.vmin,
            borderRadius: "50%",
            backgroundColor: color,
            boxShadow: `0 0 ${rect.vmin * glowSize}px ${rect.vmin * glowSize}px ${color}99`,
          }}
        />
      </Spawner>
      <Behavior
        wiggle={{ magnitude: 2, frequency: 0.1 }}
        wiggleVariance={1}
      />
    </Particles>
  );
};
