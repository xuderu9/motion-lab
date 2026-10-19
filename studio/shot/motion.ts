// 动效内核 —— 缓动、曲线路径、错峰、运动模糊、色散、辉光。
//
// 出处：`D:\DeepseekHarness\cankaoshipin\动效名称及描述.txt`
// 这个文件**只做数学和薄绘制包装**，不做版式。目的是让「轨迹太直」这件事
// 有一个统一的地方可以修：所有版式的入场/位移都必须从这里取缓动和路径。
//
// 设计原则：
//   1. 全纯函数 + 确定性（不许 Math.random，随机一律用 seed 哈希）。
//   2. 缓动按 CSS `cubic-bezier()` 语义实现（Newton 求根），这样写 [0.16,1,0.3,1]
//      得到的曲线和 CSS 里写的一样，remotion studio 里调好的值可以直接搬。
//   3. 画布上不存在的「后期」能力（全屏运动模糊）不做假实现：
//      运动模糊按**元素级多重重绘**做，色散用 drop-shadow 双色偏移做，
//      这两个是 2D canvas 上真正能达到观感的手法。

export type Pt = [number, number];
export type EaseFn = (u: number) => number;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const smoothstep = (u: number) => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};

/** 0→1 的进度：在 [t0, t0+dur] 区间内线性推进 */
export const prog = (t: number, t0: number, dur: number) => clamp01((t - t0) / Math.max(1e-6, dur));

// ---------------------------------------------------------------------------
// cubic-bezier —— 与 CSS 同语义
// ---------------------------------------------------------------------------

const cbA = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
const cbB = (a1: number, a2: number) => 3 * a2 - 6 * a1;
const cbC = (a1: number) => 3 * a1;
const cbAt = (t: number, a1: number, a2: number) => ((cbA(a1, a2) * t + cbB(a1, a2)) * t + cbC(a1)) * t;
const cbSlope = (t: number, a1: number, a2: number) => 3 * cbA(a1, a2) * t * t + 2 * cbB(a1, a2) * t + cbC(a1);

