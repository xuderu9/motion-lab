// 视觉分配 —— 决定每个镜头「用哪个版面族 + 哪种呈现方式」。
//
// 为什么单独一层：规划器原来只会按文案内容选 doc/chart/code/map/timeline/cards，
// 那六个是「内容结构」。而 page/panel/mix/space 是**呈现风格**，
// 它们吃同样的内容，只是排布和运镜不同。
//
// 所以这里做两件事：
//   1. 内容信号强（有真数据/真地名/真时间轴）就保留原生版式，信息更准
//   2. 否则套一个呈现风格，并保证：相邻不同族、族数 ≥4、screen 只用来定场
//
// 全部确定性：同一个 seed 出同一个结果，便于复现和验收。

import type { CardsContent, LayoutContent, LayoutName, Presentation } from "../shot/types";
import type { Segment } from "./types";

/** 「内容型」版式：信息结构强，优先级最高 */
const NATIVE: LayoutName[] = ["chart", "timeline", "map", "code"];
/** 「风格型」版式：吃任意内容，负责画面多样性和空间感 */
const STYLE: LayoutName[] = ["page", "panel", "mix", "space"];

/** 把任意内容压成卡片，供风格型版式使用 */
export function toCards(content: LayoutContent, heading: string, subtitle?: string): CardsContent {
  const clip = (s2: string, n: number) => {
    const a = Array.from((s2 ?? "").replace(/\s+/g, "").trim());
    return a.length <= n ? a.join("") : a.slice(0, n).join("");
  };
  const cards: CardsContent["cards"] = [];
  switch (content.kind) {
    case "cards":
      content.cards.forEach((c) => cards.push(c));
      break;
    case "doc":
      content.paragraphs.forEach((p, i) => cards.push({ title: clip(p, 8), body: clip(p.slice(8), 18), tag: `0${i + 1}` }));
      break;
    case "chart":
      content.series.forEach((s2) => cards.push({ title: clip(s2.label, 8), body: "", tag: "", value: String(s2.value) }));
      break;
    case "timeline":
      content.events.forEach((e) => cards.push({ title: clip(e.title, 8), body: clip(e.body ?? "", 18), tag: clip(e.time, 6) }));
      break;
    case "code":
      content.code.slice(0, 8).forEach((l) => cards.push({ title: clip(l.trim(), 16), body: "", tag: "CODE" }));
      break;
    case "map":
      content.places.forEach((p) => cards.push({ title: clip(p.name, 8), body: clip(p.note ?? "", 14), tag: "PLACE" }));
      break;
    default:
      cards.push({ title: clip(heading, 8), body: "", tag: "" });
  }
  // 卡片数量控制在 3~8 张：太少画面空，太多读不过来
  while (cards.length < 3) cards.push({ title: `要点 ${cards.length + 1}`, body: "", tag: "" });
  return { kind: "cards", heading: clip(heading, 12), subtitle, cards: cards.slice(0, 8), tags: [] };
}

export type VisualChoice = { layout: LayoutName; variant: 0 | 1 | 2 | 3 | 4 | 5; presentation: Presentation };

/**
 * 给整片分配视觉。
 *
 * @param segs       分段
 * @param nativePick 求解器给出的「内容型」选择（每段一个）
 * @param strong     该段内容信号是否足够强（强则保留原生版式）
 * @param seed       随机种子
 */
export function assignVisuals(
  segs: Segment[],
  nativePick: LayoutName[],
  strong: boolean[],
  seed = 20261019,
): VisualChoice[] {
  const n = segs.length;
  const out: VisualChoice[] = new Array(n);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ── 比例铁律 ──
  // 老的原生版式（doc/chart/code/map/timeline/cards）是按 1600×1200 = 4:3 写的。
  // 直接放进 1920×1080 的整帧，要么被裁要么留边，等于「把 4:3 硬拉成 16:9」——
  // 用户明确不要这个。
  // 所以：**原生版式只出现在 screen（平板屏幕，本来就是 4:3）**；
  // 整帧/浮层一律用天生 16:9 的风格族（page/panel/mix/space）。
  const MAX_SCREEN = Math.max(2, Math.ceil(n / 4));

  let screenUsed = 0;
  for (let i = 0; i < n; i++) {
    const nat = nativePick[i];
    const canNative =
      strong[i] && NATIVE.includes(nat) && screenUsed < MAX_SCREEN && i % 3 !== 0;
    if (canNative) {
      out[i] = { layout: nat, variant: Math.floor(rnd() * 3) as 0 | 1 | 2, presentation: "screen" };
      screenUsed++;
    }
  }

  // 其余走风格族：轮转 + 相邻不同族
  const counts: Record<string, number> = {};
  let cursor = Math.floor(rnd() * STYLE.length);
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    let fam = STYLE[cursor % STYLE.length];
    if (i > 0 && out[i - 1] && out[i - 1].layout === fam) {
      cursor++;
      fam = STYLE[cursor % STYLE.length];
    }
    const maxV = fam === "mix" || fam === "space" ? 6 : 3;
    const v = Math.floor(rnd() * maxV) as 0 | 1 | 2 | 3 | 4 | 5;
    out[i] = { layout: fam, variant: v, presentation: "full" };
    counts[fam] = (counts[fam] ?? 0) + 1;
    cursor++;
  }

  // 至少一次浮层（即梦底板 + 透明内容），给质感层次
  if (!out.some((o) => o.presentation === "overlay") && n >= 5) {
    const i = Math.floor(n * 0.62);
    out[i] = { ...out[i], presentation: "overlay", layout: "mix", variant: 1 };
  }

  return out;
}
