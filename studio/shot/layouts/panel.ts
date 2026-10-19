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
import { cardBg, palette, imgFor, imgSalt, type Palette } from "./blocks";
import { drawImageCover } from "../assets";
import { wrapLines } from "../chrome";
import { stagger } from "../motion";
import { slotCycle, slotTransform } from "../lifecycle";

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

function paper(g: CanvasRenderingContext2D, w: number, h: number, _t = 0) {
  g.fillStyle = C.paper;
  g.fillRect(0, 0, w, h);
  // 点阵网格：静态印刷纹理。
  // 以前是 `off = (t*6)%step` 让它一直爬 —— 那是拿漂移凑帧差，已按规矩去掉。
  const step = Math.round(h * 0.018);
  g.fillStyle = "rgba(26,26,26,0.045)";
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) g.fillRect(x, y, 1.4, 1.4);
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

/** 底边滚动渐隐：行带在画布下沿被硬切会被判成内容溢出 */
function bottomFade(g: CanvasRenderingContext2D, w: number, h: number, frac = 0.04) {
  const fadeH = h * frac;
  const fg = g.createLinearGradient(0, h - fadeH, 0, h);
  fg.addColorStop(0, "rgba(245,240,235,0)");
  fg.addColorStop(1, C.paper);
  g.fillStyle = fg;
  g.fillRect(0, h - fadeH, w, fadeH);
}

/** panel 版式自己的调色板：沿用这页的暖白 + 橙，但走 cardBg 统一的分级投影与双层描边 */
function panelPalette(theme: Theme): Palette {
  return {
    ...palette(theme),
    paper: C.paper,
    card: C.card,
    text: C.ink,
    dim: C.meta,
    faint: C.meta,
    line: C.line,
    accent: C.accent,
    isLight: true,
  };
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
  imgIdx = 0,
  fx?: { dy?: number; alpha?: number; scale?: number },
  /** 卡片底色覆盖（v2 的滚动卡列用它做交替底色） */
  bg?: string,
) {
  g.save();
  g.translate(0, rise + (fx?.dy ?? 0));
  if (fx?.alpha !== undefined) g.globalAlpha *= fx.alpha;
  if (fx?.scale !== undefined && fx.scale !== 1) {
    const cx0 = x + w / 2;
    const cy0 = y + h / 2;
    g.translate(cx0, cy0);
    g.scale(fx.scale, fx.scale);
    g.translate(-cx0, -cy0);
  }
  const p = panelPalette(theme);
  if (bg) p.card = bg;
  cardBg(g, x, y, w, h, p, hot, 0.075);

  const pad = Math.max(14, w * 0.045);
  // 字号跟卡宽走，不跟卡高走 —— 否则卡片高度一变，字号就失控
  const tSize = Math.max(15, Math.min(54, Math.round(w * 0.058)));
  const sSize = Math.max(12, Math.min(32, Math.round(w * 0.034)));
  const mSize = Math.max(11, Math.min(26, Math.round(w * 0.029)));

  g.textBaseline = "alphabetic";
  // 右上角标签：先量宽度，正文要让开它
  let tagW = 0;
  if (meta) {
    g.font = `700 ${mSize}px ${SANS_UI}`;
    tagW = g.measureText(meta).width + mSize * 1.6;
  }
  const lines = wrapLines(g, title, w - pad * 2, tSize, 800, 2);
  const top = y + pad + tSize * 0.92;
  g.fillStyle = hot ? C.accent : C.ink;
  g.font = `800 ${tSize}px ${SANS}`;
  lines.forEach((ln, i) => g.fillText(ln, x + pad, top + i * tSize * 1.2));

  let cursor = top + (lines.length - 1) * tSize * 1.2;
  if (sub) {
    g.fillStyle = C.ink;
    g.font = `700 ${sSize}px ${SANS_UI}`;
    const sl = wrapLines(g, sub, w - pad * 2, sSize, 700, 2);
    sl.forEach((ln, i) => g.fillText(ln, x + pad, cursor + sSize * 1.75 + i * sSize * 1.32));
    cursor += sSize * 1.75 + (sl.length - 1) * sSize * 1.32;
  }

  // 底部配图带：卡片空着的那半张，用一张真图填掉。
  // 纯文字的卡片在 1080p 上会显得「像表单」，加一条图之后才像参考片里的卡片。
  const imgH = Math.min(h * 0.42, (y + h - pad) - (cursor + tSize * 0.5));
  if (imgH > h * 0.16) {
    const imgY = y + h - pad - imgH;
    drawImageCover(g, imgFor(title, imgIdx), x + pad, imgY, w - pad * 2, imgH, Math.min(18, h * 0.05));
    if (hot) {
      g.save();
      g.globalCompositeOperation = "multiply";
      g.fillStyle = "rgba(217,84,43,0.16)";
      g.beginPath();
      g.roundRect(x + pad, imgY, w - pad * 2, imgH, Math.min(18, h * 0.05));
      g.fill();
      g.restore();
    }
  }

  if (meta && tagW > 0) {
    const tagX = x + w - pad - tagW;
    const tagY = y + pad * 0.92;
    g.fillStyle = hot ? C.accentSoft : "rgba(26,26,26,0.055)";
    g.beginPath();
    g.roundRect(tagX, tagY, tagW, mSize * 1.7, mSize * 0.85);
    g.fill();
    g.fillStyle = hot ? C.accent : C.meta;
    g.font = `700 ${mSize}px ${SANS_UI}`;
    g.textAlign = "center";
    g.fillText(meta, tagX + tagW / 2, tagY + mSize * 1.18);
    g.textAlign = "start";
  }
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

  // 卡片网格：**列数跟着卡片数量走**。
  // 以前固定 2×3，而 plan 里多数镜头只有 3 张卡 —— 第二行永远空一半，
  // 成片里就是一个大洞。现在 3 张就排成一行三列，4 张 2×2，5~6 张 3×2。
  const items = (c.cards ?? []).slice(0, 6);
  const pSalt = imgSalt(c.heading ?? '');
  const n = Math.max(1, items.length);
  const cols = n <= 3 ? 3 : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = w * 0.014;
  const gapY = h * 0.016;
  const gw = (w - mx * 2 - gap * (cols - 1)) / cols;
  const areaTop = h * 0.272;
  const areaBottom = h * 0.625;
  const gh = (areaBottom - areaTop - gapY * (rows - 1)) / rows;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const col = i % cols;
    // 入场只在前 1.4 秒；之后交给**轮换**（slotCycle）：卡片每 2.4 秒换内容，
    // 换的时候旧的退出、新的进场。卡片不会「摆上去就死在那儿」。
    const appear = stagger(t, i, { each: 0.22, dur: 0.58, from: 0, ease: "snap" });
    const entrance = (1 - appear) * h * 0.026;
    const draws =
      t < 1.4
        ? [{ item: items[i], exit: null as number | null, enter: null as number | null }]
        : slotCycle(items, t - 1.4, i, n, 2.4, 0.7);

    for (const d of draws) {
      const it = d.item ?? { title: "", body: "", tag: "" };
      const tf = slotTransform(d, gh, { rise: 0.22 });
      contentCard(
        g,
        mx + col * (gw + gap),
        areaTop + r * (gh + gapY),
        gw,
        gh,
        it.title || `项目 ${i + 1}`,
        it.value ? `${it.value} · ${it.body ?? ""}` : it.body ?? "",
        it.tag ?? "",
        it === items[0],
        theme,
        entrance,
        pSalt + Math.max(0, items.indexOf(it)),
        { dy: tf.dy, alpha: tf.alpha, scale: tf.scale },
      );
    }
  }

  // 底部黑色结论条
  const by = h * 0.655;
  const bh = h * 0.1;
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
  const ty = h * 0.765;
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

