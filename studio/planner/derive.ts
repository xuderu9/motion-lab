// 内容派生：把一段散文变成某个版式要的结构化数据。
//
// 铁律（M3-DESIGN §4.4 / 陷阱 3）：**不许静默编造。**
// 派生失败一律进 warnings，人类审的时候看这一栏。
// 版式里没有数字却画出一条像样的折线，观众会问「这数据哪来的」——那比空着更糟。

import {
  extractNumbers,
  extractDates,
  extractEnumerations,
  chineseToNumber,
  PLACES,
} from "./features";
import type {
  LayoutContent,
  LayoutName,
  ChartContent,
  DocContent,
  CodeContent,
  MapContent,
  TimelineContent,
  CardsContent,
} from "../shot/types";
import type { Warning } from "./types";

/** 句末切分，尽量只在标点处断，不切断词语 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;])/)
    .map((s) => s.trim())
    .filter((s) => Array.from(s).length >= 4);
}

/** 取一段文字的「标题」：第一个短句，超长则截断 */
function titleOf(text: string, max = 18): string {
  const first = sentences(text)[0] ?? text;
  const chars = Array.from(first);
  if (chars.length <= max) return first.replace(/[。！？!?；;，,]$/, "");
  return chars.slice(0, max).join("") + "…";
}

/** 数字序列 → chart 的 series；不足 3 条时用占位并报 warning */
function chartSeries(text: string, warn: (kind: string, detail: string) => void): { label: string; value: number }[] {
  const nums = extractNumbers(text, 8).filter((n) => Number.isFinite(n.value));
  if (nums.length >= 3) return nums;
  // 中文量词里的数字也试一遍（「三倍 / 三十个」这类没被 extractNumbers 抓到时）
  const cn: { label: string; value: number }[] = [];
  // 前缀字符集必须排除数字本身，否则「写两百行」会被拆成「写两」+「百」+「行」，
  // chineseToNumber("百") 单独解析就会得到 100 而不是 200 的误读（实测出现过 =0）
  const re = /([^一二三四五六七八九十两百千万\s]{0,4})([一二三四五六七八九十两百千万]+)(个|次|倍|分钟|小时|天|月|行|条|处|段)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && cn.length < 8) {
    const v = chineseToNumber(m[2]);
    if (v !== null) cn.push({ label: (m[1] || "").trim() || `第${cn.length + 1}项`, value: v });
  }
  if (cn.length >= 3) return cn;
  const got = [...nums, ...cn];
  if (got.length >= 2) return got;
  warn("chart.series", `只抽到 ${got.length} 个数字，series 用占位数据`);
  return [
    { label: "样本一", value: 42 },
    { label: "样本二", value: 58 },
    { label: "样本三", value: 71 },
    { label: "样本四", value: 64 },
  ];
}

function buildChart(text: string, warn: (k: string, d: string) => void): ChartContent {
  const series = chartSeries(text, warn);
  const first = series[0];
  const last = series[series.length - 1];
  const delta = first.value !== 0 ? ((last.value - first.value) / Math.abs(first.value)) * 100 : 0;
  const pct = text.match(/(\d+(?:\.\d+)?)\s*[%％]/);
  // 没有百分比时，用系列里最大的那个数当头条 —— 比「首项」有意义
  const biggest = series.reduce((a, b) => (b.value > a.value ? b : a), series[0]);
  const mode = series.length >= 8 ? "bars" : "line";
  return {
    kind: "chart",
    heading: titleOf(text),
    subtitle: firstSentence(text, 26),
    metric: {
      label: pct ? "关键比率" : biggest.label,
      value: pct ? Number(pct[1]) : biggest.value,
      delta: Math.round(delta * 10) / 10,
      unit: pct ? "%" : undefined,
    },
    series,
    mode,
    badge: series.length >= 3 ? "实时" : "示意",
  };
}

function firstSentence(text: string, max = 26): string {
  const s = sentences(text)[0] ?? text;
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("") + "…";
}

function buildDoc(text: string): DocContent {
  const ps = sentences(text);
  const paragraphs = ps.length ? ps : [text];
  return {
    kind: "doc",
    heading: titleOf(text),
    subtitle: `${paragraphs.length} 段 · 约 ${Math.round(Array.from(text).length / 4)} 秒`,
    breadcrumb: "讲稿 / 本段",
    paragraphs,
    // 不要再自己加「1. 2. 3.」——版式本身已经画了序号，会变成「01 1. 先说数据」
    outline: paragraphs.slice(0, 6).map((p) => titleOf(p, 10)),
    tags: paragraphs.slice(0, 6).map((p) => titleOf(p, 5)),
  };
}

