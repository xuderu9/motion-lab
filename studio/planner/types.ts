// M3 分镜规划器的类型。
//
// 输出必须是 M1 的 ShotSpec —— 规划器只负责「排什么」，不碰「怎么画」。

import type { ShotSpec, LayoutName, ThemeName, LayoutContent, EnvSpec } from "../shot/types";

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------

export type SrtLine = {
  index: number;
  /** 秒 */
  start: number;
  /** 秒 */
  end: number;
  text: string;
};

export type PlannerOptions = {
  /** 单个镜头的目标时长区间（秒） */
  targetShotSec: [number, number];
  /** 至少产出多少个镜头 */
  minShots: number;
  /** 约束求解的随机种子；固定则结果可复现 */
  seed: number;
  /** 同一 (layout, variant) 的最小间隔（镜头数） */
  minVariantGap: number;
  /** 强调层镜头占比目标区间 */
  overlayRatio: [number, number];
};

export const DEFAULT_OPTIONS: PlannerOptions = {
  targetShotSec: [8, 16],
  minShots: 8,
  seed: 20260101,
  minVariantGap: 4,
  overlayRatio: [0.2, 0.4],
};

// ---------------------------------------------------------------------------
// 中间结构
// ---------------------------------------------------------------------------

export type Features = {
  /** 每百字里的数字个数 */
  numDensity: number;
  /** 年份/日期个数 */
  dateCount: number;
  /** 地名个数 */
  placeCount: number;
  /** 每百字里的代码标识符个数 */
  codeDensity: number;
  /** 枚举连词个数 */
  enumCount: number;
  /** 字符数（用于归一化） */
  charCount: number;
};

export type Segment = {
  /** 覆盖的 SRT 行下标区间 [from, to) */
  from: number;
  to: number;
  start: number;
  end: number;
  text: string;
  features: Features;
  /** 各版式得分 */
  scores: Record<LayoutName, number>;
};

export type Warning = { shotId: string; kind: string; detail: string };

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

export type PlannedShot = ShotSpec & {
  /** 规划器记下的来源信息，渲染器不读 */
  _plan?: {
    srtFrom: number;
    srtTo: number;
    layoutScore: number;
    runnerUp: { layout: LayoutName; score: number };
  };
};

export type Plan = {
  shots: PlannedShot[];
  report: {
    totalSec: number;
    shotCount: number;
    layouts: Record<string, number>;
    themes: Record<string, number>;
    overlayCount: number;
    /** 这份文案最多能支持几个版式族（用于判定「族数够不够」） */
    supportedFamilies: number;
    warnings: Warning[];
    /** 违反硬约束的条目；必须为空，非空说明求解器有 bug */
    violations: string[];
  };
};

export type LayoutFamily = LayoutName;
export type { ShotSpec, LayoutContent, EnvSpec, ThemeName, LayoutName };
