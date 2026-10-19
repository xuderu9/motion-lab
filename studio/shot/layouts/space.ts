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
    g.globalAlpha = 0.3 + 0.45 * k2;
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
    g.globalAlpha = Math.max(0.1, 0.5 - i * 0.022);
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

// ─────────────────────────────────────────────────────────────
// 实体 3D：点阵地球 / 立方体 / 粒子场
//
// 参考片里 3D 是主角（3s、21s 的旋转地球带流量数字；126s 漂浮几何体；
// 0s、131s 有纵深的粒子场）。这三种都在 canvas 上自己算，不引 WebGL：
// 点阵地球用球面均布点 + 投影，立方体用 6 个面按深度排序着色。
// ─────────────────────────────────────────────────────────────

/** 球面均布点（Fibonacci），返回单位向量 */
function spherePoints(n: number): Vec3[] {
  const out: Vec3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    out.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
  }
  return out;
}

function rot3(v: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  const y2 = v.y * cp - z1 * sp;
  const z2 = v.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}

/** 点阵地球 + 经纬弧 + 连接弧 */
function dotGlobe(
  g: CanvasRenderingContext2D,
  cam: Camera3D,
  center: Vec3,
  R: number,
  t: number,
  p: P,
  accent: string,
) {
  const N = 900;
  const pts = spherePoints(N);
  const yaw = t * 0.45;
  const pitch = 0.32 + Math.sin(t * 0.3) * 0.06;
  // 半球剔除 + 深度排序
  const proj: { x: number; y: number; d: number; front: boolean }[] = [];
  for (const v0 of pts) {
    const v = rot3(v0, yaw, pitch);
    const w = { x: center.x + v.x * R, y: center.y + v.y * R, z: center.z + v.z * R };
    const pr = project(cam, w);
    if (!pr) continue;
    proj.push({ x: pr.x, y: pr.y, d: pr.z, front: v.z > 0 });
  }
  proj.sort((a, b) => b.d - a.d);
  for (const q of proj) {
    const a = q.front ? 0.9 : 0.1;
    g.fillStyle = q.front ? accent : "rgba(120,150,190,1)";
    g.globalAlpha = a;
    const s = Math.max(1.1, Math.min(2.6, (q.front ? 2.6 : 1.6) * (3.2 / Math.max(1.2, q.d / 3))));
    g.beginPath();
    g.arc(q.x, q.y, s, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 四条连接弧（从中心点向四个经纬点）
  const hub = { x: 0.25, y: 0.62, z: 0.74 };
  const targets = [
    { x: -0.7, y: 0.2, z: -0.68 },
    { x: 0.55, y: -0.55, z: -0.62 },
    { x: -0.2, y: -0.8, z: 0.56 },
    { x: 0.8, y: 0.35, z: -0.48 },
  ];
  targets.forEach((tg, k) => {
    const a0 = rot3(hub, yaw, pitch);
    const a1 = rot3(tg, yaw, pitch);
    if (a0.z < 0 && a1.z < 0) return;
    g.strokeStyle = accent;
    g.globalAlpha = 0.55;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      // 球面插值 + 抬升，形成弧
      const vx = a0.x * (1 - u) + a1.x * u;
      const vy = a0.y * (1 - u) + a1.y * u;
      const vz = a0.z * (1 - u) + a1.z * u;
      const L = Math.hypot(vx, vy, vz) || 1;
      const lift = 1.18 + 0.25 * Math.sin(Math.PI * u);
      const w = {
        x: center.x + (vx / L) * R * lift,
        y: center.y + (vy / L) * R * lift,
        z: center.z + (vz / L) * R * lift,
      };
      const pr = project(cam, w);
      if (!pr) continue;
      if (i === 0) g.moveTo(pr.x, pr.y);
      else g.lineTo(pr.x, pr.y);
    }
    g.stroke();
    g.globalAlpha = 1;
    void k;
  });
  void p;
}

/** 立方体：8 顶点投影 + 6 面按深度排序 + 面向光程度着色 */
function cube(
  g: CanvasRenderingContext2D,
  cam: Camera3D,
  center: Vec3,
  size: number,
  yaw: number,
  pitch: number,
  base: string,
) {
  const h = size / 2;
  const V: Vec3[] = [
    { x: -h, y: -h, z: -h }, { x: h, y: -h, z: -h }, { x: h, y: h, z: -h }, { x: -h, y: h, z: -h },
    { x: -h, y: -h, z: h }, { x: h, y: -h, z: h }, { x: h, y: h, z: h }, { x: -h, y: h, z: h },
  ];
  const R = V.map((v) => {
    const r = rot3(v, yaw, pitch);
    return { x: center.x + r.x, y: center.y + r.y, z: center.z + r.z };
  });
  const P2 = R.map((w) => project(cam, w));
  if (P2.some((q) => !q)) return;
  const faces: [number[], Vec3][] = [
    [[0, 1, 2, 3], { x: 0, y: 0, z: -1 }],
    [[4, 5, 6, 7], { x: 0, y: 0, z: 1 }],
    [[0, 1, 5, 4], { x: 0, y: -1, z: 0 }],
    [[3, 2, 6, 7], { x: 0, y: 1, z: 0 }],
    [[0, 3, 7, 4], { x: -1, y: 0, z: 0 }],
    [[1, 2, 6, 5], { x: 1, y: 0, z: 0 }],
  ];
  const drawn = faces.map(([idx, n]) => {
    const rn = rot3(n, yaw, pitch);
    const depth = idx.reduce((s2, i) => s2 + (R[i].z - cam.pos.z), 0) / idx.length;
    const light = Math.max(0, rn.y * 0.62 + rn.x * -0.45 + rn.z * 0.65);
    return { idx, depth, shade: 0.35 + 0.65 * light };
  });
  drawn.sort((a, b) => b.depth - a.depth); // 远的先画
  for (const f of drawn) {
    g.beginPath();
    f.idx.forEach((i, k) => {
      const q = P2[i]!;
      if (k === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    });
    g.closePath();
    g.globalAlpha = Math.min(1, Math.max(0, f.shade));
    g.fillStyle = base;
    g.fill();
  }
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

/** v3：点阵地球 + 连接弧 + 右下角流量读数（复刻参考片 3s/21s） */
const space3: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);
  const cam = makeCamera(w, h, 0.72, { x: 0, y: -0.15, z: 0 });
  // 地球略偏左，右侧留读数位
  dotGlobe(g, cam, { x: -0.95, y: 0.02, z: -4.2 }, 0.92, t, p, p.accent);

  const first = (c.cards ?? [])[0];
  g.textBaseline = "alphabetic";
  g.fillStyle = p.accent;
  g.font = `700 ${Math.round(h * 0.019)}px ${SANS_UI}`;
  g.fillText((first?.tag ?? "GLOBAL · TRAFFIC").toUpperCase(), w * 0.62, h * 0.3);
  g.fillStyle = p.text;
  g.font = `900 ${Math.round(h * 0.11)}px ${SANS}`;
  g.fillText(first?.value ?? "11,623", w * 0.62, h * 0.44);
  g.fillStyle = p.dim;
  g.font = `500 ${Math.round(h * 0.024)}px ${SANS_UI}`;
  g.fillText(fitText(g, first?.title ?? "每日调用量", w * 0.34), w * 0.62, h * 0.5);
  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.04)}px ${SANS}`;
  g.fillText(fitText(g, c.heading ?? "", w * 0.34), w * 0.62, h * 0.62);
};

/** v4：漂浮的立方体群（复刻参考片 126s 的漂浮几何体） */
const space4: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);
  const cam = makeCamera(w, h, 0.76, { x: 0, y: 0, z: -t * 0.35 });
  floorGrid(g, cam, p, t);

  const n = 7;
  const list: { pos: Vec3; s: number; yaw: number; pitch: number; base: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const rad = 0.9 + ((i * 3) % 5) * 0.26;
    list.push({
      pos: {
        x: Math.cos(a) * rad,
        y: Math.sin(a * 1.7) * 0.42 + Math.sin(t * 0.7 + i) * 0.05,
        z: -2.2 - ((i * 1.3) % 3.4),
      },
      s: 0.34 + ((i * 7) % 4) * 0.08,
      yaw: t * (0.4 + i * 0.11) + i,
      pitch: 0.4 + Math.sin(t * 0.5 + i) * 0.25,
      base: i === 0 ? p.accent : i % 3 === 0 ? "#7b8ea8" : theme.isLight ? "#2a3038" : "#e8eef8",
    });
  }
  list.sort((q, r) => q.pos.z - r.pos.z);
  list.forEach((o) => cube(g, cam, o.pos, o.s, o.yaw, o.pitch, o.base));

  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.042)}px ${SANS}`;
  g.fillText(fitText(g, c.heading ?? "", w * 0.68), w * 0.05, h * 0.115);
};

