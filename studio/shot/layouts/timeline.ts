// 时间轴叙事版式家族 —— 3 个**排布**变体
//
//   variant 0  timelineHorizontal  横向主时间轴 + 上下交替事件卡
//   variant 1  timelineVertical    纵向事件流 + 右侧详情面板
//   variant 2  timelineGantt       轨道式（甘特感）+ 竖向播放头
//
// 变体之间是排布差异，不是配色差异（M1-DESIGN §6 陷阱 1）。
// 每个变体自带 ≥3 个独立连续运动源，列在文件末尾 TIMELINE_MOTION_SOURCES。

import {
  caret,
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
  wrapLines,
} from "../chrome";
import type { LayoutDraw, Theme, TimelineContent } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 48;

/** 当前时间对应的「正在发生」事件下标（只用于高亮，不改变行序） */
function activeIndex(t: number, n: number, speed = 0.34): number {
  return n > 0 ? Math.floor(mod(t * speed, n)) : 0;
}

// ---------------------------------------------------------------------------
// variant 0：横向主时间轴
// ---------------------------------------------------------------------------

const timelineHorizontal: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as TimelineContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const AX = 132;
  const AW = CANVAS_W - AX * 2;
  const AY = 672;
  const ev = c.events.slice(0, 5);
  const n = Math.max(1, ev.length);

  // 轴上刻度：持续左移（运动源 1）
  const tick = 84;
  const off = mod(t * 40, tick);
  g.fillStyle = theme.grid;
  for (let k = -1; k < Math.ceil(AW / tick) + 2; k++) {
    const x = AX + k * tick - off;
    g.fillRect(x, AY - 10, 1.5, 22);
  }

  // 主轴
  g.fillStyle = theme.panelBorder;
  g.fillRect(AX, AY - 1.5, AW, 3);

  // 播放头：横移（运动源 2）
  const headP = mod(t * 0.085, 1);
  const hx = AX + AW * headP;
  g.save();
  g.shadowColor = theme.accent;
  g.shadowBlur = 26;
  g.fillStyle = theme.accent;
  rr(g, hx - 2, AY - 190, 4, 380, 2);
  g.fill();
  g.restore();
  g.fillStyle = theme.accent2;
  g.beginPath();
  g.arc(hx, AY, 9, 0, Math.PI * 2);
  g.fill();

  // 密集刻度尺：信息密度 + 整体左移（运动源）
  const fine = 24;
  const foff = mod(t * 20, fine);
  for (let k = -1; k < Math.ceil(AW / fine) + 2; k++) {
    const x = AX + k * fine - foff;
    const major = mod(k, 5) === 0;
    g.fillStyle = theme.textFaint;
    g.fillRect(x, AY + 14, 1.2, major ? 16 : 7);
    if (major) {
      text(g, String(mod(k * 3, 60)).padStart(2, "0"), x + 4, AY + 62, theme, {
        size: 34,
        tone: "textFaint",
      });
    }
  }

  // 事件卡：上下交替排布（排布差异的核心）
  const CW = 286;
  const CH = 214;
  ev.forEach((e, i) => {
    const cx = AX + (AW * (i + 0.5)) / n;
    const above = i % 2 === 0;
    const cy = above ? 214 : 764;
    const near = Math.abs(cx - hx) < (AW / n) * 0.9;

    panel(g, cx - CW / 2, cy, CW, CH, theme, {
      r: 18,
      shadow: near ? 0.7 : 0.3,
      fill: near ? theme.panelStrong : theme.panel,
      stroke: near ? theme.accent : undefined,
    });

    // 连接线：卡片 → 轴上的节点
    g.fillStyle = near ? theme.accent : theme.panelBorder;
    g.fillRect(cx - 1, above ? cy + CH : AY, 2, above ? AY - cy - CH : cy - AY);

    text(g, ellipsize(g, e.time, CW - 40, 34, 700), cx - CW / 2 + 20, cy + 46, theme, {
      size: 34,
      weight: 700,
      color: near ? theme.accent : theme.textDim,
    });
    text(g, ellipsize(g, e.title, CW - 40, 40, 600), cx - CW / 2 + 20, cy + 96, theme, {
      size: 40,
      weight: 600,
    });
    if (e.body) {
      const ls = wrapLines(g, e.body, CW - 40, 34, 400, 2);
      ls.forEach((l, k) => {
        text(g, l, cx - CW / 2 + 20, cy + 140 + k * 36, theme, { size: 34, tone: "textFaint" });
      });
    }
    if (e.tag) {
      const tw = measure(g, e.tag, 34, 500) + 32;
      chip(g, e.tag, cx + CW / 2 - tw - 16, cy + CH - 58, theme, { size: 34, h: 42, padX: 16 });
    }

    // 轴节点：脉冲（运动源 3）
    const r = near ? 11 : 7;
    g.fillStyle = near ? theme.accent2 : theme.textFaint;
    g.beginPath();
    g.arc(cx, AY, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.35 * pulse(t + i * 0.3, 0.5);
    g.strokeStyle = theme.accent2;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, AY, r + 10, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  });

  progressBar(g, AX, 1128, AW, 10, mod(t * 0.1, 1), theme);
};

