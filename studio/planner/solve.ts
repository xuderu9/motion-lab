// 约束求解：给定每个镜头的版式候选集，排出 layout / variant / theme。
//
// ── 第一版为什么失败（保留，别改回去）──────────────────────────────────
// 第一版用「三轴联合回溯」：每个位置同时枚举 layout × variant × theme。
// 结果 18 个镜头在第 13 个就撞上 30 万节点预算，函数被写成「超预算就 return true」，
// 于是**静默截断成 13 个镜头**，总时长 126.8s 对 175s 的字幕——少了 48 秒。
// 这是本项目最严重的一类 bug：不报错、不崩、只是悄悄少渲 1/4 的片子。
//
// ── 现在：三轴解耦 ─────────────────────────────────────────────────
// 关键观察：**「相邻不同 layout」已经把同一 layout 的出现间隔压到 ≥2**，
// 所以按出现次序轮转 variant（0,1,2,0,…）时针距至少是 3×2=6，
// 天然满足「同一 (layout,variant) 间隔 ≥4」——这条约束变成了白送的。
// 于是只需要贪心排 layout，variant 和 theme 各用一遍确定性规则即可。**零回溯。**
//
// 硬约束（M3-DESIGN §4.3）：
//   1. 相邻不同 layout      -> 贪心时排除上一个
//   2. 相邻不同 theme       -> 明暗交替
//   3. 同 (layout,variant) 间隔 ≥ gap -> 轮转后自动满足（仍会复核）
//   4. 同 theme 不连续 3 次  -> 明暗交替后自动满足
//   5. 全片 ≥4 个版式族      -> 贪心后若不达标，补一轮重排

import type { LayoutName, ThemeName, Segment, PlannerOptions } from "./types";
import { scoreLayouts, candidates } from "./score";
import { supportsLayout } from "./features";

export type Assign = { layout: LayoutName; variant: 0 | 1 | 2; theme: ThemeName };

export type SolveResult = {
  assigns: Assign[];
  violations: string[];
  /** 为达到 4 个版式族而额外调整的次数 */
  familyFixups: number;
  /** 候选集被占满、被迫改用次优版式的镜头数 */
  forced: number;
};