function buildCards(text: string, warn: (k: string, d: string) => void): CardsContent {
  let items = extractEnumerations(text);
  if (items.length < 3) {
    items = sentences(text);
    if (items.length < 3) warn("cards.cards", `只切出 ${items.length} 张卡片，按句子硬拆`);
  }
  const cards = items.slice(0, 6).map((s, i) => ({
    title: titleOf(s, 10),
    body: Array.from(s).slice(0, 34).join(""),
    tag: ["要点", "细节", "补充", "结论", "备注", "延伸"][i % 6],
    value: String(i + 1),
  }));
  return { kind: "cards", heading: titleOf(text), subtitle: firstSentence(text, 22), cards, tags: cards.map((c) => c.tag) };
}

function buildTimeline(text: string, start: number, warn: (k: string, d: string) => void): TimelineContent {
  const dates = extractDates(text);
  const ss = sentences(text);
  if (dates.length >= 2) {
    const events = dates.slice(0, 6).map((d, i) => ({
      time: d.label,
      title: titleOf(ss[i] ?? ss[0] ?? text, 12),
      body: Array.from(ss[i] ?? "").slice(0, 28).join(""),
      tag: i === 0 ? "起点" : i === dates.length - 1 ? "终点" : "过程",
    }));
    return { kind: "timeline", heading: titleOf(text), subtitle: firstSentence(text, 22), events };
  }
  // 没有日期：用段内各句的先后当顺序
  warn("timeline.events", "本段没有日期，事件顺序按句子先后推断");
  const events = ss.slice(0, 6).map((s, i) => ({
    time: `T+${(start + i * 3).toFixed(0)}s`,
    title: titleOf(s, 12),
    body: Array.from(s).slice(0, 28).join(""),
    tag: i === 0 ? "起点" : "过程",
  }));
  return { kind: "timeline", heading: titleOf(text), subtitle: firstSentence(text, 22), events };
}

function buildCode(text: string, warn: (k: string, d: string) => void): CodeContent {
  // 只从文本里认「明显是代码/文件名」的片段；认不出就用示例并报 warning
  const tokens = Array.from(text.matchAll(/`([^`]+)`|\b([A-Z][A-Za-z0-9_]*\.(?:ts|js|json|md)|[a-z_]+_[a-z_]+)\b/g))
    .map((m) => m[1] || m[2])
    .filter(Boolean) as string[];
  const ss = sentences(text);
  if (tokens.length === 0) warn("code.code", "本段没有可识别的代码片段，代码行用示例占位");
  const code = tokens.length
    ? tokens.slice(0, 10).map((t, i) => `${"  ".repeat(i % 3)}// ${t}`)
    : ["// 示例：本段没有具体代码", "const answer = 42;", "", "export default answer;"];
  return {
    kind: "code",
    heading: titleOf(text),
    subtitle: firstSentence(text, 22),
    breadcrumb: "讲稿 / 片段",
    language: "TypeScript",
    files: tokens.length
      ? tokens.slice(0, 5).map((t, i) => ({ name: t, status: (i === 0 ? "M" : "A") as "M" | "A" }))
      : [{ name: "sample.ts", status: "M" as const }],
    code,
    terminal: ss.slice(0, 3).map((s) => "> " + Array.from(s).slice(0, 30).join("")),
    statusRight: "Ln 1, Col 1",
  };
}

function buildMap(text: string, warn: (k: string, d: string) => void): MapContent {
  const hits = PLACES.filter((p) => text.includes(p));
  if (hits.length === 0) {
    warn("map.places", "本段没有地名，地点用占位并标为推断");
    const seed = PLACES.slice(0, 3);
    return {
      kind: "map",
      heading: titleOf(text),
      subtitle: firstSentence(text, 22),
      places: seed.map((n, i) => ({ name: n, x: 0.28 + i * 0.22, y: 0.35 + (i % 2) * 0.3, note: "推断位置" })),
      routes: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
      stats: [{ label: "地点数", value: String(seed.length) }],
    };
  }
  const places = hits.slice(0, 5).map((n, i) => ({
    name: n,
    x: 0.2 + ((i * 0.31) % 0.65),
    y: 0.25 + ((i * 0.23) % 0.5),
    note: "",
  }));
  return {
    kind: "map",
    heading: titleOf(text),
    subtitle: firstSentence(text, 22),
    places,
    routes: places.slice(1).map((_, i) => ({ from: i, to: i + 1 })),
    stats: [{ label: "地点数", value: String(places.length) }],
  };
}

export function deriveContent(
  layout: LayoutName,
  text: string,
  start: number,
  warn: (kind: string, detail: string) => void,
  /** 上下文（本段 + 前后各若干段）。只给 doc 用：
   *  本段只有两句时，阅读页会不停循环同一句，看起来像渲染坏了。 */
  context?: string,
): LayoutContent {
  switch (layout) {
    case "chart":
      return buildChart(text, warn);
    case "cards":
      return buildCards(text, warn);
    case "timeline":
      return buildTimeline(text, start, warn);
    case "code":
      return buildCode(text, warn);
    case "map":
      return buildMap(text, warn);
    case "doc":
    default:
      // 优先用上下文长文，只有上下文缺失时才退回本段
      return buildDoc(context && Array.from(context).length > Array.from(text).length * 1.5 ? context : text);
  }
}

export type { Warning };
