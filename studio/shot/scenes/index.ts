// 场景注册表。每个场景都是「一串条目 → 一种画面」，与内容类型无关。
//
// 这里先手写三个作为**模板**，剩下的交给 codex 批量扩充（见 COLLAB §4 的任务单）。
// 写新场景时照抄下面任何一个的形状即可：一个 draw 函数 + 一条 motions 清单。

import type { Item, Scene, SceneDraw } from "./types";
import type { Theme } from "../types";

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 一张卡片：标题 + 正文 + 标签，用于下面几个场景 */
function drawCard(
  g: CanvasRenderingContext2D,
  it: Item,
  x: number,
  y: number,
  w: number,
  h: number,
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
  g.shadowBlur = 28 * scale;
  g.shadowOffsetY = 10 * scale;
  g.fillStyle = theme.isLight ? "#ffffff" : "rgba(255,255,255,0.075)";
  roundRect(g, x, y, w, h, 26 * scale);
  g.fill();
  g.shadowColor = "transparent";
  g.shadowBlur = 0;

  g.strokeStyle = theme.panelBorder;
  g.lineWidth = 1.5;
  roundRect(g, x, y, w, h, 26 * scale);
  g.stroke();

  const pad = 30 * scale;
  g.fillStyle = theme.text;
  g.font = `600 ${Math.round(40 * scale)}px ${FONT}`;
  g.textBaseline = "top";
  const title = (it.title ?? "").slice(0, 12);
  g.fillText(title, x + pad, y + pad);

  if (it.value) {
    g.fillStyle = theme.accent;
    g.font = `700 ${Math.round(64 * scale)}px ${FONT}`;
    g.fillText(it.value, x + pad, y + pad + 56 * scale);
  } else if (it.body) {
    g.fillStyle = theme.textDim;
    g.font = `400 ${Math.round(28 * scale)}px ${FONT}`;
    const body = it.body.slice(0, 30);
    g.fillText(body, x + pad, y + pad + 56 * scale, w - pad * 2);
  }

  if (it.tag) {
    g.fillStyle = theme.accentSoft ?? theme.accent;
    g.font = `500 ${Math.round(24 * scale)}px ${FONT}`;
    g.fillText(it.tag, x + pad, y + h - pad - 24 * scale);
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
    drawCard(g, items[idx], x, y, cardW, cardH, theme, alpha, scale);
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
    drawCard(g, it, x, y, cardW, cardH, theme, 0.55 + 0.4 * layer, 1);
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

  const label = items[0]?.title;
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
