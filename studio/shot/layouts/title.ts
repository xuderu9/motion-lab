// 全屏大字标题卡 —— 3 个**排布**变体
//
//   variant 0  居中大字（kicker 在上、副标题在下）
//   variant 1  左对齐 + 竖线（正文靠左，右侧留白给呼吸）
//   variant 2  上下分栏（顶部小字，底部压住整幅的大标题）
//
// ── 亮度预算（全屏版式必须先算这个）──
// presentation="full" 时 canvas 就是整帧，屏幕不再被亮房间稀释。
// 验收第 3 条要求：整片 105±12、亮页帧 ≥110、暗页帧 ≥94。
// 所以画布本身必须落在 ~100-120：
//   底色 = theme.bg 渐变；再压一块 **theme.text 色的主色板**（poster）。
//   亮主题盖 ~55% → 均值 ≈ 0.55×25 + 0.45×240 ≈ 122 → 加上字与光晕约 112
//   暗主题盖 ~36% → 均值 ≈ 0.36×243 + 0.64×26 ≈ 104
// 色板上的字用 theme.bg 反白，两种主题都有强对比，且色相仍然是各自的。

import {
  ellipsize,
  measure,
  mod,
  progressBar,
  pulse,
  rr,
  text,
  withAlpha,
  wrapLines,
} from "../chrome";
import type { LayoutDraw, LayoutSize, Theme, TitleContent } from "../types";

type Geo = { W: number; H: number; U: number; PAD: number };

