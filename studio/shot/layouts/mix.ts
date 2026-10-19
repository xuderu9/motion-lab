// mix —— 用 blocks 重新组合出来的版面。
//
// 用户的要求：「保留目前版面，再重新组合新的版面，以免和别人的视频重复」。
// 所以这里不是照抄参考片，而是把它拆出来的零件**换一种排布**：
// 同样的标题/卡片/标签/数值/时间轴，用参考片里没出现过的比例和位置拼回去。
//
// 六个变体 = 六种截然不同的骨架：
//   0 左右分栏：左边大标题 + 一列键值，右边 2×2 卡阵
//   1 杂志式：左侧竖排章节 + 右侧两行大条目
//   2 满屏卡阵：3×2 卡片顶满，标题压成一行小字
//   3 中心数字：一个大数字居中，四角小注 + 底部时间轴
//   4 上下分屏：上半标题条（深色），下半三列卡
//   5 对角线式：左上标题 + 右下卡阵，中间用一条斜线分隔

import type { CardsContent, LayoutDraw, Theme } from "../types";
import {
  palette,
  paperBg,
  chapterBar,
  kicker,
  headline,
  subhead,
  contentTile,
  labelValueRow,
  darkStrip,
  timelineBar,
  bigNumber,
  serifNote,
  fitText,
} from "./blocks";
import { SANS, SANS_UI, SERIF_IT, splitHeadline as splitH } from "../typefaces";

const TABS = ["概览", "一 · 背景", "二 · 做法", "三 · 数据", "四 · 结论"];

const mix0: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  paperBg(g, w, h, p, t);
  chapterBar(g, w, h, TABS, 1, p, t);

  const mx = w * 0.06;
  const splitX = w * 0.46;
  kicker(g, "分栏 · split", mx, h * 0.115, h, p);
  // 标题限制在左栏宽度内：先按字号量，超了就缩
  let hp = Math.round(h * 0.078);
  const maxHeadW = splitX - mx - w * 0.03;
  for (let k = 0; k < 12; k++) {
    g.font = `900 ${hp}px ${SANS}`;
    const { main, accent } = splitH(c.heading || "左边讲，右边看");
    g.font = `900 ${hp}px ${SANS}`;
    let tw = g.measureText(main).width;
    if (accent) { g.font = `italic ${Math.round(hp * 1.02)}px ${SERIF_IT}`; tw += hp * 0.14 + g.measureText(accent).width; }
    if (tw <= maxHeadW || hp < h * 0.04) break;
    hp -= Math.round(h * 0.006);
  }
  headline(g, c.heading || "左边讲，右边看", mx, h * 0.225, hp, p);
  subhead(g, c.subtitle ?? "左栏给结论，右栏给证据", mx, h * 0.285, h, p, maxHeadW);

  const kv = (c.cards ?? []).slice(0, 4);
  kv.forEach((it, i) => {
    const ap = Math.max(0, Math.min(1, (t - 0.2 - i * 0.16) / 0.5));
    labelValueRow(g, it.tag || `0${i + 1}`, it.value || it.body || it.title, mx, h * (0.42 + i * 0.115), maxHeadW, h, p, ap);
  });

  const grid = (c.cards ?? []).slice(0, 4);
  const gap = w * 0.016;
  const cw = (w - splitX - mx - gap) / 2;
  const ch = h * 0.28;
  grid.forEach((it, i) => {
    const ap = Math.max(0, Math.min(1, (t - 0.35 - i * 0.14) / 0.55));
    contentTile(g, it, splitX + (i % 2) * (cw + gap), h * 0.3 + Math.floor(i / 2) * (ch + gap), cw, ch, p, i === 0, (1 - ap) * h * 0.02);
  });

  g.fillStyle = p.line;
  g.fillRect(splitX - w * 0.022, h * 0.1, 1, h * 0.66);
};

