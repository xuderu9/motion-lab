// space —— 真透视的 3D 版面。
//
// 用户反馈：「现在的版面有点像 PPT 那种看版型的动画，少了 3D」。
// 所以这一族不画「正交排版的页」，而是把卡片放进一个有纵深的连续空间：
//   透视网格地面 + 卡片按景深缩放 + 深度雾 + 方向光 → 相机一推进就有真实空间感。
//
// 三个变体是三种空间运镜：
//   v0 走廊：卡片沿 Z 轴交错排布，相机向前推进，卡片从两侧掠过
//   v1 星野：卡片散布在空间里，相机极缓平移，靠视差读出深度
//   v2 环轨：卡片排成一圈，整体绕相机缓慢旋转（近大远小最强）

import type { CardsContent, LayoutDraw } from "../types";
import { SANS, SANS_UI } from "../typefaces";
import { makeCamera, project, cardTransform, fog, type Camera3D, type Vec3 } from "../space3d";

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

type P = { paper: string; card: string; text: string; dim: string; accent: string; line: string };

function pal(light: boolean): P {
  return light
    ? { paper: "#f7f4ef", card: "#ffffff", text: "#181a1c", dim: "rgba(24,26,28,0.6)", accent: "#d9542b", line: "rgba(24,26,28,0.10)" }
    : { paper: "#0d0f12", card: "rgba(255,255,255,0.08)", text: "#eef2f8", dim: "rgba(226,234,246,0.62)", accent: "#ff7043", line: "rgba(226,234,246,0.12)" };
}

function bg(g: CanvasRenderingContext2D, w: number, h: number, p: P, light: boolean, t: number) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, p.paper);
  grd.addColorStop(1, light ? "#efe9e0" : "#05070a");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // 极淡的横向条纹底噪，避免死平
  g.globalAlpha = 0.35;
  g.fillStyle = p.line;
  for (let y = (t * 2) % 6; y < h; y += 6) g.fillRect(0, y, w, 1);
  g.globalAlpha = 1;
}

/** 透视网格地面：3D 感最强的单一线索 */
function floorGrid(g: CanvasRenderingContext2D, cam: Camera3D, p: P, t: number) {
  const y = -0.62;
  const zNear = 1.2;
  const zFar = 26;
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  // 纵向（沿 Z）的线
  for (let k = -7; k <= 7; k++) {
    const x = k * 0.9;
    const a = project(cam, { x, y, z: -zNear });
    const b = project(cam, { x, y, z: -zFar });
    if (!a || !b) continue;
    const k2 = 1 - Math.abs(k) / 9;
    g.globalAlpha = 0.16 + 0.3 * k2;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  // 横向（等距 Z）的线，随 t 缓慢前推，强化「在前进」
  const shift = (t * 1.6) % 1.2;
  for (let i = 0; i < 18; i++) {
    const z = -(zNear + i * 1.2 + shift);
    const a = project(cam, { x: -6.3, y, z });
    const b = project(cam, { x: 6.3, y, z });
    if (!a || !b) continue;
    g.globalAlpha = Math.max(0.06, 0.36 - i * 0.016);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** 在卡片局部坐标里画内容（0..CW, 0..CH），带明暗 */
function card(
  g: CanvasRenderingContext2D,
  cam: Camera3D,
  pos: Vec3,
  rx: number,
  ry: number,
  title: string,
  value: string,
  tag: string,
  p: P,
  light: boolean,
  roll = 0,
) {
  const CW = 1.0;
  const CH = 0.62;
  const t3 = cardTransform(cam, pos, rx, ry, { w: CW, h: CH }, roll);
  if (!t3) return;
  // 近处剔除：卡片掠过镜头时会放大成一大块色斑，很难看。
  // 在 1.0~1.9 之间淡出，1.0 以内直接不画。
  if (t3.depth < 1.0) return;
  const nearFade = Math.min(1, (t3.depth - 1.0) / 0.9);
  const alpha = fog(t3.depth, 1.9, 18) * nearFade;
  if (alpha <= 0.04) return;
  const s = t3.shade;

  g.save();
  g.setTransform(t3.a, t3.b, t3.c, t3.d, t3.x, t3.y);
  g.globalAlpha = alpha;

  // 卡片底：按明暗混出颜色（不写死色值，靠 globalAlpha 叠加）
  const r = 0.055;
  g.beginPath();
  g.roundRect(-CW / 2, -CH / 2, CW, CH, r);
  g.fillStyle = light ? "#ffffff" : "#1a2130";
  g.fill();
  // 明暗：叠一层黑白
  g.globalAlpha = alpha * Math.min(0.55, Math.max(0, 1 - s) * 0.9);
  g.fillStyle = "#000000";
  g.beginPath();
  g.roundRect(-CW / 2, -CH / 2, CW, CH, r);
  g.fill();
  g.globalAlpha = alpha;
  g.strokeStyle = p.line;
  g.lineWidth = 0.006;
  g.beginPath();
  g.roundRect(-CW / 2, -CH / 2, CW, CH, r);
  g.stroke();

  const pad = 0.06;
  g.textBaseline = "alphabetic";
  g.fillStyle = p.accent;
  g.font = `800 ${0.13}px ${SANS}`;
  g.fillText(fitText(g, title, CW - pad * 2), -CW / 2 + pad, -CH / 2 + pad + 0.12);
  if (value) {
    g.fillStyle = p.text;
    g.font = `900 ${0.22}px ${SANS}`;
    g.fillText(fitText(g, value, CW - pad * 2), -CW / 2 + pad, -CH / 2 + pad + 0.36);
  }
  g.fillStyle = p.dim;
  g.font = `600 ${0.062}px ${SANS_UI}`;
  g.fillText(fitText(g, tag, CW - pad * 2), -CW / 2 + pad, CH / 2 - pad);
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
}

const space0: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);

  // 相机沿 -Z 前进：fly = 每秒 1.1 个世界单位
  const fly = t * 1.1;
  const cam = makeCamera(w, h, 0.78, { x: Math.sin(t * 0.5) * 0.12, y: 0.06, z: -fly });
  floorGrid(g, cam, p, t);

  const items = c.cards ?? [];
  const n = Math.max(6, items.length);
  const LEN = 9.5;
  const list: { pos: Vec3; rx: number; ry: number; roll: number; it: (typeof items)[number]; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    // 世界固定、相机前进；循环补位让卡片持续从远处进来
    const span = LEN;
    const z = -1.4 - (((i * span) / n - fly) % span + span) % span;
    const side = i % 2 === 0 ? 1 : -1;
    list.push({
      pos: { x: side * (0.95 + (i % 3) * 0.34), y: -0.14 + ((i * 7) % 5) * 0.14, z },
      rx: 0,
      ry: side * -0.55,
      roll: side * 0.06,
      it: items[i % Math.max(1, items.length)],
      i,
    });
  }
  // 按深度排序：远的先画
  list.sort((a, b) => a.pos.z - b.pos.z);
  list.forEach((o) => {
    const it = o.it ?? { title: `0${o.i + 1}`, value: "", tag: "" };
    card(g, cam, o.pos, o.rx, o.ry, it.title ?? "", it.value ?? "", it.tag ?? "", p, theme.isLight, o.roll);
  });

  // 前景标题（2D 叠在最上）
  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.042)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, c.heading ?? "", w * 0.7), w * 0.055, h * 0.11);
  g.fillStyle = p.accent;
  g.fillRect(w * 0.055, h * 0.128, h * 0.05, 3);
};

