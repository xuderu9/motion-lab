#!/usr/bin/env python
"""check-fit.py - 画面贴合自检：量四条边的缝宽，判「小」和「一样」。

═══ 为什么这个版本才可信 ═══
前几版检查器全 PASS 而结果错，因为参照物都是自己：
  · check-canvas-overflow：内容 vs canvas —— canvas 自己小了查不出
  · check-film：帧 vs 帧 —— 镜头内部贴合不在视野
  · measure-fit v1：找第一个暗像素 —— 涂暗占位屏之后找到的就是我自己画的画布（循环论证）
  · check-fit v1（掩码覆盖率）：只能证明「屏幕被盖住」，查不出四条边是否一样宽

这一版直接把用户的验收话术写成判据：
  · 四条边的缝都要**小**      -> 每条边 gap ∈ [GAP_MIN, GAP_MAX]
  · 四条边的缝要**一样**      -> max(gap) − min(gap) ≤ SPREAD_MAX
参照物是背景板里**屏幕亮区的掩码边界**（不是亮度剖面阈值，不受暗角/反光/文字干扰）。

已知错误版本会被判 FAIL 的证据（2026-10-18 实测）：
  · quad 放大 1.06          -> 缝宽出现负值（压到边框），且极差 >10px
  · quad 按亮度剖面重拟合    -> 平移 27~32px，四边缝一正一负，极差 >30px
  · 只做掩码覆盖率检查       -> 上述两种都 PASS（所以那一版检查器是没用的）

用法：
    python studio/tools/check-fit.py                 # 用注册表里的 quad 量
    python studio/tools/check-fit.py --json out/fit.json
"""

import argparse
import json
import importlib.util
import os
import sys

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
GAP_MIN = -1.0     # 小于它 = 画布压到边框上
GAP_MAX = 4.0      # 大于它 = 缝隙肉眼可见（用户 2026-10-18 反馈：5px 已经算「缝偏大」）
SPREAD_MAX = 2.5   # 四条边互相之间的最大差（「四条边一样」）


def load_mod():
    spec = importlib.util.spec_from_file_location("aq", os.path.join(HERE, "aperture-quad.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default="studio/plates.json")
    ap.add_argument("--root", default=".")
    ap.add_argument("--orig-dir", default="out/plates-orig")
    ap.add_argument("--gap-min", type=float, default=GAP_MIN)
    ap.add_argument("--gap-max", type=float, default=GAP_MAX)
    ap.add_argument("--spread", type=float, default=SPREAD_MAX)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    aq = load_mod()
    reg = json.load(open(args.registry, encoding="utf-8"))
    rows, bad, skipped = [], [], []

    for e in reg["environments"]:
        src = os.path.join(args.root, "public", e["env"]["src"])
        if args.orig_dir and os.path.isdir(args.orig_dir):
            alt = os.path.join(args.orig_dir, os.path.basename(e["env"]["src"]))
            if os.path.exists(alt):
                src = alt
        if not os.path.exists(src):
            skipped.append((e["name"], "缺图"))
            continue
        L = aq.load(src)
        Q = np.array(e["env"]["quad"], float)
        c = Q.mean(axis=0)
        cx, cy = int(c[0]), int(c[1])
        ref = float(np.median(L[max(0, cy - 30):cy + 30, max(0, cx - 30):cx + 30]))
        if ref < 90:
            skipped.append((e["name"], "暗屏板（亮度 %.0f），亮区判据不适用" % ref))
            continue
        mask = aq.flood(L > 0.5 * ref, (cx, cy))
        if mask.sum() < 4000:
            skipped.append((e["name"], "洪泛区域太小"))
            continue
        B = aq.boundary(mask)
        gaps = aq.gaps_to_mask(B, Q)
        if any(g is None for g in gaps):
            rows.append((e["name"], gaps, None, None, "有边量不到"))
            bad.append(e["name"])
            continue
        spread = max(gaps) - min(gaps)
        ok = all(args.gap_min <= g <= args.gap_max for g in gaps) and spread <= args.spread
        why = []
        if any(g < args.gap_min for g in gaps):
            why.append("压到边框")
        if any(g > args.gap_max for g in gaps):
            why.append("缝过大")
        if spread > args.spread:
            why.append("四边不均匀")
        rows.append((e["name"], gaps, float(np.mean(gaps)), spread, "；".join(why) if why else "OK"))
        if not ok:
            bad.append(e["name"])

    print("")
    print("=" * 90)
    print("画面贴合自检   判据：每条边 %.1f~%.0f px，四边极差 ≤%.1f px" % (args.gap_min, args.gap_max, args.spread))
    print("=" * 90)
    print("  %-14s %-30s %-8s %-8s %s" % ("环境", "缝宽 上/右/下/左 (px)", "均值", "极差", "结论"))
    for name, gaps, mean, spread, why in rows:
        gs = " / ".join("%5.1f" % g if g is not None else "    ?" for g in gaps)
        ms = "—" if mean is None else "%.1f" % mean
        ss = "—" if spread is None else "%.1f" % spread
        mark = "PASS" if why == "OK" else "FAIL"
        print("  %-14s %-30s %-8s %-8s %s %s" % (name, gs, ms, ss, mark, "" if why == "OK" else why))
    for name, why in skipped:
        print("  %-14s 跳过：%s" % (name, why))
    print("=" * 90)
    if bad:
        print("  %d 个环境不达标：%s" % (len(bad), ", ".join(bad)))
        return 1
    print("  ALL PASS")
    if args.json:
        json.dump({"rows": [{"name": n, "gaps": g, "mean": m, "spread": s, "verdict": w}
                            for n, g, m, s, w in rows],
                   "skipped": skipped}, open(args.json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