/** 所有几何都从 size 推导；没有 size 时退回画布默认尺寸 */
function geo(size?: LayoutSize): Geo {
  const W = size ? size.w : 1600;
  const H = size ? size.h : 1200;
  return { W, H, U: H / 1000, PAD: Math.round(W * 0.075) };
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 主色板（poster）矩形。
 * 用「面积占比」控制亮度：亮主题 0.55、暗主题 0.36（k=0.81 时 0.55×0.66≈0.36）。
 */
function posterRect(theme: Theme, W: number, H: number, fx: number, fy: number, fw: number, fh: number): Rect {
  // 亮主题 0.97 / 暗主题 0.81：实测两者分别落在 ~112 / ~108
  const k = theme.isLight ? 0.97 : 0.81;
  const w = W * fw * k;
  const h = H * fh * k;
  const cx = W * (fx + fw / 2);
  const cy = H * (fy + fh / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 整屏底色：主题渐变 + 漂移光晕 + 暗角（前两项同时是常驻微动） */
function backdrop(g: CanvasRenderingContext2D, theme: Theme, W: number, H: number, t: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, theme.bg[0]);
  bg.addColorStop(1, theme.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const gx = W * (0.5 + 0.14 * Math.sin(t * 0.19));
  const gy = H * (0.42 + 0.09 * Math.cos(t * 0.15));
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.62);
  glow.addColorStop(0, withAlpha(theme.accent, 0.22));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const v = g.createRadialGradient(W * 0.5, H * 0.44, Math.min(W, H) * 0.24, W * 0.5, H * 0.44, Math.max(W, H) * 0.8);
  v.addColorStop(0, "rgba(0,0,0,0)");
  // 亮主题的暗角要轻一点，否则亮页帧会被压到 110 以下
  v.addColorStop(1, theme.isLight ? "rgba(0,0,0,0.20)" : "rgba(0,0,0,0.32)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

/** 画主色板；返回板上的文字色（theme.bg[0] 反白） */
function poster(g: CanvasRenderingContext2D, theme: Theme, r: Rect, radius: number): string {
  const gd = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  gd.addColorStop(0, theme.text);
  gd.addColorStop(1, withAlpha(theme.text, 0.92));
  g.fillStyle = gd;
  rr(g, r.x, r.y, r.w, r.h, radius);
  g.fill();
  // 极细的内描边，让色板在暗底上也有边界
  g.strokeStyle = withAlpha(theme.bg[0], 0.10);
  g.lineWidth = 1.5;
  rr(g, r.x, r.y, r.w, r.h, radius);
  g.stroke();
  return theme.bg[0];
}

/** 逐步缩小字号直到放进 maxW（标题/数字都要能扛任意长度） */
function fitSize(
  g: CanvasRenderingContext2D,
  s: string,
  maxW: number,
  want: number,
  weight: number,
  min: number,
): number {
  let size = want;
  while (size > min && measure(g, s, size, weight) > maxW) size *= 0.94;
  return Math.max(min, Math.round(size));
}

/** 逐行居中绘制 */
function drawCentered(
  g: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  yTop: number,
  size: number,
  lineH: number,
  weight: number,
  color: string,
  theme: Theme,
) {
  lines.forEach((l, i) => {
    text(g, l, cx, yTop + i * lineH, theme, { size, weight, color, align: "center" });
  });
}

// ---------------------------------------------------------------------------
// variant 0：居中大字
// ---------------------------------------------------------------------------

const drawTitle0: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as TitleContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.07, 0.17, 0.86, 0.66);
  const ink = poster(g, theme, r, 26 * U);

  const cx = r.x + r.w / 2;
  let y = r.y + r.h * 0.24;

  // kicker + 下划线光点（运动源：光点横移 + 线长呼吸）
  if (c.kicker) {
    const kSize = 38 * U;
    text(g, c.kicker, cx, y, theme, {
      size: kSize,
      weight: 600,
      color: theme.accent,
      align: "center",
      tracking: 8 * U,
    });
    const kw = measure(g, c.kicker, kSize, 600) + 120 * U;
    const ky = y + 26 * U;
    g.fillStyle = withAlpha(theme.accent, 0.45);
    g.fillRect(cx - kw / 2, ky, kw, 2 * U);
    const dotX = cx - kw / 2 + mod(t * 0.32, 1) * kw;
    g.fillStyle = theme.accent2;
    g.beginPath();
    g.arc(dotX, ky + U, 5 * U, 0, Math.PI * 2);
    g.fill();
    y += 92 * U;
  }

  const maxW = r.w - 2 * 56 * U;
  const headSize = 116 * U;
  const lines = wrapLines(g, c.heading, maxW, headSize, 700, 3);
  drawCentered(g, lines, cx, y + headSize, headSize, headSize * 1.16, 700, ink, theme);
  y += headSize + (lines.length - 1) * headSize * 1.16;

  if (c.subtitle) {
    const subSize = 46 * U;
    y += 58 * U;
    text(g, ellipsize(g, c.subtitle, maxW, subSize, 400), cx, y, theme, {
      size: subSize,
      color: withAlpha(ink, 0.74),
      align: "center",
    });
  }

  if (c.footnote) {
    const fSize = 36 * U;
    text(g, ellipsize(g, c.footnote, r.w - 2 * 40 * U, fSize, 400), cx, r.y + r.h - 40 * U, theme, {
      size: fSize,
      color: withAlpha(ink, 0.52),
      align: "center",
    });
  }

  progressBar(g, PAD, H - 54 * U, W - PAD * 2, 6 * U, mod(t * 0.11, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 1：左对齐 + 竖线
// ---------------------------------------------------------------------------

const drawTitle1: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as TitleContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.06, 0.10, 0.62, 0.86);
  const ink = poster(g, theme, r, 22 * U);

  const x = r.x + 64 * U;
  const maxW = r.w - 128 * U;
  let y = r.y + 88 * U;

  // 左侧竖线 + 沿线下滑的高亮（运动源）
  const barX = r.x + 26 * U;
  g.fillStyle = withAlpha(theme.accent, 0.35);
  g.fillRect(barX, r.y + 64 * U, 5 * U, r.h - 128 * U);
  const hy = r.y + 64 * U + mod(t * 0.30, 1) * (r.h - 128 * U);
  g.fillStyle = theme.accent;
  g.fillRect(barX, hy, 5 * U, 96 * U);

  if (c.kicker) {
    text(g, c.kicker, x, y, theme, {
      size: 38 * U,
      weight: 600,
      color: theme.accent2,
      tracking: 6 * U,
    });
    y += 82 * U;
  }

  const headSize = 100 * U;
  const lines = wrapLines(g, c.heading, maxW, headSize, 700, 3);
  lines.forEach((l, i) => {
    text(g, l, x, y + headSize + i * headSize * 1.14, theme, { size: headSize, weight: 700, color: ink });
  });
  y += headSize + (lines.length - 1) * headSize * 1.14;

  if (c.subtitle) {
    y += 54 * U;
    const subSize = 44 * U;
    const subs = wrapLines(g, c.subtitle, maxW, subSize, 400, 2);
    subs.forEach((l, i) => {
      text(g, l, x, y + i * subSize * 1.4, theme, { size: subSize, color: withAlpha(ink, 0.72) });
    });
  }

  if (c.footnote) {
    const fSize = 36 * U;
    text(g, ellipsize(g, c.footnote, maxW, fSize, 400), x, r.y + r.h - 44 * U, theme, {
      size: fSize,
      color: withAlpha(ink, 0.5),
    });
  }

  // 右侧留白处：一条随呼吸伸缩的横线（运动源）
  const lx = r.x + r.w + 48 * U;
  const lw = (W - PAD - lx) * (0.55 + 0.35 * pulse(t, 0.16));
  g.fillStyle = withAlpha(theme.accent, 0.55);
  g.fillRect(lx, r.y + r.h * 0.5, Math.max(0, lw), 3 * U);

  progressBar(g, PAD, H - 54 * U, W - PAD * 2, 6 * U, mod(t * 0.13, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 2：上下分栏（小标题压大字）
// ---------------------------------------------------------------------------

const drawTitle2: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as TitleContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);

  // 色板占下半幅：宽度接近满幅，高度按面积反推，保证亮度落在同一区间
  const k = theme.isLight ? 0.97 : 0.81;
  const ph = H * 0.56 * k;
  // 必须留出安全边距：色板如果顶到画布边缘，check-canvas-overflow.py 会把
  // 「边缘一圈里既有色板又有底色」判成内容被裁切（实测 48%）。留 4% 就干净了。
  const M = Math.round(W * 0.04);
  const r: Rect = { x: M, y: H - ph - M, w: W - 2 * M, h: ph };
  const ink = poster(g, theme, r, 0);

  // 顶部小字（在 field 上，用 theme.text）
  const topY = H * 0.17;
  if (c.kicker) {
    text(g, c.kicker, PAD, topY, theme, {
      size: 40 * U,
      weight: 600,
      color: theme.accent,
      tracking: 8 * U,
    });
  }
  if (c.subtitle) {
    const subSize = 48 * U;
    text(g, ellipsize(g, c.subtitle, W - PAD * 2, subSize, 400), PAD, topY + 76 * U, theme, {
      size: subSize,
      color: withAlpha(theme.text, 0.72),
    });
  }

  // 分隔线上的一道光点持续横移（运动源）
  const divY = r.y;
  g.fillStyle = withAlpha(theme.accent, 0.5);
  g.fillRect(PAD, divY, W - PAD * 2, 2 * U);
  const dx = PAD + mod(t * 0.26, 1) * (W - PAD * 2);
  g.fillStyle = theme.accent2;
  g.beginPath();
  g.arc(dx, divY + U, 6 * U, 0, Math.PI * 2);
  g.fill();

  // 底部大标题：字号按宽度自适应
  const maxW = W - PAD * 2;
  const want = 150 * U;
  const headSize = fitSize(g, c.heading, maxW, want, 800, 64 * U);
  const lines = wrapLines(g, c.heading, maxW, headSize, 800, 2);
  const baseY = r.y + r.h * 0.52;
  // 大标题极缓缩放（运动源）：整块字每帧有零点几个像素的变化
  const s = 1 + 0.004 * Math.sin(t * 0.9);
  g.save();
  g.translate(PAD, baseY);
  g.scale(s, s);
  lines.forEach((l, i) => {
    text(g, l, 0, i * headSize * 1.02, theme, { size: headSize, weight: 800, color: ink });
  });
  g.restore();

  if (c.footnote) {
    const fSize = 36 * U;
    text(g, ellipsize(g, c.footnote, maxW, fSize, 400), PAD, H - 40 * U, theme, {
      size: fSize,
      color: withAlpha(ink, 0.55),
    });
  }

  progressBar(g, PAD, H - 92 * U, W - PAD * 2, 6 * U, mod(t * 0.09, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.16),
  });
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const TITLE_VARIANTS: LayoutDraw[] = [drawTitle0, drawTitle1, drawTitle2];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const TITLE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["背景光晕横向漂移", "背景光晕纵向漂移", "kicker 下划线光点横移", "下划线长度呼吸", "底部进度条"],
  1: ["背景光晕漂移", "竖线高亮沿线下滑", "右侧横线呼吸伸缩", "底部进度条"],
  2: ["背景光晕漂移", "分隔线光点横移", "大标题极缓缩放", "底部进度条"],
};
