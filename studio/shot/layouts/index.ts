// 版式分发表 —— layout × variant → LayoutDraw
//
// 加新版式时只动这里：把变体数组注册进 LAYOUTS 即可，渲染器不认识任何具体版式。

import { CHART_MOTION_SOURCES, CHART_VARIANTS } from "./chart";
import { DOC_MOTION_SOURCES, DOC_VARIANTS } from "./doc";
import type { LayoutDraw, LayoutName, LayoutContent, Theme, Variant } from "../types";

export const LAYOUTS: Record<LayoutName, LayoutDraw[]> = {
  doc: DOC_VARIANTS,
  chart: CHART_VARIANTS,
};

/** 每个版式 × 变体的常驻运动源清单，供 check-shot.py 核对验收第 8 条 */
export const MOTION_SOURCES: Record<LayoutName, Record<number, string[]>> = {
  doc: DOC_MOTION_SOURCES,
  chart: CHART_MOTION_SOURCES,
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
) {
  getLayoutDraw(layout, variant)(g, t, content, theme, variant);
}

export type { LayoutDraw };
