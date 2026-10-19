// 分段：SRT 行 → 镜头边界。
//
// 核心判断（M3-DESIGN §4.1）：**不要把一行字幕当一个镜头。**
// 175 秒 40 行字幕，1:1 切会得到 40 个 4.4 秒镜头；版式的页面滚动、图表呼吸
// 全都来不及发挥，而且帧差会假性通过（每次切换都是一次大变化）。
// 参考片 161 秒只有 11 次硬切，平均镜头 14 秒。
//
// 断点必须落在**行边界**上，不允许切断一条字幕。相邻镜头首尾相接，不留空洞。

import { extractFeatures } from "./features";
import type { Segment, SrtLine, PlannerOptions } from "./types";

/** 行尾标点权重：句末最强，逗号最弱 */
function punctWeight(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const last = t[t.length - 1];
  if ("。！？!?".includes(last)) return 1.0;
  if ("；;".includes(last)) return 0.8;
  if ("，,、".includes(last)) return 0.3;
  if (":：".includes(last)) return 0.5;
  return 0;
}

/** 本行之后到下一行之间的停顿，>0.4s 记满分 */
function pauseWeight(lines: SrtLine[], i: number): number {
  if (i + 1 >= lines.length) return 1.0; // 片尾一定是好断点
  const gap = lines[i + 1].start - lines[i].end;
  return Math.max(0, Math.min(1, gap / 0.4));
}

/**
 * 语义切换信号：本镜头累计特征与下一行的差异。
 * 数字/日期突然密集或突然消失，通常意味着换了个话题。
 */
function shiftWeight(cur: { num: number; date: number; code: number }, nextText: string): number {
  const f = extractFeatures(nextText);
  const d =
    Math.abs(f.numDensity - cur.num) / Math.max(1, cur.num + f.numDensity) +
    Math.abs(f.dateCount - cur.date) / Math.max(1, cur.date + f.dateCount) +
    Math.abs(f.codeDensity - cur.code) / Math.max(1, cur.code + f.codeDensity);
  return Math.min(1, d / 2);
}

export function segment(lines: SrtLine[], opt: PlannerOptions): Segment[] {
  if (!lines.length) return [];
  const [minSec, maxSec] = opt.targetShotSec;
  const segs: Segment[] = [];
  let s = 0;

  while (s < lines.length) {
    const start = lines[s].start;
    let bestCut = -1;
    let bestScore = -1;
    let e = s;
    let acc = { num: 0, date: 0, code: 0 };

    for (; e < lines.length; e++) {
      const f = extractFeatures(lines[e].text);
      acc = {
        num: acc.num + f.numDensity,
        date: acc.date + f.dateCount,
        code: acc.code + f.codeDensity,
      };
      const dur = lines[e].end - start;
      if (dur >= maxSec) break;
      if (dur >= minSec) {
        const score =
          0.55 * punctWeight(lines[e].text) +
          0.3 * pauseWeight(lines, e) +
          0.15 * shiftWeight(acc, lines[e + 1]?.text ?? "");
        if (score > bestScore) {
          bestScore = score;
          bestCut = e;
        }
      }
    }

    // 超过上限还没选到断点：就在上限处断（不能无限延长）
    let cut = bestCut;
    if (cut < 0) cut = Math.min(e, lines.length - 1);
    if (cut < s) cut = s;

    // 镜头区间 = [lines[s].start, 下一段起点)，这样相邻镜头首尾相接、无空洞
    const nextStart = cut + 1 < lines.length ? lines[cut + 1].start : lines[cut].end;
    const text = lines
      .slice(s, cut + 1)
      .map((l) => l.text)
      .join("");
    const features = extractFeatures(text);
    segs.push({
      from: s,
      to: cut + 1,
      start,
      end: nextStart,
      text,
      features,
      // scores 由 score.ts 填；这里先给空壳，保持类型完整
      scores: { doc: 0, chart: 0, code: 0, map: 0, timeline: 0, cards: 0,
                 title: 0, stat: 0, quote: 0, atmosphere: 0, page: 0, panel: 0 },
    });
    s = cut + 1;
  }

  return segs;
}
