// 全屏引用卡 —— 3 个**排布**变体
//
//   variant 0  居中引号框（大引号 + 居中引文 + 右下署名）
//   variant 1  左侧竖条（竖线 + 左对齐引文 + 署名紧随）
//   variant 2  底部签名式（下方整条色板，引文在带子里，署名压右下）
//
// 亮度预算同 title.ts：亮主题色板盖 ~55%、暗主题 ~36%，都落在 100~120。

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
import type { LayoutDraw, LayoutSize, QuoteContent, Theme } from "../types";

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

  const gx = W * (0.5 + 0.15 * Math.sin(t * 0.15 + 2.1));
  const gy = H * (0.48 + 0.1 * Math.cos(t * 0.12));
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.58);
  glow.addColorStop(0, withAlpha(theme.accent, 0.18));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const v = g.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.2, W * 0.5, H * 0.45, Math.max(W, H) * 0.82);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, theme.isLight ? "rgba(0,0,0,0.20)" : "rgba(0,0,0,0.34)");
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

// ---------------------------------------------------------------------------
// variant 0：居中引号框
// ---------------------------------------------------------------------------

const drawQuote0: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as QuoteContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.07, 0.18, 0.86, 0.64);
  const ink = poster(g, theme, r, 24 * U);
  const cx = r.x + r.w / 2;
  const maxW = r.w - 2 * 64 * U;

  // 大引号：透明度与缩放轻微呼吸（运动源）
  const qSize = 210 * U;
  g.save();
  g.globalAlpha = 0.55 + 0.25 * pulse(t, 0.35);
  text(g, "\u201C", r.x + 54 * U, r.y + 86 * U + qSize * 0.16, theme, {
    size: qSize,
    weight: 700,
    color: theme.accent,
  });
  g.restore();

  // 引文
  const bodySize = 62 * U;
  const lines = wrapLines(g, c.text, maxW, bodySize, 500, 4);
  const blockH = lines.length * bodySize * 1.34;
  const startY = r.y + r.h * 0.5 - blockH / 2 + bodySize * 0.9;
  lines.forEach((l, i) => {
    text(g, l, cx, startY + i * bodySize * 1.34, theme, {
      size: bodySize,
      weight: 500,
      color: ink,
      align: "center",
    });
  });

  if (c.attribution) {
    const aSize = 40 * U;
    text(g, ellipsize(g, c.attribution, maxW, aSize, 400), r.x + r.w - 64 * U, r.y + r.h - 52 * U, theme, {
      size: aSize,
      color: withAlpha(ink, 0.6),
      align: "right",
    });
  }
  if (c.kicker) {
    text(g, c.kicker, r.x + 64 * U, r.y + 54 * U, theme, {
      size: 38 * U,
      weight: 600,
      color: withAlpha(ink, 0.55),
      tracking: 6 * U,
    });
  }

  // 内框：虚线沿边框持续走动（运动源）
  g.save();
  g.strokeStyle = withAlpha(theme.accent, 0.35);
  g.lineWidth = 2 * U;
  g.setLineDash([18 * U, 14 * U]);
  g.lineDashOffset = -t * 46 * U;
  rr(g, r.x + 26 * U, r.y + 26 * U, r.w - 52 * U, r.h - 52 * U, 16 * U);
  g.stroke();
  g.restore();

  // 署名前的小光标（运动源）
  const cw = measure(g, c.attribution ?? "", 40 * U, 400);
  if (Math.floor(t * 1.5) % 2 === 0) {
    g.fillStyle = theme.accent2;
    g.fillRect(r.x + r.w - 64 * U - cw - 14 * U, r.y + r.h - 66 * U, 3 * U, 34 * U);
  }

  progressBar(g, PAD, H - 54 * U, W - PAD * 2, 6 * U, mod(t * 0.1, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 1：左侧竖条
// ---------------------------------------------------------------------------

const drawQuote1: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as QuoteContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);
  const r = posterRect(theme, W, H, 0.06, 0.11, 0.62, 0.88);
  const ink = poster(g, theme, r, 20 * U);

  // 左侧整列色块（占卡片 26%）+ 大引号。
  // 这是 v1 的排布指纹：title v1 也是「左侧色板」，如果这里不加一块不同明度的
  // 大面积色块，两张静帧在大屏上会像同一张（实测差异只有 9%）。
  const colW = r.w * 0.26;
  g.save();
  rr(g, r.x, r.y, r.w, r.h, 20 * U);
  g.clip();
  g.fillStyle = withAlpha(theme.accent, 0.20);
  g.fillRect(r.x, r.y, colW, r.h);
  g.restore();

  // 大引号压在色块里（透明度呼吸 = 运动源）
  g.save();
  g.globalAlpha = 0.55 + 0.25 * pulse(t, 0.4);
  text(g, "\u201C", r.x + colW * 0.16, r.y + 168 * U, theme, {
    size: 148 * U,
    weight: 700,
    color: theme.accent,
  });
  g.restore();

  // 细竖条 + 下滑高亮（运动源），放在色块右缘
  const bx = r.x + colW - 3 * U;
  g.fillStyle = withAlpha(theme.accent, 0.4);
  g.fillRect(bx, r.y + 60 * U, 6 * U, r.h - 120 * U);
  const hy = r.y + 60 * U + mod(t * 0.26, 1) * (r.h - 120 * U);
  g.fillStyle = theme.accent2;
  g.fillRect(bx, hy, 6 * U, 120 * U);

  const x = r.x + colW + 40 * U;
  const maxW = r.w - colW - 88 * U;
  let y = r.y + 96 * U;

  if (c.kicker) {
    text(g, c.kicker, x, y, theme, { size: 38 * U, weight: 600, color: theme.accent2, tracking: 5 * U });
    y += 74 * U;
  }

  const bodySize = 58 * U;
  const lines = wrapLines(g, c.text, maxW, bodySize, 500, 5);
  lines.forEach((l, i) => {
    text(g, l, x, y + bodySize + i * bodySize * 1.32, theme, { size: bodySize, weight: 500, color: ink });
  });
  y += bodySize + (lines.length - 1) * bodySize * 1.32;

  if (c.attribution) {
    const aSize = 40 * U;
    y += 62 * U;
    // 署名前的短横线，随呼吸伸缩（运动源）
    const lw = 46 * U * (0.7 + 0.5 * pulse(t, 0.3));
    g.fillStyle = withAlpha(theme.accent, 0.75);
    g.fillRect(x, y - 14 * U, lw, 3 * U);
    text(g, ellipsize(g, c.attribution, maxW - 70 * U, aSize, 400), x + lw + 20 * U, y, theme, {
      size: aSize,
      color: withAlpha(ink, 0.62),
    });
  }

  // 右侧留白：一条竖刻度尺缓慢下移（运动源）
  const rx = r.x + r.w + 56 * U;
  for (let i = 0; i < 12; i++) {
    const yy = r.y + mod(t * 40 * U + i * (r.h / 12), r.h);
    g.fillStyle = withAlpha(theme.text, 0.18);
    g.fillRect(rx, yy, 26 * U, 2 * U);
  }

  progressBar(g, PAD, H - 54 * U, W - PAD * 2, 6 * U, mod(t * 0.12, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.18),
  });
};

