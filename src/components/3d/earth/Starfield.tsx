/**
 * 确定性星空
 *
 * 为什么不用 drei 的 <Stars>：
 * 它内部用 Math.random() 生成恒星位置，而 Remotion 会并发用多个浏览器 Tab
 * 分帧渲染 —— 每个 Tab 的随机结果不同，同一段视频里星空就会"跳变"。
 * 而且它把时间写在 useFrame 里累加，seek 到同一帧也未必一致。
 *
 * 这里改成：位置由固定种子的 mulberry32 生成（跨 Tab 完全一致），
 * 闪烁相位由 useCurrentFrame() 推导（seek 安全）。
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR_VERTEX = /* glsl */ `
  attribute float size;
  attribute float phase;
  attribute vec3 starColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uMaxSize;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = starColor;
    // 每颗星自己的闪烁相位 → 不会整片一起闪
    float twinkle = 0.72 + 0.28 * sin(uTime + phase * 6.28318);
    vAlpha = twinkle;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // 透视缩放 + 钳制：不钳制的话近处亮星会变成几十像素的大光斑，
    // 再被 Bloom 放大成"棉花球"，这是视觉上最刺眼的问题。
    gl_PointSize = clamp(size * uScale / -mvPosition.z, 1.0, uMaxSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // 圆形软边，避免出现方块星点
    float d = distance(gl_PointCoord, vec2(0.5));
    float alpha = 1.0 - smoothstep(0.18, 0.5, d);
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(vColor, alpha * vAlpha);
  }
`;

export interface StarfieldProps {
  count?: number;
  /** 星壳内半径 */
  radius?: number;
  /** 星壳厚度 */
  depth?: number;
  /** 闪烁速度（每秒周期数），0 = 完全不闪 */
  twinkleSpeed?: number;
  seed?: number;
}

export const Starfield: React.FC<StarfieldProps> = ({
  count = 6000,
  radius = 120,
  depth = 70,
  twinkleSpeed = 0.35,
  seed = 981_723,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const { positions, colors, sizes, phases } = useMemo(() => {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const pha = new Float32Array(count);

    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // 球面均匀分布（避免向极点聚集）
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);

      const dist = radius + depth * rand();
      pos[i * 3] = r * Math.cos(theta) * dist;
      pos[i * 3 + 1] = u * dist;
      pos[i * 3 + 2] = r * Math.sin(theta) * dist;

      // 少量偏蓝/偏黄的恒星，多数接近白色
      const hue = rand();
      const isWarm = rand() > 0.82;
      const isCool = rand() < 0.18;
      if (isWarm) color.setHSL(0.09, 0.35, 0.86);
      else if (isCool) color.setHSL(0.6, 0.4, 0.88);
      else color.setHSL(0.58, 0.04 * hue, 0.9);

      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;

      // 幂分布：绝大多数是暗弱小星，少数是亮星。
      // 数值区间要和 vertex shader 里的 uScale 配套看：
      // 最终像素尺寸 ≈ size * uScale / 相机距离（见 uScale 注释）。
      const mag = Math.pow(rand(), 3.2);
      siz[i] = 0.45 + mag * 2.6;
      pha[i] = rand();
    }

    return { positions: pos, colors: col, sizes: siz, phases: pha };
  }, [count, radius, depth, seed]);

  /**
   * 点的像素尺寸 = size * uScale / 距离。
   * 星壳距离在 radius..radius+depth（默认 120..190），
   * size 在 0.45..3.05，所以 uScale≈210 时最亮的星约 5px、普通星约 1px，
   * 换算到 4K 时按分辨率线性放大，保持"星点"的观感而不是光斑。
   */
  const resolutionScale = useMemo(() => width / 1920, [width]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScale: { value: 210 * resolutionScale },
      uMaxSize: { value: 5.5 * resolutionScale },
    }),
    [resolutionScale],
  );
  // 由帧推导时间 → 任意 seek 都一致
  uniforms.uTime.value = (frame / fps) * twinkleSpeed * Math.PI * 2;

  return (
    <points renderOrder={-5} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-starColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-phase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
};
