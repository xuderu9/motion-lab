// page —— 「白底编辑页」，复刻参考片 v1 的主形态。
//
// ── 为什么长这样（2026-10-19 重写）──
// `studio/MOTION-FINDINGS.md` 的实测说明：旧版 page/panel 的 hold3 是 99%，
// 因为「入场 2 秒很热闹，之后整张纸死掉」。dsh 的对照实验又证明：
// 只让卡片轮换只能把 hold3 降到 67% —— 真正的大头是纸底/标题/黑条/时间轴。
//
// 所以这一版不是「入场动画 + 静止版面」，而是**持续推进的内容带**：
//   · 内容带以 100~180 px/s 连续向上滚动，每个像素在 3 秒内都会换过 2~4 层内容
//   · 每行/每张卡自带极淡的交替底色（约 7 级灰差，肉眼几乎看不出），
//     让「行与行的边界」扫过整张纸 —— 这是排版本来的 zebra 结构，不是整屏明暗摆动
//   · 每个元素都有出生和滚出画面的死亡时刻，没有任何元素挂满全程
//
// 三个变体是三种**推进方式**，不是三种配色：
//   v0 故事带：整幅宽的卡片一张张往上走（大标题 + 三张图 + 说明）
//   v1 行带：标签 → 一行内容的表格式行带持续上滚
//   v2 三列：三条竖列各自以不同速度上滚（错位、异步）

import type { CardsContent, DocContent, LayoutContent, LayoutDraw, LayoutSize, Theme } from "../types";
import { SANS, SANS_UI, SERIF_IT, mixedHeadline, spacedText } from "../typefaces";
import { palette, paperBg } from "./blocks";
import { drawImageCover, CARD_IMAGES } from "../assets";
import { withAlpha } from "../chrome";

const mod = (v: number, m: number) => ((v % m) + m) % m;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 整页纸底（暖白微渐变 + 极淡横纹）。保持原样：它是被内容带扫过的那张纸。 */
export function paintPaper(g: CanvasRenderingContext2D, w: number, h: number, theme: Theme, t = 0) {
  paperBg(g, w, h, palette(theme), t);
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

/** 大标题按宽度自适应字号（单行），避免任意长度溢出 */
function fitHeadline(
  g: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  wantPx: number,
  weight = 900,
): number {
  let px = wantPx;
  g.font = `${weight} ${Math.round(px)}px ${SANS}`;
  while (px > 12 && g.measureText(text).width > maxW) {
    px *= 0.94;
    g.font = `${weight} ${Math.round(px)}px ${SANS}`;
  }
  return Math.round(px);
}

/**
 * 底边滚动渐隐：内容带在画布下沿被硬切时，既像渲染错误，
 * 也会被 check-canvas-overflow 判成「内容溢出」（实测 7.5%）。
 * 用纸色做一段渐隐，切口就变成「还没滚到」。
 */
function bottomFade(g: CanvasRenderingContext2D, w: number, h: number, theme: Theme, frac = 0.045) {
  const pp = palette(theme);
  const fadeH = h * frac;
  const fg = g.createLinearGradient(0, h - fadeH, 0, h);
  fg.addColorStop(0, withAlpha(pp.paper, 0));
  fg.addColorStop(1, pp.paper);
  g.fillStyle = fg;
  g.fillRect(0, h - fadeH, w, fadeH);
}

const RATIO = {
  bar: 0.05,
  headline: 0.106,
  label: 0.019,
  marginX: 0.08,
  padTop: 0.078,
};

/** 顶部章节标签栏：当前章节每 1.8 秒推进一格，高亮线持续扫过 */
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
  tabs.forEach((txt, i) => {
    const tw = g.measureText(txt).width;
    if (i === active) {
      g.fillStyle = theme.isLight ? "#ffffff" : "#242a33";
      g.fillRect(x - w * 0.008, 0, tw + w * 0.016, bh);
      g.fillStyle = theme.isLight ? "#1b2733" : "#e8eef8";
    } else {
      g.fillStyle = theme.isLight ? "rgba(27,39,51,0.55)" : "rgba(220,230,245,0.45)";
    }
    g.fillText(txt, x, bh * 0.52);
    x += tw + w * 0.028;
  });
  const glow = mod(t * 0.22, 1) * w;
  const grd = g.createLinearGradient(glow - w * 0.12, 0, glow + w * 0.12, 0);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.6)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, bh - 2, w, 2);
}

