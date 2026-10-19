// panel —— 「卡片矩阵页」版式，复刻参考片 v2 的主形态。
//
// 参考片实测（1920×1080，out/ref3/panel-ref.png）：
//   背景暖白 #F5F0EB + 极淡点阵网格
//   顶栏 4%H：左「OPUS 5.5 动效实验室 · 中文拆解」右「F 7200 / 8940」
//   小标题（带橙色方块）→ 大标题（黑 + 橙强调）→ 灰色副标
//   2 列 × 3 行白卡网格，其中一张高亮（浅橙底 + 橙描边）
//   底部黑色长条：两行规则文字，关键词橙色
//   最底部：细时间轴 + 菱形标记
//
// 三个变体是三种「面板组合」：
//   v0 卡片矩阵（上）+ 黑色结论条（下）
//   v1 左侧栏 + 右侧表格行
//   v2 单一大面板 + 内嵌小卡

import type { CardsContent, LayoutDraw, Theme } from "../types";
import { SANS, SANS_UI, spacedText, mixedHeadline } from "../typefaces";

const C = {
  paper: "#f5f0eb",
  card: "#ffffff",
  ink: "#1a1a1a",
  meta: "#8a817a",
  accent: "#d9542b",
  accentSoft: "#fbe3d8",
  rule: "#111111",
  line: "rgba(26,26,26,0.10)",
};

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

function paper(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.fillStyle = C.paper;
  g.fillRect(0, 0, w, h);
  // 点阵网格：极淡，缓慢平移（常驻微动）
  const step = Math.round(h * 0.018);
  const off = (t * 6) % step;
  g.fillStyle = "rgba(26,26,26,0.045)";
  for (let y = off; y < h; y += step) {
    for (let x = off; x < w; x += step) g.fillRect(x, y, 1.4, 1.4);
  }
}

function topBar(g: CanvasRenderingContext2D, w: number, h: number, left: string, right: string) {
  const bh = h * 0.04;
  g.font = `600 ${Math.round(h * 0.017)}px ${SANS_UI}`;
  g.textBaseline = "middle";
  const sw = h * 0.011;
  g.fillStyle = C.accent;
  g.fillRect(h * 0.02, bh * 0.5 - sw / 2, sw, sw);
  g.fillStyle = C.ink;
  g.fillText(left, h * 0.02 + sw + h * 0.012, bh * 0.52);
  g.fillStyle = C.meta;
  g.textAlign = "right";
  g.fillText(right, w - h * 0.02, bh * 0.52);
  g.textAlign = "start";
}

/** 一张内容卡：粗标题 + 粗副行 + 灰色元信息 */
function contentCard(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub: string,
  meta: string,
  hot: boolean,
  theme: Theme,
  rise: number,
) {
  g.save();
  g.translate(0, rise);
  const r = h * 0.075;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = hot ? C.accentSoft : C.card;
  g.fill();
  g.lineWidth = hot ? 2 : 1;
  g.strokeStyle = hot ? C.accent : C.line;
  g.stroke();

  const pad = w * 0.045;
  g.textBaseline = "alphabetic";
  g.fillStyle = hot ? C.accent : C.ink;
  g.font = `800 ${Math.round(h * 0.2)}px ${SANS}`;
  g.fillText(fitText(g, title, w - pad * 2), x + pad, y + h * 0.36);

  g.fillStyle = C.ink;
  g.font = `700 ${Math.round(h * 0.108)}px ${SANS_UI}`;
  g.fillText(fitText(g, sub, w - pad * 2), x + pad, y + h * 0.62);

  g.fillStyle = C.meta;
  g.font = `400 ${Math.round(h * 0.092)}px ${SANS_UI}`;
  g.fillText(fitText(g, meta, w - pad * 2), x + pad, y + h * 0.82);
  void theme;
  g.restore();
}

