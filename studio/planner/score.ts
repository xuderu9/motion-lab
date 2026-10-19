// 版式打分：这段在说什么，适合哪种版面。
//
// 公式来自 M3-DESIGN §4.2。权重是「先验」，可以在真文案上回归调整，
// 但改之前先跑一遍 sample.srt 看分布，不要凭感觉调。
//
// 设计意图：
//   · 有年份 → timeline（时间刻度是它唯一擅长的东西）
//   · 有地名 → map（错认会画出假地图，所以词表宁可小）
//   · 有数字/百分比 → chart
//   · 有标识符/英文缩写 → code
//   · 有枚举连词（第一/第二/首先）→ cards
//   · 都没有 → doc（兜底分 0.6，永远可选）

import type { Features, LayoutName } from "./types";

export type ScoreMap = Record<LayoutName, number>;

/** 密度封顶：不封顶的话一段数字密集的话会把所有镜头都抢成 chart（实测过） */
const CAP = { num: 3, code: 3, enum: 6 };

export function scoreLayouts(f: Features): ScoreMap {
  const num = Math.min(f.numDensity, CAP.num);
  const code = Math.min(f.codeDensity, CAP.code);
  const en = Math.min(f.enumCount, CAP.enum);
  return {
    chart: 2.0 * num + 0.5 * en,
    timeline: 2.5 * f.dateCount + 0.3 * num,
    map: 2.5 * f.placeCount,
    code: 2.5 * code,
    cards: 1.8 * en + 0.4 * num,
    doc: 0.6,
    // 四个全屏版式（title/stat/quote/atmosphere）**不按文案内容打分**：
    // 它们是「这一段该用什么节奏」的问题，由规划器的角色分配决定（见 M5 设计）。
    // 这里恒为 0，配合 supportsLayout() 里恒 false，保证它们不会被内容打分选中。
    title: 0,
    stat: 0,
    quote: 0,
    atmosphere: 0,
    page: 0.6,
    panel: 0.6,
  };
}

/** 按分数排序，返回 (最佳, 次佳) */
export function topTwo(scores: ScoreMap): { best: LayoutName; bestScore: number; second: LayoutName; secondScore: number } {
  const entries = (Object.keys(scores) as LayoutName[])
    .map((k) => ({ k, v: scores[k] }))
    .sort((a, b) => b.v - a.v);
  return {
    best: entries[0].k,
    bestScore: entries[0].v,
    second: entries[1].k,
    secondScore: entries[1].v,
  };
}

/**
 * 候选集：得分在最佳值的 80% 以上都算合格候选。
 * 只给一个候选会让约束求解必然无解；给太多会把内容硬塞进不合适的版式。
 */
export function candidates(scores: ScoreMap): LayoutName[] {
  // doc 永远是合法候选：它能把任意一段散文渲染成阅读页。
  // 其它版式需要能派生出结构（数字/日期/地名/代码/枚举），派生不出来就不能选。
  const ok = (Object.keys(scores) as LayoutName[]).filter(
    (k) => k === "doc" || scores[k] > 0.6 + 1e-9,
  );
  return ok.length ? ok : ["doc"];
}
