// page —— 「白底章节页」版式，复刻参考片 v1 的主形态。
//
// 参考片实测（1920×1080，card-afew.png）：
//   背景 RGB(248,248,248) 纯色，占 75%（**不是渐变**）
//   顶部 5.0%H 章节标签栏；主标题 10.6%H；小标签 1.9%H（全大写、宽字距）
//   内容块 14.8%H；左右边距 8%；底部 28% 留给字幕
//
// 三个变体是三种「行带组合」，不是三种配色：
//   v0 标题 + 缩略图条 + 波形 + 播放头 + 括号标注   （复刻 a few frames）
//   v1 标题 + 三组「标签 → 一行内容」的行带
//   v2 标题 + 3 列卡阵（每列一张缩略卡 + 说明）

import type { CardsContent, DocContent, LayoutContent, LayoutDraw, LayoutSize, Theme, Variant } from "../types";
import { SANS, SANS_UI, SERIF_IT, mixedHeadline, spacedText } from "../typefaces";
import { palette, paperBg } from "./blocks";
import { drawImageCover, CARD_IMAGES } from "../assets";

/** 按最大宽度截断加省略号 */
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

const RATIO = {
  bar: 0.05,
  headline: 0.106,
  label: 0.019,
  marginX: 0.08,
  padTop: 0.078,
};

/**
 * 页面底。
 *
 * 原本照参考片铺纯平白 #f8f8f8，但用户说「第一张的背景改一下」——
 * 纯平白是**别人的底**，也最容易被认出来。改用自己的「纸张底」：
 * 暖白微渐变 + 极淡横纹（3% 透明）+ 轻微晕影，横纹还会缓慢上移。
 * 信息密度和可读性不变，但一眼能区分开。
 */
export function paintPaper(g: CanvasRenderingContext2D, w: number, h: number, theme: Theme, t = 0) {
  paperBg(g, w, h, palette(theme), t);
}

/** 顶部章节标签栏：参考片用它做章节导航，是全片最强的结构元素 */
function chapterBar(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  tabs: string[],
  active: number,
  theme: Theme,
  t: number,
) {
  const bh = h * RATIO.bar;
  g.fillStyle = theme.isLight ? "#dfe7f2" : "#15181d";
  g.fillRect(0, 0, w, bh);
  g.font = `500 ${Math.round(h * 0.017)}px ${SANS_UI}`;
  g.textBaseline = "middle";
  let x = w * 0.012;
  tabs.forEach((label, i) => {
    const tw = g.measureText(label).width;
    if (i === active) {
      // 当前章节高亮：整格浅色底 + 深色字
      g.fillStyle = theme.isLight ? "#ffffff" : "#242a33";
      g.fillRect(x - w * 0.008, 0, tw + w * 0.016, bh);
      g.fillStyle = theme.isLight ? "#1b2733" : "#e8eef8";
    } else {
      g.fillStyle = theme.isLight ? "rgba(27,39,51,0.55)" : "rgba(220,230,245,0.45)";
    }
    g.fillText(label, x, bh * 0.52);
    x += tw + w * 0.028;
  });
  // 顶部一条极细的高亮线，随 t 缓慢流过（常驻微动）
  const glow = ((t * 0.18) % 1) * w;
  const grd = g.createLinearGradient(glow - w * 0.14, 0, glow + w * 0.14, 0);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, bh - 2, w, 2);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, theme: Theme) {
  g.font = `600 ${Math.round(h * RATIO.label)}px ${SANS_UI}`;
  g.fillStyle = theme.isLight ? "rgba(40,52,66,0.62)" : "rgba(200,214,235,0.62)";
  g.textBaseline = "alphabetic";
  spacedText(g, text.toUpperCase(), x, y, h * 0.0055);
}

/** 缩略图卡：圆角矩形 + 编号，可选高亮描边 */
function thumb(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  idx: number,
  active: boolean,
  theme: Theme,
) {
  const r = Math.min(w, h) * 0.08;
  // 真实配图（即梦生成），比灰块有质感得多
  drawImageCover(g, CARD_IMAGES[idx % CARD_IMAGES.length], x, y, w, h, r);
  if (active) {
    g.lineWidth = Math.max(2, h * 0.022);
    g.strokeStyle = "#d92808";
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.stroke();
  }
  void theme;
}

