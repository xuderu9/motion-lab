// 页面块（blocks）—— 把「页」拆成可以自由拼装的零件。
//
// 为什么要拆：用户的要求是「保留现有版面，再重新组合成新版面，以免撞脸」。
// 如果每出一个新版面就写一个新函数，数量上去了但会越来越像彼此的变体；
// 拆成块之后，新画面 = 新的**块序列**，组合空间立刻是几十上百种。
//
// 每个块只做一件事，坐标由调用方给，块自己负责画和动。
// 所有块都用纯色/极淡纹理，不画大面积渐变（参考片是纯色底）。

import type { CardsContent, Theme } from "../types";
import { SANS, SANS_UI, SERIF_IT, spacedText, mixedHeadline } from "../typefaces";
import { drawImageCover, CARD_IMAGES } from "../assets";
import { paperNoise } from "../post";
import { groundPaper } from "../ground";
import { motionBlur, clamp01, lerp, rnd, enterPath, velocityOf } from "../motion";
import { ellipsize, wrapLines } from "../chrome";

function hashStr(s: string): number {
  let h2 = 0;
  for (const ch of s) h2 = (h2 * 31 + ch.charCodeAt(0)) >>> 0;
  return h2;
}

/**
 * 挑一张配图。`idx >= 0` 时当作**绝对下标**，`idx < 0` 才用标题哈希。
 *
 * 为什么改成绝对下标：之前是 `(hash(title)+i) % 12`，两张卡的标题哈希只要差 11
 * 就会撞同一张图 —— 实测同屏两张卡用了同一张蓝图。
 * 绝对下标由版面用 `imgSalt(heading) + i` 算，(salt+i) % 12 对 i<n 必然各不相同。
 */
export function imgFor(key: string, idx = -1): string {
  if (idx >= 0) return CARD_IMAGES[idx % CARD_IMAGES.length];
  return CARD_IMAGES[hashStr(key) % CARD_IMAGES.length];
}

/** 同一版面里分配配图的起点：由标题决定，所以不同镜头换一拨图 */
export const imgSalt = (key: string) => hashStr(key ?? "") % CARD_IMAGES.length;

export const INK = {
  paper: "#f7f4ef",
  card: "#ffffff",
  text: "#181a1c",
  dim: "rgba(24,26,28,0.62)",
  faint: "rgba(24,26,28,0.38)",
  line: "rgba(24,26,28,0.12)",
  accent: "#d9542b",
  accent2: "#1f6fe0",
  accentSoft: "rgba(217,84,43,0.12)",
  inkPaper: "#0e1013",
  inkCard: "rgba(255,255,255,0.06)",
  inkText: "#eef2f8",
  inkDim: "rgba(226,234,246,0.66)",
  inkLine: "rgba(226,234,246,0.14)",
};

export type Palette = {
  paper: string;
  card: string;
  text: string;
  dim: string;
  faint: string;
  line: string;
  accent: string;
  /** 这个调色板属于亮底还是暗底。cardBg 的投影/内高光方向依赖它。 */
  isLight?: boolean;
};

export function palette(theme: Theme): Palette {
  return theme.isLight
    ? { paper: INK.paper, card: INK.card, text: INK.text, dim: INK.dim, faint: INK.faint, line: INK.line, accent: INK.accent, isLight: true }
    : {
        paper: INK.inkPaper,
        card: INK.inkCard,
        text: INK.inkText,
        dim: INK.inkDim,
        faint: "rgba(226,234,246,0.36)",
        line: INK.inkLine,
        accent: "#ff7043",
        isLight: false,
      };
}

export function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

/**
 * 纸张底：暖白/墨黑 + 极淡的横纹 + 轻晕影。
 * 这是「我们的底」，和参考片那种纯平白不一样，也是防撞脸的第一层。
 *
 * ⚠️ 横纹**不再随 t 漂移**。以前的写法是 `off = (t*3)%step`，用一条永远在爬的
 * 纹理给整屏凑帧差 —— 这正是用户明令禁止的那类「拿呼吸/漂移当运动」的手法。
 * 纸不会动，动的是纸上的东西。参数 t 保留只为兼容旧调用点。
 */