// ---------------------------------------------------------------------------
// variant 2：底部签名式
// ---------------------------------------------------------------------------

const drawQuote2: LayoutDraw = (g, t, content, theme, _v, size) => {
  const c = content as QuoteContent;
  const { W, H, U, PAD } = geo(size);

  backdrop(g, theme, W, H, t);

  // 顶部：kicker（在 field 上）
  if (c.kicker) {
    text(g, c.kicker, PAD, H * 0.16, theme, {
      size: 40 * U,
      weight: 600,
      color: theme.accent,
      tracking: 8 * U,
    });
  }

  // 底部整条色板（面积 ~0.55 / 暗主题 ~0.36）
  const r = posterRect(theme, W, H, 0.01, 0.42, 0.98, 0.56);
  const ink = poster(g, theme, r, 18 * U);

  const maxW = r.w - 2 * 72 * U;
  const bodySize = 60 * U;
  const lines = wrapLines(g, c.text, maxW, bodySize, 500, 3);
  lines.forEach((l, i) => {
    text(g, l, r.x + 72 * U, r.y + 96 * U + bodySize * 0.9 + i * bodySize * 1.3, theme, {
      size: bodySize,
      weight: 500,
      color: ink,
    });
  });

  // 署名：右下角，前接一条会伸缩的长横线（运动源）
  if (c.attribution) {
    const aSize = 40 * U;
    const aw = measure(g, c.attribution, aSize, 400);
    const ax = r.x + r.w - 72 * U;
    const ay = r.y + r.h - 56 * U;
    const lineW = (aw + 260 * U) * (0.62 + 0.3 * pulse(t, 0.18));
    g.fillStyle = withAlpha(ink, 0.35);
    g.fillRect(ax - lineW, ay - 14 * U, lineW, 2 * U);
    text(g, ellipsize(g, c.attribution, r.w * 0.6, aSize, 400), ax, ay, theme, {
      size: aSize,
      color: withAlpha(ink, 0.75),
      align: "right",
    });
    // 线上滑动的光点（运动源）
    const dx = ax - lineW + mod(t * 0.3, 1) * lineW;
    g.fillStyle = theme.accent2;
    g.beginPath();
    g.arc(dx, ay - 13 * U, 4.5 * U, 0, Math.PI * 2);
    g.fill();
  }

  progressBar(g, PAD, H - 34 * U, W - PAD * 2, 5 * U, mod(t * 0.095, 1), theme, {
    color: withAlpha(theme.accent, 0.85),
    track: withAlpha(theme.text, 0.16),
  });
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const QUOTE_VARIANTS: LayoutDraw[] = [drawQuote0, drawQuote1, drawQuote2];

export const QUOTE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["背景光晕漂移", "大引号呼吸", "虚线内框走动", "署名光标闪烁", "底部进度条"],
  1: ["背景光晕漂移", "竖条高亮下滑", "署名横线呼吸", "右缘刻度尺下移", "底部进度条"],
  2: ["背景光晕漂移", "署名长线呼吸伸缩", "线上光点横移", "底部进度条"],
};
