// 开发期小工具：把 SRT 跑一遍分段 + 打分，打印成表让人肉眼看合不合理。
//
// 为什么需要它：分段参数（最短/最长/权重）只能靠看真实结果调。
// 直接看 plan.json 太抽象，先看「切成几段、每段讲了什么、打了什么分」。

import { readFileSync } from "node:fs";
import { parseSrt, srtDuration } from "./parse-srt";
import { segment } from "./segment";
import { scoreLayouts, topTwo } from "./score";
import { DEFAULT_OPTIONS } from "./types";

const path = process.argv[2];
if (!path) {
  console.error("用法: node segment-preview.js <file.srt> [minSec] [maxSec]");
  process.exit(2);
}
const raw = readFileSync(path, "utf8");
const { lines, warnings } = parseSrt(raw);
const opt = { ...DEFAULT_OPTIONS };
if (process.argv[3]) opt.targetShotSec = [Number(process.argv[3]), Number(process.argv[4] ?? 16)];

console.log("");
console.log(`SRT: ${lines.length} 行, 总时长 ${srtDuration(lines).toFixed(2)}s`);
if (warnings.length) {
  console.log(`解析警告 ${warnings.length} 条:`);
  warnings.slice(0, 5).forEach((w) => console.log("  - " + w));
}

const segs = segment(lines, opt);
console.log(`\n切成 ${segs.length} 个镜头 (目标 ${opt.targetShotSec[0]}~${opt.targetShotSec[1]}s)`);
console.log("=".repeat(104));
let total = 0;
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  const dur = s.end - s.start;
  total += dur;
  const sc = scoreLayouts(s.features);
  const { best, bestScore, second, secondScore } = topTwo(sc);
  const f = s.features;
  console.log(
    `#${String(i + 1).padStart(2)}  ${s.start.toFixed(1).padStart(6)}s +${dur.toFixed(1).padStart(5)}s  ` +
      `行${String(s.from).padStart(2)}-${String(s.to - 1).padStart(2)}  ` +
      `数字${f.numDensity.toFixed(1)} 年${f.dateCount} 码${f.codeDensity.toFixed(1)} 枚${f.enumCount} 地${f.placeCount}  ` +
      `-> ${best}(${bestScore.toFixed(1)}) / ${second}(${secondScore.toFixed(1)})`,
  );
  console.log(`     ${s.text.slice(0, 60)}${s.text.length > 60 ? "…" : ""}`);
}
console.log("=".repeat(104));
console.log(`合计 ${total.toFixed(2)}s`);
const fam: Record<string, number> = {};
for (const s of segs) {
  const { best } = topTwo(scoreLayouts(s.features));
  fam[best] = (fam[best] ?? 0) + 1;
}
console.log("最佳版式分布:", fam);
