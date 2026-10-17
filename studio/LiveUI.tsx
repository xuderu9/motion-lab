// 活体界面（Live Workspace）—— 专治「屏幕内容像 AI」
//
// 依据：参考片桌面镜头内部实测 中位帧差 2.499 / 静止帧 2.4%，
// 而旧版 studio 是 0.016 / 75.1%。差 156 倍。
//
// 参考片的屏幕之所以"活"，是因为它模拟的是一个**正在运行的应用**，而不是一页 PPT：
//   · 列表高亮条持续下移（每 ~0.8s 一行）
//   · 计时器每秒真跳
//   · 图表持续呼吸
//   · 面板滑入滑出
//   · 整个工作区在缓慢平移缩放（像在录一块大画布）
//   · 输入框光标闪烁
// 所以本文件的目标不是"做出好看的动画"，而是让**每一帧都有东西在动**。

import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Composition, useCurrentFrame, useVideoConfig } from "remotion";

const W = 1600;
// 4:3 —— 要贴到背景板的平板上（真实平板屏幕就是 4:3）。
// 用 16:9 贴上去会被单应变换横向压扁 33%，文字会明显变形。
const H = 1200;

const FONT = "'Inter','Microsoft YaHei',system-ui,sans-serif";

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

/** 工作区绘制。全部按时间连续演化，没有任何"一次性播完就停"的东西。 */
export function draw(g: CanvasRenderingContext2D, frame: number, fps: number) {
  const t = frame / fps;

  // ---------- 背景 ----------
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1220");
  bg.addColorStop(1, "#070d17");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // ---------- 虚拟相机 ----------
  // 参考片同镜头内实测：底噪 1.5~3，每隔 2~3 秒爆一次 10~15（持续 0.4~0.5s）。
  // 所以这里要造两样东西：持续的底噪 + 周期性的「飞向另一块区域」爆发。
  // 相机只做极缓的漂移 —— 参考片的屏幕是物理面板，相机不动，动的是屏幕里的应用。
  const camScale = 1.01 + 0.012 * Math.sin(t * 0.35);
  const camX = 14 * Math.sin(t * 0.31 + 1.2);
  const camY = 9 * Math.sin(t * 0.43);

  // ---------- 视图切换事件 ----------
  // 参考片同镜头内的帧差节奏：底噪 1.5~3，每 2~3 秒爆一次 10~15（持续 0.4~0.5s）。
  // 那个爆发来自**整个屏幕切视图**，所以这里让主视图整体左移 + 详情面板滑入。
  // 换页用"快切"而非缓慢滑入：参考片同一镜头内的爆发是**整屏内容替换**，
  // 持续 3~4 帧，量级 10~15。慢滑只会把变化摊薄到十几帧里，峰值上不去。
  const cycle = t % 2.4;
  let m = 0;
  if (cycle < 0.1) m = easeOut(cycle / 0.1);
  else if (cycle < 1.45) m = 1;
  else if (cycle < 1.58) m = 1 - easeOut((cycle - 1.45) / 0.13);
  g.save();
  g.translate(W / 2 + camX, H / 2 + camY);
  g.scale(camScale, camScale);
  g.translate(-W / 2, -H / 2);

  // 切视图时主视图整体左移并压暗，给详情面板让位
  g.translate(-300 * m, 0);
  g.globalAlpha = 1 - 0.55 * m;

  // ---------- 顶栏 ----------
  g.fillStyle = "rgba(255,255,255,0.045)";
  g.fillRect(0, 0, W, 74);
  g.fillStyle = "#e9eff7";
  g.font = `600 27px ${FONT}`;
  g.fillText("Workspace", 40, 48);

  // 搜索框 + 闪烁光标
  g.fillStyle = "rgba(255,255,255,0.06)";
  rr(g, 250, 20, 430, 34, 17);
  g.fill();
  g.fillStyle = "rgba(190,210,235,0.5)";
  g.font = `400 16px ${FONT}`;
  g.fillText("搜索 prompt、skill、doc…", 268, 43);
  if (Math.floor(t * 1.6) % 2 === 0) {
    g.fillStyle = "#6fa8ff";
    g.fillRect(470, 27, 2, 20);
  }

  // Expand 药丸：呼吸
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.1);
  g.fillStyle = `rgba(45,108,246,${0.28 * pulse})`;
  rr(g, W - 190, 20, 150, 34, 17);
  g.fill();
  g.strokeStyle = `rgba(110,165,255,${0.55 * pulse})`;
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = "#cfe0ff";
  g.font = `500 16px ${FONT}`;
  g.fillText("Expand", W - 158, 43);

  // ---------- 左侧：Prompts 列表，高亮条持续下移 ----------
  const cardX = 40;
  const cardY = 108;
  const cardW = 470;
  const cardH = 380;
  g.fillStyle = "rgba(255,255,255,0.035)";
  rr(g, cardX, cardY, cardW, cardH, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Prompts", cardX + 22, cardY + 32);
  g.fillStyle = "rgba(170,195,220,0.35)";
  g.font = `400 14px ${FONT}`;
  g.fillText("24 saved", cardX + cardW - 92, cardY + 32);

  const rows = [
    "Summarize this meeting",
    "Draft a launch email",
    "Refactor to TypeScript",
    "Explain like I'm five",
    "Turn my notes into a video outline",
  ];
  const rowH = 54;
  // 高亮索引：每 0.6 秒前进一行，带 ease 过渡
  const hlFloat = (t / 0.6) % rows.length;
  const hlIdx = Math.floor(hlFloat);
  const hlFrac = easeOut(hlFloat - hlIdx);
  const hlY = cardY + 58 + hlIdx * rowH + hlFrac * rowH;

  g.fillStyle = "rgba(90,140,230,0.20)";
  rr(g, cardX + 14, hlY, cardW - 28, 42, 10);
  g.fill();
  g.fillStyle = "rgba(120,170,255,0.85)";
  rr(g, cardX + 14, hlY, 3, 42, 2);
  g.fill();

  rows.forEach((txt, i) => {
    const active = i === hlIdx;
    g.fillStyle = active ? "#eaf1fb" : "rgba(200,218,240,0.62)";
    g.font = `${active ? 500 : 400} 17px ${FONT}`;
    g.fillText(txt, cardX + 34, cardY + 86 + i * rowH);
  });

  // ---------- 中上：Skills 芯片，错相呼吸 ----------
  const sx = 545;
  const sy = 108;
  const sw = 470;
  const sh = 210;
  g.fillStyle = "rgba(255,255,255,0.035)";
  rr(g, sx, sy, sw, sh, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Skills", sx + 22, sy + 32);
  const chips = ["Research", "Coding", "Writing", "Design", "Data", "Video", "Agents"];
  chips.forEach((c, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = sx + 22 + col * 106;
    const y = sy + 52 + row * 46;
    const a = 0.16 + 0.10 * Math.sin(t * 1.7 + i * 0.9);
    g.fillStyle = `rgba(255,196,88,${a + 0.12})`;
    rr(g, x, y, 96, 32, 16);
    g.fill();
    g.fillStyle = "rgba(255,226,180,0.92)";
    g.font = `400 14px ${FONT}`;
    g.fillText(c, x + 15, y + 21);
  });

  // ---------- 右上：Insights，图表持续呼吸 ----------
  const ix = 1050;
  const iy = 108;
  const iw = 510;
  const ih = 210;
  g.fillStyle = "rgba(255,255,255,0.035)";
  rr(g, ix, iy, iw, ih, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Insights", ix + 22, iy + 32);

  // 数字：平滑增长 + 每隔几秒跳一次（像真实统计刷新）
  const base = 8120 + Math.floor(t) * 3 + Math.round(40 * Math.sin(t * 0.7));
  g.fillStyle = "#ffffff";
  g.font = `600 40px ${FONT}`;
  g.fillText(base.toLocaleString("en-US"), ix + 22, iy + 88);
  g.fillStyle = "rgba(170,195,220,0.45)";
  g.font = `400 13px ${FONT}`;
  g.fillText("tasks / day", ix + 22, iy + 110);

  const bars = 14;
  for (let i = 0; i < bars; i++) {
    const hgt =
      22 +
      58 * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 0.62)) +
      20 * Math.sin(t * 4.3 + i * 1.1);
    const bx = ix + 190 + i * 22;
    const by = iy + 168;
    const grd = g.createLinearGradient(0, by - hgt, 0, by);
    grd.addColorStop(0, "#4f93ff");
    grd.addColorStop(1, "rgba(79,147,255,0.12)");
    g.fillStyle = grd;
    rr(g, bx, by - hgt, 15, hgt, 4);
    g.fill();
  }

  // ---------- 中部：实时活动带（填掉空档 + 持续大面积运动）----------
  // 之前这块是纯深色，整片不参与差分；参考片的工作区是满屏密集内容的。
  const ax = 545;
  const ay = 336;
  const aw = 1135;
  const ah = 128;
  g.fillStyle = "rgba(255,255,255,0.032)";
  rr(g, ax, ay, aw, ah, 14);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.5)";
  g.font = `500 14px ${FONT}`;
  g.fillText("Activity · 最近 60 秒", ax + 20, ay + 26);

  // 折线：数据点随时间滚动，整条线持续变形
  const N = 96;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const ph = t * 2.4 - i * 0.24;
    const v =
      0.5 +
      0.30 * Math.sin(ph) +
      0.16 * Math.sin(ph * 2.7 + 1.1) +
      0.08 * Math.sin(ph * 5.3);
    pts.push([ax + 22 + (i * (aw - 44)) / (N - 1), ay + 104 - v * 56]);
  }
  g.strokeStyle = "rgba(79,147,255,0.9)";
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  const fillG = g.createLinearGradient(0, ay + 48, 0, ay + 104);
  fillG.addColorStop(0, "rgba(79,147,255,0.22)");
  fillG.addColorStop(1, "rgba(79,147,255,0)");
  g.fillStyle = fillG;
  g.beginPath();
  g.moveTo(pts[0][0], ay + 104);
  pts.forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(pts[N - 1][0], ay + 104);
  g.closePath();
  g.fill();
  // 扫描头：随折线一起走
  const headI = Math.floor((t * 40) % N);
  g.fillStyle = "#8fc0ff";
  g.beginPath();
  g.arc(pts[headI][0], pts[headI][1], 4, 0, Math.PI * 2);
  g.fill();

  // ---------- 底部：滚动刻度 ----------
  for (let i = 0; i < 60; i++) {
    const tx = ax + ((i * 26 + t * 46) % aw);
    const tall = (i + Math.floor(t * 2)) % 5 === 0;
    g.fillStyle = tall ? "rgba(150,180,215,0.4)" : "rgba(150,180,215,0.18)";
    g.fillRect(tx, ay + ah + 8, 1.5, tall ? 9 : 4);
  }

  // ---------- 下排：Agent Chat / Run / Docs ----------
  const by2 = 348;
  const bh = 300;

  // Agent Chat：逐字打字
  g.fillStyle = "rgba(255,255,255,0.03)";
  rr(g, 40, by2 + 130, 470, bh - 130, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Agent Chat", 62, by2 + 162);
  const msg = "Turn my notes into a video outline";
  const typed = msg.slice(0, Math.floor((t * 12) % (msg.length + 14)));
  g.fillStyle = "rgba(90,140,230,0.22)";
  rr(g, 62, by2 + 182, Math.max(60, typed.length * 9.6 + 30), 40, 20);
  g.fill();
  g.fillStyle = "rgba(220,235,250,0.92)";
  g.font = `400 16px ${FONT}`;
  g.fillText(typed, 82, by2 + 208);

  // Run：计时器每秒真跳 + 圆环持续转
  g.fillStyle = "rgba(255,255,255,0.03)";
  rr(g, 530, by2 + 130, 470, bh - 130, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Run", 552, by2 + 162);
  const cx = 640;
  const cy = by2 + 268;
  const R = 54;
  g.lineWidth = 9;
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "#38d6a8";
  g.lineCap = "round";
  const prog = 1 - ((t * 0.9) % 60) / 60;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
  g.stroke();
  const left = 59 - Math.floor((t * 0.9) % 60);
  g.fillStyle = "#ffffff";
  g.font = `600 24px ${FONT}`;
  g.fillText(`00:${String(left).padStart(2, "0")}`, cx - 32, cy + 8);
  // 任务列表逐条勾选（周期性）
  ["Outline", "Script", "Render"].forEach((s, i) => {
    const done = ((t * 0.5) % 3) > i;
    g.fillStyle = done ? "#38d6a8" : "rgba(180,200,225,0.35)";
    g.beginPath();
    g.arc(cx + 105, cy - 26 + i * 28, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = done ? "rgba(225,240,250,0.92)" : "rgba(180,200,225,0.5)";
    g.font = `400 15px ${FONT}`;
    g.fillText(s, cx + 122, cy - 21 + i * 28);
  });

  // Docs：缩略图 + 掠光
  g.fillStyle = "rgba(255,255,255,0.03)";
  rr(g, 1020, by2 + 130, 540, bh - 130, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.55)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Docs", 1042, by2 + 162);
  g.fillStyle = "rgba(255,255,255,0.07)";
  rr(g, 1042, by2 + 182, 230, 118, 10);
  g.fill();
  // 掠光带：连续扫过
  const sw2 = ((t * 0.55) % 1) * 340 - 120;
  const sg = g.createLinearGradient(1042 + sw2, 0, 1042 + sw2 + 90, 0);
  sg.addColorStop(0, "rgba(255,255,255,0)");
  sg.addColorStop(0.5, "rgba(255,255,255,0.16)");
  sg.addColorStop(1, "rgba(255,255,255,0)");
  g.save();
  rr(g, 1042, by2 + 182, 230, 118, 10);
  g.clip();
  g.fillStyle = sg;
  g.fillRect(1042, by2 + 182, 230, 118);
  g.restore();
  g.fillStyle = "rgba(225,238,252,0.9)";
  g.font = `500 17px ${FONT}`;
  g.fillText("Skill Handbook", 1296, by2 + 218);
  g.fillStyle = "rgba(170,195,220,0.45)";
  g.font = `400 14px ${FONT}`;
  g.fillText("updated just now", 1296, by2 + 244);

  g.restore();

  // ---------- 详情面板：随切视图事件滑入滑出 ----------
  // 它覆盖画面右侧约 62%，是"爆发"的主要来源。
  if (m > 0.001) {
    g.globalAlpha = 1;
    const pw = W * 0.68;
    const px = W - pw * m; // m=0 时完全在画面外
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 60;
    g.shadowOffsetX = -24;
    g.fillStyle = "rgba(12,20,33,0.985)";
    g.fillRect(px, 0, pw, H);
    g.restore();

    // 面板内：知识库视图，列表高亮快速下移（比主视图快，制造额外运动）
    g.fillStyle = "rgba(170,195,220,0.55)";
    g.font = `500 16px ${FONT}`;
    g.fillText("Knowledge Base", px + 44, 76);
    g.fillStyle = "#eaf1fb";
    g.font = `600 34px ${FONT}`;
    g.fillText("结构化知识库", px + 44, 136);

    const items = [
      "inbox/   待归档素材",
      "raw/     原始转录与截图",
      "wiki/    结构化条目",
      "index.md 总目录",
      "agents/  子代理说明",
      "skills/  可复用能力",
    ];
    const ih = 62;
    const hf = (t / 0.42) % items.length;
    const hi = Math.floor(hf);
    const hy = 186 + hi * ih + easeOut(hf - hi) * ih;
    g.fillStyle = "rgba(90,140,230,0.22)";
    rr(g, px + 30, hy, pw - 60, 48, 10);
    g.fill();
    g.fillStyle = "rgba(120,170,255,0.9)";
    rr(g, px + 30, hy, 3, 48, 2);
    g.fill();
    items.forEach((s, i) => {
      g.fillStyle = i === hi ? "#eaf1fb" : "rgba(200,218,240,0.6)";
      g.font = `${i === hi ? 500 : 400} 18px ${FONT}`;
      g.fillText(s, px + 52, 186 + 32 + i * ih);
    });

    // 右侧缩略信息：持续刷新的小图表
    const gx0 = px + pw - 250;
    g.fillStyle = "rgba(255,255,255,0.04)";
    rr(g, gx0, 186, 210, 150, 12);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const hgt = 16 + 62 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 0.8));
      g.fillStyle = "rgba(79,147,255,0.85)";
      rr(g, gx0 + 18 + i * 20, 316 - hgt, 12, hgt, 3);
      g.fill();
    }
    g.fillStyle = "rgba(170,195,220,0.5)";
    g.font = `400 13px ${FONT}`;
    g.fillText(`${(1240 + Math.floor(t * 7)).toLocaleString("en-US")} 条`, gx0 + 18, 352);
  }

  // ---------- 底部：渲染队列（填满 4:3 画布的下半部分）----------
  const qy = 800;
  g.fillStyle = "rgba(255,255,255,0.03)";
  rr(g, 40, qy, 1520, 350, 16);
  g.fill();
  g.fillStyle = "rgba(170,195,220,0.5)";
  g.font = `500 15px ${FONT}`;
  g.fillText("Render Queue", 64, qy + 32);
  for (let i = 0; i < 5; i++) {
    const qyy = qy + 62 + i * 56;
    const prog = (t * 0.22 + i * 0.17) % 1;
    g.fillStyle = "rgba(255,255,255,0.05)";
    rr(g, 64, qyy, 1080, 22, 11);
    g.fill();
    const grd = g.createLinearGradient(64, 0, 64 + 1080 * prog, 0);
    grd.addColorStop(0, "rgba(79,147,255,0.9)");
    grd.addColorStop(1, "rgba(56,214,168,0.95)");
    g.fillStyle = grd;
    rr(g, 64, qyy, Math.max(4, 1080 * prog), 22, 11);
    g.fill();
    g.fillStyle = "rgba(210,225,245,0.85)";
    g.font = `400 14px ${FONT}`;
    g.fillText(`shot-${String(i + 1).padStart(2, "0")}`, 1176, qyy + 17);
    g.fillStyle = "rgba(170,195,220,0.5)";
    g.fillText(`${Math.round(prog * 100)}%`, 1290, qyy + 17);
  }

  // ---------- 浅色文档页：与深色工作区交替 ----------
  // 参考片屏幕区实测平均亮度 109.9，而深色界面只有 ~41。
  // 参考片是"深色工作区 ↔ 浅色文档"交替的，这既抬了亮度，也是那些 10~15
  // 峰值帧差的真正来源（整屏深↔浅切换）。
  const cyc2 = t % 4.8;
  let L = 0;
  if (cyc2 < 2.28) L = 0;
  else if (cyc2 < 2.4) L = easeOut((cyc2 - 2.28) / 0.12);
  else if (cyc2 < 4.68) L = 1;
  else L = 1 - easeOut((cyc2 - 4.68) / 0.12);

  if (L > 0.001) {
    g.globalAlpha = L;
    g.fillStyle = "#f1f4f8";
    g.fillRect(-260, -260, W + 520, H + 520);

    // 顶栏
    g.fillStyle = "rgba(20,35,55,0.055)";
    g.fillRect(-260, -260, W + 520, 74 + 260);
    g.fillStyle = "#1b2a3d";
    g.font = `600 26px ${FONT}`;
    g.fillText("Docs", 40, 48);
    g.fillStyle = "rgba(27,42,61,0.45)";
    g.font = `400 16px ${FONT}`;
    g.fillText("结构化知识库 / router.md", 130, 46);

    // 标题
    g.fillStyle = "#12202f";
    g.font = `700 40px ${FONT}`;
    g.fillText("给模型足够的指引", 40, 150);
    g.fillStyle = "rgba(27,42,61,0.55)";
    g.font = `400 17px ${FONT}`;
    g.fillText("更新于 " + Math.floor(t) + " 秒前 · 1,0" + (Math.floor(t) % 10) + " 次浏览", 40, 182);

    // 正文：真实文字，连续滚动（大面积运动，避免冻结帧）
    const scrollY = (t * 300) % 34;
    const hl = (t / 0.5) % 14;
    const hlI = Math.floor(hl);
    const hlY = 236 + hlI * 34 - scrollY + easeOut(hl - hlI) * 34;
    if (hlY > 196 && hlY < 1010) {
      g.fillStyle = "rgba(70,120,200,0.13)";
      rr(g, 34, hlY - 20, 930, 30, 6);
      g.fill();
    }
    const doc = [
      "router that points to supporting docs and scripts.",
      "Give the model enough guidance to know where to look,",
      "without forcing it to read things that don't matter.",
      "第三，很多 skill 被写成详尽的迭代手册或配方。",
      "模型现在对细微差别和歧义的理解好了很多，",
      "所以当指引足够具体时，反而会限制结果。",
      "Repo skills 也会指导其他贡献者的 agent，",
      "而他们可能用不同的模型。",
      "所以要想清楚：哪些模型会用到你留下的说明。",
      "若目标模型是 Sol 或 Luna，过度约束尤其明显。",
      "因此把说明写成「路标」而不是「手册」。",
      "让 agent 自己决定读多少、读哪一部分。",
      "这也是 AGENTS.md 与 skill 的分工所在。",
      "一条好的指引，通常只指向入口，不展开全部。",
    ];
    for (let i = -1; i < 30; i++) {
      const y = 230 + i * 34 - scrollY;
      if (y < 200 || y > 1010) continue;
      g.fillStyle = "rgba(24,38,56,0.78)";
      g.font = `400 19px ${FONT}`;
      g.fillText(doc[((i % doc.length) + doc.length) % doc.length], 46, y);
    }

    // 右侧：浅底卡片 + 深色图表（持续变化）
    g.fillStyle = "rgba(15,30,50,0.05)";
    rr(g, 1010, 210, 550, 250, 14);
    g.fill();
    g.fillStyle = "rgba(27,42,61,0.6)";
    g.font = `500 15px ${FONT}`;
    g.fillText("引用分布", 1032, 242);
    for (let i = 0; i < 12; i++) {
      const hgt = 26 + 86 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.7));
      g.fillStyle = i % 3 === 0 ? "rgba(34,120,220,0.85)" : "rgba(120,150,185,0.55)";
      rr(g, 1032 + i * 43, 420 - hgt, 26, hgt, 5);
      g.fill();
    }

    // 底部：一条横向进度条持续走
    const pw2 = ((t * 0.35) % 1) * 1490;
    g.fillStyle = "rgba(15,30,50,0.07)";
    rr(g, 40, 1000, 1490, 12, 6);
    g.fill();
    g.fillStyle = "rgba(34,120,220,0.8)";
    rr(g, 40, 1000, Math.max(8, pw2), 12, 6);
    g.fill();

    g.globalAlpha = 1;
  }

  // ---------- 大面积掠光 ----------
  // 参考片的"底噪"约 1.5，靠小元素移动到不了 —— 必须有**大范围**的低幅度变化。
  // 一条横扫全屏的柔光能做到：面积大、幅度小、永不停止。
  const sweepX = ((t * 210) % (W + 900)) - 450;
  const sheen = g.createLinearGradient(sweepX - 450, 0, sweepX + 450, H);
  sheen.addColorStop(0, "rgba(120,170,255,0)");
  sheen.addColorStop(0.45, "rgba(120,170,255,0.10)");
  sheen.addColorStop(0.55, "rgba(180,210,255,0.13)");
  sheen.addColorStop(1, "rgba(120,170,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  // 底噪 #2：整块工作区的色温做极缓慢的呼吸（大面积、低幅度）
  g.fillStyle = `rgba(90,140,220,${0.045 + 0.035 * Math.sin(t * 1.7)})`;
  g.fillRect(0, 0, W, H);

  // ---------- 扫描线：让整屏更像"正在录制的显示器" ----------
  g.fillStyle = "rgba(120,170,255,0.035)";
  for (let y = (frame * 7) % 4; y < H; y += 4) g.fillRect(0, y, W, 1);
}

const LiveUIComp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement | null>(null);

  // 必须 useLayoutEffect：Remotion 截图在 paint 之前不会等 useEffect
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    draw(g, frame, fps);
  }, [frame, fps]);

  return (
    <AbsoluteFill style={{ background: "#05080d" }}>
      <canvas ref={ref} width={W} height={H} style={{ width, height }} />
    </AbsoluteFill>
  );
};

export const LiveUIRoot: React.FC = () => (
  <Composition id="LiveUI" component={LiveUIComp} durationInFrames={600} fps={30} width={1920} height={1080} />
);
