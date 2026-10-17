// M3 CLI：SRT -> plan.json（可直接喂给 render-batch.ps1）
//
//   node studio/planner/plan.js --srt studio/shots/sample.srt --out out/film/plan.json
//
// 输出两份：
//   plan.json  给渲染器
//   plan.md    给人看的规划表（分段、版式、主题、warnings）

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";
import { parseSrt, srtDuration } from "./parse-srt";
import { segment } from "./segment";
import { scoreLayouts, topTwo } from "./score";
import { solve } from "./solve";
import { deriveContent } from "./derive";
import { loadRegistry, pickEnvironment } from "./environments";
import { supportedLayouts } from "./features";
import { DEFAULT_OPTIONS } from "./types";
import type { Plan, PlannedShot, Warning, PlannerOptions } from "./types";

type Argv = Record<string, string | boolean>;

function parseArgv(argv: string[]): Argv {
  const out: Argv = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgv(process.argv);
const srtPath = typeof args.srt === "string" ? args.srt : "studio/shots/sample.srt";
const outPath = typeof args.out === "string" ? args.out : "out/film/plan.json";
const platesPath = typeof args.plates === "string" ? args.plates : "studio/plates.json";
const fps = Number(args.fps ?? 30);

const opt: PlannerOptions = {
  ...DEFAULT_OPTIONS,
  seed: args.seed ? Number(args.seed) : DEFAULT_OPTIONS.seed,
};
if (args["min-shot"] || args["max-shot"]) {
  opt.targetShotSec = [
    args["min-shot"] ? Number(args["min-shot"]) : opt.targetShotSec[0],
    args["max-shot"] ? Number(args["max-shot"]) : opt.targetShotSec[1],
  ];
}

// ---- 1. 解析 ----
const raw = readFileSync(srtPath, "utf8");
const parsed = parseSrt(raw);
if (!parsed.lines.length) {
  console.error("SRT 里没有可用字幕行");
  process.exit(2);
}
const totalSec = srtDuration(parsed.lines);

// ---- 2. 分段 ----
const segs = segment(parsed.lines, opt);

// ---- 3. 求解 ----
const solved = solve(segs, opt);

// ---- 4. 派生内容 + 组装 ----
const warnings: Warning[] = [];
const reg = loadRegistry(platesPath);
const shots: PlannedShot[] = [];
const base = parsed.lines[0].start;

if (solved.assigns.length !== segs.length) {
  console.error(
    `求解结果不完整：${segs.length} 段只排了 ${solved.assigns.length} 个镜头。` +
      `这会导致成片少掉 ${(((segs.length - solved.assigns.length) / segs.length) * 100).toFixed(0)}% 的内容，拒绝输出。`,
  );
  process.exit(3);
}

for (let i = 0; i < segs.length; i++) {
  const seg = segs[i];
  const a = solved.assigns[i];
  const shotId = `s${String(i + 1).padStart(2, "0")}-${a.layout}-v${a.variant}`;
  const warn = (kind: string, detail: string) => warnings.push({ shotId, kind, detail });

  // 上下文：本段前后各 2 段。doc 版式需要足够多的字才不会循环重复
  const ctxFrom = Math.max(0, i - 2);
  const ctxTo = Math.min(segs.length, i + 3);
  const context = segs.slice(ctxFrom, ctxTo).map((x) => x.text).join("");
  const content = deriveContent(a.layout, seg.text, seg.start - base, warn, context);
  const envEntry = pickEnvironment(reg, a.layout, a.theme, i);
  const durationInFrames = Math.max(1, Math.round((seg.end - seg.start) * fps));

  const sc = scoreLayouts(seg.features);
  const { best, bestScore, second, secondScore } = topTwo(sc);

  shots.push({
    id: shotId,
    durationInFrames,
    fps: fps as 30 | 60,
    layout: a.layout,
    variant: a.variant,
    theme: a.theme,
    env: envEntry.env,
    content,
    overlay: undefined,
    _plan: {
      srtFrom: seg.from,
      srtTo: seg.to,
      layoutScore: Math.round(sc[a.layout] * 10) / 10,
      runnerUp: { layout: second, score: Math.round(secondScore * 10) / 10 },
    },
  });
  void best;
  void bestScore;
}

// ---- 5. 强调层：只有段落首镜头和最后一个镜头 ----
// 全片每个镜头都弹字会很单调（M3-DESIGN §4.5）
const wantOverlay = new Set<number>();
const ratio = opt.overlayRatio;
const target = Math.max(2, Math.round(shots.length * ((ratio[0] + ratio[1]) / 2)));
const step = Math.max(2, Math.floor(shots.length / target));
for (let i = 0; i < shots.length; i += step) wantOverlay.add(i);
wantOverlay.add(shots.length - 1);
for (const i of Array.from(wantOverlay)) {
  if (i >= shots.length) continue;
  const s = shots[i];
  const c = s.content as { heading?: string };
  const text = segs[i]?.text ?? "";
  const first = (text.split(/[。！？!?；;]/)[0] ?? text).trim();
  s.overlay = {
    kicker: `${i === shots.length - 1 ? "小结" : "第 " + (i + 1) + " 段"}`,
    title: Array.from(first).slice(0, 14).join(""),
    bullets: (s.content as { paragraphs?: string[] }).paragraphs?.slice(1, 3).map((p) => Array.from(p).slice(0, 18).join("")),
    enterAt: undefined,
  };
  void c;
}

// ---- 6. 报告 ----
const layouts: Record<string, number> = {};
const themes: Record<string, number> = {};
for (const s of shots) {
  layouts[s.layout] = (layouts[s.layout] ?? 0) + 1;
  themes[s.theme] = (themes[s.theme] ?? 0) + 1;
}
const wholeText = parsed.lines.map((l) => l.text).join("");
const supported = supportedLayouts(wholeText, ["doc", "chart", "code", "map", "timeline", "cards"]);
const plan: Plan = {
  shots,
  report: {
    totalSec,
    shotCount: shots.length,
    layouts,
    themes,
    overlayCount: shots.filter((s) => s.overlay).length,
    supportedFamilies: supported.length,
    warnings,
    violations: solved.violations,
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf8");

// ---- 7. 人看的规划表 ----
const lines: string[] = [];
lines.push(`# 分镜规划  ·  ${basename(srtPath)}`);
lines.push("");
lines.push(`- 字幕 ${parsed.lines.length} 行 / 总时长 ${totalSec.toFixed(2)}s`);
lines.push(`- 切成 ${shots.length} 个镜头（目标 ${opt.targetShotSec[0]}~${opt.targetShotSec[1]}s）`);
lines.push(`- 版式分布 ${JSON.stringify(layouts)}`);
lines.push(`- 主题分布 ${JSON.stringify(themes)}`);
lines.push(`- 强调层 ${plan.report.overlayCount} 个镜头（${((plan.report.overlayCount / shots.length) * 100).toFixed(0)}%）`);
lines.push(`- 这份文案能支持的版式族 ${supported.length} 个：${supported.join("/")}`);
lines.push(`- 硬约束违规 ${solved.violations.length} 条；为凑满版式族调整 ${solved.familyFixups} 次`);
if (solved.violations.length) for (const v of solved.violations) lines.push(`  - ⚠ ${v}`);
lines.push("");
lines.push("| # | 起 | 时长 | 行 | 版式 | 变体 | 主题 | 环境 | 得分 | 次选 |");
lines.push("|---|---|---|---|---|---|---|---|---|---|");
for (let i = 0; i < shots.length; i++) {
  const s = shots[i];
  const seg = segs[i];
  lines.push(
    `| ${i + 1} | ${seg.start.toFixed(1)}s | ${(seg.end - seg.start).toFixed(1)}s | ${seg.from}-${seg.to - 1} | ` +
      `${s.layout} | ${s.variant} | ${s.theme} | ${(s.env.src || "").replace("plates/", "").replace(".png", "")} | ` +
      `${s._plan?.layoutScore ?? 0} | ${s._plan?.runnerUp.layout} ${s._plan?.runnerUp.score} |`,
  );
}
if (warnings.length) {
  lines.push("");
  lines.push(`## 需要人审的派生（${warnings.length} 条）`);
  for (const w of warnings.slice(0, 40)) lines.push(`- \`${w.shotId}\` ${w.kind}: ${w.detail}`);
}
const mdPath = outPath.replace(/\.json$/, ".md");
writeFileSync(mdPath, lines.join("\n"), "utf8");

console.log(`plan   -> ${outPath}`);
console.log(`table  -> ${mdPath}`);
console.log(`镜头 ${shots.length}  违规 ${solved.violations.length}  warnings ${warnings.length}`);
if (solved.violations.length) {
  for (const v of solved.violations.slice(0, 10)) console.log("  ! " + v);
  process.exit(1);
}
