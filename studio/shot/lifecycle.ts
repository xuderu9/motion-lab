// 编排谱（choreography）—— 让画面里的东西有寿命。
//
// 起因：`studio/MOTION-FINDINGS.md` 的实测。
// 我们的成片里 86.9% 的像素「3 秒内没变过」，三条参考片是 0.2%~11.9%。
// 这就是「像 PPT」的量化定义：**物体出现后就一直存在，直到镜头结束**。
//
// 这个文件提供两样东西：
//   1. Beat —— 带出生/死亡时间的元素时间轴（元素该死就必须不画）
//   2. slotCycle —— 网格里的**轮换**：每个槽位按自己的相位换内容，
//      换的时候旧的退出、新的进场，两者同时在动。
//      这样任何时刻画面里都有 1/3 在重排，而不是「入场一次、然后死掉」。
//
// 禁令：这里不许出现周期性整屏缩放/明暗摆动。用户明令禁止「呼吸感」，
// 而且实测证明它降不下 hold3（全局同相位的变化，3 秒尺度上仍算「没变」）。

import { clamp01, ease } from "./motion";

export type Key = { t: number; x?: number; y?: number; s?: number; a?: number; r?: number };

export type Beat = {
  /** 出生时刻（秒） */
  from: number;
  /** 死亡时刻（秒）；到点之后 `at()` 返回 null，版面必须因此不画它 */
  to: number;
  keys: Key[];
  ease?: string;
};

export type Pose = { x: number; y: number; s: number; a: number; r: number };

/** 元素在 t 时刻的姿态；不在 [from, to) 内返回 null —— 这就是「死亡」 */
export function at(beat: Beat, t: number): Pose | null {
  if (t < beat.from || t >= beat.to) return null;
  const ks = beat.keys;
  if (!ks.length) return { x: 0, y: 0, s: 1, a: 1, r: 0 };
  if (ks.length === 1) {
    const k = ks[0];
    return { x: k.x ?? 0, y: k.y ?? 0, s: k.s ?? 1, a: k.a ?? 1, r: k.r ?? 0 };
  }
  const u = (t - beat.from) / Math.max(1e-6, beat.to - beat.from);
  // 找到 u 落在哪两帧之间
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= u) i++;
  const a = ks[i];
  const b = ks[i + 1];
  const f = clamp01((u - a.t) / Math.max(1e-6, b.t - a.t));
  const e = ease(beat.ease ?? "ref", f);
  const lerp = (p: number | undefined, q: number | undefined, d: number) =>
    (p ?? d) + ((q ?? d) - (p ?? d)) * e;
  return {
    x: lerp(a.x, b.x, 0),
    y: lerp(a.y, b.y, 0),
    s: lerp(a.s, b.s, 1),
    a: lerp(a.a, b.a, 1),
    r: lerp(a.r, b.r, 0),
  };
}

export type SlotDraw<T> = {
  item: T;
  /** 0→1 正在退出；null = 稳定停留 */
  exit: number | null;
  /** 0→1 正在进入；null = 稳定停留 */
  enter: number | null;
};

/**
 * 网格槽位的轮换。
 *
 * 每个槽位有自己的相位（`slot`），所以同一时刻只有一个槽位在换，
 * 而不是整屏一起闪 —— 这正是参考片的节奏：**离散、局部、异步**。
 *
 * @param period 一个槽位多久换一次内容（秒）。2.2~2.6 与实测最接近。
 * @param ov     换内容的过渡时长（秒）。旧的和新的会重叠这么久，所以两者同时在动。
 */
export function slotCycle<T>(
  items: T[],
  t: number,
  slot: number,
  slots: number,
  period = 2.4,
  ov = 0.7,
): SlotDraw<T>[] {
  const n = items.length;
  if (n === 0) return [];
  // 槽位相位错开：slots 个槽位在一个周期内均匀分布
  const u = t + (slot * period) / Math.max(1, slots);
  const b = Math.floor(u / period);
  const local = u - b * period;
  const pick = (k: number) => items[((k % n) + n) % n];
  const inStart = Math.max(1e-6, period - ov);

  if (local < inStart) {
    return [{ item: pick(b), exit: null, enter: null }];
  }
  const q = clamp01((local - inStart) / ov);
  return [
    { item: pick(b), exit: q, enter: null },
    { item: pick(b + 1), exit: null, enter: q },
  ];
}

/**
 * 一次性列表的轮换（不是网格）：每 period 秒换一批，批次之间重叠 ov。
 * 用于「一列条目」「一条缩略图带」。
 */
export function bandCycle<T>(
  items: T[],
  t: number,
  period = 2.4,
  ov = 0.7,
): { item: T; i: number; enter: number | null; exit: number | null }[] {
  const n = items.length;
  if (n === 0) return [];
  const b = Math.floor(t / period);
  const local = t - b * period;
  const inStart = Math.max(1e-6, period - ov);
  const wrap = (k: number) => ((k % n) + n) % n;
  if (local < inStart) {
    return [{ item: items[wrap(b)], i: wrap(b), enter: null, exit: null }];
  }
  const q = clamp01((local - inStart) / ov);
  return [
    { item: items[wrap(b)], i: wrap(b), enter: null, exit: q },
    { item: items[wrap(b + 1)], i: wrap(b + 1), enter: q, exit: null },
  ];
}

/** 轮换用的位移/透明度：进 S 形、出直线，配合 motion.ts 的缓动 */
export function slotTransform(d: SlotDraw<unknown>, h: number, o: { rise?: number; fade?: boolean } = {}) {
  const rise = o.rise ?? 0.16;
  if (d.exit !== null) {
    const e = ease("cubicIn", d.exit);
    return { dy: -e * h * rise, alpha: 1 - e, scale: 1 - e * 0.04 };
  }
  if (d.enter !== null) {
    const e = ease("ref", d.enter);
    return { dy: (1 - e) * h * rise, alpha: clamp01(e * 1.6), scale: 0.96 + 0.04 * e };
  }
  return { dy: 0, alpha: 1, scale: 1 };
}