const panelV0: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paper(g, w, h, t);
  topBar(g, w, h, "MOTION LAB · 动效实验室", "F 7200 / 8940");

  const mx = w * 0.062;
  // 小标题
  g.font = `700 ${Math.round(h * 0.021)}px ${SANS_UI}`;
  g.textBaseline = "alphabetic";
  const sq = h * 0.014;
  g.fillStyle = C.accent;
  g.fillRect(mx, h * 0.072, sq, sq);
  g.fillStyle = C.ink;
  spacedText(g, "实验器材", mx + sq + h * 0.012, h * 0.086, h * 0.002);

  // 大标题：黑 + 橙强调（同字体，靠颜色分段；和 page 的衬线斜体是两种做法）
  const headPx = Math.round(h * 0.082);
  const hx = mixedHeadline(g, c.heading || "挑你的引擎", mx, h * 0.185, headPx, C.accent, C.ink);
  void hx;

  // 副标
  if (c.subtitle) {
    g.fillStyle = C.meta;
    g.font = `400 ${Math.round(h * 0.024)}px ${SANS_UI}`;
    g.fillText(fitText(g, c.subtitle, w - mx * 2), mx, h * 0.235);
  }

  // 2 × 3 卡片网格
  const items = (c.cards ?? []).slice(0, 6);
  const cols = 2;
  const rows = 3;
  const gap = w * 0.014;
  const gw = (w - mx * 2 - gap) / cols;
  const gh = h * 0.128;
  const top = h * 0.272;
  for (let i = 0; i < cols * rows && i < Math.max(items.length, 1); i++) {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const it = items[i] ?? { title: "", body: "", tag: "" };
    const appear = Math.max(0, Math.min(1, (t - i * 0.22) / 0.55));
    const rise = (1 - appear) * h * 0.022;
    contentCard(
      g,
      mx + col * (gw + gap),
      top + r * (gh + h * 0.016),
      gw,
      gh,
      it.title || `项目 ${i + 1}`,
      it.value ? `${it.value} · ${it.body ?? ""}` : it.body ?? "",
      it.tag ?? "",
      i === 0,
      theme,
      rise,
    );
  }

  // 底部黑色结论条
  const by = h * 0.792;
  const bh = h * 0.132;
  g.beginPath();
  g.roundRect(mx, by, w - mx * 2, bh, h * 0.012);
  g.fillStyle = C.rule;
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = `600 ${Math.round(h * 0.026)}px ${SANS_UI}`;
  g.textBaseline = "alphabetic";
  const line1 = (c.tags ?? [])[0] ?? "经验法则：一个点子、10 秒内 → 纯 HTML；系列、模板、数据驱动 → Remotion";
  g.fillText(fitText(g, line1, w - mx * 2 - bh * 0.6), mx + bh * 0.3, by + bh * 0.42);
  g.fillStyle = C.accent;
  const line2 = (c.tags ?? [])[1] ?? "习惯网页和 GSAP → HyperFrames；任何 3D → Three.js；动效活在产品里 → Motion";
  g.fillText(fitText(g, line2, w - mx * 2 - bh * 0.6), mx + bh * 0.3, by + bh * 0.78);

  // 底部时间轴：细线 + 菱形，游标匀速走
  const ty = h * 0.955;
  g.strokeStyle = C.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(mx, ty);
  g.lineTo(w - mx, ty);
  g.stroke();
  const cursor = mx + ((t * 0.12) % 1) * (w - mx * 2);
  for (let i = 0; i <= 12; i++) {
    const x = mx + (i / 12) * (w - mx * 2);
    const on = Math.abs(x - cursor) < (w - mx * 2) * 0.06;
    g.fillStyle = on ? C.accent : "rgba(217,84,43,0.35)";
    g.beginPath();
    const s = h * 0.008;
    g.moveTo(x, ty - s);
    g.lineTo(x + s, ty);
    g.lineTo(x, ty + s);
    g.lineTo(x - s, ty);
    g.closePath();
    g.fill();
  }
  g.fillStyle = C.ink;
  g.font = `700 ${Math.round(h * 0.016)}px ${SANS_UI}`;
  g.fillText(`${items.length || 6} 引擎`, cursor + h * 0.016, ty - h * 0.014);
};