/**
 * CSS `cubic-bezier(x1,y1,x2,y2)`。
 *
 * 为什么不用「一组命名函数凑合」：参考片的运动是**指数长尾**，用 easeOutCubic
 * 之类近似出来后半段会「停得太平」，一眼假。要精确拟合就得能写控制点。
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  // 退化成正比例时直接返回线性，省掉求根
  if (x1 === y1 && x2 === y2) return (t: number) => clamp01(t);
  return (t: number) => {
    const x = clamp01(t);
    if (x === 0 || x === 1) return x;
    // Newton-Raphson：绝大多数情况 4 次内收敛
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = cbAt(u, x1, x2) - x;
      if (Math.abs(err) < 1e-6) return cbAt(u, y1, y2);
      const s = cbSlope(u, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      u -= err / s;
      if (u < 0 || u > 1) break;
    }
    // 兜底二分，保证单调收敛
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 26; i++) {
      const v = cbAt(u, x1, x2);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return cbAt(u, y1, y2);
  };
}

// ---------------------------------------------------------------------------
// 缓动族
// ---------------------------------------------------------------------------

const c1 = 1.70158;
const c3 = c1 + 1;

export const EASE: Record<string, EaseFn> = {
  linear: (u) => clamp01(u),
  sineIn: (u) => 1 - Math.cos((clamp01(u) * Math.PI) / 2),
  sineOut: (u) => Math.sin((clamp01(u) * Math.PI) / 2),
  sineInOut: (u) => -(Math.cos(Math.PI * clamp01(u)) - 1) / 2,
  quadIn: (u) => { const x = clamp01(u); return x * x; },
  quadOut: (u) => { const x = clamp01(u); return 1 - (1 - x) * (1 - x); },
  quadInOut: (u) => { const x = clamp01(u); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; },
  cubicIn: (u) => { const x = clamp01(u); return x * x * x; },
  cubicOut: (u) => { const x = clamp01(u); return 1 - Math.pow(1 - x, 3); },
  cubicInOut: (u) => { const x = clamp01(u); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  quartIn: (u) => Math.pow(clamp01(u), 4),
  quartOut: (u) => 1 - Math.pow(1 - clamp01(u), 4),
  quartInOut: (u) => { const x = clamp01(u); return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; },
  quintOut: (u) => 1 - Math.pow(1 - clamp01(u), 5),
  expoIn: (u) => (clamp01(u) === 0 ? 0 : Math.pow(2, 10 * clamp01(u) - 10)),
  expoOut: (u) => (clamp01(u) === 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(u))),
  expoInOut: (u) => {
    const x = clamp01(u);
    if (x === 0) return 0;
    if (x === 1) return 1;
    return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
  },
  circOut: (u) => Math.sqrt(1 - Math.pow(clamp01(u) - 1, 2)),
  /** 冲过头再回弹：卡片「啪」地落位，是最便宜的精致感 */
  backOut: (u) => { const x = clamp01(u); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  backIn: (u) => { const x = clamp01(u); return c3 * x * x * x - c1 * x * x; },
  backInOut: (u) => {
    const x = clamp01(u);
    const c2 = c1 * 1.525;
    return x < 0.5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
  },
  elasticOut: (u) => {
    const x = clamp01(u);
    if (x === 0 || x === 1) return x;
    const p = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * p) + 1;
  },
  bounceOut: (u) => {
    const x = clamp01(u);
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75; }
    if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375; }
    const y = x - 2.625 / d1;
    return n1 * y * y + 0.984375;
  },

  // ── 命名曲线：直接给「要什么感觉」用 ──────────────────────────────
  /** 参考片实测的指数长尾：前 30% 走完 80% 位移，尾巴拖很长 */
  ref: cubicBezier(0.16, 1, 0.3, 1),
  /** 落位：快出、微冲、收住 */
  snap: cubicBezier(0.22, 1.2, 0.36, 1),
  /** 电影级慢入：起步几乎不动，后段加速 */
  cine: cubicBezier(0.65, 0, 0.35, 1),
  /** 甩出去：起步极快，长尾阻尼 */
  throw: cubicBezier(0.05, 0.9, 0.15, 1),
};

export const EASE_NAMES = Object.keys(EASE);

/** 按名字取缓动；名字不认识就退回 ref，绝不抛错（配置不该渲染失败） */
export function ease(name: string | EaseFn | undefined, u: number): number {
  if (typeof name === "function") return name(clamp01(u));
  const f = name ? EASE[name] : undefined;
  return (f ?? EASE.ref)(clamp01(u));
}
export const E = EASE;

// ---------------------------------------------------------------------------
// 弹簧 / 错峰
// ---------------------------------------------------------------------------

/**
 * 解析式阻尼振子。u 是归一化时间（0→1 应该基本稳定）。
 * 不是物理积分：Remotion 要多进程并渲，解析式才保证每一帧可独立算出。
 */
export function spring(u: number, o: { damping?: number; freq?: number; from?: number; to?: number } = {}): number {
  const d = o.damping ?? 6.5;
  const f = o.freq ?? 1.35;
  const from = o.from ?? 0;
  const to = o.to ?? 1;
  const x = u <= 0 ? 0 : u;
  const v = 1 - Math.exp(-d * x) * Math.cos(2 * Math.PI * f * x);
  return from + (to - from) * v;
}

/**
 * 第 i 个元素的错峰进度（已经过缓动）。
 *
 * 这是取代「所有卡片同时淡入」的关键：错峰本身就是节奏，
 * 观众读到的「高级」很大一部分来自这个相位差。
 */
