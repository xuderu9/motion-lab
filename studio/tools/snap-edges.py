#!/usr/bin/env python
"""snap-edges.py - 把四边形的每条边真正贴到屏幕边上，并修正角度。

为什么要单独一个工具：
  detect-screen 的梯度吸附会被屏幕内侧的反光/暗角带偏；逐边「最大化亮度台阶」
  又会偏向更亮的那一圈反光。两种办法都只能保证「找到了一块像屏幕的区域」，
  不能保证「这条线就是屏幕边缘，而且和屏幕边平行」。

这里的做法最朴素也最可靠：
  对每条边采 N 条法线剖面，从**外侧**往内侧扫，第一次由暗变亮的位置就是屏幕边缘
  （外侧是黑边框，内侧是亮屏）。用这些点做总体最小二乘拟合直线，再求四边交点。
  拟合的 RMS 残差直接告诉你这条边直不直、有没有角度问题。

注意：要求背景板的屏幕是**亮**的。暗屏（desk-night）不适用，脚本会自动跳过。

用法：
    python studio/tools/snap-edges.py studio/plates.json            # 只报告
    python studio/tools/snap-edges.py studio/plates.json --apply    # 写回
"""

import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FW, FH = 1920, 1080


def luma(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def load(path):
    im = Image.open(path).convert("RGB").resize((FW, FH), Image.LANCZOS)
    return luma(np.asarray(im).astype(np.float32))


def at(L, x, y):
    xi = int(np.clip(x, 0, FW - 1))
    yi = int(np.clip(y, 0, FH - 1))
    return float(L[yi, xi])


def poly_mask(Q):
    ys, xs = np.mgrid[0:FH, 0:FW]
    inside = np.ones((FH, FW), bool)
    c = Q.mean(axis=0)
    for i in range(4):
        a, b = Q[i], Q[(i + 1) % 4]
        e = b - a
        n = np.array([-e[1], e[0]], float)
        if np.dot(n, c - a) < 0:
            n = -n
        inside &= ((xs - a[0]) * n[0] + (ys - a[1]) * n[1]) > 0
    return inside


def edge_points(L, p, q, n_out, screen_th, samples=160, span=50.0, run=14):
    """沿法线**从屏内往外**扫，找第一段「持续变暗」的起点 —— 那就是屏幕边缘。

    为什么不能反过来（从外往里找第一个亮）：窗边那块板的外侧是亮窗，一进搜索窗
    就是亮的，永远找不到「由暗转亮」，实测四条边全部卡在搜索边界 +45px。
    而「持续暗」判据对亮背景免疫：屏内是亮的（文字笔画很细，最多几个采样点），
    边框一定有 6px 以上的连续暗带。要求连续 run 个采样都暗，文字就被排除了。
    """
    d = q - p
    ln = np.linalg.norm(d)
    pts, offs = [], []
    for t in np.linspace(0.06, 0.94, samples):
        base = p + d * t
        hit = None
        # 从内侧 -span 开始往 +span 走
        ss = np.arange(-span, span, 0.5)
        vals = np.array([at(L, base[0] + n_out[0] * k, base[1] + n_out[1] * k) for k in ss])
        dark = vals < screen_th
        for i in range(0, len(dark) - run):
            if dark[i:i + run].all():
                # 取这段暗带的起点（往回收半像素余量）
                hit = float(ss[i])
                break
        if hit is not None:
            offs.append(hit)
            pts.append(base + n_out * hit)
    if len(pts) < 20:
        return None, None, None
    offs = np.array(offs)
    med = float(np.median(offs))
    keep = np.abs(offs - med) < max(2.0, 2.0 * np.std(offs))
    pts = [pt for pt, k in zip(pts, keep) if k]
    if len(pts) < 15:
        return None, None, None
    A = np.array(pts, float)
    c = A.mean(axis=0)
    _, _, vt = np.linalg.svd(A - c)
    dirv = vt[0] / np.linalg.norm(vt[0])
    res = np.abs((A - c) @ np.array([-dirv[1], dirv[0]]))
    return (c, dirv), float(np.mean(offs)), float(np.sqrt(np.mean(res ** 2)))


def angle_of(d):
    a = math.degrees(math.atan2(d[1], d[0]))
    while a <= -90:
        a += 180
    while a > 90:
        a -= 180
    return a


def intersect(l1, l2):
    (c1, d1), (c2, d2) = l1, l2
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    b = c2 - c1
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, b)
    return c1 + d1 * t[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registry", nargs="?", default="studio/plates.json")
    ap.add_argument("--root", default=".")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--min-screen", type=float, default=90.0, help="屏内亮度下限；低于它认为是暗屏，跳过")
    ap.add_argument("--orig-dir", default=None,
                    help="用这个目录下的同名图来量（涂暗前的原图），结果仍写回 registry")
    args = ap.parse_args()

    reg = json.load(open(args.registry, encoding="utf-8"))
    for e in reg["environments"]:
        src = os.path.join(args.root, "public", e["env"]["src"])
        if args.orig_dir:
            src = os.path.join(args.orig_dir, os.path.basename(e["env"]["src"]))
        if not os.path.exists(src):
            print("跳过 %s（缺 %s）" % (e["name"], src))
            continue
        L = load(src)
        Q = np.array(e["env"]["quad"], float)
        m = poly_mask(Q)
        screen = float(np.median(L[m])) if m.any() else 0.0
        if screen < args.min_screen:
            print("%-14s 屏内亮度 %.0f < %.0f，是暗屏，跳过（不需要也不适用）"
                  % (e["name"], screen, args.min_screen))
            continue
        th = 0.5 * screen
        c = Q.mean(axis=0)
        print("%-14s 屏内 %.0f  阈值 %.0f" % (e["name"], screen, th))

        lines, info = [], []
        for i in range(4):
            p, q = Q[i], Q[(i + 1) % 4]
            d = q - p
            ln = np.linalg.norm(d)
            n = np.array([-d[1], d[0]], float) / ln
            if np.dot(n, c - p) > 0:
                n = -n                          # 指向外侧
            ln_fit, off, rms = edge_points(L, p, q, n, th)
            if ln_fit is None:
                print("   边%d 采样失败" % i)
                lines.append(None)
                info.append(None)
                continue
            old_a = angle_of(d / ln)
            new_a = angle_of(ln_fit[1])
            da = (new_a - old_a + 90) % 180 - 90
            lines.append(ln_fit)
            info.append((off, rms, old_a, new_a, da))
            print("   边%d 偏移 %+6.2fpx  RMS %5.2fpx  原角 %+7.3f°  新角 %+7.3f°  差 %+6.3f°"
                  % (i, off, rms, old_a, new_a, da))

        if any(x is None for x in lines):
            print("   有边失败，跳过")
            continue
        newQ = []
        for i in range(4):
            pt = intersect(lines[i - 1], lines[i])
            if pt is None:
                newQ = None
                break
            newQ.append(pt)
        if newQ is None:
            print("   求交失败，跳过")
            continue
        newQ = np.array(newQ)
        moved = [float(np.linalg.norm(newQ[i] - Q[i])) for i in range(4)]
        print("   角位移 %s px" % ["%.1f" % v for v in moved])
        if args.apply:
            e["env"]["quad"] = [[int(round(p[0])), int(round(p[1]))] for p in newQ]
            e.pop("_quadScale", None)
            print("   已写回")

    if args.apply:
        json.dump(reg, open(args.registry, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\n已写回 %s" % args.registry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
