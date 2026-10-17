// 地图航线版式家族 —— 3 个**排布**变体
//
//   variant 0  mapFullBleed  全幅地图 + 路径生长 + 左上读数
//   variant 1  mapSplit      左侧地点列表 + 右侧局部地图（带扫描十字）
//   variant 2  mapTriple     三张并排小地图（航段分屏）+ 底部行程带
//
// 地图是**样式化的矢量示意图**，不是真实地理数据：用固定控制点的平滑地块 +
// 经纬网格 + 贝塞尔航线构成，所以不依赖任何外部图片，也不会随机漂移。
// 变体之间是排布差异，不是配色差异（M1-DESIGN §6 陷阱 1）。

import {
  chip,
  clamp01,
  ellipsize,
  measure,
  mmss,
  mod,
  panel,
  progressBar,
  pulse,
  rr,
  sat,
  text,
  topBar,
} from "../chrome";
import type { LayoutDraw, MapContent, MapPlace, Theme } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 48;

type XY = [number, number];

/** 两块「大陆」的归一化轮廓（固定，不随机） */
const LAND_A: XY[] = [
  [0.04, 0.30], [0.13, 0.17], [0.26, 0.13], [0.34, 0.22], [0.31, 0.34],
  [0.38, 0.44], [0.33, 0.57], [0.24, 0.62], [0.18, 0.55], [0.10, 0.58],
  [0.05, 0.47], [0.09, 0.38],
];
const LAND_B: XY[] = [
  [0.60, 0.22], [0.72, 0.15], [0.84, 0.20], [0.90, 0.31], [0.86, 0.42],
  [0.92, 0.52], [0.85, 0.63], [0.74, 0.66], [0.66, 0.58], [0.68, 0.46],
  [0.59, 0.38], [0.56, 0.29],
];

/** 用二次曲线把折线磨成闭合的平滑轮廓 */
function blob(g: CanvasRenderingContext2D, pts: XY[], x: number, y: number, w: number, h: number) {
  const P = pts.map(([px, py]) => [x + px * w, y + py * h] as XY);
  const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(P[P.length - 1], P[0]);
  g.beginPath();
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const m = mid(p, P[(i + 1) % P.length]);
    g.quadraticCurveTo(p[0] + (m[0] - p[0]) * 0.18, p[1] + (m[1] - p[1]) * 0.18, m[0], m[1]);
  }
  g.closePath();
}

/** 地图底板：面板 + 经纬网格 + 两块大陆 + 边框 */
function mapBase(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
  t: number,
  o: { gridStep?: number; drift?: number } = {},
) {
  panel(g, x, y, w, h, theme, { r: 20, shadow: 0.32 });
  g.save();
  rr(g, x, y, w, h, 20);
  g.clip();

  // 经纬网格：整体极缓漂移（大面积低幅微动）
  const step = o.gridStep ?? 96;
  const dx = (o.drift ?? 6) * Math.sin(t * 0.22);
  const dy = (o.drift ?? 6) * Math.cos(t * 0.19);
  g.fillStyle = theme.grid;
  for (let gx = x - step + mod(dx, step); gx < x + w; gx += step) g.fillRect(gx, y, 1, h);
  for (let gy = y - step + mod(dy, step); gy < y + h; gy += step) g.fillRect(x, gy, w, 1);

  // 大陆
  blob(g, LAND_A, x, y, w, h);
  g.fillStyle = theme.panelStrong;
  g.fill();
  g.strokeStyle = theme.panelBorder;
  g.lineWidth = 1.5;
  g.stroke();

  blob(g, LAND_B, x, y, w, h);
  g.fill();
  g.stroke();

  // 地形排线（等高线的示意画法）。
  // 浅色主题下所有面板都接近背景色，只有细密深色线条能让"地图"和
  // "文档/时间轴"在像素层面真正区分开 —— 这也是制图里的常规画法。
  const hatch = (pts: XY[]) => {
    g.save();
    blob(g, pts, x, y, w, h);
    g.clip();
    g.strokeStyle = theme.textFaint;
    g.globalAlpha = 0.34;
    g.lineWidth = 1.8;
    g.beginPath();
    for (let d = -h; d < w + h; d += 11) {
      g.moveTo(x + d, y);
      g.lineTo(x + d - h, y + h);
    }
    g.stroke();
    g.restore();
  };
  hatch(LAND_A);
  hatch(LAND_B);

  g.restore();
}

/** 归一化坐标 → 面板内像素 */
function px(p: MapPlace, x: number, y: number, w: number, h: number): XY {
  return [x + clamp01(p.x) * w, y + clamp01(p.y) * h];
}

/** 二次贝塞尔取点 */
function qPoint(p0: XY, c: XY, p1: XY, u: number): XY {
  const v = 1 - u;
  return [
    v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0],
    v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1],
  ];
}

