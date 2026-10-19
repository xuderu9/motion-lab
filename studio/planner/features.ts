// 文本特征提取 —— 决定一段话适合哪种版式。
//
// 为什么用规则不用 LLM：可复现、可测、零成本、能回归。
// LLM 只作为可选精修（M3.1），不阻塞主流程。人类最终审成片，规则版够用。
//
// 每条正则都对应一种「版式擅长表达的东西」：
//   数字   -> chart 的 series / metric
//   年份   -> timeline 的事件刻度
//   地名   -> map 的地点与航线
//   标识符 -> code 的代码行
//   枚举   -> cards 的卡片序列

import type { Features } from "./types";

/** 地名词表。宁可少认，不可错认 —— 认错了会画出一张假地图。 */
const PLACES = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉", "西安", "南京",
  "苏州", "天津", "长沙", "青岛", "厦门", "合肥", "郑州", "昆明", "哈尔滨", "沈阳",
  "东京", "首尔", "新加坡", "伦敦", "巴黎", "柏林", "纽约", "旧金山", "西雅图", "波士顿",
  "中国", "美国", "日本", "德国", "英国", "法国", "印度", "巴西",
];

// 数字：阿拉伯数字全收；中文数字必须带单位才算。
// (?<!第) 排除序数 —— 否则「第二个代价 / 第三次转移」会被当成数据，
// 实测这一条就让 chart 的分数把 18 个镜头里的 13 个都抢走。
const RE_NUM =
  /\d+(?:[.,]\d+)?\s*(?:%|％|万|亿|千|百|个|次|倍|秒|分钟|小时|天|年|月|行|条|处|段)?|(?<!第)[一二三四五六七八九十两百千万]+(?:个|次|倍|分钟|小时|天|年|月|行|条|处|段|万|亿)/g;
