// 卡片素材墙版式家族 —— 3 个**排布**变体
//
//   variant 0  cardsMasonry  三列瀑布流（列高错落、列间异步漂移）
//   variant 1  cardsHeroGrid 左大卡 + 右 2×2 小卡网格
//   variant 2  cardsCarousel 横向轮播带（中间大卡 + 两侧探出）
//
// 变体之间是排布差异，不是配色差异（M1-DESIGN §6 陷阱 1）。
// 每个变体自带 ≥3 个独立连续运动源，列在文件末尾 CARDS_MOTION_SOURCES。

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
  sparkline,
  text,
  topBar,
  wrapLines,
} from "../chrome";
import type { CardsContent, LayoutDraw, Theme } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 48;

type Card = CardsContent["cards"][number];

/** 每张卡片的迷你折线：确定性生成，随 t 呼吸（运动源） */
function miniSeries(t: number, seed: number, n = 22): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push(
      clamp01(
        0.42 +
          0.22 * Math.sin(t * 1.6 + seed + u * 5.2) +
          0.10 * Math.sin(t * 3.1 + seed * 0.7 + u * 9.4),
      ),
    );
  }
  return out;
}

/** 一张卡片的通用画法（标题 / 正文 / 标签 / 可选大数字 / 迷你折线） */
function card(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: Card,
  theme: Theme,
  t: number,
  o: { seed?: number; hot?: boolean; big?: boolean } = {},
) {
  const seed = o.seed ?? 0;
  panel(g, x, y, w, h, theme, {
    r: 20,
    shadow: o.hot ? 0.8 : 0.35,
    fill: o.hot ? theme.panelStrong : theme.panel,
    stroke: o.hot ? theme.accent : undefined,
  });

  const pad = o.big ? 32 : 24;
  // 矮卡片（2×3 网格里的那种）放不下正文，只保留标签 / 标题 / 数值 / 折线
  const compact = h < 330;
  if (c.tag) {
    chip(g, ellipsize(g, c.tag, w - pad * 2, 34, 500), x + pad, y + pad, theme, {
      size: 34,
      h: 44,
      padX: 16,
    });
  }

  const titleSize = o.big ? 52 : 38;
  const titleTop = y + pad + (c.tag ? 72 : 8);
  const tl = wrapLines(g, c.title, w - pad * 2, titleSize, 600, compact ? 1 : 2);
  tl.forEach((l, k) => {
    text(g, l, x + pad, titleTop + k * (titleSize + 10), theme, { size: titleSize, weight: 600 });
  });

  if (c.value) {
    text(g, c.value, x + pad, titleTop + tl.length * (titleSize + 10) + 48, theme, {
      size: o.big ? 88 : compact ? 48 : 56,
      weight: 700,
      tone: "accent",
    });
  }

  if (compact) {
    sparkline(g, x + pad, y + h - 66, w - pad * 2, 36, miniSeries(t, seed), theme, {
      color: o.hot ? theme.accent2 : theme.accent,
      lineWidth: 2.5,
      fill: true,
    });
    return;
  }

  const bodyTop = titleTop + tl.length * (titleSize + 10) + (c.value ? (o.big ? 74 : 44) : 8);
  const bodyLines = Math.max(1, Math.min(3, Math.floor((y + h - 96 - bodyTop) / 38)));
  const bl = wrapLines(g, c.body, w - pad * 2, 34, 400, bodyLines);
  bl.forEach((l, k) => {
    text(g, l, x + pad, bodyTop + k * 38, theme, { size: 34, tone: "textDim" });
  });

  // 迷你折线（运动源：每张卡都在呼吸）
  sparkline(g, x + pad, y + h - 74, w - pad * 2, 42, miniSeries(t, seed), theme, {
    color: o.hot ? theme.accent2 : theme.accent,
    lineWidth: 2.5,
    fill: true,
  });
}

// ---------------------------------------------------------------------------
// variant 0：三列瀑布流
// ---------------------------------------------------------------------------