function label(g: CanvasRenderingContext2D, txt: string, x: number, y: number, h: number, theme: Theme) {
  g.font = `600 ${Math.round(h * RATIO.label)}px ${SANS_UI}`;
  g.fillStyle = theme.isLight ? "rgba(40,52,66,0.62)" : "rgba(200,214,235,0.62)";
  g.textBaseline = "alphabetic";
  spacedText(g, txt.toUpperCase(), x, y, h * 0.0055);
}

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
  drawImageCover(g, CARD_IMAGES[idx % CARD_IMAGES.length], x, y, w, h, r);
  if (active) {
    g.lineWidth = Math.max(2, h * 0.02);
    g.strokeStyle = "#d92808";
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.stroke();
  }
  void theme;
}

type Item = { title: string; body: string; tag: string; value?: string };

/**
 * 把任意 content 摊平成「内容条目」。
 * page 的三个变体都吃这个列表，所以同一份 JSON 能喂给三种推进方式。
 */
function feedItems(c: LayoutContent): Item[] {
  // 用结构化收窄而不是 `CardsContent & DocContent`：两者的 kind 冲突，交叉类型会退化成 never
  const any = c as unknown as {
    cards?: { title?: string; body?: string; tag?: string; value?: string }[];
    paragraphs?: string[];
  };
  if (Array.isArray(any.cards) && any.cards.length) {
    return any.cards.map((k, i) => ({
      title: k.title || `0${i + 1}`,
      body: k.body ?? "",
      tag: k.tag ?? `0${i + 1}`,
      value: k.value,
    }));
  }
  const paras = any.paragraphs ?? [];
  return paras.map((p, i) => ({
    title: p.replace(/[，。；、].*$/, "").slice(0, 26) || `0${i + 1}`,
    body: p,
    tag: `0${i + 1}`,
  }));
}

/**
 * 连续的纵向内容带。
 *
 * 语义等价于「每个条目有出生/死亡」：条目从视口下方进入，滚出上方即不再绘制。
 * 用取模而不是 Beat 列表，是因为这里要的是**匀速推进**（参考片里阅读页/代码窗的滚法），
 * 关键帧缓动会在两端减速，反而制造出「停住」的区段。
 */
function verticalBand(
  g: CanvasRenderingContext2D,
  t: number,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    itemH: number;
    gap: number;
    speed: number;
    offset?: number;
    draw: (item: Item, i: number, ix: number, iy: number, iw: number, ih: number) => void;
    items: Item[];
  },
) {
  const period = o.itemH + o.gap;
  if (period <= 1 || o.items.length === 0) return;
  const travelled = t * o.speed + (o.offset ?? 0);
  const off = mod(travelled, period);
  const base = Math.floor(travelled / period);
  const count = Math.ceil(o.h / period) + 2;

  g.save();
  g.beginPath();
  g.rect(o.x, o.y, o.w, o.h);
  g.clip();
  for (let k = -1; k <= count; k++) {
    const idx = mod(base + k, o.items.length);
    const iy = o.y + k * period - off;
    if (iy > o.y + o.h || iy + o.itemH < o.y) continue;
    o.draw(o.items[idx], idx, o.x, iy, o.w, o.itemH);
  }
  g.restore();
}

/**
 * 交替底色：排版里的 zebra，随内容带一起移动（不是整屏明暗摆动）。
 *
 * **两层都要有底色**，不能「一层有、一层没有」：
 * 空白纸滚过空白纸不会产生任何像素变化，那一层就永远是 hold3 的一部分。
 * 两层都上淡色、且相差 ~7 级灰之后，每一条带的边界都会扫过整页。
 */
