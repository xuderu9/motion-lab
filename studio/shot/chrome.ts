// 共享外壳 —— 所有版式共用的绘制原语。
//
// 这里是「不许重复写」的那部分：顶栏、面板、文字、光标、进度条、网格、掠光、扫描线。
// 版式文件只负责**排布**，不负责这些零件的画法。
//
// 硬规矩：
//   1. 任何颜色都从 theme 取，这个文件以外不许出现色值字面量（这个文件内部除外）。
//   2. 任何字号都走 setFont / text({size})，不直接拼 CSS font 字符串
//      —— 否则 check-shot.py 没法扫描最小字号。
//   3. 任何字符串都来自 content，这里只接受参数，不内置文案。

import type { Theme } from "./types";

export const FONT = "'Inter','Microsoft YaHei',system-ui,sans-serif";

// ---------------------------------------------------------------------------
// 数学
// ---------------------------------------------------------------------------

/** 圆角矩形路径（不填不描，调用方自己 fill/stroke） */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.min(w, h) / 2)));
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 给 #rrggbb 加透明度；非 hex 输入原样返回 */
export function withAlpha(color: string, a: number): string {
  if (!color.startsWith("#")) return color;
  const h = color.slice(1);
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g2 = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g2},${b},${a})`;
}

/**
 * 滚动内容的底部渐隐。
 *
 * 滚动文档的裁剪切口如果很硬，会在切口处露出「半个字」的下半截，
 * 看起来像渲染出错。用背景色做一段渐隐，切口就变成"内容还没滚到"，
 * 这也是真实阅读器里的做法。
 */
export function fadeBottom(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
  fade = 90,
) {
  const grd = g.createLinearGradient(0, y + h - fade, 0, y + h);
  grd.addColorStop(0, withAlpha(theme.bg[1], 0));
  grd.addColorStop(0.75, withAlpha(theme.bg[1], 0.72));
  grd.addColorStop(1, theme.bg[1]);
  g.fillStyle = grd;
  g.fillRect(x, y + h - fade, w, fade);
}
export const sat = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
export const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** 0/1 方波，用于光标闪烁、圆点脉冲 */
export const blink = (t: number, hz = 1.6) => (Math.floor(t * hz) % 2 === 0 ? 1 : 0);

/** 平滑脉冲 0→1→0 */
export const pulse = (t: number, hz = 0.5) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * hz);

/** 把 t 映射成 [0,1) 的周期值 */
export const cyc = (t: number, period: number) => ((t % period) + period) % period;

/** 取模取正（JS 的 % 对负数返回负值） */
export const mod = (v: number, m: number) => ((v % m) + m) % m;

// ---------------------------------------------------------------------------
// 数字格式
// ---------------------------------------------------------------------------

export function formatNum(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");
export const mmss = (sec: number) => `${pad2(sec / 60)}:${pad2(sec % 60)}`;
export const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

// ---------------------------------------------------------------------------
// 文字
// ---------------------------------------------------------------------------

/** 唯一的字体设置入口。layouts/ 里只准用这个 + text()。 */
export function setFont(g: CanvasRenderingContext2D, size: number, weight = 400) {
  g.font = `${weight} ${size}px ${FONT}`;
}

export type TextOpts = {
  size?: number;
  weight?: number;
  /** 直接指定颜色；缺省走 theme.text */
  color?: string;
  /** 取 theme 上的哪个字段当颜色 */
  tone?: "text" | "textDim" | "textFaint" | "accent" | "accent2";
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** 字距（px），Chromium 支持 ctx.letterSpacing */
  tracking?: number;
  /** 水平缩放，用于超长标题收进版面 */
  maxWidth?: number;
};

export function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  theme: Theme,
  o: TextOpts = {},
) {
  setFont(g, o.size ?? 36, o.weight ?? 400);
  g.fillStyle = o.color ?? (o.tone ? theme[o.tone] : theme.text);
  g.textAlign = o.align ?? "left";
  g.textBaseline = o.baseline ?? "alphabetic";
  if (o.tracking !== undefined) (g as any).letterSpacing = `${o.tracking}px`;
  if (o.maxWidth !== undefined) g.fillText(s, x, y, o.maxWidth);
  else g.fillText(s, x, y);
  if (o.tracking !== undefined) (g as any).letterSpacing = "0px";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
}

/** 量文本宽度（会临时改 font，调用后请重设） */
export function measure(g: CanvasRenderingContext2D, s: string, size: number, weight = 400): number {
  setFont(g, size, weight);
  return g.measureText(s).width;
}

/** 单行截断，超宽补省略号 */
export function ellipsize(g: CanvasRenderingContext2D, s: string, maxW: number, size: number, weight = 400): string {
  if (measure(g, s, size, weight) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(g, s.slice(0, mid) + "…", size, weight) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + "…";
}

/**
 * 按宽度折行（逐字符，中英文都适用），最多 maxLines 行，超出补省略号。
 *
 * 卡片里要的是「一句话分两行」，而不是「同一句截断两次」——
 * 后者看起来像渲染坏了。
 */
export function wrapLines(
  g: CanvasRenderingContext2D,
  s: string,
  maxW: number,
  size: number,
  weight = 400,
  maxLines = 2,
): string[] {
  setFont(g, size, weight);
  const chars = Array.from(s);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < chars.length; i++) {
    const next = cur + chars[i];
    if (cur.length > 0 && g.measureText(next).width > maxW) {
      lines.push(cur);
      cur = chars[i];
      if (lines.length >= maxLines) {
        cur = "";
        break;
      }
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  const consumed = lines.join("").length;
  if (consumed < chars.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = ellipsize(g, last + "…", maxW, size, weight);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

export type PanelOpts = {
  r?: number;
  fill?: string;
  stroke?: string;
  /** 投影强度 0~1，按主题决定颜色 */
  shadow?: number;
};

export function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
  o: PanelOpts = {},
) {
  const r = o.r ?? 20;
  if (o.shadow) {
    g.save();
    g.shadowColor = theme.shadow;
    g.shadowBlur = 40 * o.shadow;
    g.shadowOffsetY = 10 * o.shadow;
    g.fillStyle = o.fill ?? theme.panel;
    rr(g, x, y, w, h, r);
    g.fill();
    g.restore();
  } else {
    g.fillStyle = o.fill ?? theme.panel;
    rr(g, x, y, w, h, r);
    g.fill();
  }
  if (o.stroke !== "none") {
    g.strokeStyle = o.stroke ?? theme.panelBorder;
    g.lineWidth = 1.5;
    rr(g, x, y, w, h, r);
    g.stroke();
  }
}

/** 左侧强调竖条（列表当前项、卡片索引） */
export function accentBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
  color?: string,
) {
  g.fillStyle = color ?? theme.accent;
  rr(g, x, y, w, h, w / 2);
  g.fill();
}

/** 药丸标签 */
export function chip(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  theme: Theme,
  o: { size?: number; color?: string; fill?: string; padX?: number; h?: number } = {},
): number {
  const size = o.size ?? 34;
  const h = o.h ?? 52;
  const padX = o.padX ?? 22;
  const w = measure(g, s, size, 500) + padX * 2;
  g.fillStyle = o.fill ?? theme.accentSoft;
  rr(g, x, y, w, h, h / 2);
  g.fill();
  text(g, s, x + padX, y + h / 2 + size * 0.36, theme, {
    size,
    weight: 500,
    color: o.color ?? theme.accent,
  });
  return w;
}

// ---------------------------------------------------------------------------
// 顶栏
// ---------------------------------------------------------------------------

export type TopBarOpts = {
  title: string;
  breadcrumb?: string;
  /** 右端文字，如「已同步」；实际文案由 content 传入 */
  right?: string;
  /** 顶部高度，默认 88 */
  h?: number;
};

/**
 * 顶栏。所有版式都用它，保证整片"应用感"统一。
 * 自带一个闪烁光标 → 这是最便宜的常驻微动源之一。
 */
export function topBar(g: CanvasRenderingContext2D, theme: Theme, t: number, o: TopBarOpts) {
  const h = o.h ?? 88;
  g.fillStyle = theme.chromeBg;
  g.fillRect(0, 0, 1600, h);
  g.fillStyle = theme.grid;
  g.fillRect(0, h - 1, 1600, 1);

  text(g, o.title, 56, h * 0.63, theme, { size: 36, weight: 600 });
  if (o.breadcrumb) {
    const w = measure(g, o.title, 36, 600);
    text(g, o.breadcrumb, 56 + w + 20, h * 0.63, theme, { size: 34, tone: "textDim" });
  }

  // 右端：呼吸圆点 + 文字
  if (o.right) {
    const w = measure(g, o.right, 34, 500);
    const x = 1600 - 56 - w;
    text(g, o.right, x, h * 0.63, theme, { size: 34, weight: 500, tone: "textDim" });
    g.fillStyle = theme.accent2;
    g.globalAlpha = 0.4 + 0.6 * pulse(t, 0.45);
    g.beginPath();
    g.arc(x - 22, h * 0.55, 6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  return h;
}

/** 闪烁光标 */
export function caret(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  theme: Theme,
  t: number,
  hz = 1.6,
  color?: string,
) {
  if (!blink(t, hz)) return;
  g.fillStyle = color ?? theme.accent;
  g.fillRect(x, y - h, 3, h);
}

// ---------------------------------------------------------------------------
// 进度 / 图元
// ---------------------------------------------------------------------------

export function progressBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: number,
  theme: Theme,
  o: { track?: string; color?: string } = {},
) {
  const v = clamp01(p);
  g.fillStyle = o.track ?? theme.panel;
  rr(g, x, y, w, h, h / 2);
  g.fill();
  if (v <= 0) return;
  g.fillStyle = o.color ?? theme.accent;
  rr(g, x, y, Math.max(h, w * v), h, h / 2);
  g.fill();
}

/** 横向分隔线 */
export function divider(g: CanvasRenderingContext2D, x: number, y: number, w: number, theme: Theme) {
  g.fillStyle = theme.grid;
  g.fillRect(x, y, w, 1.5);
}

/** 网格 */
export function gridLines(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rows: number,
  cols: number,
  theme: Theme,
) {
  g.fillStyle = theme.grid;
  for (let i = 0; i <= rows; i++) {
    g.fillRect(x, y + (h * i) / rows, w, 1);
  }
  for (let i = 0; i <= cols; i++) {
    g.fillRect(x + (w * i) / cols, y, 1, h);
  }
}

// ---------------------------------------------------------------------------
// 图表原语
// ---------------------------------------------------------------------------

/** 迷你折线，用于卡片/统计卡。values 是 0~1 归一化值。 */
export function sparkline(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  values: number[],
  theme: Theme,
  o: { color?: string; lineWidth?: number; fill?: boolean } = {},
) {
  if (values.length < 2) return;
  const n = values.length;
  const px = (i: number) => x + (w * i) / (n - 1);
  const py = (v: number) => y + h - clamp01(v) * h;
  const color = o.color ?? theme.accent;

  if (o.fill) {
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.globalAlpha = 0.18;
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(px(0), y + h);
    values.forEach((v, i) => g.lineTo(px(i), py(v)));
    g.lineTo(px(n - 1), y + h);
    g.closePath();
    g.fill();
    g.restore();
  }

  g.strokeStyle = color;
  g.lineWidth = o.lineWidth ?? 2.5;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
  g.stroke();
}

/**
 * 竖向柱状图，柱子高度按时间连续呼吸。
 * 这是「大面积常驻微动」里性价比最高的一种：整块面板每一帧都在变。
 */
export function barsV(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  theme: Theme,
  o: {
    n?: number;
    /** 每根柱子的相位差 */
    speed?: number;
    phase?: number;
    color?: string;
    /** 选中柱高亮 */
    highlight?: number;
    barGap?: number;
  } = {},
) {
  const n = o.n ?? 16;
  const speed = o.speed ?? 2.6;
  const phase = o.phase ?? 0;
  const gap = o.barGap ?? 0.28;
  const slot = w / n;
  const bw = slot * (1 - gap);
  for (let i = 0; i < n; i++) {
    // 三个谐波而不是两个：柱子顶端的位移速率更高，逐帧帧差才撑得起来
    // （单频 sine 在峰值附近几乎不动，一半时间像静止）
    const v =
      0.40 +
      0.30 * Math.sin(t * speed + i * 0.62 + phase) +
      0.18 * Math.sin(t * speed * 2.3 + i * 1.1 + phase) +
      0.10 * Math.sin(t * speed * 4.1 + i * 1.9 + phase);
    const bh = Math.max(h * 0.06, sat(v, 0, 1) * h);
    const bx = x + slot * i + (slot - bw) / 2;
    g.fillStyle = i === o.highlight ? theme.accent2 : (o.color ?? theme.accent);
    g.globalAlpha = i === o.highlight ? 1 : 0.72;
    rr(g, bx, y + h - bh, bw, bh, Math.min(6, bw / 2));
    g.fill();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 全屏后处理（大面积、低幅度微动 —— 帧差的"底噪"来源）
// ---------------------------------------------------------------------------

/**
 * 掠光带：横扫全屏的柔光。
 *
 * 为什么必须有：小元素移动的像素量太小，撑不起帧差底噪。
 * 实测参考片底噪 1.5~3，靠的就是这种「面积大、幅度小、永不停止」的变化。
 */
export function sheen(g: CanvasRenderingContext2D, t: number, W: number, H: number, theme: Theme) {
  const band = 480;
  const sweepX = mod(t * 420, W + band * 2) - band;
  const rgb = theme.isLight ? "31,111,224" : "150,185,255";
  const a1 = theme.isLight ? 0.035 : 0.09;
  const a2 = theme.isLight ? 0.05 : 0.125;
  const grd = g.createLinearGradient(sweepX - band / 2, 0, sweepX + band / 2, H * 0.5);
  grd.addColorStop(0, `rgba(${rgb},0)`);
  grd.addColorStop(0.45, `rgba(${rgb},${a1})`);
  grd.addColorStop(0.55, `rgba(${rgb},${a2})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

