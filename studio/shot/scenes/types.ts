// 场景系统 —— M5 的第三根轴：**怎么摆、怎么动**。
//
// ═══ 为什么要这一层 ═══
// 之前 `layout`（doc/chart/cards…）同时承担了三件事：
//   1. 把内容结构化（一段话 → 段落/卡片/数据点）
//   2. 决定排布（网格/列表/图表）
//   3. 决定运动（滚动/浮现/扫光）
// 结果就是「版式再多，画面还是同一种」。
//
// 拆开之后：
//   content    讲什么        ← 已有的 LayoutContent
//   layout     内容怎么组织   ← 已有的 6 个版式（各 3 变体）
//   scene      画面怎么摆怎么动 ← **本文件**（与内容解耦，只吃 items）
//   presentation 贴在哪儿     ← screen / full / plate
//
// 关键：几乎所有这些效果都是在**一串条目**上做的（卡片、段落、数据点、地名…）。
// 所以只要能把内容降维成 `Item[]`，一个场景就能作用于任意内容。
// 12 个场景 × 6 种内容 = 72 种画面，而场景代码是互相独立的，可以无限加。

import type { LayoutContent, LayoutSize, Theme } from "../types";

/** 场景消费的最小单元 */
export type Item = {
  /** 主标题 / 名称 */
  title?: string;
  /** 正文 */
  body?: string;
  /** 数值（字符串，允许 "63%"、"1,280"） */
  value?: string;
  /** 小标签 */
  tag?: string;
  /** 可选强调色（缺省用 theme.accent） */
  accent?: string;
};

/** 场景的绘制函数：只依赖 items + theme + size + t */
export type SceneDraw = (
  g: CanvasRenderingContext2D,
  t: number,
  items: Item[],
  theme: Theme,
  size: LayoutSize,
  /** 0/1/2 = 同一种运动力度的三档，或三种排布 */
  variant: 0 | 1 | 2,
) => void;

export type Scene = {
  /** 注册名，写进 ShotSpec.scene */
  name: string;
  /** 中文说明，规划报告里给人看 */
  label: string;
  /** 至少 3 条常驻微动（check-shot 第 8 条会核） */
  motions: string[];
  /** 建议的条目数量区间；规划器据此挑场景 */
  items: [number, number];
  draw: SceneDraw;
};

/**
 * 把任意内容降维成条目数组。
 * 这是「一个场景吃所有内容」的关键，缺了这个函数，场景就只能一对一写死。
 */
export function toItems(content: LayoutContent): Item[] {
  switch (content.kind) {
    case "cards":
      return content.cards.map((c) => ({ title: c.title, body: c.body, tag: c.tag, value: c.value }));
    case "doc":
      return content.paragraphs.map((p, i) => ({ title: p.slice(0, 18), tag: `${i + 1}` }));
    case "chart":
      return content.series.map((s) => ({ title: s.label, value: String(s.value) }));
    case "timeline":
      return content.events.map((e) => ({ title: e.title, body: e.body, tag: e.time }));
    case "map":
      return content.places.map((p) => ({ title: p.name, body: p.note }));
    case "code":
      return content.code.slice(0, 24).map((l) => ({ title: l.trim() || " ", tag: "" }));
    case "title":
      return [{ title: content.heading, body: content.subtitle, tag: content.kicker }];
    case "stat":
      return [{ value: content.value, title: content.label, body: content.note, tag: content.delta }];
    case "quote":
      return [{ body: content.text, title: content.attribution, tag: content.kicker }];
    case "atmosphere":
      return content.text ? [{ title: content.text }] : [];
    default:
      return [];
  }
}