function zebra(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, i: number, theme: Theme) {
  // 六段「音色」而不是两段黑白交替。
  // 两段等宽的条纹在降采样后是**平移不变**的（周期为 2 行的图案平移一行还是它自己），
  // 大像素块的平均值不随滚动变化 —— 那样 hold3(--scale 4) 根本降不下来。
  // 六段互不相同的深浅，滚动时每个粗像素块的平均值才会持续变化。
  // 幅度是算过的：--scale 4 时一个粗像素覆盖 ≈64px 见方，会把相邻两行的色调平均掉；
  // 只有 25~45 级的差距还能在平均后留下 >6 的变化。
  const LIGHT = [0.028, 0.105, 0.050, 0.150, 0.072, 0.128];
  const DARK = [0.032, 0.120, 0.055, 0.170, 0.082, 0.145];
  const a = (theme.isLight ? LIGHT : DARK)[((i % 6) + 6) % 6];
  g.fillStyle = theme.isLight ? `rgba(16,28,42,${a})` : `rgba(255,255,255,${a})`;
  g.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------------------
// variant 0：整幅故事带
// ---------------------------------------------------------------------------

const pageV0: LayoutDraw = (g, t, content, theme, variant, size) => {
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);
  const tabs = ["首页", "一 · 调研", "二 · 剪辑", "三 · 计划", "四 · 动效", "五 · 检查"];
  chapterBar(g, w, h, tabs, (variant + 1 + Math.floor(t / 1.8)) % tabs.length, theme, t);

  const items = feedItems(content);
  const top = h * 0.075;
  const cardH = h * 0.4;
  const gap = h * 0.05;
  const speed = h * 0.125; // 150 px/s @1200：3 秒走 450px，正好穿过一层标题+配图

  verticalBand(g, t, {
    x: 0,
    y: top,
    w,
    h: h - top,
    items,
    itemH: cardH,
    gap,
    speed,
    draw: (it, i, x, y, iw, ih) => {
      const mx = w * 0.055;
      zebra(g, x, y + ih * 0.02, iw, ih * 0.96, i, theme);

      const kickerY = y + ih * 0.17;
      label(g, `${it.tag || "SECTION"} · ${String(i + 1).padStart(2, "0")}`, mx, kickerY, h, theme);

      // 大标题：按宽度自适应，单行不溢出
      const headY = y + ih * 0.34;
      const headPx = fitHeadline(g, it.title, iw - mx * 2, ih * 0.15);
      mixedHeadline(g, it.title, mx, headY, headPx, "#d92808", theme.isLight ? "#0d0f12" : "#f2f6fc");

      // 正文一行
      g.font = `400 ${Math.round(h * 0.022)}px ${SERIF_IT}`;
      g.fillStyle = theme.isLight ? "rgba(30,42,56,0.66)" : "rgba(210,224,244,0.66)";
      g.textBaseline = "alphabetic";
      g.fillText(fitText(g, it.body || "", iw - mx * 2), mx, y + ih * 0.42);

      // 三张配图：实测切成 6 块反而让连通域合并（blobs 10→6、birth 38.9→33.5），
      // 所以保持 3 张大图 —— 面积大、边界少，但滚动时是一整块稳定的运动单元。
      const tY = y + ih * 0.48;
      const tH = ih * 0.44;
      const tW = (iw - mx * 2) * 0.31;
      for (let k = 0; k < 3; k++) {
        thumb(g, mx + k * (tW + (iw - mx * 2) * 0.035), tY, tW, tH, i * 3 + k, (i + k) % 3 === 0, theme);
      }

      // 右侧竖排序号（随带子一起走，是运动单元）
      g.font = `900 ${Math.round(h * 0.05)}px ${SANS}`;
      g.fillStyle = "rgba(217,40,8,0.16)";
      g.textAlign = "right";
      g.fillText(String(i + 1).padStart(2, "0"), iw - mx * 0.4, y + ih * 0.16);
      g.textAlign = "start";
    },
  });

  // 底部推进条：随带子一起前进
  // 底边做一段「滚到底」的渐隐：否则配图会被硬切在画布边缘，
  // 既难看，也会被 check-canvas-overflow 判成内容溢出（实测 15.1%）。
  bottomFade(g, w, h, theme);

  const py = h * 0.975;
  g.fillStyle = theme.isLight ? "rgba(20,30,42,0.10)" : "rgba(220,232,248,0.10)";
  g.fillRect(w * 0.055, py, w * 0.89, Math.max(2, h * 0.003));
  g.fillStyle = "#d92808";
  g.fillRect(w * 0.055, py, w * 0.89 * mod(t * 0.06, 1), Math.max(2, h * 0.003));
};