const pageV0: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);
  const mx = w * RATIO.marginX;
  chapterBar(
    g,
    w,
    h,
    ["首页", "一 · 调研", "二 · 剪辑", "三 · 计划", "四 · 动效", "五 · 检查"],
    variant + 1,
    theme,
    t,
  );

  // 主标题：10.6% 画面高
  const headPx = Math.round(h * RATIO.headline);
  const baseY = h * RATIO.padTop + headPx;
  mixedHeadline(g, c.heading || "a few frames", mx, baseY, headPx, "#d92808", theme.isLight ? "#0d0f12" : "#f2f6fc");

  const items = c.cards ?? [];
  const n = Math.max(4, Math.min(8, items.length || 8));

  // 第一带：缩略图条
  const label1Y = baseY + h * 0.082;
  label(g, "picture · camera", mx, label1Y, h, theme);
  const stripY = label1Y + h * 0.03;
  const stripH = h * 0.132;
  const gap = w * 0.012;
  const tw = (w - mx * 2 - gap * (n - 1)) / n;
  const active = Math.floor((t * 1.6) % n);
  for (let i = 0; i < n; i++) thumb(g, mx + i * (tw + gap), stripY, tw, stripH, i, i === active, theme);

  // 第二带：波形 + 播放头 + 括号
  const label2Y = stripY + stripH + h * 0.05;
  label(g, "sound · microphone", mx, label2Y, h, theme);
  const waveY = label2Y + h * 0.028;
  const waveH = h * 0.096;
  const bars = 64;
  const bw = (w - mx * 2) / bars;
  const playX = mx + ((t * 0.22) % 1) * (w - mx * 2);
  for (let i = 0; i < bars; i++) {
    const bx = mx + i * bw;
    const env = Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11 + t * 0.6));
    const bh = waveH * (0.12 + 0.88 * env);
    const inPlay = bx > playX && bx < playX + (w - mx * 2) * 0.16;
    g.fillStyle = inPlay ? "#c2185b" : theme.isLight ? "rgba(24,38,54,0.16)" : "rgba(220,232,248,0.16)";
    g.fillRect(bx, waveY + (waveH - bh), bw * 0.52, bh);
  }
  g.strokeStyle = "#d92808";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(playX, waveY - h * 0.012);
  g.lineTo(playX, waveY + waveH + h * 0.012);
  g.stroke();

  // 括号 + 数值标注
  const brY = waveY + waveH + h * 0.022;
  g.strokeStyle = theme.isLight ? "#12161c" : "#e8eef8";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(playX, brY - h * 0.012);
  g.lineTo(playX, brY);
  g.lineTo(playX + (w - mx * 2) * 0.16, brY);
  g.lineTo(playX + (w - mx * 2) * 0.16, brY - h * 0.012);
  g.stroke();
  g.fillStyle = theme.isLight ? "#12161c" : "#e8eef8";
  g.font = `700 ${Math.round(h * 0.021)}px ${SANS_UI}`;
  g.textBaseline = "alphabetic";
  spacedText(g, (items[active]?.tag || "5 FRAMES · 167 MS").toUpperCase(), playX, brY + h * 0.042, h * 0.004);
};

const pageV1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as DocContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);
  const mx = w * RATIO.marginX;
  chapterBar(g, w, h, ["首页", "一 · 背景", "二 · 做法", "三 · 结果", "四 · 结论"], variant + 1, theme, t);
  const headPx = Math.round(h * RATIO.headline);
  const baseY = h * RATIO.padTop + headPx;
  mixedHeadline(g, c.heading || "the rule", mx, baseY, headPx, "#d92808", theme.isLight ? "#0d0f12" : "#f2f6fc");

  const rows = (c.paragraphs ?? []).slice(0, 4);
  let y = baseY + h * 0.09;
  rows.forEach((text, i) => {
    // 每行延迟出现：错峰淡入 + 上移
    const appear = Math.max(0, Math.min(1, (t - i * 0.35) / 0.5));
    g.globalAlpha = appear;
    label(g, `0${i + 1}`, mx, y, h, theme);
    g.fillStyle = theme.isLight ? "#12161c" : "#eef3fa";
    g.font = `500 ${Math.round(h * 0.038)}px ${SANS_UI}`;
    g.textBaseline = "alphabetic";
    g.fillText(fitText(g, text, w - mx * 2 - h * 0.06), mx + h * 0.05, y);
    g.strokeStyle = theme.isLight ? "rgba(20,30,42,0.14)" : "rgba(220,232,248,0.14)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(mx, y + h * 0.028);
    g.lineTo(w - mx, y + h * 0.028);
    g.stroke();
    g.globalAlpha = 1;
    y += h * 0.135;
  });
};

const pageV2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);
  const mx = w * RATIO.marginX;
  chapterBar(g, w, h, ["首页", "一", "二", "三", "四"], variant + 1, theme, t);
  const headPx = Math.round(h * RATIO.headline);
  const baseY = h * RATIO.padTop + headPx;
  mixedHeadline(g, c.heading || "three ways", mx, baseY, headPx, "#d92808", theme.isLight ? "#0d0f12" : "#f2f6fc");

  const items = (c.cards ?? []).slice(0, 3);
  const gap = w * 0.024;
  const cw = (w - mx * 2 - gap * 2) / 3;
  const ch = h * 0.42;
  const top = baseY + h * 0.08;
  items.forEach((it, i) => {
    const x = mx + i * (cw + gap);
    const rise = (1 - Math.max(0, Math.min(1, (t - i * 0.3) / 0.6))) * h * 0.03;
    g.save();
    g.translate(0, rise);
    g.fillStyle = theme.isLight ? "#ffffff" : "rgba(255,255,255,0.06)";
    g.beginPath();
    g.roundRect(x, top, cw, ch, h * 0.018);
    g.fill();
    g.strokeStyle = theme.isLight ? "rgba(20,30,42,0.10)" : "rgba(220,232,248,0.14)";
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = "#d92808";
    g.font = `900 ${Math.round(h * 0.05)}px ${SANS}`;
    g.fillText(`0${i + 1}`, x + cw * 0.08, top + ch * 0.2);
    g.fillStyle = theme.isLight ? "#12161c" : "#eef3fa";
    g.font = `600 ${Math.round(h * 0.03)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.title, cw * 0.84), x + cw * 0.08, top + ch * 0.4);
    g.fillStyle = theme.isLight ? "rgba(30,42,56,0.62)" : "rgba(210,224,244,0.62)";
    g.font = `400 ${Math.round(h * 0.021)}px ${SERIF_IT}`;
    g.fillText(fitText(g, it.body ?? "", cw * 0.84), x + cw * 0.08, top + ch * 0.55);
    g.restore();
  });
};

export const PAGE_VARIANTS: LayoutDraw[] = [pageV0, pageV1, pageV2];

export const PAGE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["顶部高亮线扫过", "缩略图条高亮推进", "波形起伏", "播放头匀速横扫"],
  1: ["行带错峰淡入", "顶部高亮线扫过", "行分隔线呼吸"],
  2: ["卡片错峰上浮", "顶部高亮线扫过", "编号闪烁"],
};

export type { LayoutContent, LayoutSize, Theme, Variant };