const mix1: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  paperBg(g, w, h, p, t);

  const railW = w * 0.17;
  // 左侧竖排章节
  g.fillStyle = p.line;
  g.fillRect(railW, 0, 1, h);
  g.save();
  g.translate(w * 0.045, h * 0.5);
  g.rotate(-Math.PI / 2);
  g.fillStyle = p.faint;
  g.font = `700 ${Math.round(h * 0.018)}px ${SANS_UI}`;
  g.textBaseline = "middle";
  g.fillText("章 节 · 竖 排 · 三 / 五", 0, 0);
  g.restore();
  g.fillStyle = p.accent;
  g.fillRect(w * 0.045, h * 0.42, h * 0.006, h * 0.16);

  const x0 = railW + w * 0.05;
  const rows = (c.cards ?? []).slice(0, 2);
  rows.forEach((it, i) => {
    const ap = Math.max(0, Math.min(1, (t - i * 0.3) / 0.6));
    const y = h * (0.16 + i * 0.42);
    g.globalAlpha = ap;
    g.fillStyle = p.accent;
    g.font = `900 ${Math.round(h * 0.052)}px ${SANS}`;
    g.fillText(`0${i + 1}`, x0, y + h * 0.05);
    g.fillStyle = p.text;
    g.font = `800 ${Math.round(h * 0.062)}px ${SANS}`;
    g.fillText(fitText(g, it.title ?? "", w - x0 - w * 0.06), x0 + h * 0.09, y + h * 0.05);
    g.fillStyle = p.dim;
    g.font = `400 ${Math.round(h * 0.024)}px ${SANS_UI}`;
    g.fillText(fitText(g, it.body ?? "", w - x0 - w * 0.08), x0 + h * 0.09, y + h * 0.115);
    serifNote(g, it.tag ?? "", x0 + h * 0.09, y + h * 0.17, h, p, "left", w - x0 - w * 0.08);
    g.globalAlpha = 1;
    g.strokeStyle = p.line;
    g.beginPath();
    g.moveTo(x0, y + h * 0.24);
    g.lineTo(w - w * 0.06, y + h * 0.24);
    g.stroke();
  });
};