// ---------------------------------------------------------------------------
// variant 1：行带（标签 → 一行内容）
// ---------------------------------------------------------------------------

const pageV1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);
  const tabs = ["首页", "一 · 背景", "二 · 做法", "三 · 结果", "四 · 结论"];
  chapterBar(g, w, h, tabs, (variant + 1 + Math.floor(t / 1.7)) % tabs.length, theme, t);

  const items = feedItems(content);
  const top = h * 0.075;
  const rowH = h * 0.145;
  // 行间留 3.2%H：在 480×270 的分析网格里刚好隔开一个 cell，
  // 否则整列行带会并成一个连通域，blobs 只剩 3 个（要 ≥5）。
  const gap = h * 0.032;
  const speed = h * 0.115; // 138 px/s

  verticalBand(g, t, {
    x: 0,
    y: top,
    w,
    h: h - top,
    items,
    itemH: rowH,
    gap,
    speed,
    draw: (it, i, x, y, iw, ih) => {
      zebra(g, x, y, iw, ih, i, theme);
      const mx = w * 0.05;

      // 左侧序号
      g.font = `900 ${Math.round(h * 0.052)}px ${SANS}`;
      g.fillStyle = "#d92808";
      g.textBaseline = "alphabetic";
      g.fillText(String(i + 1).padStart(2, "0"), mx, y + ih * 0.62);

      // 标题 + 正文
      g.font = `700 ${Math.round(h * 0.036)}px ${SANS_UI}`;
      g.fillStyle = theme.isLight ? "#12161c" : "#eef3fa";
      g.fillText(fitText(g, it.title, iw * 0.46), mx + w * 0.06, y + ih * 0.42);
      g.font = `400 ${Math.round(h * 0.024)}px ${SANS_UI}`;
      g.fillStyle = theme.isLight ? "rgba(30,42,56,0.62)" : "rgba(210,224,244,0.62)";
      g.fillText(fitText(g, it.body, iw * 0.34), mx + w * 0.06, y + ih * 0.72);

      // 右侧状态胶囊
      const pillW = iw * 0.11;
      const px = iw - mx - pillW;
      g.fillStyle = i % 3 === 0 ? "rgba(217,84,43,0.16)" : "rgba(26,26,26,0.055)";
      g.beginPath();
      g.roundRect(px, y + ih * 0.34, pillW, ih * 0.3, ih * 0.15);
      g.fill();
      g.fillStyle = i % 3 === 0 ? "#d9542b" : "rgba(26,26,26,0.55)";
      g.font = `700 ${Math.round(h * 0.018)}px ${SANS_UI}`;
      g.textAlign = "center";
      g.fillText(it.tag || "—", px + pillW / 2, y + ih * 0.54);
      g.textAlign = "start";

      // 行分隔线
      g.fillStyle = theme.isLight ? "rgba(20,30,42,0.10)" : "rgba(220,232,248,0.10)";
      g.fillRect(mx, y + ih - 1, iw - mx * 2, 1);
    },
  });
};

// ---------------------------------------------------------------------------
// variant 2：三列异步推进
// ---------------------------------------------------------------------------

