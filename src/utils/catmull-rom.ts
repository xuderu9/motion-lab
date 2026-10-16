/**
 * Catmull-Rom 曲线插值工具
 * 
 * 用于生成丝滑的曲线（而非直线段）
 */

interface Point {
  x: number;
  y: number;
}

/**
 * Catmull-Rom 插值算法
 * 给定一组控制点，生成平滑曲线
 */
export function catmullRomSpline(
  points: Point[],
  tension = 0.5,
  segments = 16
): Point[] {
  if (points.length < 2) return points;
  
  const result: Point[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    for (let t = 0; t <= 1; t += 1 / segments) {
      const t2 = t * t;
      const t3 = t2 * t;
      
      const x =
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3) *
        tension;
      
      const y =
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) *
        tension;
      
      result.push({ x, y });
    }
  }
  
  return result;
}

/**
 * 将点数组转换为 SVG path 字符串
 */
export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

/**
 * 将原始数据点转换为 Catmull-Rom 平滑曲线，返回 SVG path
 */
export function dataToSmoothCurve(
  data: Point[],
  width: number,
  height: number,
  tension = 0.5,
  segments = 16
): string {
  // 归一化数据到 [0, 1]
  const xValues = data.map((d) => d.x);
  const yValues = data.map((d) => d.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  
  const normalized: Point[] = data.map((d) => ({
    x: (d.x - xMin) / (xMax - xMin || 1),
    y: (d.y - yMin) / (yMax - yMin || 1),
  }));
  
  // 映射到画布坐标
  const canvasPoints: Point[] = normalized.map((p) => ({
    x: p.x * width,
    y: height - p.y * height, // SVG y 轴反转
  }));
  
  // Catmull-Rom 插值
  const smoothed = catmullRomSpline(canvasPoints, tension, segments);
  
  return pointsToSvgPath(smoothed);
}