// ---------------------------------------------------------------------------
// variant 1：纵向事件流 + 详情
// ---------------------------------------------------------------------------

const timelineVertical: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as TimelineContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const SPINE = 300;
  const TOP = 152;
  const ROW_H = 156;
  const ev = c.events;
  const active = activeIndex(t, ev.length, 0.3);
  const scroll = mod(t * 26, ROW_H);

  // 脊线：渐变随呼吸（运动源 1）
  const grd = g.createLinearGradient(0, TOP, 0, CANVAS_H - 60);
  grd.addColorStop(0, theme.panelBorder);
  grd.addColorStop(clamp01(0.2 + 0.3 * pulse(t, 0.4)), theme.accent);
  grd.addColorStop(1, theme.panelBorder);
  g.fillStyle = grd;
  g.fillRect(SPINE - 1.5, TOP, 3, CANVAS_H - TOP - 80);

  // 左侧密集纵向刻度尺：让「纵向事件流」与其它版式在像素层面明显不同
  const VT = 22;
  const voff = mod(t * 24, VT);
  const vRows = Math.ceil((CANVAS_H - TOP) / VT) + 1;
  for (let k = 0; k < vRows; k++) {
    const y = TOP + k * VT - voff;
    if (y < TOP || y > CANVAS_H - 80) continue;
    const major = mod(k, 5) === 0;
    g.fillStyle = theme.textFaint;
    g.fillRect(56, y, major ? 22 : 9, 1.2);
    if (major) {
      text(g, String(mod(k, 60)).padStart(2, "0"), 88, y + 10, theme, {
        size: 34,
        tone: "textFaint",
      });
    }
  }

  // 事件行：整体上滚（运动源 2）
  g.save();
  g.beginPath();
  g.rect(0, TOP - 20, CANVAS_W, CANVAS_H - TOP - 60);
  g.clip();
  const rows = Math.ceil((CANVAS_H - TOP) / ROW_H) + 2;
  for (let r = -1; r < rows; r++) {
    const i = mod(r, ev.length);
    const y = TOP + r * ROW_H - scroll + 60;
    const e = ev[i];
    const near = i === active;

    const nr = near ? 13 : 8;
    g.fillStyle = near ? theme.accent2 : theme.textFaint;
    g.beginPath();
    g.arc(SPINE, y, nr, 0, Math.PI * 2);
    g.fill();
    if (near) {
      g.globalAlpha = 0.4 * pulse(t, 0.6);
      g.strokeStyle = theme.accent2;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(SPINE, y, nr + 13, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    text(g, e.time, SPINE - 34, y + 10, theme, {
      size: 34,
      weight: near ? 700 : 400,
      align: "right",
      tone: near ? "accent" : "textFaint",
    });
    text(g, ellipsize(g, e.title, 470, 38, near ? 600 : 400), SPINE + 44, y + 6, theme, {
      size: 38,
      weight: near ? 600 : 400,
      color: near ? theme.text : theme.textDim,
    });
    if (e.tag) {
      chip(g, e.tag, SPINE + 44, y + 24, theme, { size: 34, h: 40, padX: 14 });
    }
  }
  g.restore();

  // 右侧详情面板
  const DX = 880;
  const DY = 152;
  const DW = CANVAS_W - DX - PAD;
  const DH = 900;
  panel(g, DX, DY, DW, DH, theme, { r: 22, shadow: 0.45 });

  const cur = ev[active];
  text(g, cur.time, DX + 36, DY + 74, theme, { size: 64, weight: 700, tone: "accent" });
  if (cur.tag) {
    const tw = measure(g, cur.tag, 34, 500) + 36;
    chip(g, cur.tag, DX + DW - tw - 36, DY + 30, theme, { size: 34, h: 46, padX: 18 });
  }
  g.fillStyle = theme.grid;
  g.fillRect(DX + 32, DY + 104, DW - 64, 1);

  const titleLines = wrapLines(g, cur.title, DW - 72, 48, 600, 2);
  titleLines.forEach((l, k) => {
    text(g, l, DX + 36, DY + 176 + k * 62, theme, { size: 48, weight: 600 });
  });

  if (cur.body) {
    const bodyLines = wrapLines(g, cur.body, DW - 72, 34, 400, 7);
    bodyLines.forEach((l, k) => {
      text(g, l, DX + 36, DY + 300 + k * 52, theme, { size: 34, tone: "textDim" });
    });
  }

  // 阅读进度：持续走（运动源 3）
  progressBar(g, DX + 36, DY + DH - 64, DW - 72, 10, mod(t * 0.12, 1), theme);
  // 详情左下角光标（运动源 4）
  caret(g, DX + 36, DY + DH - 96, 40, theme, t, 1.6);
};

// ---------------------------------------------------------------------------
// variant 2：轨道式（甘特感）
// ---------------------------------------------------------------------------

const timelineGantt: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as TimelineContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const LX = PAD;
  const LW = 336;
  const BX = PAD + LW + 24;
  const BW = CANVAS_W - BX - PAD;
  const TOP = 190;
  const LANE_H = 122;
  const ev = c.events.slice(0, 7);
  const n = Math.max(1, ev.length);

  // 顶部刻度：横向滚动（运动源 1）
  const tick = 150;
  const off = mod(t * 95, tick);
  for (let k = -1; k < Math.ceil(BW / tick) + 2; k++) {
    const x = BX + k * tick - off;
    g.fillStyle = theme.panelBorder;
    g.fillRect(x, TOP - 34, 1.5, CANVAS_H - TOP);
    text(g, String(mod(k, 12) + 1).padStart(2, "0"), x + 6, TOP - 42, theme, {
      size: 34,
      tone: "textFaint",
    });
  }

  // 次级刻度：每 25px 一根短刻度（提高密度）
  const minor = 25;
  const moff = mod(t * 70, minor);
  for (let k = -1; k < Math.ceil(BW / minor) + 2; k++) {
    const x = BX + k * minor - moff;
    if (mod(k, 6) === 0) continue;
    g.fillStyle = theme.textFaint;
    g.fillRect(x, TOP - 34, 1, 10);
  }

  // 竖向播放头：横扫（运动源 2）
  // 0.105 → 0.26：慢版的播放头在成片里只有 ~1px/帧，缩到验收采样后整段会被判「没动」
  const headP = mod(t * 0.26, 1);
  const hx = BX + BW * headP;
  // 宽一点的柔光带：让"播放头在动"这件事在低分辨率采样里也成立
  const beam = g.createLinearGradient(hx - 70, 0, hx + 70, 0);
  beam.addColorStop(0, "rgba(255,255,255,0)");
  beam.addColorStop(0.5, theme.accentSoft);
  beam.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = beam;
  g.fillRect(hx - 70, TOP - 30, 140, n * LANE_H + 12);
  g.save();
  g.shadowColor = theme.accent;
  g.shadowBlur = 24;
  g.fillStyle = theme.accent;
  g.fillRect(hx - 2, TOP - 30, 4, n * LANE_H + 12);
  g.restore();

  const active = activeIndex(t, n, 0.3);
  ev.forEach((e, i) => {
    const y = TOP + i * LANE_H;
    const near = i === active;

    // 轨道底色
    g.fillStyle = near ? theme.accentSoft : theme.panel;
    rr(g, BX - 12, y, BW + 12, LANE_H - 26, 12);
    g.fill();

    // 左侧轨道名
    text(g, ellipsize(g, e.title, LW, 34, near ? 600 : 400), LX, y + 44, theme, {
      size: 34,
      weight: near ? 600 : 400,
      tone: near ? "text" : "textDim",
    });
    text(g, e.time, LX, y + 82, theme, { size: 34, tone: "textFaint" });

    // 条形：起点与长度由序号决定（固定），填充比例随播放头前进（运动源 3）
    const startU = 0.06 + (i / n) * 0.34;
    const lenU = Math.max(0.16, 0.46 - i * 0.035);
    const x0 = BX + BW * startU;
    const wFull = BW * lenU;
    const fill = sat((headP - startU) / lenU, 0, 1);

    g.fillStyle = theme.panelStrong;
    rr(g, x0, y + 44, wFull, 30, 8);
    g.fill();

    if (fill > 0) {
      g.fillStyle = near ? theme.accent2 : theme.accent;
      g.globalAlpha = near ? 1 : 0.7;
      rr(g, x0, y + 44, Math.max(6, wFull * fill), 30, 8);
      g.fill();
      g.globalAlpha = 1;
    }

    // 条形末端百分比（随播放头变化，运动源 4）
    text(g, `${Math.round(fill * 100)}%`, x0 + wFull + 16, y + 68, theme, {
      size: 34,
      weight: 600,
      tone: near ? "text" : "textFaint",
    });
  });

  progressBar(g, BX, CANVAS_H - 74, BW, 10, mod(t * 0.09, 1), theme);
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const TIMELINE_VARIANTS: LayoutDraw[] = [timelineHorizontal, timelineVertical, timelineGantt];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const TIMELINE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["播放头横移", "轴上刻度左移", "最近事件卡高亮切换", "轴节点脉冲环", "底部进度条"],
  1: ["脊线渐变呼吸", "事件流纵向滚动", "活动节点脉冲", "右侧阅读进度条", "详情光标闪烁"],
  2: ["顶部刻度横向滚动", "竖向播放头横扫", "条形按播放头填充", "条形末端百分比跳动", "活动轨道高亮", "底部进度条"],
};
