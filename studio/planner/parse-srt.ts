// SRT 解析。
//
// 坑（都在真文件上遇过）：
//   · UTF-8 BOM —— 第一个时间码前面多一个 0xFEFF，正则匹配不上
//   · CRLF —— 用 \n 切块会把 \r 留在正文末尾
//   · 多行字幕 —— 一条字幕可以有多行正文
//   · 序号跳号/重复 —— 不能拿来当主键，必须自己重排
//   · 时间码用逗号或点 —— 两种都要认
//   · 时长归零/倒挂 —— 必须报错，不许静默生成一个负时长镜头

import type { SrtLine } from "./types";

export type ParseResult = {
  lines: SrtLine[];
  warnings: string[];
};

const TIME = /(-?\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(-?\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

function toSec(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

export function parseSrt(raw: string): ParseResult {
  const warnings: string[] = [];
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n\s*\n/);

  const lines: SrtLine[] = [];
  for (const block of blocks) {
    const m = TIME.exec(block);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    const body = block.slice(m.index + m[0].length).replace(/\n+/g, " ").trim();
    if (!body) {
      warnings.push(`时间码 ${start.toFixed(2)}s 处字幕正文为空，已跳过`);
      continue;
    }
    if (end <= start) {
      warnings.push(`时间码 ${start.toFixed(2)}s 处结束不晚于开始（${end.toFixed(2)}s），已跳过`);
      continue;
    }
    lines.push({ index: lines.length, start, end, text: body });
  }

  lines.sort((a, b) => a.start - b.start);

  // 重叠与空洞检查（重叠会导致镜头边界对不上，必须报出来）
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].start - lines[i - 1].end;
    if (gap < -0.001) {
      warnings.push(
        `第 ${i} 行与上一行重叠 ${(-gap).toFixed(2)}s（${lines[i].start.toFixed(2)}s），已按开始时间排序`,
      );
    }
  }
  if (lines.length === 0) warnings.push("没有任何可用字幕行");

  return { lines, warnings };
}

/** 总时长（最后一行结束 - 第一行开始） */
export function srtDuration(lines: SrtLine[]): number {
  if (!lines.length) return 0;
  return lines[lines.length - 1].end - lines[0].start;
}
