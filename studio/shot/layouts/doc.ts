// 文档版式家族 —— 3 个**排布**变体
//
//   variant 0  docFullBleed   单栏全幅阅读页（左正文 + 右引用卡 + 底部进度）
//   variant 1  docSidebar     左侧大纲栏 + 右正文双栏
//   variant 2  docGrid        3×2 卡片网格 + 底部横向标签流
//
// 变体之间是排布差异，不是配色差异（M1-DESIGN §6 陷阱 1）。
// 每变体自带 ≥3 个独立连续运动源（验收第 8 条），列在文件末尾的 MOTION_SOURCES 里，
// check-shot.py 会读取并核对数量。

import {
  accentBar,
  barsV,
  caret,
  chip,
  divider,
  easeInOut,
  easeOut,
  ellipsize,
  fadeBottom,
  formatNum,
  measure,
  mod,
  panel,
  progressBar,
  rr,
  sat,
  setFont,
  sparkline,
  text,
  topBar,
  wrapLines,
} from "../chrome";
import type { DocContent, LayoutDraw } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 56;

// ---------------------------------------------------------------------------
// 公用小工具
// ---------------------------------------------------------------------------

/** 循环取段落（正文要无限滚，所以越界就绕回去） */
function line(paras: string[], i: number): string {
  const n = paras.length;
  return paras[((i % n) + n) % n];
}

/** 卡片数据：content.cards 缺省时用 paragraphs 兜底，保证 variant 2 永远有东西画 */
function cardsOf(c: DocContent): { title: string; body: string; tag: string }[] {
  if (c.cards && c.cards.length > 0) return c.cards;
  return c.paragraphs.slice(0, 6).map((p, i) => ({
    title: line([c.heading], 0),
    body: p,
    tag: String(i + 1),
  }));
}

function outlineOf(c: DocContent): string[] {
  if (c.outline && c.outline.length > 0) return c.outline;
  return c.paragraphs.slice(0, 7);
}

/** 卡片/条目的呼吸亮度：让一屏静态元素之间也有微差 */
function shimmer(t: number, i: number, speed = 0.9): number {
  return sat(0.5 + 0.5 * Math.sin(t * speed + i * 1.3), 0, 1);
}

// ---------------------------------------------------------------------------
// variant 0：单栏全幅阅读页
// ---------------------------------------------------------------------------

const docFullBleed: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as DocContent;
  topBar(g, theme, t, { title: c.breadcrumb ?? c.heading });

  const BODY_X = PAD;
  const BODY_W = 1112;
  const BODY_Y = 356;
  const BODY_BOTTOM = 1020;
  const LH = 72;

  // --- 标题区 ---
  text(g, ellipsize(g, c.heading, BODY_W, 76, 700), BODY_X, 214, theme, { size: 76, weight: 700 });
  if (c.subtitle) {
    text(g, ellipsize(g, c.subtitle, BODY_W, 34, 400), BODY_X, 272, theme, { size: 34, tone: "textDim" });
  }
  divider(g, BODY_X, BODY_Y - 24, BODY_W, theme);

  // --- 正文：连续上滚（运动源 1）---
  // 裁剪必须从分隔线**下方**开始。之前上界写成 BODY_Y - LH，
  // 结果正文第一行会压到标题和副标题上（贴图验收时一眼就能看到）。
  const scrollY = mod(t * 152, LH);
  g.save();
  g.beginPath();
  g.rect(BODY_X - 8, BODY_Y - 16, BODY_W + 16, BODY_BOTTOM - BODY_Y + 16);
  g.clip();

  // 高亮带：沿可见行逐行下移（运动源 2）
  const hlFloat = mod(t / 0.55, 14);
  const hlI = Math.floor(hlFloat);
  const hlY = BODY_Y + hlI * LH - scrollY + easeOut(hlFloat - hlI) * LH;
  if (hlY > BODY_Y - 16 && hlY < BODY_BOTTOM) {
    g.fillStyle = theme.accentSoft;
    rr(g, BODY_X - 16, hlY - LH * 0.62, BODY_W + 32, LH * 0.92, 10);
    g.fill();
  }

  for (let i = -1; i < 12; i++) {
    const y = BODY_Y + i * LH - scrollY + LH * 0.7;
    if (y < BODY_Y || y > BODY_BOTTOM + LH) continue;
    const s = line(c.paragraphs, Math.floor(t / 60) + i);
    // 正文用 theme.text 而不是 textDim：0.64 alpha 在浅底上只有 ~#6c7885，
    // 缩到成片 12px 就会明显发灰、读不清。
    text(g, ellipsize(g, s, BODY_W, 40, 400), BODY_X, y, theme, { size: 40, tone: "text" });
  }
  g.restore();
  fadeBottom(g, BODY_X - 8, BODY_Y - 16, BODY_W + 16, BODY_BOTTOM - BODY_Y + 16, theme);

  // --- 右侧：引用分布卡，柱状持续呼吸（运动源 3）---
  const CX = 1208;
  const CW = 336;
  const CY = BODY_Y - 16;
  const CHT = 452;
  panel(g, CX, CY, CW, CHT, theme, { r: 22, fill: theme.panelStrong, shadow: 0.5 });
  if (c.sidebar) {
    text(g, ellipsize(g, c.sidebar.title, CW - 48, 34, 500), CX + 24, CY + 60, theme, {
      size: 34,
      weight: 500,
      tone: "textDim",
    });
    barsV(g, CX + 24, CY + 88, CW - 48, 196, t, theme, { n: Math.min(9, c.sidebar.bars.length || 9), speed: 2.1 });
    // 合计：每秒在跳（运动源 3b）
    const total = c.sidebar.bars.reduce((a, b) => a + b, 0);
    text(g, formatNum(total + Math.floor(t * 3)), CX + 24, CY + 348, theme, { size: 52, weight: 700 });
    divider(g, CX + 24, CY + 386, CW - 48, theme);
    progressBar(g, CX + 24, CY + 408, CW - 48, 10, mod(t * 0.21, 1), theme);
  }

  // --- 底部：整页阅读进度条（运动源 4）---
  progressBar(g, PAD, 1108, CANVAS_W - PAD * 2, 10, mod(t * 0.09, 1), theme);

  // --- 右缘滚动条滑块（运动源 5）---
  g.fillStyle = theme.panel;
  rr(g, CANVAS_W - 20, BODY_Y - 24, 6, BODY_BOTTOM - BODY_Y + 24, 3);
  g.fill();
  g.fillStyle = theme.textFaint;
  const knobY = BODY_Y - 24 + mod(t * 40, BODY_BOTTOM - BODY_Y - 120);
  rr(g, CANVAS_W - 20, knobY, 6, 120, 3);
  g.fill();
};