const LIGHT: ThemeName[] = ["light", "warm-sand"];
const DARK: ThemeName[] = ["deep-blue", "cool-teal"];
const ALL_LAYOUTS: LayoutName[] = ["doc", "chart", "code", "map", "timeline", "cards"];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function solve(segs: Segment[], opt: PlannerOptions): SolveResult {
  const rand = mulberry32(opt.seed);
  const scores = segs.map((s) => scoreLayouts(s.features));
  const cands = segs.map((s, i) => {
    // 只保留「这段文字真的填得满」的版式（doc 永远可填）
    const c = candidates(scores[i]).filter((k) => supportsLayout(k, s.text));
    // 加一点确定性抖动，打散并列
    return c
      .map((k) => ({ k, v: scores[i][k] + rand() * 1e-3 }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.k);
  });

  // ---- 阶段 1：贪心排 layout（只受「相邻不同」约束）----
  const layouts: LayoutName[] = [];
  let forced = 0;
  for (let i = 0; i < segs.length; i++) {
    const prev = i > 0 ? layouts[i - 1] : null;
    const pick = cands[i].find((k) => k !== prev);
    if (pick) {
      layouts.push(pick);
    } else {
      // 候选里全是上一个 layout：优先退到 doc，而不是「分数最高的那个」。
      // 理由：doc 能把任意散文如实渲染成阅读页；而零信号的 chart/map 要编数据——
      // 观众会问「这数据哪来的」。编内容是最贵的一种错，宁可版面朴素。
      const altPool = ALL_LAYOUTS.filter((k) => k !== "doc" && supportsLayout(k, segs[i].text));
      const alt = prev === "doc" && altPool.length ? altPool.sort((a, b) => scores[i][b] - scores[i][a])[0] : "doc";
      layouts.push(alt ?? "doc");
      forced++;
    }
  }

  // ---- 阶段 1b：族数不足时补一轮 ----
  let familyFixups = 0;
  const fam = () => new Set(layouts);
  for (let guard = 0; guard < 12 && fam().size < 4; guard++) {
    const missing = ALL_LAYOUTS.filter((k) => !fam().has(k));
    let fixed = false;
    for (const m of missing) {
      // 找一个「换成 m 之后仍有信号、且不破坏相邻不同」的位置
      for (let i = 0; i < layouts.length; i++) {
        if (scores[i][m] <= 0.6 + 1e-9) continue; // 没有任何信号，不硬塞
        if (!supportsLayout(m, segs[i].text)) continue; // 填不满，不硬塞
        if (i > 0 && layouts[i - 1] === m) continue;
        if (i + 1 < layouts.length && layouts[i + 1] === m) continue;
        if (layouts[i] === m) continue;
        layouts[i] = m;
        familyFixups++;
        fixed = true;
        break;
      }
      if (fam().size >= 4) break;
    }
    if (!fixed) break;
  }

  // ---- 阶段 2：variant 按出现次序轮转 ----
  const seen = new Map<LayoutName, number>();
  const variants = layouts.map((l) => {
    const k = seen.get(l) ?? 0;
    seen.set(l, k + 1);
    return (k % 3) as 0 | 1 | 2;
  });

  // ---- 阶段 3：明暗交替 + 同明暗内轮换 ----
  const themes: ThemeName[] = [];
  let lightIdx = 0;
  let darkIdx = 0;
  for (let i = 0; i < layouts.length; i++) {
    const prevLight = i > 0 ? LIGHT.includes(themes[i - 1]) : null;
    // 上一个亮 -> 这个暗；上一个暗 -> 这个亮；开头先亮
    const wantLight = prevLight === null ? true : !prevLight;
    const theme = wantLight ? LIGHT[lightIdx++ % LIGHT.length] : DARK[darkIdx++ % DARK.length];
    themes.push(theme);
  }

  const assigns: Assign[] = layouts.map((l, i) => ({ layout: l, variant: variants[i], theme: themes[i] }));

  // ---- 复核（不要相信构造）----
  const violations: string[] = [];
  for (let i = 1; i < assigns.length; i++) {
    if (assigns[i].layout === assigns[i - 1].layout) violations.push(`镜头 ${i} 与上一个同 layout ${assigns[i].layout}`);
    if (assigns[i].theme === assigns[i - 1].theme) violations.push(`镜头 ${i} 与上一个同 theme ${assigns[i].theme}`);
  }
  for (let i = 0; i < assigns.length; i++) {
    for (let j = Math.max(0, i - opt.minVariantGap); j < i; j++) {
      if (assigns[j].layout === assigns[i].layout && assigns[j].variant === assigns[i].variant) {
        violations.push(`镜头 ${i} 与 ${j} 同 (${assigns[i].layout},v${assigns[i].variant})，间隔 ${i - j} < ${opt.minVariantGap}`);
      }
    }
  }
  for (let i = 2; i < assigns.length; i++) {
    if (assigns[i].theme === assigns[i - 1].theme && assigns[i].theme === assigns[i - 2].theme) {
      violations.push(`镜头 ${i} 处主题 ${assigns[i].theme} 连续 3 次`);
    }
  }
  const nf = fam().size;
  // 要求的族数不能超过这份文案本身能支持的族数
  const supportedAcross = new Set<string>();
  for (const seg of segs) for (const k of ALL_LAYOUTS) if (supportsLayout(k, seg.text)) supportedAcross.add(k);
  const need = Math.min(4, supportedAcross.size);
  if (nf < need) violations.push(`只用到 ${nf} 个版式族（文案支持 ${supportedAcross.size} 个，要求 ≥${need}）`);

  return { assigns, violations, familyFixups, forced };
}