const space1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);
  const cam = makeCamera(w, h, 0.8, { x: Math.sin(t * 0.22) * 0.28, y: 0.05 + Math.sin(t * 0.17) * 0.05, z: -t * 0.42 });
  floorGrid(g, cam, p, t);

  const items = c.cards ?? [];
  const n = Math.max(8, items.length);
  const list: { pos: Vec3; rx: number; ry: number; it: (typeof items)[number]; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    // 前后两层：近层大卡，远层小卡，形成视差
    const layer = i % 2 === 0 ? 1 : 0;
    const zz = -1.8 - layer * 2.4 - ((i * 1.4) % 4);
    const ang = (i * 2.399) % (Math.PI * 2);
    const rad = 1.5 + ((i * 5) % 7) * 0.2 + layer * 0.6;
    // 卡片在世界里极缓漂浮
    const bob = Math.sin(t * 0.6 + i * 1.3) * 0.06;
    list.push({
      pos: { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.5 + bob + 0.1, z: zz },
      rx: Math.sin(ang) * 0.16,
      ry: Math.cos(ang) * 0.35,
      it: items[i % Math.max(1, items.length)],
      i,
    });
  }
  list.sort((a, b) => a.pos.z - b.pos.z);
  list.forEach((o) => {
    const it = o.it ?? { title: `0${o.i + 1}`, value: "", tag: "" };
    card(g, cam, o.pos, o.rx, o.ry, it.title ?? "", it.value ?? "", it.tag ?? "", p, theme.isLight);
  });

  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.04)}px ${SANS}`;
  g.fillText(fitText(g, c.heading ?? "", w * 0.66), w * 0.055, h * 0.12);
};

const space2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);
  const cam = makeCamera(w, h, 0.82, { x: 0, y: 0.05, z: 0.4 });
  floorGrid(g, cam, p, t);

  const items = c.cards ?? [];
  const n = Math.max(7, items.length);
  const R = 1.9;
  const spin = t * 0.34;
  const list: { pos: Vec3; ry: number; it: (typeof items)[number]; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    list.push({
      pos: { x: Math.sin(a) * R, y: 0.1 + Math.sin(a * 2 + t) * 0.05, z: -0.9 - Math.cos(a) * R },
      ry: -a + Math.PI,
      it: items[i % Math.max(1, items.length)],
      i,
    });
  }
  list.sort((a, b) => a.pos.z - b.pos.z);
  list.forEach((o) => {
    const it = o.it ?? { title: `0${o.i + 1}`, value: "", tag: "" };
    card(g, cam, o.pos, 0, o.ry, it.title ?? "", it.value ?? "", it.tag ?? "", p, theme.isLight);
  });

  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.04)}px ${SANS}`;
  g.fillText(fitText(g, c.heading ?? "", w * 0.66), w * 0.055, h * 0.12);
};

export const SPACE_VARIANTS: LayoutDraw[] = [space0, space1, space2];

export const SPACE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["相机沿 Z 前进", "卡片随景深缩放", "透视网格前推", "卡片左右轻微摆动"],
  1: ["相机横向平移产生视差", "卡片各自漂浮", "穿透式网格", "深度雾"],
  2: ["环形整体旋转", "近大远小变化", "网格前推", "卡片法线转动的明暗变化"],
};
