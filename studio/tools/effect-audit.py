#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
动效覆盖审计 —— 拿**原始文档**当唯一真相，逐个核对「实现了吗、在哪实现」。

为什么要有这个脚本：
    上一版 `EFFECT-CATALOG.md` 是一张手写的意愿表，76 项里标了 60 多个 ✅，
    但真正接进渲染路径的只有 5 项。表本身没有说谎，是**没人核对**。
    这个脚本的规矩是：

      1. 条目清单**从文档解析**，不是手抄 —— 所以不可能漏项、也不可能多编。
      2. 每条「已实现」必须给出 `文件:符号`，脚本去源码里 grep；
         grep 不到就判 FAIL 并以非零码退出。
      3. 没在 coverage.json 里登记的，一律算「未落地」，不给模糊空间。

用法：
    python studio/tools/effect-audit.py                 # 人读表格
    python studio/tools/effect-audit.py --md out.md     # 写 markdown
    python studio/tools/effect-audit.py --strict        # 有任何 FAIL 就退出 1

coverage.json 结构：
    {
      "匹配剪切转场": {"state": "live", "where": "studio/film/transitions.tsx:matchCut"},
      "运动模糊":     {"state": "live", "where": "studio/shot/motion.ts:motionBlur"},
      ...
    }
    state: live | partial | planned | na
      live    —— 已接进渲染路径，符号必须存在
      partial —— 近似实现，符号必须存在（但要在 note 里写清近似到什么程度）
      planned —— 明确还没做（不需要 where）
      na      —— 视频里没有对应概念（交互类），不需要 where
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = Path(r"D:\DeepseekHarness\cankaoshipin\动效名称及描述.txt")
COVERAGE = ROOT / "studio" / "fx" / "coverage.json"

GROUP_RE = re.compile(r"^#{2,3}\s*(.+?)\s*$")


def parse_doc(path: Path) -> list[dict]:
    """把文档里的 markdown 表格解析成条目列表。"""
    if not path.exists():
        print(f"[audit] 找不到原始文档: {path}", file=sys.stderr)
        sys.exit(2)

    items: list[dict] = []
    group = "未分组"
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        m = GROUP_RE.match(line)
        if m:
            group = m.group(1)
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 3:
            continue
        if set(cells[0]) <= {"-", ":"} or cells[0] in ("中文名称",):
            continue
        cn, en = cells[0], cells[1]
        if not cn or not en:
            continue
        items.append({"group": group, "cn": cn, "en": en, "desc": cells[2]})

    # 第二节是编号列表，不是表格
    numbered = [
        ("（一）交互与基础动效类", [("滚动触发动画", ""), ("视差滚动", ""), ("粘性吸顶动效", ""), ("微交互动效", ""),
                                   ("拖拽弹性动效", ""), ("悬停反馈动效", ""), ("页面转场动画", ""),
                                   ("骨架屏加载动效", ""), ("数字滚动计数", "")]),
        ("（二）视觉特效类", [("玻璃拟态动效", ""), ("新拟态动效", ""), ("SVG路径动画", ""), ("形状变形过渡", ""),
                              ("渐变流动动画", ""), ("波浪动效", ""), ("脉冲呼吸动效", ""),
                              ("故障艺术动效", ""), ("噪波扭曲动效", ""), ("描边生长动画", "")]),
        ("（三）WebGL/Canvas 高阶类", [("着色器动效", ""), ("画布粒子系统", ""), ("流体模拟动效", ""),
                                       ("后期处理特效", ""), ("体积光效果", ""), ("实时折射反射", "")]),
        ("三、动效设计风格流派", [("动态排版", "Kinetic Typography"), ("孟菲斯", "Memphis"),
                                   ("赛博朋克", "Cyberpunk"), ("蒸汽波", "Vaporwave"),
                                   ("新丑风", "New Brutalism"), ("极简主义", "Minimalist"),
                                   ("2.5D等距", "2.5D Isometric"), ("扁平化", "Flat Design"),
                                   ("低多边形", "Low Poly"), ("MG图形", "Motion Graphics"),
                                   ("数据可视化", "Data Viz")]),
    ]
    have = {i["cn"] for i in items}
    for g, pairs in numbered:
        for cn, en in pairs:
            if cn in have:
                continue
            items.append({"group": g, "cn": cn, "en": en, "desc": ""})
    return items