/** 航线控制点：中点 + 垂直偏移，让航线成一条优雅的弧 */
function ctrlOf(p0: XY, p1: XY, bend = 0.22): XY {
  const mx = (p0[0] + p1[0]) / 2;
  const my = (p0[1] + p1[1]) / 2;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  return [mx - dy * bend, my + dx * bend];
}

/**
 * 画一条"生长中"的航线：按进度截取贝塞尔前段。
 * grow 由时间推导 → 持续重绘，是地图版式的主力运动源。
 */
function routePath(
  g: CanvasRenderingContext2D,
  p0: XY,
  p1: XY,
  grow: number,
  theme: Theme,
  o: { color?: string; width?: number; dash?: number[] } = {},
) {
  const c = ctrlOf(p0, p1);
  const n = 40;
  const upto = Math.max(1, Math.floor(sat(grow, 0, 1) * n));
  g.save();
  if (o.dash) g.setLineDash(o.dash);
  g.strokeStyle = o.color ?? theme.accent;
  g.lineWidth = o.width ?? 3;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  for (let i = 0; i <= upto; i++) {
    const q = qPoint(p0, c, p1, i / n);
    if (i === 0) g.moveTo(q[0], q[1]);
    else g.lineTo(q[0], q[1]);
  }
  g.stroke();
  g.restore();
}

