// 场景注册表。每个场景都是「一串条目 → 一种画面」，与内容类型无关。
//
// 这里先手写三个作为**模板**，剩下的交给 codex 批量扩充（见 COLLAB §4 的任务单）。
// 写新场景时照抄下面任何一个的形状即可：一个 draw 函数 + 一条 motions 清单。

import type { Item, Scene, SceneDraw } from "./types";
import { drawVisual, fitText } from "./visuals";
import type { Theme } from "../types";

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

/** 按最大宽度截断并加省略号（场景里所有文字都要过这一关，否则会溢出卡片） */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 一张卡片 = 圆角容器 + 里面一个 visual + 可选角标。
 * **不画长文字**：文字的量和长度由 visual 自己决定（见 visuals.ts）。
 */
function drawCard(
  g: CanvasRenderingContext2D,
  it: Item,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  theme: Theme,
  alpha = 1,
  scale = 1,
) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x + w / 2, y + h / 2);
  g.scale(scale, scale);
  g.translate(-(x + w / 2), -(y + h / 2));

  g.shadowColor = theme.shadow;
  g.shadowBlur = 30 * scale;
  g.shadowOffsetY = 12 * scale;
  g.fillStyle = theme.isLight ? "rgba(255,255,255,0.92)" : "rgba(18,28,44,0.55)";
  roundRect(g, x, y, w, h, 24 * scale);
  g.fill();
  g.shadowColor = "transparent";
  g.shadowBlur = 0;

  g.strokeStyle = theme.panelBorder;
  g.lineWidth = 1.2;
  roundRect(g, x, y, w, h, 24 * scale);
  g.stroke();

  const pad = 26 * scale;
  drawVisual(g, it.visual, t, theme, x + pad, y + pad, w - pad * 2, h - pad * 2);

  if (it.tag) {
    g.fillStyle = theme.textFaint;
    g.font = `500 ${Math.round(20 * scale)}px ${FONT}`;
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    g.fillText(fitText(g, it.tag, w - pad * 2), x + w - pad, y + h - 14 * scale);
    g.textAlign = "start";
  }
  g.restore();
}

/**
 * 一排在画面里**横向飞过**（用户举的例子：大量卡片排列成一排快速通过）。
 * 条目循环排布，整体沿 X 匀速平移，越靠两侧越小、越淡 —— 有纵深。
 */
const flyRow: SceneDraw = (g, t, items, theme, size, variant) => {
  const n = Math.max(1, items.length);
  const cardW = variant === 0 ? 300 : variant === 1 ? 360 : 260;
  const cardH = Math.round(cardW * 0.66);
  const gap = variant === 2 ? 36 : 56;
  const y = size.h / 2 - cardH / 2 + Math.sin(t * 0.6) * 10;
  const speed = 150 + variant * 45;              // px/s，匀速穿过
  const span = n * (cardW + gap);
  const travel = ((t * speed) % span);

  for (let k = -1; k <= Math.ceil(size.w / (cardW + gap)) + 1; k++) {
    const idx = ((k % n) + n) % n;
    const x = k * (cardW + gap) - travel;
    const cx = x + cardW / 2;
    const d = Math.abs(cx - size.w / 2) / (size.w / 2);   // 0=正中 1=边缘
    const scale = 1 - 0.18 * Math.min(1, d);
    const alpha = 1 - 0.35 * Math.min(1, d);
    drawCard(g, items[idx], x, y, cardW, cardH, t, theme, alpha, scale);
  }
  // 常驻微动：整排呼吸
  void size;
};

/** 大批卡片在空间里**悬浮排布**，各自轻微漂浮 + 视差 */
const floatField: SceneDraw = (g, t, items, theme, size, variant) => {
  const n = Math.max(1, items.length);
  const per = variant === 0 ? 5 : variant === 1 ? 7 : 4;
  for (let i = 0; i < n * 2; i++) {
    const it = items[i % n];
    const r = i * 1.7;
    const layer = 0.55 + 0.45 * ((i % 3) / 2);           // 三层景深
    const cardW = (220 + 90 * ((i % 3) / 2)) * layer;
    const cardH = cardW * 0.66;
    const x = (size.w * ((i * 0.37) % 1)) - cardW / 2 + Math.sin(t * 0.25 + r) * 26 * layer;
    const y = (size.h * ((i * 0.61) % 1)) - cardH / 2 + Math.cos(t * 0.21 + r) * 20 * layer;
    drawCard(g, it, x, y, cardW, cardH, t, theme, 0.55 + 0.4 * layer, 1);
  }
};

/** 纯氛围：星场 + 缓慢漂移的雾 */
const starfield: SceneDraw = (g, t, items, theme, size) => {
  const gW = size.w;
  const gH = size.h;
  const grad = g.createRadialGradient(gW * 0.5, gH * 0.42, 0, gW * 0.5, gH * 0.42, Math.max(gW, gH) * 0.75);
  grad.addColorStop(0, theme.bg[0]);
  grad.addColorStop(1, "#05070b");
  g.fillStyle = grad;
  g.fillRect(0, 0, gW, gH);

  for (let i = 0; i < 220; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const rad = Math.sqrt((i % 97) / 97) * Math.max(gW, gH) * 0.55;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.5 + (i % 7) * 0.13) + i));
    const x = gW / 2 + Math.cos(a + t * 0.02) * rad;
    const y = gH / 2 + Math.sin(a + t * 0.02) * rad * 0.6;
    const s = 1 + (i % 3);
    g.fillStyle = `rgba(200,220,255,${0.12 + 0.55 * tw})`;
    g.fillRect(x, y, s, s);
  }

  const v0 = items[0]?.visual;
  const label = v0 && v0.kind === "text" ? v0.text : undefined;
  if (label) {
    g.fillStyle = theme.text;
    g.font = `300 ${Math.round(gW * 0.052)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.globalAlpha = 0.7 + 0.25 * Math.sin(t * 0.8);
    g.fillText(label, gW / 2, gH * 0.52);
    g.globalAlpha = 1;
    g.textAlign = "start";
  }
};

/** 场景注册表。codex 往这里加即可，不需要改渲染器。 */
export const SCENES: Record<string, Scene> = {
  flyRow: {
    name: "flyRow",
    label: "整排卡片横向飞过",
    motions: ["整排匀速平移", "两侧缩放纵深", "整排呼吸浮动"],
    items: [3, 12],
    draw: flyRow,
  },
  floatField: {
    name: "floatField",
    label: "卡片悬浮排布",
    motions: ["各自漂浮", "三层景深视差", "透明度分层"],
    items: [3, 10],
    draw: floatField,
  },
  starfield: {
    name: "starfield",
    label: "星空氛围",
    motions: ["星点闪烁", "整体缓慢旋转", "中置大字呼吸"],
    items: [0, 1],
    draw: starfield,
  },
};

export function getScene(name: string | undefined): Scene | undefined {
  return name ? SCENES[name] : undefined;
}
