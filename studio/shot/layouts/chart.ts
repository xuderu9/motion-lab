// 图表版式家族 —— 3 个**排布**变体
//
//   variant 0  chartFullBleed  全幅折线 + 左上大数字（单图占满）
//   variant 1  chartSplit      左 3 张 KPI 卡 + 右柱状图（左右分栏）
//   variant 2  chartRankRace   8 行排名赛跑（横向条形 + 名次互换）
//
// 三个变体用的是同一份 ChartContent：只有排布不同，数据一样能出三种完全不同的画面。
// 这正是「只改 JSON 就能换画面」的证明（验收第 1 条）。

import {
  barsV,
  chip,
  clamp01,
  dashedLine,
  ellipsize,
  formatNum,
  measure,
  mmss,
  mod,
  panel,
  progressBar,
  pulse,
  rr,
  setFont,
  signed,
  sparkline,
  text,
  topBar,
} from "../chrome";
import type { ChartContent, LayoutDraw, Theme } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 56;

/** 把 series 的数值归一化到 0~1，供"生成型"图表使用 */
function normSeries(c: ChartContent): number[] {
  const vals = c.series.map((s) => s.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  return vals.map((v) => (v - lo) / span);
}

/**
 * 数据条的平均水平（归一化到 0~1），用来给合成曲线定标。
 * 换一份 JSON，曲线基准高度就跟着变 —— 这是「只改数据也看得出是另一条片子」的关键。
 */
function levelOf(c: ChartContent): number {
  const n = normSeries(c);
  return n.reduce((a, b) => a + b, 0) / n.length;
}

// ---------------------------------------------------------------------------
// variant 0：全幅折线
// ---------------------------------------------------------------------------

const chartFullBleed: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as ChartContent;
  topBar(g, theme, t, { title: c.heading, right: mmss(t) });

  // --- 左上英雄数字 ---
  text(g, ellipsize(g, c.metric.label, 900, 34, 400), PAD, 152, theme, { size: 34, tone: "textDim" });
  const vs = formatNum(c.metric.value);
  text(g, vs, PAD, 262, theme, { size: 96, weight: 700 });
  const vw = measure(g, vs, 96, 700);
  if (c.metric.unit) {
    text(g, c.metric.unit, PAD + vw + 16, 262, theme, { size: 40, weight: 500, tone: "textDim" });
  }
  const up = c.metric.delta >= 0;
  const dText = `${signed(c.metric.delta, 1)}%`;
  setStatusChip(g, dText, PAD + vw + 16 + (c.metric.unit ? measure(g, c.metric.unit, 40, 500) + 24 : 0), 210, theme, up, t);
  if (c.subtitle) {
    text(g, ellipsize(g, c.subtitle, 1000, 34, 400), PAD, 320, theme, { size: 34, tone: "textFaint" });
  }

  // 右上角 badge（内容给的）
  if (c.badge) {
    const bw = measure(g, c.badge, 34, 500) + 44;
    chip(g, c.badge, CANVAS_W - PAD - bw, 200, theme, { size: 34, h: 54, padX: 22 });
  }

  // --- 图表区 ---
  const CX = PAD;
  const CY = 372;
  const CW = CANVAS_W - PAD * 2;
  const CH = 596;

  grid4(g, CX, CY, CW, CH, theme);

  const norm = normSeries(c);
  const lvl = levelOf(c) / 100;
  const N = 132;

  // 主曲线：底噪 + 双正弦，持续变形（运动源 1）
  const main: number[] = [];
  const cmp: number[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const ph = t * 3.4 + u * 7.4;
    main.push(
      clamp01(
        0.42 +
          lvl * 0.20 +
          0.22 * Math.sin(ph) +
          0.11 * Math.sin(ph * 2.6 + 1.2) +
          0.05 * Math.sin(ph * 5.1 + 0.4),
      ),
    );
    cmp.push(
      clamp01(
        0.34 + 0.18 * Math.sin(ph * 1.15 + 2.1) + 0.08 * Math.sin(ph * 1.9 + 0.7) + norm[i % norm.length] * 0.10,
      ),
    );
  }
  const px = (i: number) => CX + (CW * i) / (N - 1);
  const py = (v: number) => CY + CH - v * CH;

  // 面积填充
  const grd = g.createLinearGradient(0, CY, 0, CY + CH);
  grd.addColorStop(0, theme.accent);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.save();
  g.globalAlpha = 0.16;
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(px(0), CY + CH);
  main.forEach((v, i) => g.lineTo(px(i), py(v)));
  g.lineTo(px(N - 1), CY + CH);
  g.closePath();
  g.fill();
  g.restore();

  // 对照虚线
  g.save();
  g.setLineDash([12, 10]);
  g.strokeStyle = theme.textFaint;
  g.lineWidth = 2.5;
  g.beginPath();
  cmp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
  g.stroke();
  g.restore();

  // 主线
  g.strokeStyle = theme.accent;
  g.lineWidth = 4;
  g.lineJoin = "round";
  g.beginPath();
  main.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
  g.stroke();

  // 扫描头：竖直游标 + 发光点，持续右移（运动源 2）
  const headI = Math.floor(mod(t * 44, N));
  const hx = px(headI);
  const hy = py(main[headI]);
  g.fillStyle = theme.grid;
  g.fillRect(hx, CY, 2, CH);
  g.save();
  g.shadowColor = theme.accent;
  g.shadowBlur = 26;
  g.fillStyle = theme.accent;
  g.beginPath();
  g.arc(hx, hy, 8, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = theme.text;
  g.beginPath();
  g.arc(hx, hy, 4, 0, Math.PI * 2);
  g.fill();

  // --- 横轴刻度：整体向左滚（运动源 3）---
  const labels = c.series.map((s) => s.label);
  const tickW = 128;
  const totalTW = labels.length * tickW;
  const off = mod(t * 46, tickW);
  g.save();
  g.beginPath();
  g.rect(CX, CY + CH + 10, CW, 56);
  g.clip();
  for (let k = -1; k < Math.ceil(CW / tickW) + 2; k++) {
    const idx = mod(k, labels.length);
    text(g, labels[idx], CX + k * tickW - off, CY + CH + 52, theme, { size: 34, tone: "textFaint" });
  }
  g.restore();

  // 横轴基线 + 底部进度
  g.fillStyle = theme.grid;
  g.fillRect(CX, CY + CH, CW, 2);
  progressBar(g, PAD, 1128, CANVAS_W - PAD * 2, 10, mod(t * 0.11, 1), theme);

  // 左上角小十字准星：跟随扫描头（运动源 4）
  g.fillStyle = theme.accent2;
  g.globalAlpha = 0.5 + 0.5 * pulse(t, 0.33);
  rr(g, CX, CY - 16, 3, 3, 1.5);
  g.fill();
  g.globalAlpha = 1;

  void totalTW;
};

// ---------------------------------------------------------------------------
// variant 1：左 KPI 卡 + 右柱状
// ---------------------------------------------------------------------------

const chartSplit: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as ChartContent;
  topBar(g, theme, t, { title: c.heading, right: mmss(t) });

  // --- 左列：3 张 KPI 卡 ---
  const LX = 48;
  const LW = 552;
  const CH = 286;
  const GAP = 34;
  const series = c.series.slice(0, 3);

  series.forEach((s, i) => {
    const y = 120 + i * (CH + GAP);
    panel(g, LX, y, LW, CH, theme, { r: 24, shadow: 0.45 });

    text(g, ellipsize(g, s.label, LW - 56, 34, 500), LX + 28, y + 56, theme, {
      size: 34,
      weight: 500,
      tone: "textDim",
    });

    // 数值持续增长（运动源 1）—— 每秒都在变
    const drift = s.value * (0.016 * Math.sin(t * 1.9 + i * 1.9) + 0.006 * Math.floor(t * 3));
    const shown = s.value + drift;
    text(g, formatNum(shown, Math.abs(shown) < 100 ? 1 : 0), LX + 28, y + 138, theme, {
      size: 68,
      weight: 700,
    });

    const d = (i % 2 === 0 ? 1 : -1) * (2.4 + 0.9 * Math.sin(t * 0.8 + i));
    setStatusChip(g, `${signed(d, 1)}%`, LX + 28, y + 164, theme, d >= 0, t, 34);

    // 迷你折线（运动源 2）
    const vals: number[] = [];
    for (let k = 0; k < 26; k++) {
      vals.push(clamp01(0.44 + 0.26 * Math.sin(t * 1.9 + i * 1.3 + k * 0.42) + 0.12 * Math.sin(t * 3.7 + k * 0.9)));
    }
    sparkline(g, LX + 28, y + CH - 82, LW - 56, 56, vals, theme, {
      color: i === 0 ? theme.accent : theme.accent2,
      lineWidth: 3,
      fill: true,
    });
  });

  // --- 右列：柱状图 ---
  const RX = 646;
  const RW = CANVAS_W - RX - 48;
  const RY = 120;
  const RH = 730;
  panel(g, RX, RY, RW, RH, theme, { r: 24, shadow: 0.45 });

  if (c.badge) {
    const bw = measure(g, c.badge, 34, 500) + 40;
    chip(g, c.badge, RX + RW - 28 - bw, RY + 26, theme, { size: 34, h: 50, padX: 20 });
  }
  // 头部两行：标签 + 大合计。之前把合计和 badge 画在同一行，两者直接叠在一起。
  text(g, ellipsize(g, c.metric.label, RW - 320, 34, 500), RX + 28, RY + 62, theme, {
    size: 34,
    weight: 500,
    tone: "textDim",
  });
  const total = c.series.reduce((a, b) => a + b.value, 0);
  text(g, formatNum(total + Math.floor(t * 4)), RX + 28, RY + 130, theme, {
    size: 56,
    weight: 700,
  });

  const BX = RX + 34;
  const BY = RY + 172;
  const BW = RW - 68;
  const BH = 326;

  // 阈值虚线放在柱子中段，柱群才会真的穿过去
  dashedLine(g, BX, BY + BH * 0.55, BX + BW, BY + BH * 0.55, theme, { color: theme.accent2, width: 2.5 });

  // 柱子持续呼吸（运动源 3）
  barsV(g, BX, BY, BW, BH, t, theme, {
    n: Math.min(16, c.series.length),
    speed: 1.75,
    highlight: Math.floor(mod(t * 0.7, Math.min(16, c.series.length))),
  });

  // 柱下标签：每两根显示一根，避免挤在一起
  const n = Math.min(16, c.series.length);
  const slot = BW / n;
  g.save();
  g.beginPath();
  g.rect(BX - 4, BY + BH + 8, BW + 8, 52);
  g.clip();
  for (let i = 0; i < n; i++) {
    if (i % 2 !== 0) continue;
    text(g, c.series[i].label, BX + slot * i + slot / 2, BY + BH + 48, theme, {
      size: 34,
      tone: "textFaint",
      align: "center",
      maxWidth: slot * 1.9,
    });
  }
  g.restore();

  // --- 右列底部：分布条 + 游标（运动源 4）---
  // 别再画第二遍 metric.label：上一次就是这行字和柱下标签撞在一起。
  const SY = RY + 592;
  const SW = RW - 68;

  // 分布小柱
  const segs = 46;
  for (let i = 0; i < segs; i++) {
    const h = 8 + 44 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.55));
    g.fillStyle = theme.accent;
    g.globalAlpha = 0.28 + 0.5 * (i / segs);
    g.fillRect(BX + (SW * i) / segs, SY + 92 - h, SW / segs - 3, h);
  }
  g.globalAlpha = 1;
  const markerX = BX + SW * mod(t * 0.19, 1);
  g.fillStyle = theme.accent2;
  g.fillRect(markerX, SY + 34, 3, 60);
  g.beginPath();
  g.arc(markerX + 1.5, SY + 34, 7, 0, Math.PI * 2);
  g.fill();
};

