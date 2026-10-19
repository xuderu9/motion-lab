// 页面块（blocks）—— 把「页」拆成可以自由拼装的零件。
//
// 为什么要拆：用户的要求是「保留现有版面，再重新组合成新版面，以免撞脸」。
// 如果每出一个新版面就写一个新函数，数量上去了但会越来越像彼此的变体；
// 拆成块之后，新画面 = 新的**块序列**，组合空间立刻是几十上百种。
//
// 每个块只做一件事，坐标由调用方给，块自己负责画和动。
// 所有块都用纯色/极淡纹理，不画大面积渐变（参考片是纯色底）。

import type { CardsContent, Theme } from "../types";
import { SANS, SANS_UI, SERIF_IT, spacedText, mixedHeadline } from "../typefaces";

export const INK = {
  paper: "#f7f4ef",
  card: "#ffffff",
  text: "#181a1c",
  dim: "rgba(24,26,28,0.62)",
  faint: "rgba(24,26,28,0.38)",
  line: "rgba(24,26,28,0.12)",
  accent: "#d9542b",
  accent2: "#1f6fe0",
  accentSoft: "rgba(217,84,43,0.12)",
  inkPaper: "#0e1013",
  inkCard: "rgba(255,255,255,0.06)",
  inkText: "#eef2f8",
  inkDim: "rgba(226,234,246,0.66)",
  inkLine: "rgba(226,234,246,0.14)",
};

export type Palette = {
  paper: string;
  card: string;
  text: string;
  dim: string;
  faint: string;
  line: string;
  accent: string;
};

export function palette(theme: Theme): Palette {
  return theme.isLight
    ? { paper: INK.paper, card: INK.card, text: INK.text, dim: INK.dim, faint: INK.faint, line: INK.line, accent: INK.accent }
    : {
        paper: INK.inkPaper,
        card: INK.inkCard,
        text: INK.inkText,
        dim: INK.inkDim,
        faint: "rgba(226,234,246,0.36)",
        line: INK.inkLine,
        accent: "#ff7043",
      };
}

export function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

/**
 * 纸张底：暖白/墨黑 + 极淡的横纹 + 轻晕影。
 * 这是「我们的底」，和参考片那种纯平白不一样，也是防撞脸的第一层。
 */
export function paperBg(g: CanvasRenderingContext2D, w: number, h: number, p: Palette, t: number) {
  const grd = g.createLinearGradient(0, 0, w * 0.35, h);
  grd.addColorStop(0, p.paper);
  grd.addColorStop(1, shade(p.paper, p === palette({ isLight: true } as Theme) ? -0.035 : 0.05));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);

  // 横纹：每 4.2% 画一条 1px 线，透明度 3%，缓慢上移（常驻微动）
  const step = Math.round(h * 0.042);
  const off = (t * 3) % step;
  g.fillStyle = p.line;
  g.globalAlpha = 0.28;
  for (let y = -step + off; y < h + step; y += step) g.fillRect(0, y, w, 1);
  g.globalAlpha = 1;

  // 角落晕影，避免整片死平
  const vg = g.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.10)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amt))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 顶部章节条：细线 + 当前章节高亮 + 一条扫过的光 */
export function chapterBar(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  tabs: string[],
  active: number,
  p: Palette,
  t: number,
  heightPct = 0.042,
) {
  const bh = h * heightPct;
  g.fillStyle = p === palette({ isLight: true } as Theme) ? "rgba(24,26,28,0.045)" : "rgba(255,255,255,0.05)";
  g.fillRect(0, 0, w, bh);
  g.font = `600 ${Math.round(h * 0.0165)}px ${SANS_UI}`;
  g.textBaseline = "middle";
  let x = w * 0.035;
  tabs.forEach((label, i) => {
    const tw = g.measureText(label).width;
    if (i === active) {
      g.fillStyle = p.paper;
      g.beginPath();
      g.roundRect(x - w * 0.007, bh * 0.16, tw + w * 0.014, bh * 0.68, bh * 0.2);
      g.fill();
      g.fillStyle = p.accent;
      g.fillRect(x - w * 0.007, bh - 2, tw + w * 0.014, 2);
      g.fillStyle = p.text;
    } else {
      g.fillStyle = p.faint;
    }
    g.fillText(label, x, bh * 0.52);
    x += tw + w * 0.026;
  });
  const glow = ((t * 0.16) % 1) * w;
  const grd = g.createLinearGradient(glow - w * 0.1, 0, glow + w * 0.1, 0);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, bh - 1, w, 1);
}

/** 小标签：全大写 + 宽字距 + 可带一个方块 */
export function kicker(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  withSquare = true,
) {
  g.textBaseline = "alphabetic";
  let cx = x;
  if (withSquare) {
    const s = h * 0.013;
    g.fillStyle = p.accent;
    g.fillRect(x, y - s, s, s);
    cx = x + s + h * 0.011;
  }
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  g.fillStyle = p.text;
  spacedText(g, text.toUpperCase(), cx, y, h * 0.0052);
}

/** 大字标题（混排，返回宽度） */
export function headline(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  fontPx: number,
  p: Palette,
): number {
  return mixedHeadline(g, text, x, baselineY, fontPx, p.accent, p.text);
}

