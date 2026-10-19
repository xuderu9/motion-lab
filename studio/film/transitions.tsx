// 12 种镜头转场 —— 纯 CSS / SVG 实现，不引入 WebGL、canvas、第三方依赖。
//
// 合成模型（与 Film.tsx 严格对齐）：
//   · 转场不改变时间轴：后一个镜头提前 k 帧开始，两个镜头在 k 帧窗口内同时存在。
//   · 后一个镜头在 DOM 里更靠后，默认压在先一个镜头上；需要「出画在上」的转场
//     （破碎/故障/卷页/像素化）由 Film 给 Sequence 加 z-index 抬起来。
//   · p = 0 → 1 走完整个重叠窗口。出画和入画拿到的是同一个 p，
//     所以两边可以对齐同一个几何量（半径、缩放、位移）。
//
// 确定性：所有随机量都由 seed 经整数哈希得到，不用 Math.random()。
// Remotion 多进程并渲时同一个 p 必得同一画面。

import React from "react";
import type { CSSProperties } from "react";
import type { TransitionId } from "./types";

export type { TransitionId } from "./types";

// ---------------------------------------------------------------------------
// 数学 / 缓动
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const easeOutCubic = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

const easeInCubic = (v: number) => Math.pow(clamp01(v), 3);

const easeInOutCubic = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

const easeInOutQuart = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
};

/** 在 [a,b] 区间内做 smoothstep，返回 0~1 */
const smoothstep = (a: number, b: number, v: number) => {
  if (a === b) return v >= b ? 1 : 0;
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * 确定性 0~1 哈希。
 * 用整数混合（Math.imul）而不是 Math.sin，避免不同 JS 引擎的末位差异；
 * 同一个 seed 在任何进程里都返回同一个数。
 */
function hash01(seed: number): number {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// 公共样式
// ---------------------------------------------------------------------------

type Side = "out" | "in";

export type TransitionLayerProps = {
  id: TransitionId;
  /** 0 → 1 的转场进度 */
  p: number;
  /** 这个节点是出画还是入画 */
  side: Side;
  width: number;
  height: number;
  children: React.ReactNode;
  /**
   * 重叠帧数。可选：matchCut 需要把「8 帧内完成」映射到实际窗口；
   * 其余转场只用 p，不依赖它。Film 会传。
   */
  frames?: number;
};

const ACCENT = "#d9542b";

/** 铺满整帧、裁掉越界部分的容器 */
function frameBox(width: number, height: number): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
    overflow: "hidden",
    transformOrigin: "50% 50%",
    backfaceVisibility: "hidden",
  };
}

