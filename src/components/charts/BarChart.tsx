/**
 * 柱状图 - 生长动画
 * 
 * 柱子从 0 生长到目标高度，staggered 动画
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

interface BarChartProps {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  barWidth?: number;
  showLabels?: boolean;
  showValues?: boolean;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 600,
  height = 400,
  color = "#4a90e2",
  barWidth = 50,
  showLabels = true,
  showValues = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);

  // 每根柱子的延迟
  const barProgress = data.map((_, i) => {
    const delay = i * 10;
    return spring({
      frame: Math.max(0, frame - delay),
      fps,
      config: { damping: 15, stiffness: 100 },
      durationInFrames: 40,
    });
  });

  const spacing = width / data.length;

  return (
    <svg width={width} height={height + 60}>
      {/* 柱子 */}
      {data.map((d, i) => {
        const barHeight = (d.value / maxValue) * height;
        const x = i * spacing + (spacing - barWidth) / 2;
        const currentHeight = barHeight * barProgress[i];
        const y = height - currentHeight;

        return (
          <g key={i}>
            {/* 柱子 */}
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={currentHeight}
              fill={color}
              rx={4}
            />
            {/* 数值 */}
            {showValues && (
              <text
                x={x + barWidth / 2}
                y={y - 10}
                textAnchor="middle"
                fill="white"
                fontSize={14}
                fontWeight="bold"
                opacity={barProgress[i]}
              >
                {Math.round(d.value * barProgress[i])}
              </text>
            )}
            {/* 标签 */}
            {showLabels && (
              <text
                x={x + barWidth / 2}
                y={height + 25}
                textAnchor="middle"
                fill="#999"
                fontSize={12}
                opacity={barProgress[i]}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
