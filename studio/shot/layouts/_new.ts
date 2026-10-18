// 新全屏版式的注册表 —— **codex 独占这个文件**，dsh 不碰。
//
// 为什么单独开一个文件：两个 agent 并行改同一个仓库时，index.ts / types.ts
// 是必然撞车的地方。dsh 已经在 types.ts 里把四个新版式的类型定好了
// （TitleContent / StatContent / QuoteContent / AtmosphereContent），
// 也在 index.ts 里预留了这一行的合并；codex 只需要在这里补齐四个版式的实现。
//
// 约定：
//   1. 每个版式导出 `*_VARIANTS: LayoutDraw[]`（长度 3，对应 variant 0/1/2）
//   2. 每个版式导出 `*_MOTION_SOURCES: Record<number, string[]>`，
//      每个变体至少 3 条**常驻**微动（check-shot.py 第 8 条会核）
//   3. 画的时候一律用 `size`，不要直接 import CANVAS_W / CANVAS_H ——
//      同一份代码要能画在 1600×1200（平板屏幕里）和 1920×1080（整帧）上
//   4. 字号下限：在 1600 宽画布上 ≥40px（成片有效字号因此 ≥12.8px）
//   5. 颜色一律从 theme 取，不许写死色值（chrome.ts 里有 withAlpha 之类的工具）

import type { LayoutDraw } from "../types";
import { ATMOSPHERE_MOTION_SOURCES, ATMOSPHERE_VARIANTS } from "./atmosphere";
import { QUOTE_MOTION_SOURCES, QUOTE_VARIANTS } from "./quote";
import { STAT_MOTION_SOURCES, STAT_VARIANTS } from "./stat";
import { TITLE_MOTION_SOURCES, TITLE_VARIANTS } from "./title";

export type NewLayoutName = "title" | "stat" | "quote" | "atmosphere";

export const NEW_LAYOUTS: Partial<Record<NewLayoutName, LayoutDraw[]>> = {
  title: TITLE_VARIANTS,
  stat: STAT_VARIANTS,
  quote: QUOTE_VARIANTS,
  atmosphere: ATMOSPHERE_VARIANTS,
};

export const NEW_MOTION_SOURCES: Partial<Record<NewLayoutName, Record<number, string[]>>> = {
  title: TITLE_MOTION_SOURCES,
  stat: STAT_MOTION_SOURCES,
  quote: QUOTE_MOTION_SOURCES,
  atmosphere: ATMOSPHERE_MOTION_SOURCES,
};
