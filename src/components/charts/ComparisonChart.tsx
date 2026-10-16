/**
 * 两侧对比图
 * 
 * 左右两侧柱子对比，中间标注差值
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

interface ComparisonChartProps {
  data: { label: string; left: number; right: number }[];
  width?: number;
  height?: number;
  leftColor?: string;
  rightColor?: string;
  showDiff?: boolean;
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  data,
  width = 800,
  height = 400,
  leftColor = "#f59e0b",
  rightColor = "#10b981",
  showDiff = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const maxVal = useMemo(
    () => Math.max(...data.flatMap((d) => [d.left, d.right])),
    [data]
  );

  const barProgress = data.map((_, i) => {
    const delay = i * 12;
    return spring({
      frame: Math.max(0, frame - delay),
      fps,
      config: { damping: 15, stiffness: 100 },
      durationInFrames: 45,
    });
  });

  const rowHeight = height / data.length;
  const barMaxWidth = width * 0.35;

  return (
    <svg width={width} height={height}>
      {/* 中线 */}
      <line
        x1={width / 2}
        y1={0}
        x2={width / 2}
        y2={height}
        stroke="#666"
        strokeWidth={2}
        strokeDasharray="4 4"
      />

      {data.map((d, i) => {
        const y = i * rowHeight + rowHeight * 0.3;
        const barHeight = rowHeight * 0.4;
        const leftWidth = (d.left / maxVal) * barMaxWidth * barProgress[i];
        const rightWidth = (d.right / maxVal) * barMaxWidth * barProgress[i];
        const diff = d.right - d.left;
        const diffPercent = ((diff / d.left) * 100).toFixed(1);

        return (
          <g key={i} opacity={barProgress[i]}>
            {/* 左侧柱子 */}
            <rect
              x={width / 2 - leftWidth}
              y={y}
              width={leftWidth}
              height={barHeight}
              fill={leftColor}
              rx={4}
            />
            {/* 左侧数值 */}
            <text
              x={width / 2 - leftWidth - 10}
              y={y + barHeight / 2 + 5}
              textAnchor="end"
              fill="white"
              fontSize={14}
              fontWeight="bold"
            >
              {Math.round(d.left * barProgress[i])}
            </text>

            {/* 右侧柱子 */}
            <rect
              x={width / 2}
              y={y}
              width={rightWidth}
              height={barHeight}
              fill={rightColor}
              rx={4}
            />
            {/* 右侧数值 */}
            <text
              x={width / 2 + rightWidth + 10}
              y={y + barHeight / 2 + 5}
              textAnchor="start"
              fill="white"
              fontSize={14}
              fontWeight="bold"
            >
              {Math.round(d.right * barProgress[i])}
            </text>

            {/* 标签 */}
            <text
              x={width / 2}
              y={y + barHeight + 20}
              textAnchor="middle"
              fill="#999"
              fontSize={12}
            >
              {d.label}
            </text>

            {/* 差值标注 */}
            {showDiff && barProgress[i] > 0.8 && (
              <text
                x={width / 2 + barMaxWidth + 60}
                y={y + barHeight / 2 + 5}
                fill={diff > 0 ? "#10b981" : "#ef4444"}
                fontSize={14}
                fontWeight="bold"
              >
                {diff > 0 ? "+" : ""}
                {diffPercent}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
