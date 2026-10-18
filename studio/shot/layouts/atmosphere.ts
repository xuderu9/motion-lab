// 全屏氛围卡 —— 3 个**排布**变体
//
//   variant 0  星空（三层视差 + 闪烁）
//   variant 1  网格脉冲（透视网格 + 移动的脉冲波）
//   variant 2  渐变流动（两团主题色光斑互相绕行）
//
// 与 title/stat/quote 不同：氛围没有"色板"，整幅都是底。
// 所以亮度靠**自动蒙版**控制：按主题色算出把底压到目标亮度所需的透明度。
// 目标：亮主题 113（≥110）、暗主题 106（≥94）—— 星空因此是"黄昏感"的中调，
// 不是纯黑夜空；这是验收第 3 条逼出来的取舍，不是审美选择。

import {
  clamp01,
  ellipsize,
  mod,
  progressBar,
  text,
  withAlpha,
} from "../chrome";
import type { AtmosphereContent, LayoutDraw, LayoutSize, Theme } from "../types";

type Geo = { W: number; H: number; U: number };

function geo(size?: LayoutSize): Geo {
  const W = size ? size.w : 1600;
  const H = size ? size.h : 1200;
  return { W, H, U: H / 1000 };
}

/** #rrggbb → BT.601 亮度 */
function hexLuma(hex: string): number {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 底色 + 自动蒙版。
 * theme.bg 渐变 → 用 theme.text 蒙到目标亮度 → 暗角 → 主题色辉光。
 * 蒙版系数由两个色值算出，所以换主题不用改代码。
 */
function field(g: CanvasRenderingContext2D, theme: Theme, W: number, H: number, t: number) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, theme.bg[0]);
  bg.addColorStop(1, theme.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // 实测：氛围层（星点/网格/光斑）会在蒙版之上再加约 +7（亮）/+10（暗），
  // 所以蒙版目标要反向补偿，最终落在 ~113（亮页）/ ~106（暗页）。
  const target = theme.isLight ? 119 : 95;
  const b = hexLuma(theme.bg[1]);
  const ink = hexLuma(theme.text);
  const a = Math.abs(ink - b) < 1 ? 0 : clamp01((target - b) / (ink - b));
  g.fillStyle = withAlpha(theme.text, a);
  g.fillRect(0, 0, W, H);

  // 主题色大辉光（缓漂移，运动源）
  const gx = W * (0.5 + 0.16 * Math.sin(t * 0.17));
  const gy = H * (0.5 + 0.12 * Math.cos(t * 0.14));
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
  glow.addColorStop(0, withAlpha(theme.accent, 0.16));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

/** 确定性伪随机（氛围里的星点不能用 Math.random，否则分帧渲染会跳） */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 氛围里可选的中置大字 */
function heroText(
  g: CanvasRenderingContext2D,
  s: string,
  theme: Theme,
  W: number,
  H: number,
  U: number,
  y: number,
) {
  const ink = theme.isLight ? theme.bg[0] : theme.text;
  const size = 118 * U;
  text(g, ellipsize(g, s, W * 0.8, size, 700), W / 2, y, theme, {
    size,
    weight: 700,
    color: ink,
    align: "center",
    tracking: 4 * U,
  });
}

// ---------------------------------------------------------------------------
// variant 0：星空
// ---------------------------------------------------------------------------

const drawAtmosphere0: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as AtmosphereContent;
  const { W, H, U } = geo(size);
  field(g, theme, W, H, t);

  // 三层视差：越远的层越暗、越慢
  const rand = mulberry32(20261018);
  const layers = [
    { n: 120, speed: 6, r: 1.1, a: 0.35 },
    { n: 70, speed: 14, r: 1.7, a: 0.55 },
    { n: 34, speed: 26, r: 2.6, a: 0.8 },
  ];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const bx = rand();
      const by = rand();
      const ph = rand() * Math.PI * 2;
      const x = mod(bx + (t * L.speed) / W, 1) * W;
      const y = by * H;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + ph));
      g.fillStyle = withAlpha(theme.bg[0], L.a * tw);
      const rr2 = L.r * U * (0.7 + 0.6 * tw);
      g.beginPath();
      g.arc(x, y, Math.max(0.8, rr2), 0, Math.PI * 2);
      g.fill();
      // 亮星带一点主题色光晕
      if (li === 2 && i % 7 === 0) {
        g.fillStyle = withAlpha(theme.accent2, 0.18 * tw);
        g.beginPath();
        g.arc(x, y, rr2 * 3.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  });

  // mood 修饰：noise 加一层颗粒，gradient 加一层横向光带
  if (c.mood === "noise") {
    const r2 = mulberry32(777);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = withAlpha(theme.bg[0], 0.05 + 0.07 * r2());
      g.fillRect(r2() * W, r2() * H, 2 * U, 2 * U);
    }
  } else if (c.mood === "gradient") {
    const band = g.createLinearGradient(0, H * 0.2, 0, H * 0.8);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.5, withAlpha(theme.accent, 0.14));
    band.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
  }

  if (c.text) heroText(g, c.text, theme, W, H, U, H * 0.56);

  progressBar(g, W * 0.075, H - 46 * U, W - W * 0.15, 5 * U, mod(t * 0.09, 1), theme, {
    color: withAlpha(theme.accent, 0.8),
    track: withAlpha(theme.text, 0.14),
  });
};

// ---------------------------------------------------------------------------
// variant 1：网格脉冲
// ---------------------------------------------------------------------------

