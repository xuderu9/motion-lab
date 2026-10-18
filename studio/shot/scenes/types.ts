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
import type { Visual } from "./visuals";

/**
 * 一张卡片。
 *
 * 用户原话：「卡片中不一定是文字，也可以是动画等，任何画面都可以用卡片展示」。
 * 所以卡片 = 容器（`visual` 决定里面是什么）+ 一行极短标题（`tag`）。
 * **不设 body 长文字**：卡片里放大段文字是错的，字要多就换一个版式。
 */
export type Item = {
  /** 卡片里画什么：文字/数字/环/柱/折线/图标/代码/图片 */
  visual: Visual;
  /** 角标，≤6 字，可缺省 */
  tag?: string;
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
      return content.cards.map((c) => ({
        visual: { kind: "text", text: short(c.title, 8), sub: c.tag ? short(c.tag, 6) : undefined },
        tag: c.tag ? short(c.tag, 4) : undefined,
      }));
    case "doc":
      // 文档类：一句一卡，标题压到 8 字以内
      return content.paragraphs.slice(0, 10).map((p) => ({
        visual: { kind: "text", text: short(p, 8) },
      }));
    case "chart": {
      const vals = content.series.map((x) => x.value);
      return [
        { visual: { kind: "spark", values: vals, label: short(content.heading, 10) } },
        { visual: { kind: "stat", value: formatNum(vals[vals.length - 1] ?? 0), label: short(content.metric.label, 8) } },
        ...content.series.slice(0, 8).map((x) => {
          const visual: Visual = { kind: "bars", values: [x.value], label: short(x.label, 6) };
          return { visual, tag: short(x.label, 4) };
        }),
      ];
    }
    case "timeline":
      return content.events.slice(0, 8).map((e) => ({
        visual: { kind: "text", text: short(e.title, 8), sub: short(e.time, 6) },
        tag: short(e.time, 5),
      }));
    case "map":
      return content.places.slice(0, 8).map((p) => ({
        visual: { kind: "icon", shape: "dot", label: short(p.name, 6) } as Visual,
        tag: short(p.name, 4),
      }));
    case "code":
      return content.code.slice(0, 6).map((l) => ({
        visual: { kind: "code", lines: [l.trim().slice(0, 24)] },
      }));
    case "title":
      return [{ visual: { kind: "text", text: short(content.heading, 8), sub: content.subtitle } }];
    case "stat":
      return [{ visual: { kind: "stat", value: content.value, label: short(content.label, 8) } }];
    case "quote":
      return [{ visual: { kind: "text", text: short(content.text, 8), sub: content.attribution } }];
    case "atmosphere":
      return content.text ? [{ visual: { kind: "text", text: short(content.text, 8) } }] : [];
    default:
      return [];
  }
}

/** 截到 n 个字，卡片里不允许出现长句 */
export function short(text: string, n: number): string {
  const s = (text ?? "").replace(/\s+/g, "").trim();
  return s.length <= n ? s : s.slice(0, n);
}

function formatNum(v: number): string {
  return v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10);
}
