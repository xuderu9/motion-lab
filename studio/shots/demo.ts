// 验收数据装载器。
//
// JSON 进不了 TypeScript 的类型系统，所以入口处挡一道校验（validateSpec）。
// 这里也是「只改 JSON 就能换画面」的落点 —— 组件代码一行都不动。

import rawDemo from "./demo.json";
import { validateSpec } from "../shot/types";
import type { ShotSpec } from "../shot/types";

const memo = new Map<string, ShotSpec[]>();

/** 读 demo.json 里的全部镜头，逐个校验 */
export function defineDemoShots(): ShotSpec[] {
  const cached = memo.get("demo");
  if (cached) return cached;

  const box = rawDemo as unknown as { shots?: unknown };
  if (!Array.isArray(box.shots)) {
    throw new Error("shots/demo.json 缺少 shots 数组");
  }
  const parsed = box.shots.map(validateSpec);

  const ids = new Set<string>();
  for (const s of parsed) {
    if (ids.has(s.id)) throw new Error(`shots/demo.json 里 id 重复: ${s.id}`);
    ids.add(s.id);
  }

  memo.set("demo", parsed);
  return parsed;
}

/** 按 id 取单个镜头（给 still / 调试用） */
export function shotById(id: string): ShotSpec {
  const found = defineDemoShots().find((s) => s.id === id);
  if (!found) {
    throw new Error(`找不到镜头 ${id}，可用: ${defineDemoShots().map((s) => s.id).join(", ")}`);
  }
  return found;
}