/** 整帧内容层（复制 children 时用） */
function fill(): CSSProperties {
  return { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
}

const Plain: React.FC<{ width: number; height: number; children: React.ReactNode }> = ({
  width,
  height,
  children,
}) => <div style={frameBox(width, height)}>{children}</div>;

// ---------------------------------------------------------------------------
// 1) matchCut —— 匹配剪切
//
// 不是视觉特效：出画放大 4%、入画从 1.04 收到 1.0，让「同一物体」在剪切处连续。
// 要求 8 帧内完成，所以把 p 按实际窗口长度换算成 8 帧进度，再套 easeOut。
// ---------------------------------------------------------------------------

const MatchCut: React.FC<TransitionLayerProps> = ({ p, side, width, height, children, frames }) => {
  const k = Math.max(2, frames ?? 14);
  // 规格是「8 帧内完成」：窗口比 8 帧长时前 8 帧走完；窗口更短时按窗口走完。
  const span = Math.min(8, k);
  const q = easeOutCubic(clamp01((p * k) / span));
  const out = side === "out";
  const scale = out ? 1 + 0.04 * q : 1.04 - 0.04 * q;
  // 出画逐渐退场、入画逐渐进场。两者在同一几何量上，切换时看不出"跳"。
  const opacity = out ? 1 - q : q;
  return (
    <div
      style={{
        ...frameBox(width, height),
        transform: `scale(${scale.toFixed(5)})`,
        opacity: opacity.toFixed(4),
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2) liquidMorph —— 液体变形
//
// 入画：SVG feTurbulence + feDisplacementMap，displacement scale 60 → 0；
// 出画：blur 0 → 14px、saturate 1 → 1.6。两者叠在一起就是"流体化开"。
// ---------------------------------------------------------------------------

const LiquidMorph: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  const out = side === "out";
  const rawId = React.useId();
  const fid = `lm-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (out) {
    const blur = 14 * easeOutCubic(q);
    const sat = 1 + 0.6 * q;
    return (
      <div style={frameBox(width, height)}>
        <div style={{ ...fill(), filter: `blur(${blur.toFixed(2)}px) saturate(${sat.toFixed(3)})` }}>
          {children}
        </div>
      </div>
    );
  }

  const disp = 60 * (1 - easeOutCubic(q));
  const freq = 0.011 + 0.007 * q;
  const opacity = smoothstep(0.02, 0.72, q);
  return (
    <div style={frameBox(width, height)}>
      <svg width={0} height={0} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
        <defs>
          <filter
            id={fid}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freq.toFixed(4)} ${(freq * 1.7).toFixed(4)}`}
              numOctaves={3}
              seed={11}
              result="morphNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="morphNoise"
              scale={disp.toFixed(2)}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        style={{
          ...fill(),
          filter: disp > 0.05 ? `url(#${fid})` : undefined,
          opacity: opacity.toFixed(4),
          transform: `scale(${(1 + 0.012 * (1 - q)).toFixed(5)})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3) shatter —— 破碎消散
//
// 出画切成 6×4 = 24 块，每块 clip-path: inset(...)，带 0.6px 缝；
// 位移 x ±240px、y 180~520px、旋转 ±18°，按离中心距离错峰起飞。
// 入画垫在下面（Film 给"出画在上"加 z-index），碎块飞走后露出来。
// ---------------------------------------------------------------------------

const Shatter: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  if (side === "in") return <Plain width={width} height={height}>{children}</Plain>;

  const COLS = 6;
  const ROWS = 4;
  const GAP = 0.6;
  const cw = width / COLS;
  const ch = height / ROWS;
  const maxDist = Math.hypot(width / 2, height / 2);
  const blocks: React.ReactNode[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const left = c * cw;
      const top = r * ch;
      const cx = left + cw / 2;
      const cy = top + ch / 2;
      const dist = Math.hypot(cx - width / 2, cy - height / 2);
      // 中心先碎、边缘后碎：0 ~ 0.34 的起飞延迟
      const delay = 0.34 * (dist / maxDist);
      const t = clamp01((q - delay) / Math.max(0.0001, 1 - delay));
      const idx = r * COLS + c;
      const rx = hash01(idx * 97 + 13) * 2 - 1;
      const ry = hash01(idx * 131 + 29);
      const rr = hash01(idx * 173 + 7) * 2 - 1;
      const dx = rx * 240 * t;
      const dy = (180 + 340 * ry) * t;
      const rot = rr * 18 * t;
      const opacity = 1 - smoothstep(0.55, 1, t);

      const clip = `inset(${(top + GAP / 2).toFixed(2)}px ${(width - (left + cw) + GAP / 2).toFixed(2)}px ${(
        height -
        (top + ch) +
        GAP / 2
      ).toFixed(2)}px ${(left + GAP / 2).toFixed(2)}px)`;

      blocks.push(
        <div
          key={idx}
          style={{
            ...fill(),
            clipPath: clip,
            transformOrigin: `${cx.toFixed(1)}px ${cy.toFixed(1)}px`,
            transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`,
            opacity: opacity.toFixed(4),
            willChange: "transform, opacity",
          }}
        >
          {children}
        </div>,
      );
    }
  }

  // 碎块之间露出黑底（而不是立刻露出入画），才像"碎"。
  // 黑底在尾段退场，入画镜头随碎块散尽接上。
  const backdrop = 1 - smoothstep(0.5, 0.95, q);
  return (
    <div style={frameBox(width, height)}>
      <div
        style={{
          ...fill(),
          background: "#05080d",
          opacity: backdrop.toFixed(4),
        }}
      />
      {blocks}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4) shapeMask —— 图形遮罩
//
// 入画用 clip-path: circle(R at cx cy)，R 从 0 到 hypot(W,H)，easeInOutCubic。
// 从左上角扩张（中点约盖住一半画面）；出画不参与（原样留在下面）。
// 另加一圈 accent 描边，让遮罩边缘可读。
// ---------------------------------------------------------------------------