/** 地点标记：脉冲环 + 实心点 + 名称 */
function marker(
  g: CanvasRenderingContext2D,
  p: XY,
  name: string,
  theme: Theme,
  t: number,
  o: { phase?: number; align?: "left" | "right"; size?: number; strong?: boolean; note?: string } = {},
) {
  const ph = o.phase ?? 0;
  const r = 6 + 10 * pulse(t * 0.9 + ph, 0.4);
  g.strokeStyle = theme.accent;
  g.globalAlpha = 0.35;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(p[0], p[1], r, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;

  g.fillStyle = o.strong ? theme.accent2 : theme.accent;
  g.beginPath();
  g.arc(p[0], p[1], 6, 0, Math.PI * 2);
  g.fill();

  text(g, name, p[0] + (o.align === "right" ? -16 : 16), p[1] + 10, theme, {
    size: o.size ?? 34,
    weight: 500,
    tone: "text",
    align: o.align === "right" ? "right" : "left",
  });
  if (o.note) {
    text(g, o.note, p[0] + (o.align === "right" ? -16 : 16), p[1] + 46, theme, {
      size: 34,
      tone: "textFaint",
      align: o.align === "right" ? "right" : "left",
    });
  }
}

// ---------------------------------------------------------------------------
// variant 0：全幅地图
// ---------------------------------------------------------------------------

const mapFullBleed: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as MapContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const MX = PAD;
  const MY = 112;
  const MW = CANVAS_W - PAD * 2;
  const MH = 900;
  mapBase(g, MX, MY, MW, MH, theme, t);

  // 航线：逐段生长，循环（运动源 1）
  const segs = c.routes;
  segs.forEach((r, i) => {
    const a = c.places[r.from];
    const b = c.places[r.to];
    if (!a || !b) return;
    const p0 = px(a, MX, MY, MW, MH);
    const p1 = px(b, MX, MY, MW, MH);
    const grow = mod(t * 0.16 + i * 0.12, 1.25);
    routePath(g, p0, p1, grow, theme, { width: 3.5 });

    // 沿线飞行的光点（运动源 2）
    const ctrl = ctrlOf(p0, p1);
    const u = mod(t * 0.28 + i * 0.33, 1);
    const q = qPoint(p0, ctrl, p1, u);
    g.save();
    g.shadowColor = theme.accent2;
    g.shadowBlur = 22;
    g.fillStyle = theme.accent2;
    g.beginPath();
    g.arc(q[0], q[1], 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });

  // 地点标记（运动源 3：脉冲）
  c.places.forEach((p, i) => {
    marker(g, px(p, MX, MY, MW, MH), p.name, theme, t, {
      phase: i * 0.7,
      align: p.x > 0.72 ? "right" : "left",
      strong: i === 0,
      note: p.note,
    });
  });

  // 左下读数：数值持续小幅跳动（运动源 4）
  const stats = (c.stats ?? []).slice(0, 2);
  stats.forEach((s, i) => {
    const y = MY + MH - 96 - i * 92;
    text(g, s.label, MX + 32, y, theme, { size: 34, tone: "textDim" });
    text(g, s.value, MX + 32, y + 58, theme, { size: 56, weight: 700 });
  });
  if (stats.length === 0) {
    text(g, String(c.places.length), MX + 32, MY + MH - 96, theme, { size: 56, weight: 700 });
  }

  // 航线标签
  if (segs[0]?.label) {
    const a = c.places[segs[0].from];
    const b = c.places[segs[0].to];
    if (a && b) {
      const m = qPoint(px(a, MX, MY, MW, MH), ctrlOf(px(a, MX, MY, MW, MH), px(b, MX, MY, MW, MH)), px(b, MX, MY, MW, MH), 0.5);
      const lw = measure(g, segs[0].label, 34, 500) + 48;
      chip(g, segs[0].label, m[0] - lw / 2, m[1] - 76, theme, { size: 34, h: 50, padX: 24 });
    }
  }

  progressBar(g, MX + 32, MY + MH + 36, MW - 64, 8, mod(t * 0.12, 1), theme);
};

// ---------------------------------------------------------------------------
// variant 1：左列表 + 右局部地图
// ---------------------------------------------------------------------------

const mapSplit: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as MapContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const LY = 118;
  const LW = 470;
  const LH = 966;
  panel(g, PAD, LY, LW, LH, theme, { r: 20, shadow: 0.35 });

  const ROW_H = 112;
  const TOP = LY + 28;
  const rows = c.places.slice(0, 7);
  const active = rows.length ? Math.floor(mod(t * 0.38, rows.length)) : 0;

  // 活动行指示条平滑滑动（运动源）
  g.fillStyle = theme.accentSoft;
  rr(g, PAD + 14, TOP + active * ROW_H, LW - 28, ROW_H - 16, 12);
  g.fill();
  g.fillStyle = theme.accent;
  rr(g, PAD + 14, TOP + active * ROW_H + 12, 4, ROW_H - 40, 2);
  g.fill();

  rows.forEach((p, i) => {
    const y = TOP + i * ROW_H;
    text(g, String(i + 1).padStart(2, "0"), PAD + 32, y + 46, theme, {
      size: 34,
      weight: 600,
      tone: i === active ? "accent" : "textFaint",
    });
    text(g, ellipsize(g, p.name, LW - 150, 34, 500), PAD + 92, y + 46, theme, {
      size: 34,
      weight: i === active ? 600 : 400,
      tone: i === active ? "text" : "textDim",
    });
    if (p.note) {
      text(g, ellipsize(g, p.note, LW - 150, 34, 400), PAD + 92, y + 86, theme, {
        size: 34,
        tone: "textFaint",
      });
    }
    if (i < rows.length - 1) {
      g.fillStyle = theme.grid;
      g.fillRect(PAD + 92, y + ROW_H - 8, LW - 130, 1);
    }
  });

  // 右：局部地图（只投前 3 个点 → 视觉上像放大了一级）
  const MX = PAD + LW + 26;
  const MY = LY;
  const MW = CANVAS_W - MX - PAD;
  const MH = LH;
  mapBase(g, MX, MY, MW, MH, theme, t, { gridStep: 74, drift: 9 });

  const local = c.places.slice(0, 3);
  // 把局部三点重新铺满面板（放大）
  const spread: XY[] = [
    [0.26, 0.34],
    [0.72, 0.30],
    [0.56, 0.72],
  ];

  local.forEach((p, i) => {
    const q: XY = [MX + spread[i][0] * MW, MY + spread[i][1] * MH];
    if (i > 0) {
      const a: XY = [MX + spread[0][0] * MW, MY + spread[0][1] * MH];
      routePath(g, a, q, mod(t * 0.2 + i * 0.18, 1.2), theme, { width: 3.5 });
    }
    marker(g, q, p.name, theme, t, { phase: i * 0.8, size: 34, align: i === 1 ? "right" : "left" });
    text(g, String(i + 1).padStart(2, "0"), q[0] - 26, q[1] - 18, theme, {
      size: 34,
      weight: 700,
      tone: "textFaint",
      align: "right",
    });
  });

  // 扫描十字：横竖两条缓慢平移（运动源）
  const sx = MX + MW * mod(t * 0.11, 1);
  const sy = MY + MH * mod(t * 0.07, 1);
  g.strokeStyle = theme.accent;
  g.globalAlpha = 0.18;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx, MY);
  g.lineTo(sx, MY + MH);
  g.moveTo(MX, sy);
  g.lineTo(MX + MW, sy);
  g.stroke();
  g.globalAlpha = 1;

  // 底部图例：把地点备注转成图例条目（内容全部来自 content）。
  // 地图没有图例会显得像背景装饰；补上之后信息密度和"这是张地图"的可读性都更足。
  const legend = c.places.slice(0, 4);
  const ly = MY + MH - 58;
  const slot = (MW - 56) / Math.max(1, legend.length);
  legend.forEach((p, i) => {
    const lx = MX + 28 + i * slot;
    g.fillStyle = i === 0 ? theme.accent : theme.textFaint;
    rr(g, lx, ly - 5, 22, 4, 2);
    g.fill();
    text(g, ellipsize(g, p.note ?? p.name, slot - 40, 34, 400), lx + 32, ly + 14, theme, {
      size: 34,
      tone: i === 0 ? "text" : "textFaint",
    });
  });

  progressBar(g, MX + 28, MY + MH + 12, MW - 56, 8, mod(t * 0.14, 1), theme);
};