export function stagger(
  p: number,
  i: number,
  o: { each?: number; dur?: number; ease?: string | EaseFn; from?: number } = {},
): number {
  const each = o.each ?? 0.075;
  const dur = o.dur ?? 0.42;
  const start = (o.from ?? 0) + i * each;
  const u = clamp01((p - start) / Math.max(1e-6, dur));
  return ease(o.ease ?? "snap", u);
}

/** 从中心向外的错峰序号：0 在正中，越大越靠外 */
export function radialOrder(i: number, n: number): number {
  const c = (n - 1) / 2;
  return Math.abs(i - c) * 1.35 + (i < c ? 0 : 0.18); // 出画时顺序略偏
}

// ---------------------------------------------------------------------------
// 曲线路径
// ---------------------------------------------------------------------------

export const bezierPt = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

export const quadPt = (p0: Pt, p1: Pt, p2: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
};

export const bezierTan = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  return [
    3 * v * v * (p1[0] - p0[0]) + 6 * v * u * (p2[0] - p1[0]) + 3 * u * u * (p3[0] - p2[0]),
    3 * v * v * (p1[1] - p0[1]) + 6 * v * u * (p2[1] - p1[1]) + 3 * u * u * (p3[1] - p2[1]),
  ];
};

export type Pose = { x: number; y: number; angle: number };

/**
 * 均匀速度的路径采样器。
 *
 * 为什么需要：直接拿 u 当参数走贝塞尔，速度是**不均匀**的（端点慢中间快），
 * 叠上 ease 会双倍失真。先按弧长重参数化，再叠缓动，才是「匀速贝塞尔 + 缓动」。
 */
export function pathSampler(fn: (u: number) => Pt, samples = 32) {
  const pts: Pt[] = [];
  const arc: number[] = [0];
  for (let i = 0; i <= samples; i++) pts.push(fn(i / samples));
  for (let i = 1; i <= samples; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    arc.push(arc[i - 1] + Math.hypot(dx, dy));
  }
  const total = arc[samples] || 1;
  return (u: number): Pose => {
    const target = clamp01(u) * total;
    let k = 1;
    while (k < samples && arc[k] < target) k++;
    const seg = arc[k] - arc[k - 1] || 1;
    const f = (target - arc[k - 1]) / seg;
    const a = pts[k - 1];
    const b = pts[k];
    return {
      x: lerp(a[0], b[0], f),
      y: lerp(a[1], b[1], f),
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
  };
}

/** Catmull-Rom 样条（穿过所有控制点），用于「多段折线但拐角是圆的」 */
export function catmullRom(pts: Pt[], u: number): Pt {
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1) return pts[0];
  const n = pts.length - 1;
  const s = clamp01(u) * n;
  const i = Math.min(n - 1, Math.floor(s));
  const f = s - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const f2 = f * f;
  const f3 = f2 * f;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * f + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * f + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3),
  ];
}

/**
 * 常用入场路径：从屏幕外某点弯进来。
 * `bow` 控制弯曲度（0 = 直线，0.3 = 明显弧线，负数反向弯）。
 */
export function enterPath(from: Pt, to: Pt, bow = 0.18) {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  // 法线方向偏移，得到一条弧
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  const c1: Pt = [from[0] + dx * 0.28 + (nx / len) * len * bow * 0.5, from[1] + dy * 0.28 + (ny / len) * len * bow * 0.5];
  const c2: Pt = [from[0] + dx * 0.72 + (nx / len) * len * bow * 0.5, from[1] + dy * 0.72 + (ny / len) * len * bow * 0.5];
  return pathSampler((u) => bezierPt(from, c1, c2, to, u));
}

// ---------------------------------------------------------------------------
// 确定性随机
// ---------------------------------------------------------------------------

/** 由 seed 得到 [0,1) 的确定性伪随机（同一 seed 恒等，跨进程一致） */
export function rnd(seed: number): number {
  let x = (seed | 0) * 1103515245 + 12345;
  x = (x ^ (x >>> 16)) >>> 0;
  x = (x * 2246822507) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  return (x % 100000) / 100000;
}
export const rndIn = (seed: number, lo: number, hi: number) => lo + rnd(seed) * (hi - lo);
export const rndSign = (seed: number) => (rnd(seed) < 0.5 ? -1 : 1);