/** 副标 */
export function subhead(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  maxW: number,
) {
  g.font = `400 ${Math.round(h * 0.023)}px ${SANS_UI}`;
  g.fillStyle = p.dim;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, text, maxW), x, y);
}

/** 圆角卡片底 */
export function cardBg(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  hot = false,
  radiusPct = 0.072,
) {
  const r = h * radiusPct;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = hot ? p.accent + "" : p.card;
  if (hot) {
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = p.accent;
    g.fill();
    g.restore();
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fill();
  } else {
    g.fill();
  }
  g.strokeStyle = hot ? p.accent : p.line;
  g.lineWidth = hot ? 2 : 1;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.stroke();
}

/** 内容卡：粗标题 + 粗副行 + 灰元信息 */
export function contentTile(
  g: CanvasRenderingContext2D,
  it: { title?: string; body?: string; tag?: string; value?: string },
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  hot = false,
  rise = 0,
) {
  g.save();
  g.translate(0, rise);
  cardBg(g, x, y, w, h, p, hot);
  const pad = w * 0.042;
  g.textBaseline = "alphabetic";
  g.fillStyle = hot ? p.accent : p.text;
  g.font = `800 ${Math.round(h * 0.19)}px ${SANS}`;
  g.fillText(fitText(g, it.title ?? "", w - pad * 2), x + pad, y + h * 0.34);
  g.fillStyle = p.text;
  g.font = `700 ${Math.round(h * 0.104)}px ${SANS_UI}`;
  g.fillText(fitText(g, it.value ? `${it.value} · ${it.body ?? ""}` : it.body ?? "", w - pad * 2), x + pad, y + h * 0.6);
  g.fillStyle = p.faint;
  g.font = `400 ${Math.round(h * 0.088)}px ${SANS_UI}`;
  g.fillText(fitText(g, it.tag ?? "", w - pad * 2), x + pad, y + h * 0.8);
  g.restore();
}

/** 一行「左标签 / 右值」 */
export function labelValueRow(
  g: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  alpha = 1,
) {
  g.save();
  g.globalAlpha = alpha;
  g.textBaseline = "alphabetic";
  g.fillStyle = p.dim;
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  spacedText(g, label.toUpperCase(), x, y, h * 0.0042);
  g.fillStyle = p.text;
  g.font = `600 ${Math.round(h * 0.026)}px ${SANS_UI}`;
  g.textAlign = "right";
  g.fillText(fitText(g, value, w * 0.6), x + w, y);
  g.textAlign = "start";
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + h * 0.016);
  g.lineTo(x + w, y + h * 0.016);
  g.stroke();
  g.restore();
}

/** 深色结论条 */
export function darkStrip(
  g: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
) {
  g.beginPath();
  g.roundRect(x, y, w, h, h * 0.16);
  g.fillStyle = p === palette({ isLight: true } as Theme) ? "#111315" : "rgba(255,255,255,0.09)";
  g.fill();
  const pad = h * 0.34;
  lines.slice(0, 2).forEach((ln, i) => {
    g.fillStyle = i === 0 ? "#ffffff" : p.accent;
    g.font = `600 ${Math.round(h * (i === 0 ? 0.26 : 0.25))}px ${SANS_UI}`;
    g.textBaseline = "alphabetic";
    g.fillText(fitText(g, ln, w - pad * 2), x + pad, y + h * (i === 0 ? 0.42 : 0.78));
  });
}

/** 底边时间轴：细线 + 菱形 + 游标 */
export function timelineBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  t: number,
  label = "",
) {
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.stroke();
  const cursor = x + ((t * 0.11) % 1) * w;
  for (let i = 0; i <= 12; i++) {
    const dx = x + (i / 12) * w;
    const on = Math.abs(dx - cursor) < w * 0.05;
    g.fillStyle = on ? p.accent : p.line;
    const s = h * 0.006;
    g.beginPath();
    g.moveTo(dx, y - s);
    g.lineTo(dx + s, y);
    g.lineTo(dx, y + s);
    g.lineTo(dx - s, y);
    g.closePath();
    g.fill();
  }
  if (label) {
    g.fillStyle = p.text;
    g.font = `700 ${Math.round(h * 0.015)}px ${SANS_UI}`;
    g.fillText(label, cursor + h * 0.014, y - h * 0.012);
  }
}

/** 竖排大数字（用于 mix 里的强对比块） */
export function bigNumber(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  align: "left" | "center" | "right" = "left",
) {
  g.textBaseline = "alphabetic";
  g.textAlign = align;
  g.fillStyle = p.accent;
  g.font = `900 ${Math.round(h * 0.22)}px ${SANS}`;
  g.fillText(value, x, y);
  g.textAlign = "start";
}

/** 斜体衬线的小引文（只在拉丁字符上使用） */
export function serifNote(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  align: "left" | "center" = "left",
  maxW?: number,
) {
  g.font = `italic ${Math.round(h * 0.026)}px ${SERIF_IT}`;
  g.fillStyle = p.dim;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(maxW ? fitText(g, text, maxW) : text, x, y);
  g.textAlign = "start";
}

export type { CardsContent };