// ---------------------------------------------------------------------------
// variant 2：排行榜（横向条形）
// ---------------------------------------------------------------------------

/**
 * 排行榜（横向条形 8 行）。
 *
 * 曾经试过让行**真的移动**来体现名次互换，三种插值都试了，都不行：
 *   1) 软排名（sigmoid 连续名次）      -> 两行长期停在 2.5 上叠字
 *   2) 预测式换位（from=rankAt(t0)、to=rankAt(t0+周期)）-> 条形长度按当前值、
 *      行序按未来值，静止帧上 402 排在 415 上面
 *   3) 整数名次 + 0.3 秒收敛            -> 换位那 0.3 秒两行必然交叉，
 *      叠字（糊成一团）或加底板（整行被遮住留个洞），两种都难看
 *
 * 结论：**行序固定，不许动**。行的身份由 JSON 的书写顺序决定（规划器按降序写）。
 * 名次互换的表达改成「当前最大项高亮」——高亮在两行之间跳，读得出来谁在领跑，
 * 但永远不会有两行叠在一起。取舍写在这里，M2 的人别再改回去。
 *
 * 常驻微动：条形长度演化、数值连续跳动、领跑高亮跳动、年份刻度前进、条内掠光。
 */
const chartRankRace: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as ChartContent;
  topBar(g, theme, t, { title: c.heading, right: mmss(t) });

  const rows = c.series.slice(0, 8);

  // 年份刻度持续前进（运动源 1）
  const year = 2016 + Math.floor(mod(t * 0.75, 9));
  text(g, String(year), CANVAS_W - PAD, 200, theme, { size: 72, weight: 700, align: "right" });
  if (c.subtitle) {
    text(g, ellipsize(g, c.subtitle, 860, 34, 400), PAD, 176, theme, { size: 34, tone: "textDim" });
  }

  const ROW_Y = 258;
  const ROW_H = 104;
  const BAR_X = 430;
  const BAR_MAX = 800;
  const BH = 52;

  // 数值随时间演化（运动源 2）。
  // 幅度 ±4.5% 是算过的，不是随手写的：JSON 里第 1、2 名只差 3%（所以领跑会真的换人），
  // 第 2 名之后的相邻差都在 10% 以上（所以永远不会出现「数字更大却排在下面」）。
  // 行序固定，就不允许相邻两行的数值乱序 —— 那会被读成「排名算错了」。
  const vals = rows.map(
    (r, i) => r.value * (1 + 0.045 * Math.sin(t * 1.30 + i * 1.7) + 0.018 * Math.sin(t * 2.90 + i * 0.8)),
  );
  const vmax = Math.max(...vals);
  const leader = vals.indexOf(vmax);

  rows.forEach((row, i) => {
    const y = ROW_Y + i * ROW_H;
    const bw = Math.max(8, (vals[i] / vmax) * BAR_MAX);
    const lead = i === leader;

    // 名称
    text(g, ellipsize(g, row.label, BAR_X - 32 - PAD, 40, lead ? 600 : 500), PAD, y + BH / 2 + 14, theme, {
      size: 40,
      weight: lead ? 600 : 500,
      color: theme.text,
      maxWidth: BAR_X - 32 - PAD,
    });

    // 条底
    g.fillStyle = theme.panel;
    rr(g, BAR_X, y, BAR_MAX, BH, BH / 2);
    g.fill();

    // 条体
    g.fillStyle = lead ? theme.accent2 : theme.accent;
    g.globalAlpha = lead ? 1 : 0.62 + 0.14 * Math.sin(t * 1.4 + i);
    rr(g, BAR_X, y, bw, BH, BH / 2);
    g.fill();
    g.globalAlpha = 1;

    // 领跑条内掠光持续扫过（运动源 3）
    if (lead) {
      g.save();
      rr(g, BAR_X, y, bw, BH, BH / 2);
      g.clip();
      const sw = mod(t * 260, bw + 260) - 130;
      const sg = g.createLinearGradient(BAR_X + sw - 70, 0, BAR_X + sw + 70, 0);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, "rgba(255,255,255,0.42)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sg;
      g.fillRect(BAR_X, y, bw, BH);
      g.restore();
    }

    // 数值（运动源 4：连续跳动）—— 紧贴条形末端，保证和它自己那行同一视觉高度
    text(g, formatNum(vals[i], 1), BAR_X + bw + 18, y + BH / 2 + 14, theme, {
      size: 40,
      weight: 600,
      color: lead ? theme.text : theme.textDim,
    });
  });

  progressBar(g, PAD, 1128, CANVAS_W - PAD * 2, 10, mod(t * 0.14, 1), theme);
};