// ---------------------------------------------------------------------------
// variant 1：左侧大纲 + 右正文
// ---------------------------------------------------------------------------

const docSidebar: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as DocContent;
  topBar(g, theme, t, { title: c.breadcrumb ?? c.heading });

  const items = outlineOf(c).slice(0, 8);
  const RX = 48; // 大纲栏贴左边缘，别留一大块白（之前写成 500，屏幕左侧空了三分之一）
  const RW = 452;
  const RY = 128;
  const RH = 940;
  const rowH = Math.min(92, Math.floor((RH - 96) / items.length));

  panel(g, RX, RY, RW, RH, theme, { r: 24 });

  // 当前小节：每 1.4 秒前进一条，指示条平滑滑过去（运动源 1）
  const ai = mod(t / 1.4, items.length);
  const aI = Math.floor(ai);
  const rowY = (i: number) => RY + 64 + i * rowH;
  const slideY = rowY(aI) + easeInOut(ai - aI) * rowH;

  g.fillStyle = theme.accentSoft;
  rr(g, RX + 20, slideY, RW - 40, rowH - 14, 14);
  g.fill();
  accentBar(g, RX + 20, slideY + 10, 5, rowH - 34, theme);

  items.forEach((s, i) => {
    const active = i === aI;
    const near = sat(1 - Math.abs(i - ai), 0, 1);
    text(g, String(i + 1).padStart(2, "0"), RX + 44, rowY(i) + rowH * 0.56, theme, {
      size: 34,
      tone: "textFaint",
    });
    text(g, ellipsize(g, s, RW - 130, 36, active ? 600 : 400), RX + 96, rowY(i) + rowH * 0.56, theme, {
      size: 36,
      weight: active ? 600 : 400,
      color: active ? theme.text : theme.textDim,
      tracking: 0,
    });
    // 未选中项呼吸，避免整栏死板（运动源 2）
    if (!active) {
      g.fillStyle = theme.accent;
      g.globalAlpha = 0.10 * near * shimmer(t, i);
      rr(g, RX + 20, rowY(i), RW - 40, rowH - 14, 14);
      g.fill();
      g.globalAlpha = 1;
    }
  });

  // 右缘竖直进度：滑块持续下移（运动源 3）
  const trackX = RX + RW - 22;
  const p = mod(t * 0.12, 1);
  g.fillStyle = theme.panel;
  rr(g, trackX, RY + 56, 5, RH - 112, 3);
  g.fill();
  g.fillStyle = theme.accent2;
  const knobH = (RH - 112) * 0.22;
  rr(g, trackX, RY + 56 + (RH - 112 - knobH) * p, 5, knobH, 3);
  g.fill();

  // --- 右正文 ---
  // 左栏 48..500，正文 556..1544：栏宽 988，40px 字号一行约 24 个汉字。
  const BX = 556;
  const BW = CANVAS_W - BX - PAD;
  const BY = 360;
  const BOTTOM = 1020;
  const LH = 70;

  text(g, ellipsize(g, c.heading, BW, 64, 700), BX, 216, theme, { size: 64, weight: 700 });
  if (c.subtitle) {
    text(g, ellipsize(g, c.subtitle, BW, 34, 400), BX, 270, theme, { size: 34, tone: "textDim" });
  }
  divider(g, BX, BY - 26, BW, theme);

  // 正文以不同速度滚动，和左栏错开节奏（运动源 4）
  const scrollY = mod(t * 118, LH);
  g.save();
  g.beginPath();
  g.rect(BX - 8, BY - 16, BW + 16, BOTTOM - BY + 16);
  g.clip();
  for (let i = -1; i < 12; i++) {
    const y = BY + i * LH - scrollY + LH * 0.7;
    if (y < BY || y > BOTTOM + LH) continue;
    const s = line(c.paragraphs, Math.floor(t / 45) + i + 3);
    text(g, ellipsize(g, s, BW, 40, 400), BX, y, theme, { size: 40, tone: "text" });
  }
  g.restore();
  fadeBottom(g, BX - 8, BY - 16, BW + 16, BOTTOM - BY + 16, theme);

  // 左下：当前小节序号，随大纲切换而变
  text(g, `${String(aI + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`, RX + 24, RY + RH - 32, theme, {
    size: 34,
    weight: 500,
    tone: "textFaint",
  });

  caret(g, RX + RW - 60, RY + RH - 24, 30, theme, t, 1.4);
};