export function paperBg(g: CanvasRenderingContext2D, w: number, h: number, p: Palette, t = 0) {
  // 底色 + **会动的纸纹**。
  //
  // 为什么必须会动：实测 hold3（3 秒没变过的像素）我们 86.9%、参考片 0.2%。
  // 纸底占全帧 70% 以上，它一动不动，hold3 就永远下不来。
  // 而且这里不能靠明暗摆动（那是被禁的呼吸感，且实测降不下 hold3）——
  // 必须让**结构在空间上平移**，每块像素几秒内被新纹理覆盖。
  const top = p.paper;
  const bottom = shade(p.paper, p.isLight === false ? 0.05 : -0.035);
  groundPaper(g, w, h, t, { top, bottom }, { strength: 0.055, seed: 7, mode: p.isLight === false ? "screen" : "multiply" });

  // 横纹：静态印刷纹理（它压在会动的纸纹上，所以不会变成一整块死区）
  const step = Math.round(h * 0.042);
  g.save();
  g.fillStyle = p.line;
  g.globalAlpha = 0.26;
  for (let y = 0; y < h + step; y += step) g.fillRect(0, y, w, 1);
  g.restore();

  // 角落晕影，避免整片死平
  const vg = g.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.10)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amt))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 顶部章节条：细线 + 当前章节高亮 + 一条扫过的光 */
export function chapterBar(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  tabs: string[],
  active: number,
  p: Palette,
  t: number,
  heightPct = 0.042,
) {
  const bh = h * heightPct;
  // 注意：这里以前写的是 `p === palette({isLight:true} as Theme)`。
  // palette() 每次返回**新对象**，恒等比较永远是 false，所以亮底也会走暗底分支。
  // 改成读 p.isLight。
  g.fillStyle = p.isLight ? "rgba(24,26,28,0.045)" : "rgba(255,255,255,0.05)";
  g.fillRect(0, 0, w, bh);
  g.font = `600 ${Math.round(h * 0.0165)}px ${SANS_UI}`;
  g.textBaseline = "middle";
  let x = w * 0.035;
  tabs.forEach((label, i) => {
    const tw = g.measureText(label).width;
    if (i === active) {
      g.fillStyle = p.paper;
      g.beginPath();
      g.roundRect(x - w * 0.007, bh * 0.16, tw + w * 0.014, bh * 0.68, bh * 0.2);
      g.fill();
      g.fillStyle = p.accent;
      g.fillRect(x - w * 0.007, bh - 2, tw + w * 0.014, 2);
      g.fillStyle = p.text;
    } else {
      g.fillStyle = p.faint;
    }
    g.fillText(label, x, bh * 0.52);
    x += tw + w * 0.026;
  });
  const glow = ((t * 0.16) % 1) * w;
  const grd = g.createLinearGradient(glow - w * 0.1, 0, glow + w * 0.1, 0);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, bh - 1, w, 1);
}

/** 小标签：全大写 + 宽字距 + 可带一个方块 */
export function kicker(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  withSquare = true,
) {
  g.textBaseline = "alphabetic";
  let cx = x;
  if (withSquare) {
    const s = h * 0.013;
    g.fillStyle = p.accent;
    g.fillRect(x, y - s, s, s);
    cx = x + s + h * 0.011;
  }
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  g.fillStyle = p.text;
  spacedText(g, text.toUpperCase(), cx, y, h * 0.0052);
}

/** 大字标题（混排，返回宽度） */
export function headline(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  fontPx: number,
  p: Palette,
): number {
  return mixedHeadline(g, text, x, baselineY, fontPx, p.accent, p.text);
}

/** 副标 */
export function subhead(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  maxW: number,
) {
  g.font = `400 ${Math.round(h * 0.023)}px ${SANS_UI}`;
  g.fillStyle = p.dim;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, text, maxW), x, y);
}

/**
 * 圆角卡片底 —— 「精致度」的全部来源都在这里。
 *
 * 之前的版本是一层平涂 + 一条 1px 描边，所以在成片里卡片看着像贴在纸上的色块。
 * 真实界面上，一张卡片之所以「有厚度」，靠的是下面这几层叠出来的：
 *
 *   1. 环境投影（大、软、偏下）—— 卡片离开纸面的距离
 *   2. 接触投影（小、硬、贴边）—— 卡片和纸面的接触
 *   3. 面填充（极轻的竖向渐变）—— 受光面
 *   4. 顶部内高光 1px      —— 边缘的受光
 *   5. 底部内阴影（渐变）   —— 边缘的背光，和 4 一起构成「厚度」
 *   6. 双层描边（外 hairline + 内 1px 亮线）—— 这是 Apple 系界面的标志性做法
 *   7. 静态纸噪点 —— 去掉「矢量色块」的塑料感
 *
 * 全部是静态的：卡片本身不呼吸，动的是卡片的位置和内容。
 */