const mix2: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  paperBg(g, w, h, p, t);
  const mx = w * 0.05;
  // 标题压成一行小字
  g.fillStyle = p.text;
  g.font = `800 ${Math.round(h * 0.038)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, c.heading ?? "六件事", w * 0.7), mx, h * 0.085);
  g.fillStyle = p.accent;
  g.fillRect(mx, h * 0.105, h * 0.055, h * 0.004);
  g.fillStyle = p.faint;
  g.font = `600 ${Math.round(h * 0.017)}px ${SANS_UI}`;
  g.textAlign = "right";
  g.fillText("GRID · 3 × 2", w - mx, h * 0.085);
  g.textAlign = "start";

  const items = (c.cards ?? []).slice(0, 6);
  const cols = 3;
  const gap = w * 0.014;
  const cw = (w - mx * 2 - gap * (cols - 1)) / cols;
  const ch = h * 0.36;
  for (let i = 0; i < cols * 2 && i < items.length; i++) {
    const it = items[i];
    const ap = Math.max(0, Math.min(1, (t - i * 0.13) / 0.5));
    contentTile(
      g,
      it,
      mx + (i % cols) * (cw + gap),
      h * 0.16 + Math.floor(i / cols) * (ch + gap),
      cw,
      ch,
      p,
      i === 0,
      (1 - ap) * h * 0.026,
    );
  }
};

const mix3: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  paperBg(g, w, h, p, t);
  chapterBar(g, w, h, TABS, 3, p, t, 0.036);

  const first = (c.cards ?? [])[0];
  const value = first?.value || "63%";
  // 中心大数字
  g.textAlign = "center";
  bigNumber(g, value, w / 2, h * 0.58, h * 1.1, p, "center");
  g.textAlign = "start";
  g.fillStyle = p.text;
  g.font = `600 ${Math.round(h * 0.03)}px ${SANS_UI}`;
  g.textAlign = "center";
  g.fillText(fitText(g, first?.title ?? c.heading ?? "", w * 0.6), w / 2, h * 0.66);
  g.textAlign = "start";

  // 四角小注
  const notes = (c.cards ?? []).slice(1, 5);
  const pad = w * 0.06;
  const spots: [number, number, "left" | "right"][] = [
    [pad, h * 0.2, "left"],
    [w - pad, h * 0.2, "right"],
    [pad, h * 0.86, "left"],
    [w - pad, h * 0.86, "right"],
  ];
  notes.forEach((n, i) => {
    const [x, y, al] = spots[i];
    const ap = Math.max(0, Math.min(1, (t - 0.3 - i * 0.18) / 0.5));
    g.globalAlpha = ap;
    g.textAlign = al;
    g.fillStyle = p.faint;
    g.font = `700 ${Math.round(h * 0.015)}px ${SANS_UI}`;
    g.fillText((n.tag || `注 ${i + 1}`).toUpperCase(), x, y - h * 0.022);
    g.fillStyle = p.dim;
    g.font = `400 ${Math.round(h * 0.02)}px ${SANS_UI}`;
    g.fillText(fitText(g, n.body ?? n.title ?? "", w * 0.3), x, y);
    g.textAlign = "start";
    g.globalAlpha = 1;
  });

  timelineBar(g, pad, h * 0.945, w - pad * 2, h, p, t, first?.value ?? "");
};

const mix4: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  g.fillStyle = p.paper;
  g.fillRect(0, 0, w, h);

  // 上半：深色标题条
  const topH = h * 0.46;
  g.fillStyle = theme.isLight ? "#12141a" : "rgba(255,255,255,0.05)";
  g.fillRect(0, 0, w, topH);
  kicker(g, "上半 · 标题条", w * 0.06, topH * 0.26, h, { ...p, text: "#ffffff", accent: p.accent });
  g.fillStyle = "#ffffff";
  g.font = `900 ${Math.round(h * 0.085)}px ${SANS}`;
  g.textBaseline = "alphabetic";
  g.fillText(fitText(g, c.heading ?? "上半标题", w * 0.84), w * 0.06, topH * 0.58);
  g.fillStyle = p.accent;
  g.font = `700 ${Math.round(h * 0.026)}px ${SANS_UI}`;
  g.fillText(fitText(g, c.subtitle ?? "", w * 0.84), w * 0.06, topH * 0.74);

  // 下半：三列卡
  const items = (c.cards ?? []).slice(0, 3);
  const mx = w * 0.06;
  const gap = w * 0.02;
  const cw = (w - mx * 2 - gap * 2) / 3;
  const ch = h * 0.245;
  items.forEach((it, i) => {
    const ap = Math.max(0, Math.min(1, (t - 0.25 - i * 0.16) / 0.55));
    contentTile(g, it, mx + i * (cw + gap), topH + h * 0.06 + (1 - ap) * h * 0.03, cw, ch, p, false, 0);
  });
};

const mix5: LayoutDraw = (g, t, content, theme, variant, size) => {
  const c = content as CardsContent;
  const w = size?.w ?? 1920;
  const h = size?.h ?? 1080;
  const p = palette(theme);
  paperBg(g, w, h, p, t);

  // 对角线分隔
  g.strokeStyle = p.line;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, h * 0.72);
  g.lineTo(w, h * 0.18);
  g.stroke();

  const mx = w * 0.07;
  kicker(g, "对角 · diagonal", mx, h * 0.14, h, p);
  headline(g, c.heading ?? "左上写标题", mx, h * 0.28, Math.round(h * 0.088), p);
  subhead(g, c.subtitle ?? "", mx, h * 0.34, h, p, w * 0.38);

  // 三张卡沿对角线依次排开，**互不重叠**：横向 0.44w 步进、纵向 0.26h 步进
  // 只放两张卡，沿对角线拉开，右下角不再有第三张去撞黑条
  const items = (c.cards ?? []).slice(0, 2);
  const cw = w * 0.3;
  const ch = h * 0.22;
  items.forEach((it, i) => {
    const ap = Math.max(0, Math.min(1, (t - 0.3 - i * 0.2) / 0.55));
    contentTile(
      g,
      it,
      w * 0.42 + i * (w * 0.17),
      h * 0.37 + i * (h * 0.175),
      cw,
      ch,
      p,
      i === 1,
      (1 - ap) * h * 0.026,
    );
    g.globalAlpha = 1;
  });

  // 黑条固定在左下，与右上方的卡阵对角呼应
  darkStrip(g, (c.tags ?? []).slice(0, 2).length ? (c.tags as string[]).slice(0, 2) : ["一条结论", "另一条结论"], mx, h * 0.645, w * 0.42, h * 0.1, p);
};

export const MIX_VARIANTS: LayoutDraw[] = [mix0, mix1, mix2, mix3, mix4, mix5];

export const MIX_MOTION_SOURCES: Record<number, string[]> = {
  0: ["横纹缓慢上移", "卡阵错峰上浮", "键值行错峰淡入", "章节光扫过"],
  1: ["竖排标签静止", "两条目错峰淡入", "强调竖条呼吸"],
  2: ["卡阵错峰上浮", "标题下划线生长", "横纹上移"],
  3: ["大数字轻微缩放", "四角注释错峰淡入", "时间轴游标移动"],
  4: ["三列卡错峰上浮", "深色条内文字缓慢位移", "横纹上移"],
  5: ["卡阵沿对角线错峰浮现", "斜线分隔呼吸", "横纹上移"],
};