/** 扫描线：让整屏更像"正在录制的显示器" */
export function scanlines(g: CanvasRenderingContext2D, frame: number, W: number, H: number, theme: Theme) {
  g.fillStyle = theme.isLight ? "rgba(16,32,52,0.022)" : "rgba(150,185,255,0.035)";
  for (let y = frame * 7 % 4; y < H; y += 4) g.fillRect(0, y, W, 1);
}

/**
 * 屏幕底噪：整帧亮度按帧号做确定性伪随机抖动。
 *
 * 为什么必须有：参考片同一镜头内的帧差底噪实测 1.5~3，那不是内容在动，
 * 而是"这是段录屏、不是一张渲染图"的质感。我们之前完全没有，所以哪怕布局在动，
 * 屏占比 9.39% 摊薄之后整帧帧差只有 0.3~0.7，看起来"不动"。
 *
 * 幅度只有 ±1~2 级（0.6%），单帧看不出来；但每帧都在变，这就是底噪的来源。
 * 用帧号做线性同余，保证逐帧不同、且同帧可复现（Remotion 要多进程并渲）。
 */
export function screenNoise(g: CanvasRenderingContext2D, frame: number, W: number, H: number, theme: Theme) {
  const r = ((frame * 1103515245 + 12345) >>> 8) % 1000 / 1000;
  const a = theme.isLight ? 0.008 + 0.020 * r : 0.010 + 0.026 * r;
  g.fillStyle = theme.isLight ? `rgba(8,16,28,${a})` : `rgba(200,220,255,${a})`;
  g.fillRect(0, 0, W, H);
}
/** 整屏色温极缓呼吸（大面积、低幅度） */
export function tintBreath(g: CanvasRenderingContext2D, t: number, W: number, H: number, theme: Theme) {
  g.fillStyle = theme.isLight
    ? `rgba(31,111,224,${0.012 + 0.010 * Math.sin(t * 1.7)})`
    : `rgba(90,140,220,${0.04 + 0.032 * Math.sin(t * 1.7)})`;
  g.fillRect(0, 0, W, H);
}

/** 虚线折线（对照组/阈值） */
export function dashedLine(
  g: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  theme: Theme,
  o: { color?: string; width?: number; dash?: number[] } = {},
) {
  g.save();
  g.setLineDash(o.dash ?? [10, 8]);
  g.strokeStyle = o.color ?? theme.textFaint;
  g.lineWidth = o.width ?? 2;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.restore();
}