// ---------------------------------------------------------------------------
// variant 2：三张并排小地图 + 底部行程带
// ---------------------------------------------------------------------------

const mapTriple: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as MapContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const GAP = 28;
  const MW = (CANVAS_W - PAD * 2 - GAP * 2) / 3;
  const MY = 122;
  const MH = 600;
  const routes = c.routes.slice(0, 3);

  routes.forEach((r, i) => {
    const MX = PAD + i * (MW + GAP);
    mapBase(g, MX, MY, MW, MH, theme, t, { gridStep: 64, drift: 5 + i * 2 });

    const a = c.places[r.from];
    const b = c.places[r.to];
    if (!a || !b) return;
    const p0 = px(a, MX, MY, MW, MH);
    const p1 = px(b, MX, MY, MW, MH);
    routePath(g, p0, p1, mod(t * 0.2 + i * 0.3, 1.2), theme, { width: 3 });

    // 每张图自己的扫描线（相位不同 → 三块同时动，运动源 1）
    const sy = MY + MH * mod(t * 0.16 + i * 0.3, 1);
    g.fillStyle = theme.accent;
    g.globalAlpha = 0.18;
    g.fillRect(MX + 1, sy, MW - 2, 2);
    g.globalAlpha = 1;

    marker(g, p0, a.name, theme, t, { phase: i, size: 34 });
    marker(g, p1, b.name, theme, t, { phase: i + 0.5, size: 34, align: "right", strong: true });

    // 卡片序号
    text(g, String(i + 1).padStart(2, "0"), MX + 24, MY + 52, theme, {
      size: 34,
      weight: 700,
      tone: "textFaint",
    });
    if (r.label) {
      const lw = measure(g, r.label, 34, 500) + 40;
      chip(g, r.label, MX + MW - lw - 18, MY + 22, theme, { size: 34, h: 46, padX: 20 });
    }
  });

  // 底部行程带：横向滚动 + 游标（运动源 2/3）
  const BY = MY + MH + 36;
  const BH = 300;
  panel(g, PAD, BY, CANVAS_W - PAD * 2, BH, theme, { r: 20, shadow: 0.3 });

  const AX = PAD + 64;
  const AW = CANVAS_W - PAD * 2 - 128;
  const AY = BY + 128;
  g.fillStyle = theme.grid;
  g.fillRect(AX, AY, AW, 2);

  // 刻度滚动（整条带在动）
  const tick = 92;
  const off = mod(t * 34, tick);
  for (let k = -1; k < Math.ceil(AW / tick) + 2; k++) {
    const x = AX + k * tick - off;
    g.fillStyle = theme.grid;
    g.fillRect(x, AY - 8, 1.5, 18);
    const idx = mod(k, Math.max(1, routes.length));
    text(g, String(idx + 1).padStart(2, "0"), x, AY + 44, theme, {
      size: 34,
      tone: "textFaint",
      align: "center",
    });
  }

  // 游标
  const cxp = AX + AW * mod(t * 0.18, 1);
  g.fillStyle = theme.accent2;
  g.beginPath();
  g.arc(cxp, AY, 8, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.5;
  g.fillRect(cxp - 1, BY + 40, 2, BH - 76);
  g.globalAlpha = 1;

  if (c.stats?.[0]) {
    text(g, c.stats[0].label, PAD + 32, BY + 62, theme, { size: 34, tone: "textDim" });
    text(g, c.stats[0].value, PAD + 32, BY + 128, theme, { size: 56, weight: 700 });
  }
  progressBar(g, PAD + 32, BY + BH - 52, CANVAS_W - PAD * 2 - 64, 8, mod(t * 0.1, 1), theme);
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const MAP_VARIANTS: LayoutDraw[] = [mapFullBleed, mapSplit, mapTriple];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const MAP_MOTION_SOURCES: Record<number, string[]> = {
  0: ["航线逐段生长", "沿线飞行光点", "地点脉冲环", "经纬网格缓漂", "读数跳动", "底部进度条"],
  1: ["地点列表活动行滑动", "局部航线生长", "扫描十字横移", "扫描十字纵移", "右侧网格漂移", "底部进度条"],
  2: ["三张地图各自的扫描线", "三条航线生长", "底部刻度带滚动", "行程带游标右移", "地点脉冲环", "底部进度条"],
};