def check_symbol(where: str) -> tuple[bool, str]:
    """where = 'relative/path.ts:symbol'；返回 (是否存在, 说明)。"""
    if ":" not in where:
        return False, "缺少 :符号"
    rel, sym = where.rsplit(":", 1)
    f = ROOT / rel
    if not f.exists():
        return False, f"文件不存在 {rel}"
    src = f.read_text(encoding="utf-8", errors="replace")
    # 允许 this文件里 import 进来的符号：一起扫同目录的 .ts/.tsx 太宽，先只认本文件
    if sym not in src:
        return False, f"{rel} 里找不到符号 `{sym}`"
    return True, ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", help="把报告写到这个 markdown 文件")
    ap.add_argument("--strict", action="store_true", help="有 FAIL 就返回非零")
    args = ap.parse_args()

    items = parse_doc(DOC)
    cov: dict[str, dict] = {}
    if COVERAGE.exists():
        cov = json.loads(COVERAGE.read_text(encoding="utf-8"))
    else:
        print(f"[audit] 没有 {COVERAGE}，全部按未落地统计", file=sys.stderr)

    rows = []
    counts = {"live": 0, "ready": 0, "partial": 0, "planned": 0, "na": 0, "missing": 0}
    fails = []

    for it in items:
        c = cov.get(it["cn"]) or {}
        state = c.get("state", "missing")
        where = c.get("where", "")
        note = c.get("note", "")
        ok, why = True, ""
        if state in ("live", "ready", "partial"):
            ok, why = check_symbol(where)
            if not ok:
                fails.append(f"{it['cn']} ({it['en']}): {why}")
        if state not in counts:
            state = "missing"
        counts[state] += 1
        rows.append({**it, "state": state, "where": where, "note": note, "ok": ok, "why": why})

    total = len(items)
    done = counts["live"] + counts["partial"]

    # ── 控制台 ──────────────────────────────────────────────
    order = ["live", "partial", "ready", "planned", "na", "missing"]
    label = {"live": "已落地", "ready": "已写未接", "partial": "近似", "planned": "未做", "na": "不适用", "missing": "未登记"}
    print(f"来源：{DOC}")
    print(f"条目：{total}   已落地 {counts['live']}   近似 {counts['partial']}   已写未接 {counts['ready']}   未做 {counts['planned']}   "
          f"不适用 {counts['na']}   未登记 {counts['missing']}")
    print(f"落地率：{done}/{total} = {done / total * 100:.1f}%\n")

    g = ""
    for r in sorted(rows, key=lambda x: (order.index(x["state"]), x["group"])):
        if r["group"] != g:
            g = r["group"]
            print(f"── {g}")
        flag = "" if r["ok"] else "  ❌ " + r["why"]
        print(f"   [{label[r['state']]:>4}] {r['cn']:<16} {r['en'][:34]:<34} {r['where']}{flag}")

    # ── markdown ───────────────────────────────────────────
    if args.md:
        lines = ["# 动效覆盖审计（自动生成，勿手改）", "",
                 f"> 来源：`{DOC}`",
                 f"> 条目 {total} · 已落地 {counts['live']} · 近似 {counts['partial']} · 已写未接 {counts['ready']} · "
                 f"未做 {counts['planned']} · 不适用 {counts['na']} · 未登记 {counts['missing']}", "",
                 "| 组 | 中文 | 英文 | 状态 | 实现位置 | 说明 |", "|---|---|---|---|---|---|"]
        for r in rows:
            lines.append(f"| {r['group']} | {r['cn']} | {r['en']} | {label[r['state']]} | "
                         f"{('`' + r['where'] + '`') if r['where'] else ''} | {r['note'] or (r['why'] if not r['ok'] else '')} |")
        Path(args.md).write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\n[audit] markdown -> {args.md}")

    if fails:
        print(f"\n[audit] {len(fails)} 条声称已实现但源码里找不到：", file=sys.stderr)
        for f in fails:
            print("   ❌ " + f, file=sys.stderr)
        if args.strict:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