const ShapeMask: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  if (side === "out") return <Plain width={width} height={height}>{children}</Plain>;

  const q = clamp01(p);
  const R = Math.hypot(width, height) * easeInOutCubic(q);
  // 从左上角扩张：R 的终点正好是画面对角线，中点时盖住约一半面积，
  // 比"从中心扩张"更容易在单个中帧里看出遮罩形状。
  const cx = 0;
  const cy = 0;
  const ring = Math.max(0, 1 - q * 3);

  return (
    <div style={frameBox(width, height)}>
      <div
        style={{
          ...fill(),
          clipPath: `circle(${R.toFixed(2)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)`,
        }}
      >
        {children}
      </div>
      {ring > 0 ? (
        <div
          style={{
            position: "absolute",
            left: cx - R,
            top: cy - R,
            width: R * 2,
            height: R * 2,
            borderRadius: "50%",
            border: `2px solid ${ACCENT}`,
            boxShadow: `0 0 26px 2px rgba(217,84,43,0.55)`,
            opacity: ring.toFixed(3),
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5) glitch —— 故障干扰
//
// 第一段 p<0.2：出画放大 1.02 + RGB 分离（红/青两层）；
// 中段 0.2~0.8：横向 6 条切片各自水平位移 ±80px，位移每帧都变 + hue-rotate 抖动；
// 末段 p>=0.8：出画淡出，入画从 1.03 收到 1.0。
// ---------------------------------------------------------------------------

const GLITCH_SLICES = 6;

const GlitchOut: React.FC<{ q: number; width: number; height: number; children: React.ReactNode }> = ({
  q,
  width,
  height,
  children,
}) => {
  if (q < 0.2) {
    // RGB 分离：两层带色 copy 用 screen 叠回去，出画本体压 1.02。
    // 同时保留任务要求的 drop-shadow 红/青偏移（边缘光）。
    return (
      <div
        style={{
          ...frameBox(width, height),
          transform: "scale(1.02)",
          filter:
            "drop-shadow(4px 0 0 rgba(255,32,80,0.65)) drop-shadow(-4px 0 0 rgba(0,220,255,0.65))",
        }}
      >
        <div style={fill()}>{children}</div>
        <div
          style={{
            ...fill(),
            transform: "translateX(4px) scale(1.004)",
            filter: "sepia(1) saturate(9) hue-rotate(-38deg) brightness(1.05)",
            mixBlendMode: "screen",
            opacity: 0.58,
          }}
        >
          {children}
        </div>
        <div
          style={{
            ...fill(),
            transform: "translateX(-4px) scale(1.004)",
            filter: "sepia(1) saturate(9) hue-rotate(145deg) brightness(1.05)",
            mixBlendMode: "screen",
            opacity: 0.58,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  const frameSeed = Math.floor(q * 1000000);
  const fade =
    q < 0.8 ? 1 : 1 - smoothstep(0.8, 0.9, q);
  const slices: React.ReactNode[] = [];
  for (let i = 0; i < GLITCH_SLICES; i++) {
    const dx = (hash01(frameSeed * 37 + i * 101 + 5) * 2 - 1) * 80;
    const dy = (hash01(frameSeed * 53 + i * 71 + 3) * 2 - 1) * 4;
    const hue = (hash01(frameSeed * 17 + i * 41 + 9) * 2 - 1) * 22;
    const clip = `inset(${((i * height) / GLITCH_SLICES).toFixed(2)}px 0px ${(
      height -
      ((i + 1) * height) / GLITCH_SLICES
    ).toFixed(2)}px 0px)`;
    slices.push(
      <div
        key={i}
        style={{
          ...fill(),
          clipPath: clip,
          transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
          filter: `hue-rotate(${hue.toFixed(1)}deg) saturate(1.55) contrast(1.06)`,
          mixBlendMode: "screen",
          opacity: 0.92,
        }}
      >
        {children}
      </div>,
    );
  }
  return (
    <div style={{ ...frameBox(width, height), opacity: fade.toFixed(4) }}>{slices}</div>
  );
};

const Glitch: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  if (side === "out") {
    return <GlitchOut q={q} width={width} height={height}>{children}</GlitchOut>;
  }
  // 入画在 p<0.8 完全不出现；0.8 时"闪切"进来，再收掉 3% 的缩放。
  if (q < 0.8) return <div style={{ ...frameBox(width, height), opacity: 0 }} />;
  const e = easeOutCubic((q - 0.8) / 0.2);
  return (
    <div
      style={{
        ...frameBox(width, height),
        transform: `scale(${(1.03 - 0.03 * e).toFixed(5)})`,
        opacity: smoothstep(0.8, 0.83, q).toFixed(4),
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6) stroke —— 动态描边
//
// 一条 3px accent 线自上而下扫过，线的位置用 clip-path 把入画一点点露出来；
// 线后面留 6px 柔光残留（刚扫过的区域）。
// ---------------------------------------------------------------------------

const Stroke: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  if (side === "out") return <Plain width={width} height={height}>{children}</Plain>;

  const q = clamp01(p);
  const y = q * height;
  const lineVisible = q > 0.0001 && q < 0.9999;
  return (
    <div style={frameBox(width, height)}>
      <div
        style={{
          ...fill(),
          clipPath: `inset(0px 0px ${((1 - q) * 100).toFixed(4)}% 0px)`,
        }}
      >
        {children}
      </div>
      {lineVisible ? (
        <>
          {/* 线后 6px 的柔光残留（在线之上 = 已经扫过的区域） */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: Math.max(0, y - 7),
              width,
              height: 6,
              background: `linear-gradient(to top, rgba(217,84,43,0.55) 0%, rgba(217,84,43,0.18) 55%, rgba(217,84,43,0) 100%)`,
              filter: "blur(1px)",
              pointerEvents: "none",
            }}
          />
          {/* 3px 线本体 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: Math.max(0, y - 1.5),
              width,
              height: 3,
              background: ACCENT,
              boxShadow: `0 0 13px 3px rgba(217,84,43,0.5)`,
              pointerEvents: "none",
            }}
          />
        </>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7) seamlessZoom —— 无缝缩放
//
// 出画 1.0 → 2.6（easeInCubic，越到后面越快），入画 0.38 → 1.0（easeOutCubic）。
// p≈0.5 附近给 6px 运动模糊，宽度收在 ~2 帧内（峰值不超过 3 帧）。
// ---------------------------------------------------------------------------

const SeamlessZoom: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  const out = side === "out";
  const scale = out ? 1 + 1.6 * easeInCubic(q) : 0.38 + 0.62 * easeOutCubic(q);
  const blur = 6 * Math.exp(-Math.pow((q - 0.5) / 0.09, 2));
  const opacity = out ? 1 : smoothstep(0.05, 0.8, q);
  return (
    <div
      style={{
        ...frameBox(width, height),
        transform: `scale(${scale.toFixed(5)})`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        opacity: opacity.toFixed(4),
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8) whipPan —— 甩镜摇移
//
// 出画 translateX(0→-100%) + blur(0→18px)，入画 translateX(100%→0) + blur(18→0)。
// 两者都用 easeInOutQuart，中段速度明显快于两端。
// ---------------------------------------------------------------------------

const WhipPan: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  const out = side === "out";
  const e = easeInOutQuart(q);
  const x = out ? -100 * e : 100 * (1 - e);
  const blur = 18 * (out ? e : 1 - e);
  return (
    <div
      style={{
        ...frameBox(width, height),
        transform: `translateX(${x.toFixed(3)}%)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        opacity: 1,
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 9) perspectivePull —— 透视拉扯
//
// 容器 perspective: 1200px。出画 translateZ(0→900px) + 淡出；
// 入画 translateZ(-700px→0)。easeInOutCubic。
// 内层 transform-style 保持 flat：ShotRenderer 自己的 matrix3d 先栅格化，
// 再整块作为平面参与透视，避免两套 3D 变换互相污染。
// ---------------------------------------------------------------------------

const PerspectivePull: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  const e = easeInOutCubic(q);
  const out = side === "out";
  const z = out ? 900 * e : -700 * (1 - e);
  const opacity = out ? 1 - e : smoothstep(0.02, 0.85, q);
  return (
    <div
      style={{
        ...frameBox(width, height),
        perspective: "1200px",
        perspectiveOrigin: "50% 50%",
      }}
    >
      <div
        style={{
          ...fill(),
          transform: `translateZ(${z.toFixed(2)}px)`,
          transformStyle: "flat",
          opacity: opacity.toFixed(4),
          backfaceVisibility: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 10) lightLeak —— 漏光
//
// 暖色大渐变从右上角扫过，mix-blend-mode: screen；峰值在 p=1/3，随后快速衰减。
// 入画在 p≈1/3 才出现（切在漏光最亮处），并带一段衰减的残留光。
// 另加一点 contrast。
// ---------------------------------------------------------------------------

const leakOverlay = (peak: number, q: number): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  mixBlendMode: "screen",
  filter: "blur(24px)",
  backgroundImage: [
    `radial-gradient(90% 90% at ${(100 - 16 * q).toFixed(1)}% ${(2 + 8 * q).toFixed(1)}%, rgba(255,252,235,${(
      0.85 * peak
    ).toFixed(3)}) 0%, rgba(255,209,102,${(0.82 * peak).toFixed(3)}) 22%, rgba(255,138,61,${(
      0.6 * peak
    ).toFixed(3)}) 46%, rgba(255,90,40,${(0.18 * peak).toFixed(3)}) 65%, rgba(0,0,0,0) 82%)`,
    `linear-gradient(${(118 - 14 * q).toFixed(1)}deg, rgba(0,0,0,0) 32%, rgba(255,138,61,${(
      0.52 * peak
    ).toFixed(3)}) 56%, rgba(255,209,102,${(0.8 * peak).toFixed(3)}) 72%, rgba(255,245,220,${(
      0.55 * peak
    ).toFixed(3)}) 80%, rgba(0,0,0,0) 92%)`,
  ].join(","),
});

const LightLeak: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  const third = 1 / 3;
  const peak = q < third ? q / third : Math.pow(clamp01(1 - (q - third) / (2 * third)), 2.6);

  if (side === "out") {
    return (
      <div style={frameBox(width, height)}>
        <div
          style={{
            ...fill(),
            filter: `contrast(${(1 + 0.1 * peak).toFixed(3)})`,
          }}
        >
          {children}
        </div>
        <div style={leakOverlay(peak, q)} />
      </div>
    );
  }

  // 入画：漏光最亮之前不出现；之后带一段衰减的残留光。
  if (q < third) return <div style={{ ...frameBox(width, height), opacity: 0 }} />;
  const tail = Math.pow(clamp01(1 - (q - third) / (2 * third)), 3);
  // 滤镜强度在尾段归零，保证 p=1 与"无转场"逐像素一致（否则会有一帧跳变）。
  const grade = 1 - smoothstep(0.7, 1, q);
  return (
    <div style={frameBox(width, height)}>
      <div
        style={{
          ...fill(),
          filter:
            grade > 0.001
              ? `contrast(${(1 + 0.045 * grade).toFixed(4)}) saturate(${(1 + 0.04 * grade).toFixed(4)})`
              : undefined,
        }}
      >
        {children}
      </div>
      {tail > 0.01 ? <div style={leakOverlay(0.8 * tail, q)} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 11) pageCurl —— 卷页（近似）
//
// 出画用 clip-path: polygon(...) 把右下角沿 45° 折线卷起来，
// 卷边是"亮面 + 暗面 + 投影"三段窄条；入画在纸下面，位置不动、只做 8% 的缩放。
// 不是滑入：翻开的区域是三角形，折线随 p 从右下角向画面中心推进。
// ---------------------------------------------------------------------------

const PageCurl: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);

  if (side === "in") {
    const s = 1.08 - 0.08 * easeOutCubic(q);
    return (
      <div style={{ ...frameBox(width, height), transform: `scale(${s.toFixed(5)})` }}>
        {children}
      </div>
    );
  }

  const s = (width + height) * 0.9 * Math.pow(q, 1.08);
  const x1 = width;
  const y1 = height - s;
  const x2 = width - s;
  const y2 = height;
  const polygon = `polygon(0px 0px, ${width}px 0px, ${x1.toFixed(2)}px ${y1.toFixed(2)}px, ${x2.toFixed(
    2,
  )}px ${y2.toFixed(2)}px, 0px ${height}px)`;

  const mx = width - s / 2;
  const my = height - s / 2;
  const bandLen = Math.max(0, s * Math.SQRT2);
  const bandThick = 46;
  const opacity = 1 - smoothstep(0.9, 0.99, q);

  return (
    <div style={{ ...frameBox(width, height), opacity: opacity.toFixed(4) }}>
      <div style={{ ...fill(), clipPath: polygon }}>{children}</div>

      {/* 卷边：三段窄条（亮面 / 暗面 / 投影），沿折线方向旋转 135° */}
      {s > 1 ? (
        <div
          style={{
            position: "absolute",
            left: mx,
            top: my,
            width: bandLen,
            height: bandThick,
            transform: "translate(-50%, -50%) rotate(135deg)",
            transformOrigin: "50% 50%",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "none",
            filter: "drop-shadow(0 16px 30px rgba(0,0,0,0.62)) drop-shadow(0 0 7px rgba(0,0,0,0.4))",
          }}
        >
          <div
            style={{
              height: 14,
              flex: "0 0 14px",
              background: "linear-gradient(90deg, #fffaf0 0%, #f7e7c9 55%, #e7cda4 100%)",
              opacity: 0.97,
            }}
          />
          <div
            style={{
              height: 12,
              flex: "0 0 12px",
              background: "linear-gradient(90deg, #b9895f 0%, #8a5f40 55%, #5d3d2a 100%)",
            }}
          />
          <div
            style={{
              height: 20,
              flex: "1 1 auto",
              background: "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 12) pixelate —— 像素化
//
// canvas 才能真做像素化，这里按要求换成：
//   出画 filter: blur(0→10px) contrast(1 + 0.3p) + scale(1 + 0.06p)，
//   再叠一层双向 repeating-linear-gradient 方块网格（alpha 随 p 上升）。
// p=0.5 时网格 + 模糊 + 对比度已经能明显看出"马赛克化"；p=1 时出画完全退场。
// ---------------------------------------------------------------------------

const Pixelate: React.FC<TransitionLayerProps> = ({ p, side, width, height, children }) => {
  const q = clamp01(p);
  if (side === "in") return <Plain width={width} height={height}>{children}</Plain>;

  const blur = 10 * q;
  const contrast = 1 + 0.3 * q;
  const scale = 1 + 0.06 * q;
  const cell = 64;
  const line = 3;
  const dark = (0.32 * q).toFixed(3);
  const block = (0.16 * q).toFixed(3);
  const lift = (0.05 * q).toFixed(3);
  const opacity = 1 - smoothstep(0.85, 1, q);

  const grid = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    mixBlendMode: "overlay",
    backgroundImage: [
      // 横 / 纵网格线
      `repeating-linear-gradient(0deg, rgba(0,0,0,${dark}) 0px, rgba(0,0,0,${dark}) ${line}px, transparent ${line}px, transparent ${cell}px)`,
      `repeating-linear-gradient(90deg, rgba(0,0,0,${dark}) 0px, rgba(0,0,0,${dark}) ${line}px, transparent ${line}px, transparent ${cell}px)`,
      // 交错方块：横纵两层 64px 方波叠出深浅不一的马赛克格
      `repeating-linear-gradient(90deg, rgba(8,18,34,${block}) 0px, rgba(8,18,34,${block}) ${cell}px, rgba(255,255,255,${lift}) ${cell}px, rgba(255,255,255,${lift}) ${cell * 2}px)`,
      `repeating-linear-gradient(0deg, rgba(8,18,34,${block}) 0px, rgba(8,18,34,${block}) ${cell}px, rgba(255,255,255,${lift}) ${cell}px, rgba(255,255,255,${lift}) ${cell * 2}px)`,
    ].join(","),
  } as CSSProperties;

  return (
    <div style={{ ...frameBox(width, height), opacity: opacity.toFixed(4) }}>
      <div
        style={{
          ...fill(),
          filter: `blur(${blur.toFixed(2)}px) contrast(${contrast.toFixed(3)})`,
          transform: `scale(${scale.toFixed(5)})`,
        }}
      >
        {children}
      </div>
      <div style={grid} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 分发
// ---------------------------------------------------------------------------

/** Film 用：这个转场是否要求「出画镜头压在入画上面」 */
export function isOutOnTop(id: TransitionId): boolean {
  return id === "shatter" || id === "glitch" || id === "pageCurl" || id === "pixelate";
}

export const TRANSITION_IDS: TransitionId[] = [
  "matchCut",
  "liquidMorph",
  "shatter",
  "shapeMask",
  "glitch",
  "stroke",
  "seamlessZoom",
  "whipPan",
  "perspectivePull",
  "lightLeak",
  "pageCurl",
  "pixelate",
];

export const TransitionLayer: React.FC<TransitionLayerProps> = (props) => {
  const { id } = props;
  switch (id) {
    case "matchCut":
      return <MatchCut {...props} />;
    case "liquidMorph":
      return <LiquidMorph {...props} />;
    case "shatter":
      return <Shatter {...props} />;
    case "shapeMask":
      return <ShapeMask {...props} />;
    case "glitch":
      return <Glitch {...props} />;
    case "stroke":
      return <Stroke {...props} />;
    case "seamlessZoom":
      return <SeamlessZoom {...props} />;
    case "whipPan":
      return <WhipPan {...props} />;
    case "perspectivePull":
      return <PerspectivePull {...props} />;
    case "lightLeak":
      return <LightLeak {...props} />;
    case "pageCurl":
      return <PageCurl {...props} />;
    case "pixelate":
      return <Pixelate {...props} />;
    case "cut":
    default:
      return <Plain width={props.width} height={props.height}>{props.children}</Plain>;
  }
};