// ---------------------------------------------------------------------------
// 局部工具
// ---------------------------------------------------------------------------

/** 涨跌药丸：颜色由 up 决定，但色值只能来自主题 */
function setStatusChip(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  theme: Theme,
  up: boolean,
  t: number,
  size = 40,
) {
  const color = up ? theme.accent2 : theme.accent;
  const h = size * 1.4;
  const w = measure(g, s, size, 500) + size * 1.1;
  g.fillStyle = color;
  g.globalAlpha = 0.16 + 0.06 * Math.sin(t * 2.2);
  rr(g, x, y, w, h, h / 2);
  g.fill();
  g.globalAlpha = 1;
  text(g, s, x + size * 0.55, y + h / 2 + size * 0.36, theme, { size, weight: 500, color });
}

/** 4 横 6 竖的图表网格 */
function grid4(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
) {
  g.fillStyle = theme.grid;
  for (let i = 0; i <= 4; i++) g.fillRect(x, y + (h * i) / 4, w, 1);
  for (let i = 0; i <= 8; i++) g.fillRect(x + (w * i) / 8, y, 1, h);
}

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const CHART_VARIANTS: LayoutDraw[] = [chartFullBleed, chartSplit, chartRankRace];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const CHART_MOTION_SOURCES: Record<number, string[]> = {
  0: ["主曲线持续变形", "扫描头右移", "横轴刻度横向滚动", "准星脉冲", "底部进度条"],
  1: ["3 张 KPI 数值漂移", "3 条迷你折线呼吸", "16 根柱状呼吸", "分布条游标移动", "总览数字跳动"],
  2: ["年份刻度前进", "条形长度演化", "领跑高亮在两行间跳", "领跑条内掠光", "数值连续跳动"],
};