const cardsMasonry: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CardsContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const GAP = 30;
  const COLS = 3;
  const CW = (CANVAS_W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const TOP = 120;
  // 三张卡 + 两个间距必须落在「顶部 120 → 底部标签带 1064」之间，
  // 还要留出 ±14px 的列漂移量。原来 430+348+402 会画到 1360，直接被画布裁掉
  // （品红探针查不到，但人眼看到的是「卡片被切了一半」）。
  const H_PATTERN = [310, 252, 268];

  const cards = c.cards;
  const total = cards.length;

  // 聚光灯：跨卡连续移动（运动源 1，大面积低幅）
  const spotX = PAD + (CANVAS_W - PAD * 2) * mod(t * 0.07, 1);
  const spot = g.createRadialGradient(spotX, 560, 40, spotX, 560, 520);
  spot.addColorStop(0, theme.accentSoft);
  spot.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = spot;
  g.fillRect(0, 100, CANVAS_W, CANVAS_H - 100);

  for (let col = 0; col < COLS; col++) {
    const x = PAD + col * (CW + GAP);
    // 列间异步纵向漂移（运动源 2）
    const drift = 14 * Math.sin(t * 0.55 + col * 1.7);
    let y = TOP + drift;
    for (let row = 0; row < 3; row++) {
      const h = H_PATTERN[(col + row) % H_PATTERN.length];
      const idx = mod(col * 3 + row, total);
      const hot = Math.abs(x + CW / 2 - spotX) < CW * 0.6;
      card(g, x, y, CW, h, cards[idx], theme, t, { seed: idx * 1.3, hot, big: row === 0 });
      y += h + GAP;
    }
  }

  // 底部标签流：横向滚动（运动源 3）
  const tags = c.tags ?? cards.map((k) => k.tag);
  const STY = 1064;
  g.fillStyle = theme.grid;
  g.fillRect(PAD, STY - 18, CANVAS_W - PAD * 2, 1);
  let tx = PAD - mod(t * 46, 260);
  for (let i = 0; i < tags.length * 3; i++) {
    const tg = tags[mod(i, tags.length)];
    const w = measure(g, tg, 34, 500) + 40;
    chip(g, tg, tx, STY + 6, theme, { size: 34, h: 48, padX: 20 });
    tx += w + 16;
    if (tx > CANVAS_W) break;
  }

  progressBar(g, PAD, 1146, CANVAS_W - PAD * 2, 8, mod(t * 0.11, 1), theme);
};

// ---------------------------------------------------------------------------
// variant 1：左大卡 + 右 2×2 网格
// ---------------------------------------------------------------------------

const cardsHeroGrid: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CardsContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const HY = 120;
  const HH = 900;

  // 左侧索引栏：既是编辑排版里的常规元素，也让这个变体在结构上
  // 明显区别于「瀑布流」和「轮播带」（后两者没有竖向导轨）
  const RAIL_X = PAD;
  const RAIL_W = 96;
  const RAIL_H = 900;
  g.fillStyle = theme.accentSoft;
  rr(g, RAIL_X, HY, RAIL_W, RAIL_H, 28);
  g.fill();
  const railN = 7;
  for (let i = 0; i < railN; i++) {
    const on = Math.floor(mod(t * 0.5, railN)) === i;
    text(g, String(i + 1).padStart(2, "0"), RAIL_X + RAIL_W / 2, HY + 74 + i * 118, theme, {
      size: 34,
      weight: on ? 700 : 500,
      align: "center",
      color: on ? theme.accent : theme.textFaint,
    });
  }

  const HX = PAD + RAIL_W + 24;
  const HW = 520;
  const hero = c.cards[0];

  // 大卡：数值与折线都在动（运动源 1/2）
  card(g, HX, HY, HW, HH, hero, theme, t, { seed: 0.4, hot: true, big: true });

  // 大卡上叠加一条横向进度（运动源 3）
  progressBar(g, HX + 32, HY + HH - 132, HW - 64, 8, mod(t * 0.16, 1), theme, {
    color: theme.accent2,
  });

  // 右 2×3：比 2×2 多两张卡，信息密度和「大卡 + 四宫格」的观感都更接近素材墙
  const GAP = 22;
  const GX = HX + HW + GAP;
  const GW = (CANVAS_W - GX - PAD - GAP) / 2;
  const GH = (HH - GAP * 2) / 3;
  for (let i = 0; i < 6; i++) {
    const idx = mod(i + 1, c.cards.length);
    const x = GX + (i % 2) * (GW + GAP);
    const y = HY + Math.floor(i / 2) * (GH + GAP);
    const hot = Math.floor(mod(t * 0.5, 6)) === i;
    card(g, x, y, GW, GH, c.cards[idx], theme, t, { seed: idx * 1.9, hot });
  }

  // 底部整条标签栏：全宽底色带 + 标签 + 滑动高亮。
  // 这条带子是这个变体的结构指纹（另外两个变体没有全宽底栏）。
  const BAR_Y = 1024;
  const BAR_H = 84;
  g.save();
  rr(g, PAD, BAR_Y, CANVAS_W - PAD * 2, BAR_H, 20);
  g.clip();
  g.fillStyle = theme.accentSoft;
  g.fillRect(PAD, BAR_Y, CANVAS_W - PAD * 2, BAR_H);
  // 滑动高亮（运动源）
  const hiX = PAD + (CANVAS_W - PAD * 2) * mod(t * 0.25, 1);
  const hg = g.createLinearGradient(hiX - 160, 0, hiX + 160, 0);
  hg.addColorStop(0, "rgba(0,0,0,0)");
  hg.addColorStop(0.5, theme.panelStrong);
  hg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = hg;
  g.fillRect(PAD, BAR_Y, CANVAS_W - PAD * 2, BAR_H);
  g.restore();

  const tags = c.tags ?? c.cards.map((k) => k.tag);
  let tx = PAD + 24;
  tags.slice(0, 5).forEach((tg) => {
    const w = measure(g, tg, 34, 500) + 40;
    if (tx + w > CANVAS_W - PAD - 16) return;
    chip(g, tg, tx, BAR_Y + 18, theme, { size: 34, h: 48, padX: 20 });
    tx += w + 14;
  });
};