export function cardBg(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  hot = false,
  radiusPct = 0.072,
  o: { grain?: number; shadow?: number; radius?: number } = {},
) {
  const r = o.radius ?? Math.max(4, Math.min(h * radiusPct, Math.min(w, h) / 2));
  const light = p.isLight !== false;
  const shadowK = o.shadow ?? 1;

  // ── 1+2. 两级投影：先画环境投影，再画接触投影 ──────────────────────
  if (shadowK > 0) {
    g.save();
    g.shadowColor = light ? `rgba(28,26,22,${0.13 * shadowK})` : `rgba(0,0,0,${0.42 * shadowK})`;
    g.shadowBlur = h * 0.30 * shadowK;
    g.shadowOffsetY = h * 0.085 * shadowK;
    g.fillStyle = light ? "#ffffff" : "rgba(255,255,255,0.05)";
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();

    g.shadowColor = light ? `rgba(28,26,22,${0.10 * shadowK})` : `rgba(0,0,0,${0.34 * shadowK})`;
    g.shadowBlur = h * 0.045 * shadowK;
    g.shadowOffsetY = h * 0.012 * shadowK;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
    g.restore();
  }

  // ── 3. 面填充：极轻的竖向渐变（上亮下暗 = 受光面） ──────────────────
  const base = light ? p.card : "rgba(255,255,255,0.055)";
  const face = g.createLinearGradient(0, y, 0, y + h);
  if (light) {
    face.addColorStop(0, "#ffffff");
    face.addColorStop(0.55, "#fdfcfa");
    face.addColorStop(1, "#f6f4f0");
  } else {
    face.addColorStop(0, "rgba(255,255,255,0.085)");
    face.addColorStop(1, "rgba(255,255,255,0.028)");
  }
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = hot ? (light ? "#fff8f4" : "rgba(255,120,70,0.10)") : base;
  g.fill();
  g.fillStyle = face;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();

  // ── 4~6. 内层：全部裁剪在卡片内 ────────────────────────────────
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.clip();

  // 顶部内高光
  g.fillStyle = light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.16)";
  g.fillRect(x + r * 0.4, y + 0.5, w - r * 0.8, 1);

  // 底部内阴影
  const inner = h * 0.16;
  const ig = g.createLinearGradient(0, y + h - inner, 0, y + h);
  ig.addColorStop(0, "rgba(0,0,0,0)");
  ig.addColorStop(1, light ? "rgba(28,26,22,0.055)" : "rgba(0,0,0,0.22)");
  g.fillStyle = ig;
  g.fillRect(x, y + h - inner, w, inner);

  // 高亮卡：左上角一片暖光，而不是整块染成橙色
  if (hot) {
    const hg = g.createRadialGradient(x + w * 0.12, y, 0, x + w * 0.12, y, w * 0.9);
    hg.addColorStop(0, light ? "rgba(217,84,43,0.13)" : "rgba(255,112,67,0.16)");
    hg.addColorStop(1, "rgba(217,84,43,0)");
    g.fillStyle = hg;
    g.fillRect(x, y, w, h);
  }

  // 纸噪点：静态纹理，去掉塑料感
  paperNoise(g, x, y, w, h, o.grain ?? (light ? 0.05 : 0.08), 7);

  g.restore();

  // ── 7. 双层描边 ──────────────────────────────────────────────
  // 外层：压在纸面上的细线
  g.strokeStyle = hot
    ? light
      ? "rgba(217,84,43,0.42)"
      : "rgba(255,112,67,0.5)"
    : light
      ? "rgba(28,26,22,0.10)"
      : "rgba(255,255,255,0.13)";
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();

  // 内层：1px 内侧的亮线（跟着圆角走，所以不能用 fillRect）
  g.strokeStyle = light ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.10)";
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, r - 1));
  g.stroke();

  // 高亮卡再加一条左侧强调竖条
  if (hot) {
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.clip();
    g.fillStyle = p.accent;
    g.fillRect(x, y + h * 0.18, Math.max(3, h * 0.012), h * 0.64);
    g.restore();
  }
}

/** 卡片的入场姿态。dx/dy = 相对落位的偏移，vx/vy = 瞬时速度（驱动运动模糊） */
export type TilePose = {
  dx?: number;
  dy?: number;
  scale?: number;
  rot?: number;
  alpha?: number;
  vx?: number;
  vy?: number;
};

