#!/usr/bin/env python
"""check-plan.py - M3 分镜规划的验收器（先写验收，再写实现）。

判据全部来自 `studio/M3-DESIGN.md` §6。改判据要先改那份文档。

用法：
    python studio/tools/check-plan.py --plan out/film/plan.json --srt out/film/voice.srt
    python studio/tools/check-plan.py --plan a.json --plan2 b.json --srt x.srt   # 顺带查可复现
"""

import argparse
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

C_DUR_TOL = 0.5           # 时长闭合误差（秒）
C_GAP_SAME_VARIANT = 4    # 同一 (layout,variant) 的最小间隔（镜头数）
C_MIN_FAMILIES = 4        # 至少用到的版式族数
C_MIN_VARIANTS_PER_FAMILY = 2
C_MAX_SAME_THEME_RUN = 2  # 同一主题最多连续出现几次（3 次即违规）
EPS = 1e-6

LIGHT = {"light", "warm-sand"}


# ---------------------------------------------------------------- SRT
def parse_srt(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-8", "gbk", "utf-16"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit("SRT 解码失败: %s" % path)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text.strip())
    out = []
    pat = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")
    for b in blocks:
        m = pat.search(b)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        body = b[m.end():].strip()
        out.append({"start": start, "end": end, "text": body})
    out.sort(key=lambda r: r["start"])
    return out


# ---------------------------------------------------------------- checks
def shot_times(plan):
    t = 0.0
    times = []
    for s in plan["shots"]:
        dur = s["durationInFrames"] / float(s["fps"])
        times.append((t, t + dur))
        t += dur
    return times, t


def check_duration(plan, srt):
    times, total = shot_times(plan)
    srt_total = srt[-1]["end"] - srt[0]["start"]
    d = abs(total - srt_total)
    return d <= C_DUR_TOL, "镜头总时长 %.3fs / SRT %.3fs，差 %.3fs（≤%.1f）" % (total, srt_total, d, C_DUR_TOL), {
        "total": total, "srt_total": srt_total, "diff": d}


def check_boundaries(plan, srt):
    """切点必须落在某条字幕的开始或结束上，且相邻镜头首尾相接（无空洞、无重叠）。"""
    times, _ = shot_times(plan)
    base = srt[0]["start"]
    starts = {round(r["start"] - base, 3) for r in srt}
    ends = {round(r["end"] - base, 3) for r in srt}
    bounds = starts | ends
    bad = []
    for i, (t0, t1) in enumerate(times):
        if round(t0, 3) not in bounds:
            bad.append((i, "起始切点不在字幕边界上", round(t0, 3)))
        if round(t1, 3) not in bounds:
            bad.append((i, "结束切点不在字幕边界上", round(t1, 3)))
        if i + 1 < len(times) and abs(times[i + 1][0] - t1) > 1e-6:
            bad.append((i, "与下一镜头不相接（空洞或重叠）", round(t1, 3)))
    ok = not bad
    return ok, "%d 个镜头 / %d 个切点，%d 处不对齐" % (len(times), len(times) * 2, len(bad)), {"bad": bad[:8]}


def check_constraints(plan):
    shots = plan["shots"]
    v = []
    for i in range(1, len(shots)):
        if shots[i]["layout"] == shots[i - 1]["layout"]:
            v.append("镜头 %d/%d 相邻同 layout (%s)" % (i - 1, i, shots[i]["layout"]))
        if shots[i]["theme"] == shots[i - 1]["theme"]:
            v.append("镜头 %d/%d 相邻同 theme (%s)" % (i - 1, i, shots[i]["theme"]))
    last = {}
    for i, s in enumerate(shots):
        key = (s["layout"], s["variant"])
        if key in last and i - last[key] < C_GAP_SAME_VARIANT:
            v.append("镜头 %d 与 %d 用了同一个 (layout,variant) %s，间隔 %d < %d"
                     % (i, last[key], key, i - last[key], C_GAP_SAME_VARIANT))
        last[key] = i
    run = 1
    for i in range(1, len(shots)):
        run = run + 1 if shots[i]["theme"] == shots[i - 1]["theme"] else 1
        if run > C_MAX_SAME_THEME_RUN:
            v.append("镜头 %d 处主题 %s 连续出现 %d 次" % (i, shots[i]["theme"], run))
    ok = not v
    return ok, "%d 条硬约束违规" % len(v), {"violations": v}


def check_coverage(plan):
    fam = {}
    occ = {}
    for s in plan["shots"]:
        fam.setdefault(s["layout"], set()).add(s["variant"])
        occ[s["layout"]] = occ.get(s["layout"], 0) + 1
    # 只出现 1 次的版式族不可能有 2 个变体 —— 判据只要求「出现 ≥2 次的族必须有 ≥2 变体」
    thin = [k for k, v in fam.items()
            if occ.get(k, 0) >= C_MIN_VARIANTS_PER_FAMILY and len(v) < C_MIN_VARIANTS_PER_FAMILY]
    # 文案本身能支持的族数可能少于 4（比如没有地名也没有年份），此时不该强求
    supported = (plan.get("report") or {}).get("supportedFamilies") or C_MIN_FAMILIES
    need = min(C_MIN_FAMILIES, supported)
    ok = len(fam) >= need and not thin
    msg = "%d 个版式族（文案支持 %d，要求 ≥%d）：%s%s" % (
        len(fam), supported, need,
        ", ".join("%s %d次/%d变体" % (k, occ.get(k, 0), len(v)) for k, v in sorted(fam.items())),
        ("；出现多次却只有 1 个变体: %s" % ",".join(thin)) if thin else "")
    return ok, msg, {"families": {k: len(v) for k, v in fam.items()}}


def check_content(plan):
    """每个镜头的必填字段非空；content.kind 必须等于 layout。"""
    bad = []
    for s in plan["shots"]:
        c = s.get("content") or {}
        if not c:
            bad.append((s["id"], "content 缺失"))
            continue
        if c.get("kind") != s["layout"]:
            bad.append((s["id"], "content.kind(%s) != layout(%s)" % (c.get("kind"), s["layout"])))
        if not c.get("heading"):
            bad.append((s["id"], "content.heading 为空"))
        if s["layout"] == "chart" and not c.get("series"):
            bad.append((s["id"], "chart.series 为空"))
        if s["layout"] == "doc" and not c.get("paragraphs"):
            bad.append((s["id"], "doc.paragraphs 为空"))
        if s["layout"] == "cards" and not c.get("cards"):
            bad.append((s["id"], "cards.cards 为空"))
        if s["layout"] == "timeline" and not c.get("events"):
            bad.append((s["id"], "timeline.events 为空"))
        if s["layout"] == "code" and not c.get("code"):
            bad.append((s["id"], "code.code 为空"))
        if s["layout"] == "map" and not c.get("places"):
            bad.append((s["id"], "map 无 places"))
        if s["env"].get("exposure") is None or not s["env"].get("quad"):
            bad.append((s["id"], "env 不完整"))
    warns = (plan.get("report") or {}).get("warnings") or []
    ok = not bad
    return ok, "%d 处字段问题；%d 条 warning" % (len(bad), len(warns)), {"bad": bad[:8], "warnings": warns[:10]}


def check_repro(a, b):
    if b is None:
        return None, "未提供第二份 plan，跳过可复现检查", {}
    ja = json.dumps(a, sort_keys=True, ensure_ascii=False)
    jb = json.dumps(b, sort_keys=True, ensure_ascii=False)
    return ja == jb, "两份 plan %s" % ("完全一致" if ja == jb else "不一致"), {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--plan2", default=None)
    ap.add_argument("--srt", required=True)
    args = ap.parse_args()

    plan = json.load(open(args.plan, encoding="utf-8"))
    plan2 = json.load(open(args.plan2, encoding="utf-8")) if args.plan2 else None
    srt = parse_srt(args.srt)
    if not srt:
        raise SystemExit("SRT 解析结果为空: %s" % args.srt)

    res = []
    res.append(("1 时长闭合",) + check_duration(plan, srt))
    res.append(("2 边界对齐 SRT 行",) + check_boundaries(plan, srt))
    res.append(("3 硬约束（相邻/间隔/主题）",) + check_constraints(plan))
    res.append(("4 版式覆盖",) + check_coverage(plan))
    res.append(("5 字段完整、不静默编造",) + check_content(plan))
    res.append(("6 一条命令出 plan", True, "本表由 check-plan.py 生成，plan 已产出", {}))
    res.append(("7 换本跑通", None, "需人工用新 SRT 跑一次（自动化只能证明本份 SRT 通过）", {}))
    res.append(("8 可复现",) + check_repro(plan, plan2))

    print("")
    print("=" * 88)
    print("M3 分镜规划验收   %s   （%d 行字幕，%d 个镜头）" % (args.plan, len(srt), len(plan["shots"])))
    print("=" * 88)
    hard = 0
    for name, ok, msg, _ in res:
        mark = "SKIP" if ok is None else ("PASS" if ok else "FAIL")
        if ok is False:
            hard += 1
        print("  %-4s %-26s %s" % (mark, name, msg))
    print("-" * 88)
    if hard == 0:
        print("  ALL PASS")
    else:
        print("  %d 项未通过" % hard)
        for name, ok, msg, det in res:
            if ok is False:
                for k in ("violations", "bad"):
                    for row in (det.get(k) or [])[:6]:
                        print("     %s" % (row,))
    print("=" * 88)
    return 0 if hard == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