// ---------------------------------------------------------------------------
// variant 2：横向轮播带
// ---------------------------------------------------------------------------

const cardsCarousel: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CardsContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.subtitle, right: mmss(t) });

  const CW = 720;
  const CH = 620;
  const CY = 190;
  const GAP = 40;
  const step = CW + GAP;
  const cards = c.cards;
  const n = cards.length;

  // 连续横移（运动源 1）。
  // 速度是算过的：52px/s 在成片里只有约 0.3px/帧，缩到 160 宽的验收采样里
  // 会整段被判成「没动」；220px/s ≈ 1.3px/帧（成片），既看得出在动，也不至于糊。
  const SPEED = 220;
  const shift = mod(t * SPEED, step);
  const centerX = CANVAS_W / 2 - CW / 2;

  g.save();
  g.beginPath();
  g.rect(0, 96, CANVAS_W, CH + 120);
  g.clip();

  // 画 3 张：左探出 / 中间 / 右探出
  for (let k = -1; k <= 1; k++) {
    const idx = mod(Math.floor((t * SPEED) / step) + k, n);
    const x = centerX + k * step - (shift - Math.floor(shift / step) * step);
    const isCenter = k === 0;
    const scale = isCenter ? 1 : 0.9;
    const w = CW * scale;
    const h = CH * scale;
    const cx = x + (CW - w) / 2;
    const cy = CY + (CH - h) / 2;

    g.globalAlpha = isCenter ? 1 : 0.55;
    card(g, cx, cy, w, h, cards[idx], theme, t, {
      seed: idx * 1.7,
      hot: isCenter,
      big: isCenter,
    });
    g.globalAlpha = 1;

    if (isCenter) {
      // 中间卡的聚焦框呼吸（运动源 2）
      g.strokeStyle = theme.accent;
      g.lineWidth = 2.5;
      g.globalAlpha = 0.25 + 0.35 * pulse(t, 0.5);
      rr(g, cx - 8, cy - 8, w + 16, h + 16, 26);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  g.restore();

  // 底部指示点：当前位置随时间推进（运动源 3）
  const activeDot = Math.floor(mod(t * 0.34, n));
  const dotsY = CY + CH + 56;
  const dotGap = 30;
  const startX = CANVAS_W / 2 - ((n - 1) * dotGap) / 2;
  for (let i = 0; i < n; i++) {
    const on = i === activeDot;
    g.fillStyle = on ? theme.accent : theme.textFaint;
    g.globalAlpha = on ? 1 : 0.45;
    g.beginPath();
    g.arc(startX + i * dotGap, dotsY, on ? 8 : 5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 底部三块读数：轮播带下方需要一层稳定的信息，否则整屏太空
  const BAND_Y = 900;
  for (let i = 0; i < 3; i++) {
    const bx = PAD + i * 496;
    const cd = cards[mod(activeDot + i + 1, n)];
    panel(g, bx, BAND_Y, 480, 108, theme, { r: 16, shadow: 0.25 });
    text(g, ellipsize(g, cd.tag, 180, 34, 500), bx + 22, BAND_Y + 44, theme, {
      size: 34,
      tone: "textFaint",
    });
    text(g, ellipsize(g, cd.title, 300, 34, 600), bx + 22, BAND_Y + 86, theme, {
      size: 34,
      weight: 600,
    });
    if (cd.value) {
      text(g, cd.value, bx + 458, BAND_Y + 72, theme, {
        size: 40,
        weight: 700,
        tone: "accent",
        align: "right",
      });
    }
  }

  // 底部标签带：横向滚动
  const tags = c.tags ?? cards.map((k) => k.tag);
  const TY = 1040;
  let tx = PAD - mod(t * 40, 240);
  for (let i = 0; i < tags.length * 2; i++) {
    const tg = tags[mod(i, tags.length)];
    const w = measure(g, tg, 34, 500) + 40;
    chip(g, tg, tx, TY, theme, { size: 34, h: 48, padX: 20 });
    tx += w + 14;
    if (tx > CANVAS_W) break;
  }
  progressBar(g, PAD, 1146, CANVAS_W - PAD * 2, 8, mod(t * 0.13, 1), theme);
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const CARDS_VARIANTS: LayoutDraw[] = [cardsMasonry, cardsHeroGrid, cardsCarousel];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const CARDS_MOTION_SOURCES: Record<number, string[]> = {
  0: ["聚光灯跨列移动", "三列异步纵向漂移", "每张卡迷你折线呼吸", "底部标签流横向滚动", "底部进度条"],
  1: ["大卡数值区折线呼吸", "大卡横向进度条", "2×2 网格高亮轮转", "小卡折线呼吸", "底部标签"],
  2: ["轮播带连续横移", "中间卡聚焦框呼吸", "指示点轮转", "卡片折线呼吸", "底部标签带滚动", "底部进度条"],
};