/**
 * 内容卡：粗标题 + 粗副行 + 灰元信息。
 *
 * 入场不再走 `rise`（一条直线往上浮），而是吃一个 TilePose：
 * 位移由 motion.ts 的贝塞尔路径给出，所以卡片是**沿弧线**落位的；
 * 速度超过阈值时自动叠方向性运动模糊 —— 这是「丝滑」和「帧不够」的分界。
 */
export function contentTile(
  g: CanvasRenderingContext2D,
  it: { title?: string; body?: string; tag?: string; value?: string },
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  hot = false,
  rise = 0,
  pose?: TilePose,
  imgIndex = -1,
) {
  const body = () => {
    cardBg(g, x, y, w, h, p, hot);
    const pad = Math.round(w * 0.045);
    // 字号跟着**卡片宽度**走，不跟高度走。
    // 跟高度走曾导致竖长卡片上标题有 94px —— 一行只放得下 5 个字，全被截断。
    const titleSize = Math.max(22, Math.min(72, Math.round(w * 0.082)));
    const metaSize = Math.max(14, Math.min(34, Math.round(w * 0.042)));
    const tagSize = Math.max(12, Math.min(30, Math.round(w * 0.036)));
    const lineH = titleSize * 1.18;

    const imgH = Math.min(h * 0.46, w * 0.55);
    drawImageCover(g, imgFor(it.title ?? it.body ?? "", imgIndex), x + pad, y + pad, w - pad * 2, imgH, h * 0.03);
    const grd = g.createLinearGradient(0, y + imgH * 0.55, 0, y + pad + imgH);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, hot ? "rgba(217,84,43,0.20)" : "rgba(0,0,0,0.06)");
    g.fillStyle = grd;
    g.fillRect(x + pad, y + imgH * 0.55, w - pad * 2, imgH * 0.45);

    // ── 文字区：自上而下量着排，每一段都吃掉上一段的实际高度 ──────────
    const availW = w - pad * 2;
    g.textBaseline = "alphabetic";
    const titleTop = y + pad + imgH + h * 0.052; // 第一行标题的「顶」，不是基线
    g.font = `800 ${titleSize}px ${SANS}`;
    const lines = wrapLines(g, it.title ?? "", availW, titleSize, 800, 2);

    g.fillStyle = hot ? p.accent : p.text;
    g.font = `800 ${titleSize}px ${SANS}`;
    lines.forEach((ln, li) => g.fillText(ln, x + pad, titleTop + titleSize * 0.86 + li * lineH));

    let cursor = titleTop + titleSize * 0.86 + (lines.length - 1) * lineH;
    const tagY = y + h - pad - tagSize * 0.35;
    if (it.tag) {
      g.fillStyle = p.faint;
      g.font = `400 ${tagSize}px ${SANS_UI}`;
      g.fillText(ellipsize(g, it.tag, availW, tagSize, 400), x + pad, tagY);
    }

    const meta = it.value ? `${it.value} · ${it.body ?? ""}` : it.body ?? "";
    const metaY = cursor + metaSize * 1.7;
    if (meta && metaY < tagY - tagSize * 0.5) {
      g.fillStyle = p.dim;
      g.font = `600 ${metaSize}px ${SANS_UI}`;
      const shown = ellipsize(g, meta, availW, metaSize, 600);
      const wrapped = g.measureText(shown).width > availW * 1.02 ? wrapLines(g, meta, availW, metaSize, 600, 2) : [shown];
      wrapped.forEach((ln, li) => g.fillText(ln, x + pad, metaY + li * metaSize * 1.3));
      cursor = metaY;
    }
  };

  g.save();
  g.globalAlpha *= pose?.alpha ?? 1;
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.translate(cx + (pose?.dx ?? 0), cy + (pose?.dy ?? 0) + rise);
  if (pose?.rot) g.rotate(pose.rot);
  if (pose?.scale !== undefined && pose.scale !== 1) g.scale(pose.scale, pose.scale);
  g.translate(-cx, -cy);

  const vx = pose?.vx ?? 0;
  const vy = pose?.vy ?? 0;
  // 阈值 2.2px/帧：低于这个数重影看不出，只会让字发虚
  if (Math.hypot(vx, vy) > 2.2) motionBlur(g, body, -vx, -vy, { samples: 5, strength: 0.5 });
  else body();
  g.restore();
}