/** v1：左侧栏 + 右侧表格行 */
const panelV1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paper(g, w, h, t);
  const sb = w * 0.2;
  // 侧栏
  g.fillStyle = C.card;
  g.fillRect(0, 0, sb, h);
  g.strokeStyle = C.line;
  g.beginPath();
  g.moveTo(sb, 0);
  g.lineTo(sb, h);
  g.stroke();
  g.fillStyle = C.ink;
  g.font = `800 ${Math.round(h * 0.026)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText("MOTION", h * 0.03, h * 0.07);
  const nav = ["总览", "素材", "分镜", "渲染", "设置"];
  g.font = `500 ${Math.round(h * 0.02)}px ${SANS_UI}`;
  nav.forEach((n, i) => {
    const y = h * 0.14 + i * h * 0.058;
    if (i === variant) {
      g.fillStyle = C.accentSoft;
      g.beginPath();
      g.roundRect(h * 0.02, y - h * 0.028, sb - h * 0.04, h * 0.046, h * 0.01);
      g.fill();
      g.fillStyle = C.accent;
    } else g.fillStyle = C.meta;
    g.fillText(n, h * 0.04, y);
  });

  // 右表格
  const x0 = sb + w * 0.03;
  const cw = w - x0 - w * 0.03;
  g.fillStyle = C.ink;
  g.font = `800 ${Math.round(h * 0.045)}px ${SANS}`;
  g.fillText(c.heading || "任务列表", x0, h * 0.105);
  const rows = (c.cards ?? []).slice(0, 6);
  const rowH = h * 0.1;
  rows.forEach((it, i) => {
    const y = h * 0.16 + i * rowH;
    const appear = Math.max(0, Math.min(1, (t - i * 0.18) / 0.45));
    g.globalAlpha = appear;
    g.fillStyle = i % 2 ? "rgba(26,26,26,0.02)" : "transparent";
    g.fillRect(x0, y, cw, rowH - h * 0.012);
    g.fillStyle = C.ink;
    g.font = `700 ${Math.round(h * 0.024)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.title, cw * 0.42), x0 + h * 0.02, y + rowH * 0.46);
    g.fillStyle = C.meta;
    g.font = `400 ${Math.round(h * 0.019)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.body ?? "", cw * 0.34), x0 + cw * 0.44, y + rowH * 0.46);
    // 状态胶囊
    const pillW = cw * 0.12;
    const px = x0 + cw - pillW - h * 0.02;
    g.fillStyle = i % 3 === 0 ? C.accentSoft : "rgba(26,26,26,0.05)";
    g.beginPath();
    g.roundRect(px, y + rowH * 0.26, pillW, rowH * 0.4, rowH * 0.2);
    g.fill();
    g.fillStyle = i % 3 === 0 ? C.accent : C.meta;
    g.font = `600 ${Math.round(h * 0.016)}px ${SANS_UI}`;
    g.textAlign = "center";
    g.fillText(i % 3 === 0 ? "进行中" : "待办", px + pillW / 2, y + rowH * 0.52);
    g.textAlign = "start";
    g.globalAlpha = 1;
  });
};

/** v2：单一大面板 + 内嵌小卡 */
const panelV2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paper(g, w, h, t);
  topBar(g, w, h, "MOTION LAB · 面板", "F 4210 / 8940");
  const mx = w * 0.08;
  const py = h * 0.11;
  const pw = w - mx * 2;
  const ph = h * 0.76;
  // 大面板：从左侧滑入
  const slide = (1 - Math.max(0, Math.min(1, t / 0.6))) * w * 0.25;
  g.save();
  g.translate(-slide, 0);
  g.shadowColor = "rgba(26,26,26,0.18)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  g.beginPath();
  g.roundRect(mx, py, pw, ph, h * 0.016);
  g.fillStyle = C.card;
  g.fill();
  g.shadowColor = "transparent";
  g.strokeStyle = C.line;
  g.lineWidth = 1;
  g.stroke();

  g.fillStyle = C.ink;
  g.font = `800 ${Math.round(h * 0.04)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText("Render, look, fix", mx + h * 0.04, py + h * 0.075);

  const inner = (c.cards ?? []).slice(0, 4);
  const iw = (pw - h * 0.04 * 2 - h * 0.02) / 2;
  const ih = (ph - h * 0.14) / 2 - h * 0.01;
  inner.forEach((it, i) => {
    const x = mx + h * 0.04 + (i % 2) * (iw + h * 0.02);
    const y = py + h * 0.11 + Math.floor(i / 2) * (ih + h * 0.02);
    const appear = Math.max(0, Math.min(1, (t - 0.25 - i * 0.15) / 0.4));
    g.globalAlpha = appear;
    g.beginPath();
    g.roundRect(x, y, iw, ih, h * 0.01);
    g.fillStyle = i === 0 ? "rgba(245,240,235,0.9)" : "rgba(26,26,26,0.03)";
    g.fill();
    g.strokeStyle = C.line;
    g.stroke();
    g.fillStyle = C.meta;
    g.font = `700 ${Math.round(h * 0.015)}px ${SANS_UI}`;
    spacedText(g, (it.tag || "SECTION").toUpperCase(), x + h * 0.02, y + h * 0.035, h * 0.003);
    g.fillStyle = C.ink;
    g.font = `700 ${Math.round(h * 0.022)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.title, iw - h * 0.04), x + h * 0.02, y + ih * 0.55);
    g.fillStyle = C.meta;
    g.font = `400 ${Math.round(h * 0.017)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.body ?? "", iw - h * 0.04), x + h * 0.02, y + ih * 0.75);
    g.globalAlpha = 1;
  });
  g.restore();
  void theme;
};

export const PANEL_VARIANTS: LayoutDraw[] = [panelV0, panelV1, panelV2];

export const PANEL_MOTION_SOURCES: Record<number, string[]> = {
  0: ["点阵网格缓慢平移", "卡片错峰上浮", "时间轴游标移动", "菱形标记高亮"],
  1: ["表格行错峰淡入", "点阵平移", "状态胶囊呼吸"],
  2: ["面板从左侧滑入", "内嵌小卡错峰浮现", "投影深度", "点阵平移"],
};