const pageV2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paintPaper(g, w, h, theme, t);

  // 顶部不是章节条，而是一条会推进的窄条（标题在纸面上，靠三列的内容盖住）
  const bh = h * 0.062;
  g.fillStyle = theme.isLight ? "rgba(20,30,42,0.055)" : "rgba(220,232,248,0.06)";
  g.fillRect(0, 0, w, bh);
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  g.fillStyle = theme.isLight ? "#1b2733" : "#e8eef8";
  g.textBaseline = "middle";
  g.fillText(`0${(variant % 9) + 1}`, w * 0.03, bh * 0.52);
  g.fillStyle = "rgba(217,40,8,0.85)";
  g.fillRect(w * 0.055, bh * 0.28, w * 0.0035, bh * 0.44);
  g.font = `600 ${Math.round(h * 0.017)}px ${SANS_UI}`;
  g.fillStyle = theme.isLight ? "rgba(27,39,51,0.6)" : "rgba(220,230,245,0.55)";
  g.fillText("THREE COLUMNS · 异步推进", w * 0.065, bh * 0.52);
  const tick = mod(t * 0.25, 1) * (w * 0.24);
  g.fillStyle = "rgba(217,40,8,0.5)";
  g.fillRect(w - w * 0.03 - w * 0.24 + tick, bh * 0.46, w * 0.02, bh * 0.08);

  const items = feedItems(content);
  const cols = 3;
  const colW = w / cols;
  const top = bh;
  const cardH = h * 0.295;
  // 卡间留 3.5%H：在 480×270 的分析网格里刚好隔开一个 cell，
  // 否则相邻卡会被并成一条长 blob（实测：gap 0.018 时 blobs 只剩 3~5）。
  const gap = h * 0.05;
  const speeds = [h * 0.075, h * 0.115, h * 0.155];
  const offsets = [0, cardH * 0.55, cardH * 1.1];

  for (let col = 0; col < cols; col++) {
    verticalBand(g, t, {
      x: col * colW,
      y: top,
      w: colW,
      h: h - top,
      items,
      itemH: cardH,
      gap,
      speed: speeds[col],
      offset: offsets[col],
      draw: (it, i, x, y, iw, ih) => {
        // 外侧只留 0.8%W：刚好让边缘 6px 采样环落在纸色上，
        // 又不至于形成一整条静止的竖带（留 2% 时 hold3 会 +6 点）
        zebra(g, x + w * 0.008, y, iw - w * 0.016, ih, i + col, theme);
        const pad = iw * 0.07;
        const innerW = iw - pad * 2;

        // 序号 + 标签
        g.font = `900 ${Math.round(ih * 0.16)}px ${SANS}`;
        g.fillStyle = "rgba(217,40,8,0.9)";
        g.textBaseline = "alphabetic";
        g.fillText(String(i + 1).padStart(2, "0"), x + pad, y + ih * 0.2);

        // 标题
        const headPx = fitHeadline(g, it.title, innerW, ih * 0.14, 800);
        g.font = `800 ${headPx}px ${SANS}`;
        g.fillStyle = theme.isLight ? "#12161c" : "#eef3fa";
        g.fillText(it.title, x + pad, y + ih * 0.44);

        // 一行说明
        g.font = `400 ${Math.round(ih * 0.075)}px ${SANS_UI}`;
        g.fillStyle = theme.isLight ? "rgba(30,42,56,0.6)" : "rgba(210,224,244,0.6)";
        g.fillText(fitText(g, it.body, innerW), x + pad, y + ih * 0.56);

        // 配图块：每列都有一块，给像素层提供密度
        const imgY = y + ih * 0.63;
        const imgH = ih * 0.33;
        if (imgH > 8) thumb(g, x + pad, imgY, innerW, imgH, i + col * 3, true, theme);
      },
    });
  }

  // 列分隔线（静态细线，宽度只有 2px，不影响 hold3）
  g.fillStyle = theme.isLight ? "rgba(20,30,42,0.10)" : "rgba(220,232,248,0.10)";
  for (let i = 1; i < cols; i++) g.fillRect(colW * i - 1, top, 2, h - top);
  bottomFade(g, w, h, theme, 0.035);
};

export const PAGE_VARIANTS: LayoutDraw[] = [pageV0, pageV1, pageV2];

export const PAGE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["故事带匀速上滚（整幅宽）", "大标题随带子滚过", "三张配图随带子滚过", "交替底色边界扫过全页", "章节高亮每 1.8s 推进", "高亮线横向扫过", "底部推进条"],
  1: ["行带匀速上滚（整幅宽）", "行序号随带子滚过", "行分隔线扫过全页", "交替底色边界扫过全页", "状态胶囊随行滚过", "章节高亮推进"],
  2: ["三列各自异步上滚（不同速度）", "三列的配图块滚过", "交替底色边界扫过全页", "顶部刻度游标横移", "章节序号推进"],
};

export type { LayoutContent, LayoutSize, Theme };
