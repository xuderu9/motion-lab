// 全屏单数字卡 —— 3 个**排布**变体
//
//   variant 0  居中巨字（delta 在上、label 与 note 在下）
//   variant 1  左巨字 + 右说明（右侧带一条持续的柱状呼吸）
//   variant 2  数字 + 背景大圆环（环在转，数字压在环心）
//
// 亮度预算与 title.ts 相同：theme.bg 铺底 + 一块 theme.text 色板，
// 亮主题盖 ~55%、暗主题 ~36%，两种主题都落在 100~120。

import {
  barsV,
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
import type { LayoutDraw, LayoutSize, StatContent, Theme } from "../types";

type Geo = { W: number; H: number; U: number; PAD: number };
type Rect = { x: number; y: number; w: number; h: number };

function geo(size?: LayoutSize): Geo {
  const W = size ? size.w : 1600;
  const H = size ? size.h : 1200;
  return { W, H, U: H / 1000, PAD: Math.round(W * 0.075) };
}

function posterRect(theme: Theme, W: number, H: number, fx: number, fy: number, fw: number, fh: number): Rect {
  const k = theme.isLight ? 0.97 : 0.81;
  const w = W * fw * k;
  const h = H * fh * k;
  const cx = W * (fx + fw / 2);
  const cy = H * (fy + fh / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function backdrop(g: CanvasRenderingContext2D, theme: Theme, W: number, H: number, t: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, theme.bg[0]);
  bg.addColorStop(1, theme.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const gx = W * (0.5 + 0.13 * Math.sin(t * 0.17 + 1.1));
  const gy = H * (0.5 + 0.1 * Math.cos(t * 0.13));
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.55);
  glow.addColorStop(0, withAlpha(theme.accent2, 0.20));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const v = g.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.22, W * 0.5, H * 0.45, Math.max(W, H) * 0.8);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, theme.isLight ? "rgba(0,0,0,0.20)" : "rgba(0,0,0,0.32)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

function poster(g: CanvasRenderingContext2D, theme: Theme, r: Rect, radius: number): string {
  g.fillStyle = theme.text;
  rr(g, r.x, r.y, r.w, r.h, radius);
  g.fill();
  g.strokeStyle = withAlpha(theme.bg[0], 0.10);
  g.lineWidth = 1.5;
  rr(g, r.x, r.y, r.w, r.h, radius);
  g.stroke();
  return theme.bg[0];
}

function fitSize(
  g: CanvasRenderingContext2D,
  s: string,
  maxW: number,
  want: number,
  weight: number,
  min: number,
): number {
  let size = want;
  while (size > min && measure(g, s, size, weight) > maxW) size *= 0.93;
  return Math.max(min, Math.round(size));
}

/** 涨跌药丸（颜色只取主题 token） */
function deltaChip(
  g: CanvasRenderingContext2D,
  s: string,
  cx: number,
  y: number,
  theme: Theme,
  size: number,
  ink: string,
  t: number,
) {
  const w = measure(g, s, size, 700) + size * 1.4;
  const h = size * 1.6;
  g.fillStyle = withAlpha(theme.accent2, 0.26 + 0.08 * pulse(t, 0.5));
  rr(g, cx - w / 2, y, w, h, h / 2);
  g.fill();
  text(g, s, cx, y + h * 0.68, theme, { size, weight: 700, color: ink, align: "center" });
  return h;
}

// ---------------------------------------------------------------------------
// variant 0：居中巨字
// ---------------------------------------------------------------------------

const drawStat0: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as StatContent;
  const { W, H, U } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.07, 0.18, 0.86, 0.64);
  const ink = poster(g, theme, r, 28 * U);

  const cx = r.x + r.w / 2;
  const maxW = r.w - 2 * 56 * U;
  let y = r.y + 86 * U;

  if (c.delta) {
    const dh = deltaChip(g, c.delta, cx, y, theme, 40 * U, ink, t);
    y += dh + 54 * U;
  }

  const valueSize = fitSize(g, c.value, maxW, 230 * U, 800, 88 * U);
  // 数字极缓呼吸（运动源）
  const s = 1 + 0.005 * Math.sin(t * 1.05);
  g.save();
  g.translate(cx, y + valueSize * 0.82);
  g.scale(s, s);
  text(g, c.value, 0, 0, theme, { size: valueSize, weight: 800, color: ink, align: "center" });
  g.restore();
  y += valueSize * 0.92 + 46 * U;

  const labelSize = 56 * U;
  text(g, ellipsize(g, c.label, maxW, labelSize, 500), cx, y, theme, {
    size: labelSize,
    weight: 500,
    color: withAlpha(ink, 0.86),
    align: "center",
  });

  if (c.note) {
    const noteSize = 38 * U;
    text(g, ellipsize(g, c.note, maxW, noteSize, 400), cx, r.y + r.h - 46 * U, theme, {
      size: noteSize,
      color: withAlpha(ink, 0.5),
      align: "center",
    });
  }

  // 数字下方一条随呼吸伸缩的短线（运动源）
  const uw = (r.w * 0.26) * (0.7 + 0.3 * pulse(t, 0.22));
  g.fillStyle = withAlpha(theme.accent, 0.75);
  g.fillRect(cx - uw / 2, r.y + r.h - 92 * U, uw, 4 * U);

  progressBar(g, W * 0.075, H - 54 * U, W - W * 0.15, 6 * U, mod(t * 0.1, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 1：左巨字 + 右说明
// ---------------------------------------------------------------------------

const drawStat1: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as StatContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.05, 0.10, 0.60, 0.86);
  const ink = poster(g, theme, r, 24 * U);

  const x = r.x + 56 * U;
  const maxW = r.w - 112 * U;

  // 左：巨数字（按宽度自适应）
  const valueSize = fitSize(g, c.value, maxW, 196 * U, 800, 80 * U);
  text(g, c.value, x, r.y + r.h * 0.52, theme, { size: valueSize, weight: 800, color: ink });
  text(g, ellipsize(g, c.label, maxW, 52 * U, 500), x, r.y + r.h * 0.52 + 78 * U, theme, {
    size: 52 * U,
    weight: 500,
    color: withAlpha(ink, 0.84),
  });

  // 右：说明列（在 field 上，用 theme.text）
  const rx = r.x + r.w + 56 * U;
  const rw = W - PAD - rx;
  let y = r.y + 70 * U;

  text(g, ellipsize(g, c.label, rw, 44 * U, 500), rx, y, theme, {
    size: 44 * U,
    weight: 500,
    color: withAlpha(theme.text, 0.66),
  });
  y += 64 * U;

  if (c.delta) {
    const dw = measure(g, c.delta, 48 * U, 700) + 48 * U;
    g.fillStyle = withAlpha(theme.accent2, 0.28);
    rr(g, rx, y, dw, 68 * U, 34 * U);
    g.fill();
    text(g, c.delta, rx + 24 * U, y + 46 * U, theme, { size: 48 * U, weight: 700, color: theme.text });
    y += 106 * U;
  }

  // 柱状呼吸（运动源）：整列每帧都在变
  barsV(g, rx, y + 10 * U, rw, 180 * U, t, theme, {
    n: 14,
    speed: 1.9,
    highlight: Math.floor(mod(t * 0.9, 14)),
  });
  y += 230 * U;

  if (c.note) {
    text(g, ellipsize(g, c.note, rw, 38 * U, 400), rx, y, theme, {
      size: 38 * U,
      color: withAlpha(theme.text, 0.5),
    });
  }

  // 竖分隔线 + 沿线滑动的高亮（运动源）
  const dx = r.x + r.w + 24 * U;
  g.fillStyle = withAlpha(theme.text, 0.16);
  g.fillRect(dx, r.y, 2 * U, r.h);
  const hy = r.y + mod(t * 0.28, 1) * r.h;
  g.fillStyle = theme.accent;
  g.fillRect(dx, hy, 2 * U, 110 * U);

  progressBar(g, PAD, H - 54 * U, W - PAD * 2, 6 * U, mod(t * 0.12, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 2：数字 + 背景大圆环
// ---------------------------------------------------------------------------

const drawStat2: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as StatContent;
  const { W, H, U } = geo(size);

  backdrop(g, theme, W, H, t);

  // 大色板先铺（亮度账：亮主题 ~0.50、暗主题 ~0.33）
  // 色板放右侧、读数放左侧 —— 与 v0（居中宽卡）、v1（左侧高卡）三种排布互不重叠。
  // 面积仍按 0.60×0.86 控制，亮度与其它变体同一区间。
  const r = posterRect(theme, W, H, 0.36, 0.07, 0.60, 0.86);
  const ink = poster(g, theme, r, 30 * U);

  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.min(r.w, r.h) * 0.37;

  // 环：外圈虚线持续旋转（运动源）+ 轨道光点
  g.save();
  g.translate(cx, cy);
  g.rotate(t * 0.22);
  g.strokeStyle = withAlpha(theme.accent, 0.55);
  g.lineWidth = Math.max(2, 5 * U);
  g.setLineDash([26 * U, 22 * U]);
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.restore();

  // 第二圈：反向旋转的细实线（运动源）
  g.save();
  g.translate(cx, cy);
  g.rotate(-t * 0.13);
  g.strokeStyle = withAlpha(theme.accent2, 0.45);
  g.lineWidth = Math.max(1.5, 2.5 * U);
  g.beginPath();
  g.arc(0, 0, R * 0.86, 0, Math.PI * 0.62);
  g.stroke();
  g.restore();

  // 轨道光点
  const oa = t * 0.9;
  g.fillStyle = theme.accent2;
  g.beginPath();
  g.arc(cx + Math.cos(oa) * R, cy + Math.sin(oa) * R, 8 * U, 0, Math.PI * 2);
  g.fill();

  const maxW = r.w - 56 * U;
  const valueSize = fitSize(g, c.value, maxW, 186 * U, 800, 76 * U);
  text(g, c.value, cx, cy + valueSize * 0.30, theme, {
    size: valueSize,
    weight: 800,
    color: ink,
    align: "center",
  });
  text(g, ellipsize(g, c.label, maxW, 42 * U, 500), cx, cy + valueSize * 0.30 + 56 * U, theme, {
    size: 42 * U,
    weight: 500,
    color: withAlpha(ink, 0.82),
    align: "center",
  });

  // 左侧读数区（与色板完全错开，也是这个变体的排布指纹）
  const lx = W * 0.075;
  const lmax = Math.max(W * 0.12, r.x - lx - 40 * U);
  let ly = H * 0.34;
  if (c.delta) {
    text(g, c.delta, lx, ly, theme, {
      size: 72 * U,
      weight: 800,
      color: theme.accent2,
    });
    ly += 34 * U;
    // 呼吸下划线（运动源）
    const uw = Math.min(lmax, 140 * U) * (0.7 + 0.3 * pulse(t, 0.4));
    g.fillStyle = withAlpha(theme.accent2, 0.7);
    g.fillRect(lx, ly, uw, 4 * U);
    ly += 56 * U;
  }
  if (c.note) {
    const noteSize = 38 * U;
    const nl = wrapLines(g, c.note, lmax, noteSize, 400, 3);
    nl.forEach((l, i) => {
      text(g, l, lx, ly + i * noteSize * 1.42, theme, {
        size: noteSize,
        color: withAlpha(theme.text, 0.62),
      });
    });
  }

  progressBar(g, W * 0.075, H - 54 * U, W - W * 0.15, 6 * U, mod(t * 0.11, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const STAT_VARIANTS: LayoutDraw[] = [drawStat0, drawStat1, drawStat2];

export const STAT_MOTION_SOURCES: Record<number, string[]> = {
  0: ["背景光晕漂移", "数字极缓呼吸", "delta 药丸呼吸", "下划线呼吸伸缩", "底部进度条"],
  1: ["背景光晕漂移", "柱状图逐柱呼吸", "竖分隔线高亮下滑", "底部进度条"],
  2: ["外圈虚线旋转", "内圈反向旋转", "轨道光点绕行", "delta 药丸呼吸", "底部进度条"],
};