// ---------------------------------------------------------------------------
// 运动模糊 / 拖尾（元素级多次重绘）
// ---------------------------------------------------------------------------

export type BlurOpts = {
  /** 重影数量，5~8 是甜点；超过 10 会糊成一片 */
  samples?: number;
  /** 总拖影长度占位移的比例 */
  strength?: number;
  /** 是否让重影逐渐缩小（径向模糊感） */
  taper?: number;
};

/**
 * 线性运动模糊：把元素沿速度反方向重绘 N 次。
 *
 * 为什么不用 `ctx.filter = blur()`：那是各向同性模糊，快速平移的元素会变成
 * 「一团软」，而不是「一条尾巴」。方向性才是运动模糊的灵魂。
 */
export function motionBlur(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  dx: number,
  dy: number,
  o: BlurOpts = {},
) {
  const n = Math.max(1, Math.min(12, o.samples ?? 6));
  const strength = o.strength ?? 0.55;
  const taper = o.taper ?? 0;
  if (n <= 1 || (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35)) {
    draw(g);
    return;
  }
  for (let i = n; i >= 1; i--) {
    const k = (i / n) * strength;
    const a = (1 - i / (n + 1)) * 0.75;
    const s = 1 - taper * (i / n);
    g.save();
    g.globalAlpha *= a;
    g.translate(dx * k, dy * k);
    if (taper > 0 && s !== 1) {
      // 以元素中心为锚缩放：调用方不传中心，用平移近似已经够看
      g.scale(s, s);
    }
    draw(g);
    g.restore();
  }
  g.save();
  draw(g);
  g.restore();
}

/** 径向模糊：从中心向外的拖影（穿梭 / 冲击时用） */
export function radialBlur(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  cx: number,
  cy: number,
  amount: number,
  samples = 6,
) {
  if (amount <= 0.001) {
    draw(g);
    return;
  }
  for (let i = samples; i >= 1; i--) {
    const k = 1 + (i / samples) * amount;
    g.save();
    g.globalAlpha *= (1 - i / (samples + 1)) * 0.6;
    g.translate(cx, cy);
    g.scale(k, k);
    g.translate(-cx, -cy);
    draw(g);
    g.restore();
  }
  draw(g);
}

// ---------------------------------------------------------------------------
// 合成类：色散 / 辉光 / 霓虹（drop-shadow 实现，GPU 加速）
// ---------------------------------------------------------------------------

/**
 * 色差色散：用两条彩色 drop-shadow 制造 RGB 分离。
 *
 * 之所以能这么做：`drop-shadow` 复制的是**alpha 轮廓**，所以偏移后的影子就是
 * 该元素在红/青通道上的位移版本 —— 这正是横向色差的成因。
 */
export function rgbSplit(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  amount = 2.2,
  o: { red?: string; cyan?: string } = {},
) {
  if (amount <= 0.01) {
    draw(g);
    return;
  }
  const red = o.red ?? "rgba(255,0,72,0.62)";
  const cyan = o.cyan ?? "rgba(0,168,255,0.62)";
  g.save();
  g.filter = `drop-shadow(${amount}px 0 0 ${red}) drop-shadow(${-amount}px 0 0 ${cyan})`;
  draw(g);
  g.restore();
}

/** 辉光 / Bloom（元素级）：亮部向外扩散的柔光 */
export function glow(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  radius = 24,
  color = "rgba(120,170,255,0.55)",
  layers = 2,
) {
  g.save();
  let f = "";
  for (let i = 0; i < layers; i++) f += `drop-shadow(0 0 ${radius * (1 + i * 0.85)}px ${color}) `;
  g.filter = f.trim();
  draw(g);
  g.restore();
}

