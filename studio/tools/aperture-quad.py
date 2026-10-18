#!/usr/bin/env python
"""aperture-quad.py - 用「屏幕亮区掩码」的边界拟合四边形，并给出四条边的缝宽。

═══ 为什么之前的量法都不行 ═══
前几版沿法线取亮度剖面找边缘，受这些东西干扰：屏幕内侧的暗角、反光边、
屏内文字笔画、窗外亮景。判据一错，拟合出来的边就系统性偏向内侧，
于是画布要么偏小、要么整体偏一个方向（用户看到的正是「左下缝大、右上缝小」）。

这里改用**二值掩码的边界**：屏幕是一块亮而均匀的区域，边框是暗的。
从四边形中心洪泛亮区得到掩码，掩码的边界就是屏幕边缘——没有灰度阈值可调，
也不受屏内文字影响（文字是掩码内部的洞，不是边界）。

然后：
  1. 取掩码边界点，按「离哪条边近」分组
  2. 每组做总体最小二乘直线拟合 -> 四条边线 -> 求交得四个角
  3. 反复 2~3 轮（边和角会互相拉动）
  4. 可选：每条边向内收 inset 像素 —— 这就是用户要的那圈「窄而均匀的亮边」
  5. 输出每条边的实际缝宽与均匀性

用法：
    python studio/tools/aperture-quad.py studio/plates.json                 # 只报告
    python studio/tools/aperture-quad.py studio/plates.json --inset 5 --apply
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

W, H = 1920, 1080


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def load(path):
    im = Image.open(path).convert("RGB").resize((W, H), Image.LANCZOS)
    return luma(np.asarray(im).astype(np.float32))


def flood(mask, seed):
    m = np.zeros_like(mask)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return m
    k = int(np.argmin((ys - seed[1]) ** 2 + (xs - seed[0]) ** 2))
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


def boundary(m):
    e = m.copy()
    e[1:, :] &= m[:-1, :]
    e[:-1, :] &= m[1:, :]
    e[:, 1:] &= m[:, :-1]
    e[:, :-1] &= m[:, 1:]
    return m & ~e


def tls(points):
    A = np.asarray(points, float)
    c = A.mean(axis=0)
    _, _, vt = np.linalg.svd(A - c)
    d = vt[0] / np.linalg.norm(vt[0])
    res = np.abs((A - c) @ np.array([-d[1], d[0]]))
    return c, d, float(np.sqrt(np.mean(res ** 2)))


def intersect(l1, l2):
    (c1, d1), (c2, d2) = l1, l2
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    b = c2 - c1
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, b)
    return c1 + d1 * t[0]


def ang(d):
    a = math.degrees(math.atan2(d[1], d[0]))
    while a <= -90:
        a += 180
    while a > 90:
        a -= 180
    return a


def fit_quad(B, Q, rounds=3, radius=26.0):
    """用边界点 B 拟合四条边，再从当前 Q 出发迭代收敛。"""
    pts = np.argwhere(B)[:, ::-1].astype(float)      # (x, y)
    if len(pts) < 200:
        return None, None
    Q = np.array(Q, float)
    lines = None
    for _ in range(rounds):
        c = Q.mean(axis=0)
        newlines, rms_all = [], []
        for i in range(4):
            p, q = Q[i], Q[(i + 1) % 4]
            d = q - p
            ln = np.linalg.norm(d)
            u = d / ln
            n = np.array([-u[1], u[0]])
            # 到这条直线的距离 < 26px，且投影落在这条边的中段
            rel = pts - p
            dist = np.abs(rel @ n)
            t = (rel @ u) / ln
            sel = (dist < radius) & (t > 0.06) & (t < 0.94)
            if sel.sum() < 40:
                return None, None
            cc, dd, rms = tls(pts[sel])
            newlines.append((cc, dd))
            rms_all.append(rms)
        newQ = []
        for i in range(4):
            pt = intersect(newlines[i - 1], newlines[i])
            if pt is None:
                return None, None
            newQ.append(pt)
        newQ = np.array(newQ)
        moved = float(np.abs(newQ - Q).max())
        Q, lines = newQ, newlines
        if moved < 0.2:
            break
    return Q, (lines, rms_all)


def edge_gaps(G, lines_or_quad):
    """给定四边形与掩码边界点云，算每条边的缝宽（点云到边的距离中位数）。"""
    pass


def gaps_to_mask(B, Q, samples=120, span=60.0):
    """每条边：从四边形边向外量到最近的掩码边界点。"""
    pts = np.argwhere(B)[:, ::-1].astype(float)
    c = Q.mean(axis=0)
    out = []
    for i in range(4):
        p, q = Q[i], Q[(i + 1) % 4]
        d = q - p
        ln = np.linalg.norm(d)
        u = d / ln
        n = np.array([-u[1], u[0]])
        if np.dot(n, c - (p + q) / 2) > 0:
            n = -n
        vals = []
        for t in np.linspace(0.1, 0.9, samples):
            base = p + d * t
            rel = pts - base
            along = rel @ u
            lat = rel @ n
            sel = (np.abs(along) < 6) & (np.abs(lat) < span)
            if not sel.any():
                continue
            latv = lat[sel]
            # 取离得最近的那个边界点（可能在内侧或外侧）
            k = int(np.argmin(np.abs(latv)))
            vals.append(float(latv[k]))
        out.append(float(np.median(vals)) if len(vals) > 30 else None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registry", nargs="?", default="studio/plates.json")
    ap.add_argument("--root", default=".")
    ap.add_argument("--orig-dir", default=None, help="用这个目录的同名图来量（涂暗前的原图）")
    ap.add_argument("--inset", type=float, default=0.0, help="每条边向内收多少像素（=要留的亮边宽度）")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--min-screen", type=float, default=90.0)
    ap.add_argument("--radius", type=float, default=26.0, help="边界点归组半径；四边形明显偏离时要加大")
    args = ap.parse_args()

    reg = json.load(open(args.registry, encoding="utf-8"))
    for e in reg["environments"]:
        src = os.path.join(args.root, "public", e["env"]["src"])
        if args.orig_dir:
            src = os.path.join(args.orig_dir, os.path.basename(e["env"]["src"]))
        if not os.path.exists(src):
            print("跳过 %s" % e["name"])
            continue
        L = load(src)
        Q0 = np.array(e["env"]["quad"], float)
        c = Q0.mean(axis=0)
        cx, cy = int(c[0]), int(c[1])
        ref = float(np.median(L[max(0, cy - 30):cy + 30, max(0, cx - 30):cx + 30]))
        if ref < args.min_screen:
            print("%-14s 屏内亮度 %.0f，暗屏板，跳过（不需要，也不适用）" % (e["name"], ref))
            continue
        mask = flood(L > 0.5 * ref, (cx, cy))
        if mask.sum() < 4000:
            print("%-14s 洪泛区域太小，跳过" % e["name"])
            continue
        B = boundary(mask)

        Q, extra = fit_quad(B, Q0, radius=args.radius)
        if Q is None:
            print("%-14s 拟合失败" % e["name"])
            continue
        lines, rmss = extra

        # 每边角度变化
        print("%-14s 拟合 RMS %s px" % (e["name"], ["%.2f" % v for v in rmss]))
        for i in range(4):
            a0 = ang(Q0[(i + 1) % 4] - Q0[i])
            a1 = ang(Q[(i + 1) % 4] - Q[i])
            da = (a1 - a0 + 90) % 180 - 90
            print("   边%d 原角 %+7.3f° -> %+7.3f°   差 %+6.3f°" % (i, a0, a1, da))
        print("   角位移 %s px" % ["%.1f" % np.linalg.norm(Q[i] - Q0[i]) for i in range(4)])

        # 四条边各向内收 offset 像素。
        # 必须「先把四条边都算成新直线，再两两求交」——直接在原点上叠加会互相拉扯，
        # 第一条边移动后第二条边用的是已移动的端点，收出来的形状不是均匀内缩。
        if args.inset > 0:
            ctr = Q.mean(axis=0)
            lines_off = []
            for i in range(4):
                p, q = Q[i], Q[(i + 1) % 4]
                d = q - p
                ln = np.linalg.norm(d)
                u = d / ln
                n = np.array([-u[1], u[0]])
                if np.dot(n, ctr - (p + q) / 2) > 0:
                    n = -n                       # 指向外侧
                lines_off.append((p - n * args.inset, u))   # 向内 = 反向移动
            newQ = []
            for i in range(4):
                pt = intersect(lines_off[i - 1], lines_off[i])
                if pt is None:
                    newQ = None
                    break
                newQ.append(pt)
            if newQ is not None:
                Q = np.array(newQ)

        gaps = gaps_to_mask(B, Q)
        gs = ["%.1f" % v if v is not None else "?" for v in gaps]
        ok_gaps = [v for v in gaps if v is not None]
        if ok_gaps:
            print("   缝宽(上/右/下/左) %s px   中位 %.1f  极差 %.1f"
                  % (gs, float(np.median(ok_gaps)), float(max(ok_gaps) - min(ok_gaps))))

        if args.apply:
            e["env"]["quad"] = [[int(round(p[0])), int(round(p[1]))] for p in Q]
            e.pop("_quadScale", None)
            print("   已写回 quad=%s" % e["env"]["quad"])

    if args.apply:
        json.dump(reg, open(args.registry, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\n已写回 %s" % args.registry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
