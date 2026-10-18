#!/usr/bin/env python
"""measure-radius.py - 量出背景板里设备屏幕的圆角半径。

为什么必须量：画布是圆角矩形（cornerRadius 以**画布空间**计），设备屏幕的圆角
在**成片空间**里。两者差一个缩放系数 screenW/1600。之前五块板全用 76，
换算到 window-day（屏宽 542）只有 26px 的实际圆角，而设备的圆角远大于这个数 ——
于是画布四角几乎方角，会盖到设备的圆角上，看起来就是「四个角没对齐」。

做法：在每个角取一块 patch，用「屏内亮度 / 边框亮度」的 50% 阈值二值化，
取边界点拟合圆，得到该角的半径；四角取中位数。

用法：
    python studio/tools/measure-radius.py studio/plates.json
    python studio/tools/measure-radius.py studio/plates.json --apply
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FRAME_W, FRAME_H = 1920, 1080
CANVAS_W = 1600


def luma(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def load(path):
    im = Image.open(path).convert("RGB").resize((FRAME_W, FRAME_H), Image.LANCZOS)
    return luma(np.asarray(im).astype(np.float32))


def boundary_points(mask):
    """返回布尔掩码的边界像素坐标（用四邻域移位近似形态学边界）。"""
    m = mask
    er = (
        m
        & np.roll(m, 1, 0) & np.roll(m, -1, 0)
        & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    )
    bd = m & ~er
    ys, xs = np.nonzero(bd)
    return np.c_[xs, ys].astype(float)


def fit_circle(pts):
    x, y = pts[:, 0], pts[:, 1]
    M = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x * x + y * y
    sol, *_ = np.linalg.lstsq(M, b, rcond=None)
    cx, cy, c = sol
    r = np.sqrt(max(0.0, c + cx * cx + cy * cy))
    return float(cx), float(cy), float(r)


def measure_corner(L, corner, screen_level, bezel_level, patch=150, max_dist=95):
    cx, cy = int(round(corner[0])), int(round(corner[1]))
    x0, y0 = max(0, cx - patch), max(0, cy - patch)
    x1, y1 = min(FRAME_W, cx + patch), min(FRAME_H, cy + patch)
    if x1 - x0 < 40 or y1 - y0 < 40:
        return None
    P = L[y0:y1, x0:x1]
    th = 0.5 * (screen_level + bezel_level)
    mask = P > th
    # 只保留「与角相邻的那块亮区」：从 patch 里离角最近的中心点做种子
    sy, sx = cy - y0, cx - x0
    sy = int(np.clip(sy, 0, P.shape[0] - 1))
    sx = int(np.clip(sx, 0, P.shape[1] - 1))
    if not mask[sy, sx]:
        # 角点可能落在边框上，向外找最近的亮像素
        ys, xs = np.nonzero(mask)
        if len(ys) == 0:
            return None
        k = np.argmin((ys - sy) ** 2 + (xs - sx) ** 2)
        sy, sx = ys[k], xs[k]
    # 洪泛（4 邻域，迭代膨胀到稳定）
    seed = np.zeros_like(mask)
    seed[sy, sx] = True
    for _ in range(400):
        nxt = seed | (np.roll(seed, 1, 0) & mask) | (np.roll(seed, -1, 0) & mask) \
                  | (np.roll(seed, 1, 1) & mask) | (np.roll(seed, -1, 1) & mask)
        if nxt.sum() == seed.sum():
            break
        seed = nxt
    bd = boundary_points(seed)
    if len(bd) < 30:
        return None
    bd += np.array([x0, y0])
    d = np.hypot(bd[:, 0] - corner[0], bd[:, 1] - corner[1])
    near = bd[d < max_dist]
    if len(near) < 25:
        return None
    # 拟合圆后剔除离群点再拟一次
    cx_, cy_, r_ = fit_circle(near)
    res = np.abs(np.hypot(near[:, 0] - cx_, near[:, 1] - cy_) - r_)
    keep = res < max(2.5, 2.0 * np.median(res))
    if keep.sum() < 20:
        return None
    return fit_circle(near[keep])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registry", nargs="?", default="studio/plates.json")
    ap.add_argument("--apply", action="store_true", help="把量出的画布圆角写回注册表")
    ap.add_argument("--root", default=".", help="仓库根（拼 plates/... 用）")
    args = ap.parse_args()

    reg = json.load(open(args.registry, encoding="utf-8"))
    out = []
    for e in reg["environments"]:
        src = os.path.join(args.root, "public", e["env"]["src"].replace("plates/", "plates" + os.sep))
        if not os.path.exists(src):
            print("跳过 %s（找不到 %s）" % (e["name"], src))
            continue
        L = load(src)
        q = e["env"]["quad"]
        Q = np.array([[p[0], p[1]] for p in q], float)
        cxy = Q.mean(axis=0)

        # 屏内亮度：取四边形中心 40% 区域的均值
        inner = np.zeros((FRAME_H, FRAME_W), bool)
        # 简单多边形填充
        ys, xs = np.mgrid[0:FRAME_H, 0:FRAME_W]
        inside = np.ones((FRAME_H, FRAME_W), bool)
        for i in range(4):
            x1_, y1_ = Q[i]
            x2_, y2_ = Q[(i + 1) % 4]
            inside &= ((y1_ > ys) != (y2_ > ys))
        # 用凸四边形的半平面法（保证方向一致性）
        inside = np.ones((FRAME_H, FRAME_W), bool)
        for i in range(4):
            a = Q[i]
            b = Q[(i + 1) % 4]
            e_ = b - a
            n_ = np.array([-e_[1], e_[0]])
            if np.dot(n_, (Q.mean(axis=0) - a)) > 0:
                n_ = -n_
            inside &= ((xs - a[0]) * n_[0] + (ys - a[1]) * n_[1]) < 0
        screen_level = float(np.median(L[inside])) if inside.any() else 128.0
        # 边框亮度：沿四边形外扩 14px 的一圈
        out_ring = np.zeros_like(inside)
        for i in range(4):
            a = Q[i]
            b = Q[(i + 1) % 4]
            e_ = b - a
            ln = np.linalg.norm(e_)
            n_ = np.array([-e_[1], e_[0]]) / max(1e-9, ln)
            if np.dot(n_, (Q.mean(axis=0) - a)) > 0:
                n_ = -n_
            # 线段采样点
            for t in np.linspace(0.15, 0.85, 60):
                p = a + e_ * t + n_ * 14
                xi, yi = int(p[0]), int(p[1])
                if 0 <= xi < FRAME_W and 0 <= yi < FRAME_H:
                    out_ring[yi, xi] = True
        out_ring_d = np.zeros_like(out_ring)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                sh = np.roll(np.roll(out_ring, dy, 0), dx, 1)
                out_ring_d |= sh
        bezel_level = float(np.median(L[out_ring_d])) if out_ring_d.any() else 30.0

        radii = []
        for i, nm in enumerate(["TL", "TR", "BR", "BL"]):
            r = measure_corner(L, Q[i], screen_level, bezel_level)
            if r:
                radii.append(r[2])
                print("  %-14s %s  r=%.1fpx  圆心(%.0f,%.0f)" % (e["name"], nm, r[2], r[0], r[1]))
            else:
                print("  %-14s %s  测不到" % (e["name"], nm))
        if not radii:
            continue
        r_frame = float(np.median(radii))
        w_f = float((np.linalg.norm(Q[1] - Q[0]) + np.linalg.norm(Q[2] - Q[3])) / 2)
        r_canvas = r_frame * CANVAS_W / w_f
        old = e["env"].get("cornerRadius")
        print("  => %-14s 屏宽 %.0fpx  圆角 %.1fpx(成片)  画布空间 %.0f（原来 %s）"
              % (e["name"], w_f, r_frame, r_canvas, old))
        out.append((e["name"], int(round(r_canvas)), old, r_frame, w_f))
        if args.apply:
            e["env"]["cornerRadius"] = int(round(r_canvas))

    print("")
    print("  %-14s %-10s %-10s %-10s" % ("环境", "原 cornerRadius", "新", "成片圆角px"))
    for nm, new, old, rf, wf in out:
        print("  %-14s %-16s %-10d %.1f" % (nm, old, new, rf))
    if args.apply:
        json.dump(reg, open(args.registry, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\n  已写回 %s" % args.registry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
