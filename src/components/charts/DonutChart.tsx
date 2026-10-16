/**
 * 环形统计图
 * 
 * SVG 弧线旋转填充动画
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  width?: number;
  height?: number;
  thickness?: number;
  showLabels?: boolean;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  width = 400,
  height = 400,
  thickness = 40,
  showLabels = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const radius = Math.min(width, height) / 2 - thickness;
  const circumference = 2 * Math.PI * radius;

  // 进度动画
  const progress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80 },
    durationInFrames: 60,
  });

  let currentOffset = 0;

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${width / 2}, ${height / 2})`}>
        {/* 背景环 */}
        <circle
          r={radius}
          fill="none"
          stroke="#333"
          strokeWidth={thickness}
          opacity={0.3}
        />

        {/* 数据弧 */}
        {data.map((d, i) => {
          const percentage = d.value / total;
          const arcLength = circumference * percentage;
          const dashOffset = -currentOffset;

          const animatedLength = arcLength * progress;

          const element = (
            <circle
              key={i}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${animatedLength} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90)"
              opacity={progress}
            />
          );

          currentOffset += arcLength;
          return element;
        })}

        {/* 中心文字 */}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={32}
          fontWeight="bold"
          opacity={progress}
        >
          {Math.round(total * progress)}
        </text>
      </g>

      {/* 图例 */}
      {showLabels && (
        <g transform={`translate(${width - 120}, 20)`}>
          {data.map((d, i) => (
            <g key={i} transform={`translate(0, ${i * 30})`} opacity={progress}>
              <rect width={16} height={16} fill={d.color} rx={2} />
              <text x={24} y={12} fill="white" fontSize={12}>
                {d.label} ({((d.value / total) * 100).toFixed(0)}%)
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};
