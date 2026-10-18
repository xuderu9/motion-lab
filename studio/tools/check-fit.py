#!/usr/bin/env python
"""check-fit.py - 画面(canvas)与设备屏幕的贴合自检（掩码版）。

═══ 为什么要有这个检查器 ═══
前几轮 check-shot / check-film / check-canvas-overflow 全是 PASS，用户却一眼看出
「画面和屏幕没贴合」。因为这些检查器的参照物都是**自己**：

  · check-canvas-overflow: 内容有没有超出 canvas —— canvas 自己小了它查不出
  · check-film: 帧与帧之间的切点 —— 镜头内部的贴合不在视野
  · measure-fit(第一版): 找「第一个暗像素」—— 涂暗占位屏之后找到的就是我自己的画布，循环论证

这里的参照物是**背景板里那块设备屏幕本身**：
  1. 从纯色探针帧里取 canvas 的掩码（品红）
  2. 从原始背景板里取屏幕开口的掩码（亮区洪泛，边框包围）
  3. 算两个数：
       coverage = |canvas ∩ 屏幕| / |屏幕|      -> 屏幕被盖住了多少（要 ≥99%）
       overflow = |canvas \\ 屏幕| / |屏幕|      -> 画布有多少落在屏幕外（要 ≤2%）
判据对「太大」和「太小」同时敏感，这正是之前一直缺的那个维度。

用法：
    python studio/tools/check-fit.py --make-probe out/fitcheck/probe.json
    .\\studio\\tools\\render-batch.ps1 -ShotsJson out/fitcheck/probe.json -OutDir out/fitcheck -Mode stills
    python studio/tools/check-fit.py --probes out/fitcheck/stills --plates public/plates
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

W, H = 1920, 1080
MIN_COVERAGE = 0.99
MAX_OVERFLOW = 0.02


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def magenta_mask(a):
    return (a[:, :, 0] > 150) & (a[:, :, 2] > 150) & (a[:, :, 1] < 120)


def flood(mask, seed):
    m = np.zeros_like(mask)
    sy, sx = seed
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return m
    d2 = (ys - sy) ** 2 + (xs - sx) ** 2
    k = int(np.argmin(d2))
    sy, sx = int(ys[k]), int(xs[k])
    m[sy, sx] = True
    while True:
        n = m.copy()
        n[1:, :] |= m[:-1, :] & mask[1:, :]
        n[:-1, :] |= m[1:, :] & mask[:-1, :]
        n[:, 1:] |= m[:, :-1] & mask[:, 1:]
        n[:, :-1] |= m[:, 1:] & mask[:, :-1]
        n &= mask
        if n.sum() == m.sum():
            return n
        m = n


def aperture_mask(plate_path, quad):
    """从原始（未涂暗）背景板求屏幕开口：从四边形中心洪泛亮区。"""
    im = Image.open(plate_path).convert("RGB").resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    L = luma(a)
    Q = np.array(quad, float)
    c = Q.mean(axis=0)
    cx, cy = int(c[0]), int(c[1])
    ref = float(np.median(L[max(0, cy - 30):cy + 30, max(0, cx - 30):cx + 30]))
    if ref < 90:
        return None, ref          # 暗屏板，无法用亮区判据
    mask = L > 0.5 * ref
    return flood(mask, (cy, cx)), ref


def make_probe(registry, out_json):
    reg = json.load(open(registry, encoding="utf-8"))
    demo = json.load(open(os.path.join(os.path.dirname(registry), "shots", "demo.json"), encoding="utf-8"))
    base = next(s for s in demo["shots"] if s["id"] == "s04-chart-fullbleed")
    shots = []
    for e in reg["environments"]:
        s = json.loads(json.dumps(base))
        s["id"] = "probe-" + e["name"]
        s.pop("overlay", None)
        s["env"] = dict(e["env"])
        s["theme"] = "light"
        s["debug"] = "solid"
        shots.append(s)
    os.makedirs(os.path.dirname(out_json) or ".", exist_ok=True)
    json.dump({"shots": shots}, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("探针 JSON -> %s（%d 个环境）" % (out_json, len(shots)))
    print("接着：.\\studio\\tools\\render-batch.ps1 -ShotsJson %s -OutDir %s -Mode stills"
          % (out_json, os.path.dirname(out_json)))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default="studio/plates.json")
    ap.add_argument("--probes", default=None)
    ap.add_argument("--plates", default="public/plates")
    ap.add_argument("--make-probe", default=None)
    ap.add_argument("--min-coverage", type=float, default=MIN_COVERAGE)
    ap.add_argument("--max-overflow", type=float, default=MAX_OVERFLOW)
    args = ap.parse_args()

    if args.make_probe:
        return make_probe(args.registry, args.make_probe)
    if not args.probes:
        print("要给 --probes 或 --make-probe", file=sys.stderr)
        return 2

    reg = json.load(open(args.registry, encoding="utf-8"))
    rows, bad = [], []
    for e in reg["environments"]:
        name = e["name"]
        pf = os.path.join(args.probes, "probe-%s.png" % name)
        plate = os.path.join(args.plates, os.path.basename(e["env"]["src"]))
        if not os.path.exists(pf):
            rows.append((name, None, None, None, "缺探针"))
            bad.append(name)
            continue
        ap_mask, ref = aperture_mask(plate, e["env"]["quad"])
        if ap_mask is None:
            rows.append((name, None, None, ref, "暗屏板，跳过（无亮区可判）"))
            continue
        probe = np.asarray(Image.open(pf).convert("RGB")).astype(np.float32)
        cv = magenta_mask(probe)
        area_ap = ap_mask.sum()
        area_cv = cv.sum()
        inter = (cv & ap_mask).sum()
        coverage = inter / max(1, area_ap)
        overflow = max(0.0, area_cv - inter) / max(1, area_ap)
        ok = coverage >= args.min_coverage and overflow <= args.max_overflow
        why = []
        if coverage < args.min_coverage:
            why.append("屏幕没盖满 %.2f%%" % (100 * (1 - coverage)))
        if overflow > args.max_overflow:
            why.append("画布溢出 %.2f%%" % (100 * overflow))
        rows.append((name, coverage, overflow, ref, "；".join(why) if why else "OK"))
        if not ok:
            bad.append(name)

    print("")
    print("=" * 92)
    print("画面贴合自检（掩码版）  判据：覆盖率 ≥%.1f%%，溢出 ≤%.1f%%"
          % (100 * args.min_coverage, 100 * args.max_overflow))
    print("=" * 92)
    print("  %-14s %-10s %-10s %-8s %s" % ("环境", "覆盖率", "溢出", "屏内亮度", "结论"))
    for name, cov, ovf, ref, why in rows:
        if cov is None:
            print("  %-14s %-10s %-10s %-8s %s" % (name, "—", "—", "%.0f" % (ref or 0), why))
            continue
        mark = "PASS" if (cov >= args.min_coverage and ovf <= args.max_overflow) else "FAIL"
        print("  %-14s %-10s %-10s %-8.0f %s %s"
              % (name, "%.3f" % cov, "%.4f" % ovf, ref, mark, why))
    print("=" * 92)
    if bad:
        print("  %d 个环境不达标：%s" % (len(bad), ", ".join(bad)))
        print("  判读：覆盖率低 = canvas 太小；溢出大 = canvas 太大（压到边框）")
        return 1
    print("  ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
