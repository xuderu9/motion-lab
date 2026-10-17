// 环境注册表。
//
// 一间片子用哪几个环境，写在 studio/plates.json 里；规划器只消费，不硬编码。
// 人类改这一个文件就能换整片的场景基调（夜景桌面 / 白天窗边 / 黄昏书房 / 明亮办公室）。
//
// 每个环境的 quad / exposure 都是实测推导出来的（见 out/plates-work/PLATE-SPEC.md），
// 不是手调的。换板子请跑 studio/tools/plate-prep.ps1 重新生成。

import { readFileSync } from "node:fs";
import type { EnvSpec, ThemeName } from "../shot/types";

export type EnvironmentEntry = {
  name: string;
  /** 中文名，规划报告里给人看 */
  label: string;
  /** 适合的版式族；空 = 通用 */
  prefer?: string[];
  /**
   * 允许搭配的主题；缺省 = 亮暗都能配。
   *
   * 为什么需要：屏占比大的环境（特写 22%）配暗主题时，整帧亮度会被屏内拉黑到 77，
   * 而验收要求暗页帧 ≥94。抬曝光救不回来——房间会先被烧穿。所以这类环境
   * 必须在注册表里限定为亮主题（见 PLATE-SPEC §4.4）。
   */
  allowedThemes?: ThemeName[];
  env: EnvSpec;
};

export type PlateRegistry = {
  /** 默认环境（第一个） */
  default: string;
  environments: EnvironmentEntry[];
};

export function loadRegistry(path: string): PlateRegistry {
  const raw = JSON.parse(readFileSync(path, "utf8")) as PlateRegistry;
  if (!raw.environments || raw.environments.length === 0) {
    throw new Error(`${path} 里没有任何环境`);
  }
  for (const e of raw.environments) {
    if (!e.env?.quad || e.env.quad.length !== 4) throw new Error(`环境 ${e.name} 的 quad 不是 4 个点`);
    if (!e.env.src) throw new Error(`环境 ${e.name} 缺 src`);
  }
  return raw;
}

/**
 * 给第 i 个镜头挑环境。
 *
 * 两道过滤，顺序不能反：
 *   1. **主题必须被环境允许**（特写只配亮主题）。先过这道，否则会挑出一个
 *      主题上根本站不住的环境，亮度验收直接挂。
 *   2. 版式偏好（标了 prefer 的优先），同优先级里轮换，避免整片只用一间屋。
 */
export function pickEnvironment(reg: PlateRegistry, layout: string, theme: string, i: number): EnvironmentEntry {
  const themeOk = reg.environments.filter(
    (e) => !e.allowedThemes || e.allowedThemes.includes(theme as ThemeName),
  );
  const pool0 = themeOk.length ? themeOk : reg.environments;
  const suited = pool0.filter((e) => e.prefer?.includes(layout));
  const pool = suited.length ? suited : pool0;
  return pool[i % pool.length];
}
