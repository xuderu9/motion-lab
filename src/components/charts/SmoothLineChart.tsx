/**
 * 丝滑折线图
 * 
 * 使用 Catmull-Rom 曲线 + spring 动画 + pathLength 描边
 * 实现丝滑的折线生长效果
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { dataToSmoothCurve } from "../../utils/catmull-rom";

interface DataPoint {
  label: string;
  value: number;
}

interface SmoothLineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  showPoints?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
}

export const SmoothLineChart: React.FC<SmoothLineChartProps> = ({
  data,
  width = 800,
  height = 400,
  color = "#4a90e2",
  lineWidth = 3,
  showPoints = true,
  showGrid = true,
  showLabels = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 将数据转为坐标点
  const points = useMemo(() => {
    return data.map((d, i) => ({
      x: i,
      y: d.value,
      label: d.label,
    }));
  }, [data]);

  // 生成平滑曲线路径
  const pathD = useMemo(() => {
    const coords = points.map((p) => ({ x: p.x, y: p.y }));
    return dataToSmoothCurve(coords, width, height, 0.5, 16);
  }, [points, width, height]);

  // 计算路径总长度（用于 pathLength 动画）
  const pathLength = useMemo(() => {
    // 简单估算：点数 * 平均距离
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total * 2; // 留余量
  }, [points]);

  // Spring 动画控制进度
  const progress = spring({
    frame,
    fps,
    config: {
      damping: 20,
      stiffness: 80,
      mass: 1,
    },
    durationInFrames: 60, // 1 秒完成
  });

  // 数据点延迟出现
  const pointProgress = points.map((_, i) => {
    const delay = i * 8;
    return spring({
      frame: Math.max(0, frame - delay),
      fps,
      config: { damping: 15, stiffness: 100 },
      durationInFrames: 30,
    });
  });

  // 计算 Y 轴范围
  const yMin = Math.min(...points.map((p) => p.y));
  const yMax = Math.max(...points.map((p) => p.y));
  const yRange = yMax - yMin || 1;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {/* 背景网格 */}
      {showGrid && (
        <g opacity={0.2}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={0}
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="#666"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
        </g>
      )}

      {/* 折线 */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={pathLength}
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength * (1 - progress)}
        style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
      />

      {/* 数据点 */}
      {showPoints &&
        points.map((p, i) => {
          const cx = (p.x / (points.length - 1)) * width;
          const cy = height - ((p.y - yMin) / yRange) * height;
          const scale = pointProgress[i];

          return (
            <g key={i} opacity={scale}>
              <circle
                cx={cx}
                cy={cy}
                r={6 * scale}
                fill={color}
                stroke="white"
                strokeWidth={2}
              />
            </g>
          );
        })}

      {/* X 轴标签 */}
      {showLabels &&
        points.map((p, i) => {
          const cx = (i / (points.length - 1)) * width;
          return (
            <text
              key={i}
              x={cx}
              y={height + 30}
              textAnchor="middle"
              fill="#999"
              fontSize={14}
              opacity={pointProgress[i]}
            >
              {p.label}
            </text>
          );
        })}
    </svg>
  );
};