const mod = (v: number, m: number) => ((v % m) + m) % m;

// 六段「音色」：两段等宽条纹在 --scale 4 下是平移不变的（滚一行还是它自己），
// 粗像素块的平均值不会变，hold3 就降不下来。六段互不相同的深浅才有效。
const ROW_TONES = [0.030, 0.135, 0.058, 0.190, 0.082, 0.160];
const rowTone = (i: number) => `rgba(26,26,26,${ROW_TONES[((i % 6) + 6) % 6]})`;

type PItem = { title: string; body: string; tag: string; value?: string };

function pItems(c: CardsContent): PItem[] {
  const cards = c.cards ?? [];
  if (cards.length) {
    return cards.map((k, i) => ({
      title: k.title || `0${i + 1}`,
      body: k.body ?? "",
      tag: k.tag ?? `0${i + 1}`,
      value: k.value,
    }));
  }
  return (c.tags ?? []).map((tg, i) => ({ title: tg, body: "", tag: `0${i + 1}` }));
}

/**
 * 连续的纵向滚动带。
 * 条目从视口下方进入、滚出上方即不再绘制 —— 每个元素都有明确的死亡时刻。
 * 匀速而不是缓动：缓动会在两端减速，反而制造出「停住」的区段。
 */
function vstack(
  g: CanvasRenderingContext2D,
  t: number,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    items: PItem[];
    itemH: number;
    gap: number;
    speed: number;
    offset?: number;
    draw: (it: PItem, i: number, x: number, y: number, w: number, h: number) => void;
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
 * v1：左侧栏 + 右侧表格行。
 *
 * 旧版是「行错峰淡入，然后静止 8 秒」——hold3 99%。
 * 现在表格是一张**持续向上滚的台账**：行从底部进、从顶部出，
 * 每行带 zebra 底色（约 7 级灰差），所以整块纸面都会被行边界扫过。
 * 侧栏的名录也同步上滚，左侧 20% 面积同样不是死的。
 */
const panelV1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paper(g, w, h, t);
  const sb = w * 0.2;
  const items = pItems(c);

  // 顶栏：只有 5% 高，左右两端都在动（计数器每秒跳 12 次）
  const th = h * 0.04;
  g.fillStyle = C.card;
  g.fillRect(0, 0, w, th);
  g.strokeStyle = C.line;
  g.beginPath();
  g.moveTo(0, th);
  g.lineTo(w, th);
  g.stroke();
  g.fillStyle = C.ink;
  g.font = `800 ${Math.round(h * 0.026)}px ${SANS}`;
  g.textBaseline = "middle";
  g.fillText("MOTION", h * 0.03, th * 0.52);
  g.font = `700 ${Math.round(h * 0.022)}px ${SANS_UI}`;
  g.fillText(fitText(g, c.heading || "任务台账", w * 0.42), h * 0.03 + h * 0.13, th * 0.52);
  g.fillStyle = C.accent;
  g.font = `700 ${Math.round(h * 0.018)}px ${SANS_UI}`;
  g.textAlign = "right";
  g.fillText(`${items.length} / ${Math.round(t * 12)}`, w - h * 0.03, th * 0.52);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";

  // 侧栏底
  g.fillStyle = C.card;
  g.fillRect(0, th, sb, h - th);
  g.strokeStyle = C.line;
  g.beginPath();
  g.moveTo(sb, th);
  g.lineTo(sb, h);
  g.stroke();

  // 侧栏名录：持续上滚（每项 5.6%H，速度 62px/s）
  const navNames = ["总览", "素材", "分镜", "渲染", "设置", ...(c.tags ?? []), ...items.map((i) => i.title)];
  vstack(g, t, {
    x: 0,
    y: th + h * 0.01,
    w: sb,
    h: h - th - h * 0.01,
    items: navNames.map((n, i) => ({ title: n, body: "", tag: `${i}` })),
    itemH: h * 0.056,
    gap: 0,
    speed: h * 0.052,
    draw: (it, i, x, y, iw, ih) => {
      const on = i % 5 === variant % 5;
      if (on) {
        g.fillStyle = C.accentSoft;
        g.beginPath();
        g.roundRect(h * 0.02, y + ih * 0.12, sb - h * 0.04, ih * 0.76, h * 0.01);
        g.fill();
      } else {
        // 非选中项也要有交替底色：否则侧栏那条白底滚过白底，像素永远不变
        g.fillStyle = rowTone(i);
        // 左侧留 1%W：贴边会被判成裁切
        g.fillRect(x + w * 0.01, y, iw - w * 0.01, ih);
      }
      g.fillStyle = on ? C.accent : C.meta;
      g.font = `500 ${Math.round(h * 0.02)}px ${SANS_UI}`;
      g.textBaseline = "middle";
      g.fillText(fitText(g, it.title, sb - h * 0.09), h * 0.04, y + ih * 0.52);
      g.textBaseline = "alphabetic";
    },
  });

  // 右表格（从顶栏下方一路铺到底，表头也随行滚走 —— 没有「挂满全程」的标题块）
  // 表格一直铺到右边缘：右侧如果留 3% 白边，那 3% 就是永远不动的面积
  const x0 = sb + w * 0.02;
  const cw = w - x0;

  const rowH = h * 0.1;
  vstack(g, t, {
    x: x0,
    y: th + h * 0.012,
    w: cw,
    h: h - th - h * 0.012,
    items,
    itemH: rowH,
    // 行间必须 ≥1 个分析 cell（32px @1080），否则整列行带并成一个 blob
    gap: h * 0.03,
    speed: h * 0.13, // 156 px/s：3 秒走 468px ≈ 4 行
    draw: (it, i, x, y, iw, ih) => {
      // 两层都上色（相差 ~8 级），行边界才会扫过整块纸面
      g.fillStyle = rowTone(i);
      // 右缘留 1%W
      g.fillRect(x, y, iw - w * 0.01, ih);
      g.fillStyle = C.ink;
      g.font = `700 ${Math.round(h * 0.024)}px ${SANS_UI}`;
      g.textBaseline = "alphabetic";
      g.fillText(fitText(g, it.title, iw * 0.36), x + h * 0.02, y + ih * 0.46);
      g.fillStyle = C.meta;
      g.font = `400 ${Math.round(h * 0.019)}px ${SANS_UI}`;
      g.fillText(fitText(g, it.body ?? "", iw * 0.3), x + iw * 0.42, y + ih * 0.46);
      const pillW = iw * 0.12;
      const px = x + iw - pillW - h * 0.02;
      g.fillStyle = i % 3 === 0 ? C.accentSoft : "rgba(26,26,26,0.05)";
      g.beginPath();
      g.roundRect(px, y + ih * 0.26, pillW, ih * 0.4, ih * 0.2);
      g.fill();
      g.fillStyle = i % 3 === 0 ? C.accent : C.meta;
      g.font = `600 ${Math.round(h * 0.016)}px ${SANS_UI}`;
      g.textAlign = "center";
      g.fillText(i % 3 === 0 ? "进行中" : "待办", px + pillW / 2, y + ih * 0.52);
      g.textAlign = "start";
      g.fillStyle = C.line;
      g.fillRect(x, y + ih - 1, iw, 1);
    },
  });

  bottomFade(g, w, h);
};

