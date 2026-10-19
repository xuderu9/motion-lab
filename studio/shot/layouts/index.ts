// 版式分发表 —— layout × variant → LayoutDraw
//
// 加新版式时只动这里：把变体数组注册进 LAYOUTS 即可，渲染器不认识任何具体版式。

import { CHART_MOTION_SOURCES, CHART_VARIANTS } from "./chart";
import { DOC_MOTION_SOURCES, DOC_VARIANTS } from "./doc";
import { CARDS_MOTION_SOURCES, CARDS_VARIANTS } from "./cards";
import { CODE_MOTION_SOURCES, CODE_VARIANTS } from "./code";
import { MAP_MOTION_SOURCES, MAP_VARIANTS } from "./map";
import { TIMELINE_MOTION_SOURCES, TIMELINE_VARIANTS } from "./timeline";
import { NEW_LAYOUTS, NEW_MOTION_SOURCES } from "./_new";
import { PAGE_MOTION_SOURCES, PAGE_VARIANTS } from "./page";
import { PANEL_MOTION_SOURCES, PANEL_VARIANTS } from "./panel";
import type { LayoutDraw, LayoutName, LayoutContent, Theme, Variant, LayoutSize } from "../types";

export const LAYOUTS: Record<LayoutName, LayoutDraw[]> = {
  doc: DOC_VARIANTS,
  chart: CHART_VARIANTS,
  code: CODE_VARIANTS,
  map: MAP_VARIANTS,
  timeline: TIMELINE_VARIANTS,
  cards: CARDS_VARIANTS,
  // 四个全屏版式由 codex 在 _new.ts 里注册；没填之前是占位实现，渲染成空画面
  title: NEW_LAYOUTS.title ?? [],
  stat: NEW_LAYOUTS.stat ?? [],
  quote: NEW_LAYOUTS.quote ?? [],
  atmosphere: NEW_LAYOUTS.atmosphere ?? [],
  page: PAGE_VARIANTS,
  panel: PANEL_VARIANTS,
};

/** 每个版式 × 变体的常驻运动源清单，供 check-shot.py 核对验收第 8 条 */
export const MOTION_SOURCES: Record<LayoutName, Record<number, string[]>> = {
  doc: DOC_MOTION_SOURCES,
  chart: CHART_MOTION_SOURCES,
  code: CODE_MOTION_SOURCES,
  map: MAP_MOTION_SOURCES,
  timeline: TIMELINE_MOTION_SOURCES,
  cards: CARDS_MOTION_SOURCES,
  title: NEW_MOTION_SOURCES.title ?? {},
  stat: NEW_MOTION_SOURCES.stat ?? {},
  quote: NEW_MOTION_SOURCES.quote ?? {},
  atmosphere: NEW_MOTION_SOURCES.atmosphere ?? {},
  page: PAGE_MOTION_SOURCES,
  panel: PANEL_MOTION_SOURCES,
};

export function getLayoutDraw(layout: LayoutName, variant: Variant): LayoutDraw {
  const family = LAYOUTS[layout];
  if (!family) throw new Error(`[layout] 未知版式: ${layout}`);
  const fn = family[variant];
  if (!fn) throw new Error(`[layout] 版式 ${layout} 没有变体 ${variant}（现有 ${family.length} 个）`);
  return fn;
}

export function paintLayout(
  g: CanvasRenderingContext2D,
  t: number,
  layout: LayoutName,
  variant: Variant,
  content: LayoutContent,
  theme: Theme,
  size?: LayoutSize,
) {
  getLayoutDraw(layout, variant)(g, t, content, theme, variant, size);
}

export type { LayoutDraw };