/** 霓虹文字：外发光 + 内发光（内层用较小的白芯） */
export function neon(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  radius = 10,
  color = "rgba(120,190,255,0.85)",
) {
  g.save();
  g.filter = `drop-shadow(0 0 ${radius * 0.45}px ${color}) drop-shadow(0 0 ${radius * 1.4}px ${color}) drop-shadow(0 0 ${radius * 3}px ${color})`;
  draw(g);
  g.restore();
}

/** 光束扫过（漏光 / 掠光），以 gradient 覆盖，blend mode 由调用方设 */
export function lightSweep(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  alpha = 0.5,
) {
  g.save();
  g.globalCompositeOperation = "screen";
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(0.45, color);
  grd.addColorStop(0.55, color);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = alpha;
  g.fillStyle = grd;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}

// ---------------------------------------------------------------------------
// 景深（按层的各向同性模糊 —— 远处的东西就是该糊）
// ---------------------------------------------------------------------------

/**
 * 景深：给一个绘制过程套 blur。
 * 注意这是「层」的景深，不是逐像素 DOF；2D canvas 上这是能达到正确观感的做法，
 * 而且几乎零成本（Chromium 的 filter 走 GPU）。
 */
export function withDepthBlur(g: CanvasRenderingContext2D, px: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (px < 0.2) {
    draw(g);
    return;
  }
  g.save();
  g.filter = `blur(${px}px)`;
  draw(g);
  g.restore();
}

/** 按真实深度算模糊半径：对焦深度 focus，焦距外的偏移越大越糊，上限 max */
export function dofByDepth(depth: number, focus: number, k = 0.55, max = 9): number {
  return Math.min(max, Math.abs(depth - focus) * k);
}

// ---------------------------------------------------------------------------
// 组合：把「入场」一次算完
// ---------------------------------------------------------------------------

export type EnterFx = {
  /** 0 = 完全在外，1 = 落位 */
  p: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  alpha: number;
};

/**
 * 标准入场：位移沿曲线 + 缩放入 + 轻微旋转 + 透明度。
 *
 * 一个元素进场只调这一个函数，保证全片入场语言一致 ——
 * 这也是「不撞脸但要统一」的落点：形态可变，运动语汇不变。
 */
export function enter(
  p: number,
  target: Pt,
  o: {
    from?: Pt;
    bow?: number;
    ease?: string | EaseFn;
    dur?: number;
    scaleFrom?: number;
    rotateFrom?: number;
    fade?: boolean;
  } = {},
): EnterFx {
  const e = ease(o.ease ?? "ref", p);
  const from = o.from ?? [target[0] - 120, target[1] + 90];
  const path = enterPath(from, target, o.bow ?? 0.18);
  const pose = path(e);
  return {
    p: e,
    x: pose.x,
    y: pose.y,
    scale: lerp(o.scaleFrom ?? 0.94, 1, e),
    rotate: lerp(o.rotateFrom ?? 0, 0, e),
    alpha: o.fade === false ? 1 : clamp01(e * 1.35),
  };
}

/** 把 EnterFx 应用到画布上，画完自动还原 */
export function withEnter(g: CanvasRenderingContext2D, fx: EnterFx, draw: () => void) {
  g.save();
  g.globalAlpha *= fx.alpha;
  g.translate(fx.x, fx.y);
  if (fx.rotate) g.rotate(fx.rotate);
  if (fx.scale !== 1) g.scale(fx.scale, fx.scale);
  draw();
  g.restore();
}

/**
 * 路径上的瞬时速度（px/单位参数），用于给元素加方向性运动模糊。
 * 用前后差分而不是解析求导：路径可能是弧长重参数化后的，解析式拿不到。
 */
export function velocityOf(sample: (u: number) => Pose, u: number, du = 0.016): Pt {
  const a = sample(Math.max(0, u - du));
  const b = sample(Math.min(1, u + du));
  return [b.x - a.x, b.y - a.y];
}