/** v5：有纵深的粒子场（复刻参考片 0s/131s 的星尘） */
const space5: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = pal(theme.isLight);
  bg(g, w, h, p, theme.isLight, t);
  const cam = makeCamera(w, h, 0.9, { x: 0, y: 0, z: -t * 0.55 });

  const N = 420;
  const pts: { x: number; y: number; z: number; s: number; a: number }[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const rad = 0.4 + ((i * 37) % 100) / 100 * 7.5;
    // z 用 fly 取模循环，让粒子不断从远处进入
    const zz = -1.2 - (((i * 53) % 100) / 100) * 9 - (t * 0.55) % 1;
    pts.push({
      x: Math.cos(a) * rad * 0.9,
      y: Math.sin(a) * rad * 0.5,
      z: zz,
      s: 1 + ((i * 17) % 3),
      a: 0.25 + ((i * 29) % 70) / 100,
    });
  }
  pts.sort((q, r) => q.z - r.z);
  for (const q of pts) {
    const pr = project(cam, { x: q.x, y: q.y, z: q.z });
    if (!pr || pr.z < 1.2) continue;
    const f = fog(pr.z, 1.2, 14);
    if (f <= 0.03) continue;
    g.globalAlpha = f * q.a;
    g.fillStyle = theme.isLight ? "#2a3038" : "#cfe0ff";
    // 尺寸必须封顶：不封的话近处粒子会放大成几百像素的色块（实测过）
    const s = Math.min(3.2, Math.max(0.9, (q.s * 24) / pr.z));
    g.fillRect(pr.x, pr.y, s, s);
  }
  g.globalAlpha = 1;

  const first = (c.cards ?? [])[0];
  g.textAlign = "center";
  g.fillStyle = p.text;
  g.font = `300 ${Math.round(h * 0.058)}px ${SANS}`;
  g.globalAlpha = 0.72 + 0.28 * Math.sin(t * 0.8);
  g.fillText(fitText(g, first?.title ?? c.heading ?? "", w * 0.8), w / 2, h * 0.53);
  g.globalAlpha = 1;
  g.textAlign = "start";
};

export const SPACE_VARIANTS: LayoutDraw[] = [space0, space1, space2, space3, space4, space5];

export const SPACE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["相机沿 Z 前进", "卡片随景深缩放", "透视网格前推", "卡片左右轻微摆动"],
  1: ["相机横向平移产生视差", "卡片各自漂浮", "穿透式网格", "深度雾"],
  2: ["环形整体旋转", "近大远小变化", "网格前推", "卡片法线转动的明暗变化"],
  3: ["地球持续自转", "点阵前后半球分层明暗", "连接弧呼吸", "读数缓慢计数"],
  4: ["立方体各自旋转", "整体缓慢前推", "面法线转动产生明暗变化", "网格前推"],
  5: ["粒子由远及近循环", "深度雾", "粒子闪烁", "中央大字呼吸"],
};