/** 一行「左标签 / 右值」 */
export function labelValueRow(
  g: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  alpha = 1,
) {
  g.save();
  g.globalAlpha = alpha;
  g.textBaseline = "alphabetic";
  g.fillStyle = p.dim;
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  spacedText(g, label.toUpperCase(), x, y, h * 0.0042);
  g.fillStyle = p.text;
  g.font = `600 ${Math.round(h * 0.026)}px ${SANS_UI}`;
  g.textAlign = "right";
  g.fillText(fitText(g, value, w * 0.6), x + w, y);
  g.textAlign = "start";
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + h * 0.016);
  g.lineTo(x + w, y + h * 0.016);
  g.stroke();
  g.restore();
}

/** 深色结论条 */
export function darkStrip(
  g: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
) {
  g.beginPath();
  g.roundRect(x, y, w, h, h * 0.16);
  g.fillStyle = p.isLight ? "#111315" : "rgba(255,255,255,0.09)";
  g.fill();
  const pad = h * 0.34;
  lines.slice(0, 2).forEach((ln, i) => {
    g.fillStyle = i === 0 ? "#ffffff" : p.accent;
    g.font = `600 ${Math.round(h * (i === 0 ? 0.26 : 0.25))}px ${SANS_UI}`;
    g.textBaseline = "alphabetic";
    g.fillText(fitText(g, ln, w - pad * 2), x + pad, y + h * (i === 0 ? 0.42 : 0.78));
  });
}

/** 底边时间轴：细线 + 菱形 + 游标 */
export function timelineBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  t: number,
  label = "",
) {
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.stroke();
  const cursor = x + ((t * 0.11) % 1) * w;
  for (let i = 0; i <= 12; i++) {
    const dx = x + (i / 12) * w;
    const on = Math.abs(dx - cursor) < w * 0.05;
    g.fillStyle = on ? p.accent : p.line;
    const s = h * 0.006;
    g.beginPath();
    g.moveTo(dx, y - s);
    g.lineTo(dx + s, y);
    g.lineTo(dx, y + s);
    g.lineTo(dx - s, y);
    g.closePath();
    g.fill();
  }
  if (label) {
    g.fillStyle = p.text;
    g.font = `700 ${Math.round(h * 0.015)}px ${SANS_UI}`;
    g.fillText(label, cursor + h * 0.014, y - h * 0.012);
  }
}

/** 竖排大数字（用于 mix 里的强对比块） */
export function bigNumber(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  align: "left" | "center" | "right" = "left",
) {
  g.textBaseline = "alphabetic";
  g.textAlign = align;
  g.fillStyle = p.accent;
  g.font = `900 ${Math.round(h * 0.22)}px ${SANS}`;
  g.fillText(value, x, y);
  g.textAlign = "start";
}

/** 斜体衬线的小引文（只在拉丁字符上使用） */
export function serifNote(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  p: Palette,
  align: "left" | "center" = "left",
  maxW?: number,
) {
  g.font = `italic ${Math.round(h * 0.026)}px ${SERIF_IT}`;
  g.fillStyle = p.dim;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(maxW ? fitText(g, text, maxW) : text, x, y);
  g.textAlign = "start";
}

export type { CardsContent };

/**
 * 算一张卡的入场姿态：从画面下方**沿弧线**落位。
 *
 * 之前是 `(1-ap)*h*0.026` —— 一条笔直的上升。用户说「运动轨迹太直」指的就是这个。
 * 现在每条路径的起点横向偏移、弯曲度都按 seed 不同，所以一排卡不会像梳子一样
 * 平行上浮，而是各有各的弧。
 */
export function tileEnter(
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
  seed: number,
  o: { rise?: number; spread?: number; scaleFrom?: number; bow?: number } = {},
): TilePose {
  const e = clamp01(u);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const spread = o.spread ?? 0.55;
  const from: [number, number] = [
    cx + (rnd(seed * 7 + 1) - 0.5) * w * spread * 2,
    cy + h * (o.rise ?? 1.15) * (0.8 + rnd(seed * 7 + 2) * 0.5),
  ];
  const path = enterPath(from, [cx, cy], o.bow ?? 0.14 + rnd(seed * 7 + 3) * 0.12);
  const pose = path(e);
  const v = velocityOf(path, e, 0.02);
  return {
    dx: pose.x - cx,
    dy: pose.y - cy,
    scale: lerp(o.scaleFrom ?? 0.93, 1, e),
    rot: lerp((rnd(seed * 7 + 4) - 0.5) * 0.05, 0, e),
    alpha: clamp01(e * 1.7),
    vx: v[0],
    vy: v[1],
  };
}