/**
 * v2：单一大面板 + 内嵌小卡。
 *
 * 旧版是「面板滑入 → 内嵌卡淡入 → 静止」，hold3 99%。
 * 现在面板几乎铺满整帧（96%×91%），内部是两条各自上滚的卡列：
 * 卡片从底部进、顶部出，卡与卡之间带 zebra 底色，所以面板内部每一点都在被覆盖。
 * 面板外的纸边只有 ~9% 面积，是这一版唯一接近静止的区域。
 */
const panelV2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1600;
  const h = size?.h ?? 1200;
  paper(g, w, h, t);

  // 面板几乎铺满整帧：外面只剩 ~6% 纸边，是这一版唯一接近静止的区域
  const mx = w * 0.005;
  const py = h * 0.015;
  const pw = w - mx * 2;
  const ph = h * 0.97;

  g.save();
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

  // 面板头只保留 4%H：标题 + 计数 + 推进条。原来 10.5% 的头部是一整块不动的纸。
  const hh = h * 0.04;
  g.fillStyle = C.ink;
  g.font = `800 ${Math.round(h * 0.026)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, c.heading || "Render, look, fix", pw - h * 0.5), mx + h * 0.035, py + hh * 0.72);
  g.fillStyle = C.meta;
  g.font = `600 ${Math.round(h * 0.017)}px ${SANS_UI}`;
  g.fillText(`${Math.round(t * 24)}`, mx + pw - h * 0.09, py + hh * 0.72);
  const barW = pw - h * 0.07;
  g.fillStyle = "rgba(26,26,26,0.08)";
  g.fillRect(mx + h * 0.035, py + hh * 0.92, barW, Math.max(2, h * 0.0035));
  g.fillStyle = C.accent;
  g.fillRect(mx + h * 0.035, py + hh * 0.92, barW * mod(t * 0.07, 1), Math.max(2, h * 0.0035));

  // 内嵌卡：两条独立上滚的列
  const items = pItems(c);
  const gutter = h * 0.02;
  const innerX = mx + h * 0.035;
  const innerW = pw - h * 0.07;
  const colW = (innerW - gutter) / 2;
  const cardH = ph * 0.36;
  const speeds = [h * 0.105, h * 0.145];
  const offsets = [0, cardH * 0.62];
  const pSalt = imgSalt(c.heading ?? "");

  for (let col = 0; col < 2; col++) {
    vstack(g, t, {
      x: innerX + col * (colW + gutter),
      y: py + hh * 1.06,
      w: colW,
      h: ph - hh * 1.06 - h * 0.01,
      items,
      itemH: cardH,
      gap: h * 0.05,
      speed: speeds[col],
      offset: offsets[col],
      draw: (it, i, x, y, iw, ih) => {
        contentCard(
          g,
          x,
          y,
          iw,
          ih,
          it.title,
          it.value ? `${it.value} · ${it.body}` : it.body,
          it.tag,
          (i + col) % 3 === 0,
          theme,
          0,
          pSalt + i + col * 3,
          undefined,
          // 交替卡面：白卡滚过白面板同样不产生变化，所以卡片本身也要有深浅两层
          ["#f9f5f0", "#eee6dd", "#f4eee7", "#e8dfd4"][((i + col) % 4 + 4) % 4],
        );
      },
    });
  }
  g.restore();
  void theme;
};

export const PANEL_VARIANTS: LayoutDraw[] = [panelV0, panelV1, panelV2];

export const PANEL_MOTION_SOURCES: Record<number, string[]> = {
  0: ["点阵网格缓慢平移", "卡片错峰上浮", "时间轴游标移动", "菱形标记高亮"],
  1: ["表格行持续上滚（整块纸面）", "行 zebra 底色扫过全页", "侧栏名录同步上滚", "侧栏高亮随行切换", "表头计数器跳动"],
  2: ["两条卡列各自上滚（不同速度）", "卡片 zebra 底色扫过面板", "卡内配图随卡滚过", "面板头计数器跳动", "面板头推进条"],
};
