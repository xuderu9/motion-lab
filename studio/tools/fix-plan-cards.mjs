// 一次性迁移：把已有 plan 里「标题=正文前 10 字+省略号」的卡片修成「标点处断开」。
//
// 背景：`studio/planner/derive.ts` 的 buildCards 以前用 `titleOf(s,10)` 生成标题，
// 于是卡片上出现「从这一刻起，它不再是…」，而正文又是同一句的全文 —— 标题读不通、
// 且与正文重复。derive.ts 已修，但已经生成的 plan.json 不会自动变，所以补这个脚本。
//
// 用法：node studio/tools/fix-plan-cards.mjs <in.json> <out.json>
// 只改 content.kind === "cards" 的 title/body/value，其余字段原样保留。

import { readFileSync, writeFileSync } from "node:fs";

const CARD_BREAK = /[，,、：:；;]/;

function cardHead(s) {
  const chars = Array.from(String(s ?? "").replace(/[。！？!?]+$/, ""));
  const idx = chars.findIndex((c) => CARD_BREAK.test(c));
  if (idx >= 3 && idx <= 18) {
    const title = chars.slice(0, idx).join("");
    const body = chars.slice(idx + 1).join("").trim();
    if (Array.from(body).length >= 4) return { title, body };
    return { title: chars.join(""), body: "" };
  }
  return { title: chars.slice(0, 24).join(""), body: "" };
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: node fix-plan-cards.mjs <in.json> <out.json>");
  process.exit(2);
}

const plan = JSON.parse(readFileSync(inPath, "utf8"));
let changed = 0;

for (const shot of plan.shots ?? []) {
  const c = shot.content;
  if (!c || c.kind !== "cards") continue;
  for (const card of c.cards ?? []) {
    const title = String(card.title ?? "");
    const body = String(card.body ?? "");
    const trunc = /…$/.test(title);
    const bodyLonger = Array.from(body).length > Array.from(title).length;

    // ① 标题是被截断的正文 → 在标点处重切
    if (trunc && bodyLonger) {
      const h = cardHead(body);
      card.title = h.title;
      card.body = h.body;
      card.value = "";
      changed++;
      continue;
    }

    // ② 正文以标题开头 → 去掉重复部分（「2 · 第二个代价是可复现性。」这种）
    const stem = title.replace(/…$/, "");
    if (stem && body.startsWith(stem) && Array.from(body).length > Array.from(stem).length) {
      const rest = body.slice(stem.length).replace(/^[，,、：:；;。\s]+/, "").trim();
      card.body = rest;
      card.value = "";
      // 正文除了标点什么都不剩 → 标题把省略号去掉，别留一个「…」在卡上
      if (!rest) card.title = stem;
      changed++;
      continue;
    }

    // ③ 正文和标题几乎一样 → 正文清空，别在卡上重复同一句话
    if (stem && (body === stem || body === stem + "。")) {
      card.title = stem;
      card.body = "";
      if (/^\d+$/.test(String(card.value ?? ""))) card.value = "";
      changed++;
      continue;
    }

    // ④ 值只是序号（"1"/"2"…）且旁边有正文 → 去掉序号前缀
    if (/^\d+$/.test(String(card.value ?? "")) && body) {
      card.value = "";
      changed++;
    }
  }
}

writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf8");
console.log(`cards fixed: ${changed}  -> ${outPath}`);