// ---------------------------------------------------------------------------
// variant 2：3×2 卡片网格 + 底部标签流
// ---------------------------------------------------------------------------

const docGrid: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as DocContent;
  topBar(g, theme, t, { title: c.breadcrumb ?? c.heading });

  text(g, ellipsize(g, c.heading, 1100, 64, 700), PAD, 210, theme, { size: 64, weight: 700 });
  if (c.subtitle) {
    text(g, ellipsize(g, c.subtitle, 1100, 34, 400), PAD, 262, theme, { size: 34, tone: "textDim" });
  }

  const cards = cardsOf(c).slice(0, 6);
  const COLS = 3;
  // 464×3 + 32×2 = 1456，左右各留 72 —— 之前 480 宽只剩 48 边距，
  // 贴到平板上右列卡片几乎顶到屏幕边。
  const CW = 464;
  const CH = 316;
  const GAP = 32;
  const GAP_Y = 34;
  const GX = 72;
  const GY = 306;
  const posOf = (i: number) => ({
    x: GX + (i % COLS) * (CW + GAP),
    y: GY + Math.floor(i / COLS) * (CH + GAP_Y),
  });

  // 聚光灯相位先算出来：卡片底色要跟着它一起呼吸（见下面的 cardWash）
  const spotF = mod(t / 1.05, cards.length);

  // --- 卡片 ---
  cards.forEach((card, i) => {
    const { x, y } = posOf(i);
    panel(g, x, y, CW, CH, theme, {
      r: 22,
      fill: theme.panelStrong,
      shadow: 0.35,
    });

    // 卡片底色洗：离聚光灯越近越亮，整张卡（464×316）作为一个大面积低幅度
    // 的变化源。只有细线在动的话，缩到成片里帧差会低到「像静止」。
    const near = sat(1 - Math.abs(i - spotF), 0, 1);
    if (near > 0.01) {
      g.save();
      g.fillStyle = theme.accent;
      g.globalAlpha = 0.07 * near;
      rr(g, x, y, CW, CH, 22);
      g.fill();
      g.restore();
    }

    text(g, ellipsize(g, card.title, CW - 200, 38, 600), x + 26, y + 58, theme, { size: 38, weight: 600 });

    // 右上角标签
    const tagW = measure(g, card.tag, 34, 500) + 36;
    chip(g, card.tag, x + CW - 26 - tagW, y + 26, theme, { size: 34, h: 46, padX: 18 });

    // 正文两行（真换行，不是把同一句截断两次）
    const bodyLines = wrapLines(g, card.body, CW - 52, 34, 400, 2);
    bodyLines.forEach((ln, k) => {
      text(g, ln, x + 26, y + 122 + k * 48, theme, {
        size: 34,
        tone: k === 0 ? "text" : "textDim",
      });
    });

    // 迷你折线：每张相位不同（运动源 1 —— 6 张同时呼吸）
    const vals: number[] = [];
    const N = 22;
    for (let k = 0; k < N; k++) {
      vals.push(
        0.45 +
          0.30 * Math.sin(t * 2.6 + i * 1.1 + k * 0.55) +
          0.16 * Math.sin(t * 4.7 + i * 0.7 + k * 1.2),
      );
    }
    sparkline(g, x + 26, y + CH - 94, CW - 52, 62, vals, theme, {
      color: i === Math.floor(mod(t / 1.05, cards.length)) ? theme.accent2 : theme.accent,
      lineWidth: 3,
      fill: true,
    });
    g.globalAlpha = 1;
  });

  // --- 聚光灯：在卡片之间连续移动（运动源 2）---
  // 同一行内是「滑过去」；跨行（行尾→下一行行首）改成「淡出+淡入」。
  // 之前的做法是直接按索引线性插值，从第 3 张到第 4 张时形成一条斜穿网格的
  // 方框，看起来像渲染坏了。
  const sf = spotF;
  const sI = Math.min(Math.floor(sf), cards.length - 1);
  const sJ = Math.min(sI + 1, cards.length - 1);
  const f = easeInOut(sf - sI);
  const p0 = posOf(sI);
  const p1 = posOf(sJ);
  const sameRow = Math.floor(sI / COLS) === Math.floor(sJ / COLS);
  const alpha = 0.55 + 0.35 * Math.sin(t * 3.4);

  const ring = (x: number, y: number, a: number) => {
    if (a <= 0.01) return;
    g.save();
    g.strokeStyle = theme.accent;
    g.lineWidth = 3;
    g.globalAlpha = a;
    rr(g, x - 2, y - 2, CW + 4, CH + 4, 24);
    g.stroke();
    g.restore();
  };

  if (sameRow) {
    ring(p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f, alpha);
  } else {
    ring(p0.x, p0.y, alpha * (1 - f));
    ring(p1.x, p1.y, alpha * f);
  }

  // --- 底部标签流：整条向左连续滚动（运动源 3）---
  const tags = (c.tags && c.tags.length > 0 ? c.tags : c.paragraphs.slice(0, 8)).map(String);
  const STRIP_Y = 1004;
  const STRIP_H = 62;
  let totalW = 0;
  const tagW = tags.map((s) => measure(g, s, 34, 500) + 68);
  tags.forEach((_, i) => (totalW += tagW[i] + 16));
  const off = mod(t * 130, totalW);

  g.save();
  g.beginPath();
  g.rect(PAD, STRIP_Y - 8, CANVAS_W - PAD * 2, STRIP_H + 16);
  g.clip();
  for (let rep = 0; rep < 3; rep++) {
    let cx = PAD - off + rep * totalW;
    tags.forEach((s, i) => {
      chip(g, s, cx, STRIP_Y, theme, {
        size: 34,
        h: STRIP_H,
        padX: 26,
        fill: i % 3 === 0 ? theme.accentSoft : theme.panel,
        color: i % 3 === 0 ? theme.accent : theme.textDim,
      });
      cx += tagW[i] + 16;
    });
  }
  g.restore();

  // 底部细进度条（运动源 4）
  progressBar(g, PAD, STRIP_Y + 92, CANVAS_W - PAD * 2, 8, mod(t * 0.17, 1), theme);

  // 光标（运动源 5）
  caret(g, PAD - 22, 214, 46, theme, t, 1.6);
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const DOC_VARIANTS: LayoutDraw[] = [docFullBleed, docSidebar, docGrid];

/**
 * 每个变体的常驻连续运动源清单（验收第 8 条：≥3 个）。
 * 只列**本变体自有**的，不把 ScreenLayer 的掠光/扫描线/相机漂移算进来。
 * check-shot.py 会核对每个变体 ≥3 条。
 */
export const DOC_MOTION_SOURCES: Record<number, string[]> = {
  0: ["正文连续上滚", "高亮带逐行下移", "右卡柱状呼吸", "底部阅读进度", "右缘滚动滑块", "光标闪烁"],
  1: ["大纲指示条平滑滑动", "未选中项呼吸", "右缘进度滑块下移", "右正文异速滚动", "光标闪烁"],
  2: ["6 张卡片折线同时呼吸", "聚光灯跨卡连续移动", "底部标签流横向滚动", "细进度条", "光标闪烁"],
};