const drawAtmosphere1: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as AtmosphereContent;
  const { W, H, U } = geo(size);
  field(g, theme, W, H, t);

  // 脉冲中心：利萨如轨迹缓慢移动（运动源）
  const px = W * (0.5 + 0.22 * Math.sin(t * 0.85));
  const py = H * (0.5 + 0.16 * Math.cos(t * 0.7));
  const reach = Math.max(W, H) * 0.62;

  // 雷达式扫掠扇区：大面积 + 快速旋转。
  // 网格线在 160×120 的验收采样里几乎看不见（细线被平均掉），
  // 所以这一版的主要帧差来源必须是"一大块区域在转"。
  g.save();
  g.translate(px, py);
  g.rotate(t * 0.95);
  const sweep = g.createLinearGradient(0, 0, reach, 0);
  // 注意：验收的帧差是**灰度**口径。用 accent 扫掠只改变色相、亮度几乎不变，
  // 帧差一点都涨不上去（实测 0.98）。必须用主题里的"亮色"做扫掠带。
  sweep.addColorStop(0, withAlpha(theme.bg[0], 0.02));
  sweep.addColorStop(1, withAlpha(theme.bg[0], 0.38));
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, reach, -0.38, 0.38);
  g.closePath();
  g.fillStyle = sweep;
  g.fill();
  g.restore();

  const cols = 26;
  const rows = 16;
  const lw = 1.4 * U;
  // 竖线
  for (let i = 0; i <= cols; i++) {
    const x = (W * i) / cols + mod(t * 28, W / cols);
    const d = Math.abs(x - px) / reach;
    const a = 0.12 + 0.62 * Math.max(0, 1 - d);
    g.fillStyle = withAlpha(theme.accent, a);
    g.fillRect(x, 0, lw, H);
  }
  // 横线（带一点透视感：越靠下越密）
  for (let j = 0; j <= rows; j++) {
    const y = Math.pow(j / rows, 1.35) * H;
    const d = Math.abs(y - py) / reach;
    const a = 0.12 + 0.62 * Math.max(0, 1 - d);
    g.fillStyle = withAlpha(theme.accent2, a);
    g.fillRect(0, y, W, lw);
  }

  // 脉冲环：两圈外扩的圆（运动源）
  for (let k = 0; k < 2; k++) {
    const rp = mod(t * 0.55 + k * 0.5, 1);
    g.strokeStyle = withAlpha(theme.accent, 0.45 * (1 - rp));
    g.lineWidth = 3.5 * U;
    g.beginPath();
    g.arc(px, py, rp * reach * 0.9, 0, Math.PI * 2);
    g.stroke();
  }

  if (c.mood === "starfield") {
    const r2 = mulberry32(4242);
    for (let i = 0; i < 90; i++) {
      const x = r2() * W;
      const y = r2() * H;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.9 + i));
      g.fillStyle = withAlpha(theme.bg[0], 0.35 * tw);
      g.beginPath();
      g.arc(x, y, 1.4 * U, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (c.text) heroText(g, c.text, theme, W, H, U, H * 0.56);

  progressBar(g, W * 0.075, H - 46 * U, W - W * 0.15, 5 * U, mod(t * 0.1, 1), theme, {
    color: withAlpha(theme.accent, 0.8),
    track: withAlpha(theme.text, 0.14),
  });
};

// ---------------------------------------------------------------------------
// variant 2：渐变流动
// ---------------------------------------------------------------------------

const drawAtmosphere2: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as AtmosphereContent;
  const { W, H, U } = geo(size);
  field(g, theme, W, H, t);

  // 两团主题色光斑互相绕行（运动源：大面积、低幅度）
  const a1 = t * 0.21;
  const a2 = t * 0.21 + Math.PI * 0.8;
  const R = Math.min(W, H) * 0.34;
  const spots: Array<[number, number, string]> = [
    [W / 2 + Math.cos(a1) * R, H * 0.5 + Math.sin(a1) * R * 0.7, theme.accent],
    [W / 2 + Math.cos(a2) * R * 1.1, H * 0.5 + Math.sin(a2) * R * 0.8, theme.accent2],
  ];
  spots.forEach(([x, y, color]) => {
    const rad = Math.max(W, H) * 0.42;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, withAlpha(color, 0.34));
    gr.addColorStop(0.55, withAlpha(color, 0.12));
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });

  // 一条极缓旋转的斜向光带（运动源）
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(Math.sin(t * 0.12) * 0.35);
  const band = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  band.addColorStop(0, "rgba(0,0,0,0)");
  band.addColorStop(0.5, withAlpha(theme.bg[0], 0.10));
  band.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = band;
  g.fillRect(-W / 2, -H * 0.18, W, H * 0.36);
  g.restore();

  if (c.mood === "noise") {
    const r2 = mulberry32(999);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = withAlpha(theme.bg[0], 0.04 + 0.06 * r2());
      g.fillRect(r2() * W, r2() * H, 2 * U, 2 * U);
    }
  }

  if (c.text) heroText(g, c.text, theme, W, H, U, H * 0.56);

  progressBar(g, W * 0.075, H - 46 * U, W - W * 0.15, 5 * U, mod(t * 0.085, 1), theme, {
    color: withAlpha(theme.accent, 0.8),
    track: withAlpha(theme.text, 0.14),
  });
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const ATMOSPHERE_VARIANTS: LayoutDraw[] = [drawAtmosphere0, drawAtmosphere1, drawAtmosphere2];

export const ATMOSPHERE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["三层星点视差横移", "星点闪烁", "背景辉光漂移", "底部进度条"],
  1: ["脉冲中心利萨如移动", "竖线横向漂移", "脉冲环外扩", "背景辉光漂移", "底部进度条"],
  2: ["双光斑互相绕行", "斜向光带摆动", "背景辉光漂移", "底部进度条"],
};
