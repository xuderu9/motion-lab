// 环境注册表。
//
// 一间片子用哪几个环境，写在 studio/plates.json 里；规划器只消费，不硬编码。
// 人类改这一个文件就能换整片的场景基调（夜景桌面 / 白天窗边 / 黄昏书房 / 明亮办公室）。
//
// 每个环境的 quad / exposure 都是实测推导出来的（见 out/plates-work/PLATE-SPEC.md），
// 不是手调的。换板子请跑 studio/tools/plate-prep.ps1 重新生成。

import { readFileSync } from "node:fs";
import type { EnvSpec } from "../shot/types";

export type EnvironmentEntry = {
  name: string;
  /** 中文名，规划报告里给人看 */
  label: string;
  /** 适合的版式族；空 = 通用 */
  prefer?: string[];
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
 * 规则：优先选「标了适合这个版式」的环境；同优先级里轮换，避免整片只用一间屋。
 */
export function pickEnvironment(reg: PlateRegistry, layout: string, i: number): EnvironmentEntry {
  const suited = reg.environments.filter((e) => e.prefer?.includes(layout));
  const pool = suited.length ? suited : reg.environments;
  return pool[i % pool.length];
}