const RE_DATE = /\d{4}\s*年|\d{1,2}\s*月\d{1,2}\s*日|\d{1,2}\s*月|第\s*\d+\s*(?:次|步|阶段|期|年|天)/g;
const RE_CODE = /`[^`]+`|\b[A-Za-z_][A-Za-z0-9_]{1,}\s*\(\)|\b[A-Za-z]+_[A-Za-z0-9_]+\b|\b[A-Z][A-Z0-9]{1,5}\b/g;
const RE_ENUM = /第[一二三四五六七八九十]+|首先|其次|再次|另外|还有|一是|二是|三是|第一，|第二，|第三，/g;

/** 中文数字转阿拉伯数字，覆盖「二十/三十/十五/两千/十几」这类口语形态 */
export function chineseToNumber(s: string): number | null {
  if (!s) return null;
  if (/^\d/.test(s)) return Number(s.replace(/[^\d.]/g, ""));
  // 十几 = 10~19 的模糊量，取中值 15
  if (s.startsWith("十几")) return 15;
  const D: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const U: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };
  let total = 0;
  let section = 0;
  let digit = 0;
  let seen = false;
  for (const ch of Array.from(s)) {
    if (ch in D) {
      digit = D[ch];
      seen = true;
    } else if (ch in U) {
      const u = U[ch];
      seen = true;
      if (u >= 10000) {
        total = (total + section + digit) * u;
        section = 0;
      } else {
        // 单位前没有数字时按 1 算：「十五」= 1×10+5、「百」= 100、「千」= 1000。
        // 原来只对「十」这样处理，于是 chineseToNumber("百") 返回 0 ——
        // 实测让图表里出现「写两 = 0」这种脏数据。
        const d = digit === 0 ? 1 : digit;
        section += d * u;
      }
      digit = 0;
    }
  }
  if (!seen && digit === 0) return null;
  return total + section + digit;
}

export function extractFeatures(text: string): Features {
  const charCount = Math.max(1, Array.from(text).length);

  // 数字：先数「带单位的数字」，单纯年份不重复计入数字密度（年份归 date）
  const years = (text.match(RE_DATE) || []).length;
  const nums = (text.match(RE_NUM) || []).length;
  const places = PLACES.reduce((n, p) => n + (text.split(p).length - 1), 0);
  const codes = (text.match(RE_CODE) || []).length;
  const enums = (text.match(RE_ENUM) || []).length;

  return {
    numDensity: ((nums - years) * 100) / charCount,
    dateCount: years,
    placeCount: places,
    codeDensity: (codes * 100) / charCount,
    enumCount: enums,
    charCount,
  };
}

/**
 * 从文本里抽数字（带上下文标签），供 chart 的 series 用。
 *
 * 标签只取紧邻数字前方的 2~4 个字 —— 取整句会出现「写两 帮你补全程序员」这种又长又重复的
 * 轴标签（第一版就是这样，渲出来 x 轴一行字重复四遍）。同名标签还要去重。
 */
export function extractNumbers(text: string, max = 8): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const re = /([\u4e00-\u9fa5A-Za-z]{0,8})?\s*(\d+(?:\.\d+)?)\s*(%|％)?/g;
  const seen = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < max) {
    const v = Number(m[2]);
    if (!isFinite(v)) continue;
    let label = (m[1] || "").trim();
    // 只留紧邻数字的 2~4 个字
    if (label.length > 4) label = label.slice(-4);
    if (label.length < 2) label = (label + "数值").slice(0, 2);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    out.push({ label: n > 1 ? `${label}${n}` : label, value: v });
  }
  return out;
}

/** 抽年份/日期，供 timeline 用 */
export function extractDates(text: string): { label: string; note: string }[] {
  const out: { label: string; note: string }[] = [];
  const re = /(\d{4}\s*年|\d{1,2}\s*月(?:\d{1,2}\s*日)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < 8) {
    out.push({ label: m[1].replace(/\s/g, ""), note: "" });
  }
  return out;
}

/** 抽枚举项，供 cards 用：按枚举连词切句 */
export function extractEnumerations(text: string): string[] {
  const parts = text.split(/(?:第[一二三四五六七八九十]+[，、,]?|首先[，、,]?|其次[，、,]?|再次[，、,]?|另外[，、,]?|还有[，、,]?|一是[，、,]?|二是[，、,]?|三是[，、,]?)/);
  return parts.map((s) => s.trim()).filter((s) => Array.from(s).length >= 4);
}

export { PLACES };

/**
 * 「这段文字能不能真的填满这个版式」。
 *
 * 这是 M3 最重要的一条护栏：**没有数据就不许画图表**。
 * 纯规则抽数字一定会抽到噪声（「第二个代价」的 2、「写两百行」的 200），
 * 与其在派生层拼命清洗，不如在候选层直接不给它这个机会。
 */
export function supportsLayout(layout: string, text: string): boolean {
  const arabic = (text.match(/\d+(?:\.\d+)?\s*(?:%|％|万|亿|倍|个|次|行|条|处|段|秒|分钟|小时|天)/g) || []).length;
  const pct = (text.match(/\d+(?:\.\d+)?\s*[%％]/g) || []).length;
  switch (layout) {
    case "chart":
      return arabic >= 3 || pct >= 2;
    case "timeline":
      return /\d{4}\s*年|\d{1,2}\s*月/.test(text);
    case "map":
      return PLACES.some((p2) => text.includes(p2));
    case "code":
      return /`[^`]+`|\b[A-Z][A-Z0-9]{1,5}\b|\b[a-z]+_[a-z]+\b/.test(text);
    case "cards":
      return /第[一二三四五六七八九十]+|首先|其次|一是|二是|另外/.test(text) || (text.match(/[。！？]/g) || []).length >= 2;
    case "title":
    case "stat":
    case "quote":
    case "atmosphere":
      // 全屏版式由「角色」决定，不由内容决定：任何一段文字都能做成标题卡/大数字卡
      return false;
    case "page":
    case "panel":
    case "mix":
      return true;
    case "doc":
      return true;
    default:
      return false;
  }
}

/** 当前文本能支持哪些版式 */
export function supportedLayouts(text: string, all: string[]): string[] {
  return all.filter((k) => supportsLayout(k, text));
}
