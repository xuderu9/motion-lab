#!/usr/bin/env python
"""refit-quad.py - 按「边框暗环」重新定位屏幕四边，并给出每条边的偏差量。

判据：屏幕内部是亮的中性灰（160~250），边框是暗环（10~50）。从四边形内部沿法线
向外扫，**第一次跌破 0.6×屏内亮度**的位置就是屏幕的几何边缘。窗外再亮也不影响，
因为先碰到的一定是边框。

用法：
    python studio/tools/refit-quad.py studio/plates.json            # 只报告每条边偏多少
    python studio/tools/refit-quad.py studio/plates.json --apply    # 直接把四边形改到位
"""

import argparse
import json
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


def bilerp(L, x, y):
    if not (0 <= x < FW - 1 and 0 <= y < FH - 1):
        return None
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    return (L[y0, x0] * (1 - fx) * (1 - fy) + L[y0, x0 + 1] * fx * (1 - fy)
            + L[y0 + 1, x0] * (1 - fx) * fy + L[y0 + 1, x0 + 1] * fx * fy)


def poly_mask(Q):
    ys, xs = np.mgrid[0:FH, 0:FW]
    inside = np.ones((FH, FW), bool)
    c = Q.mean(axis=0)
    for i in range(4):
        a, b = Q[i], Q[(i + 1) % 4]
        e = b - a
        n = np.array([-e[1], e[0]], float)
        # 统一让法线指向内（朝四边形中心），内部就是与内法线同侧的点
        if np.dot(n, c - a) < 0:
            n = -n
        inside &= ((xs - a[0]) * n[0] + (ys - a[1]) * n[1]) > 0
    return inside


def edge_offsets(L, Q, screen_level, samples=140, span=40.0):
    """每条边：沿法线向外扫，找第一次跌破 0.6×屏内亮度的位置；返回相对当前边的偏移。"""
    center = Q.mean(axis=0)
    out = []
    for e in range(4):
        p, q = Q[e], Q[(e + 1) % 4]
        d = q - p
        ln = np.linalg.norm(d)
        n = np.array([-d[1], d[0]], float) / ln
        if np.dot(n, center - p) > 0:
            n = -n
        th = 0.6 * screen_level
        offs = []
        for t in np.linspace(0.08, 0.92, samples):
            base = p + d * t
            hit = None
            for s in np.arange(0.0, span, 0.5):
                v = bilerp(L, base[0] + n[0] * s, base[1] + n[1] * s)
                if v is None:
                    break
                if v < th:
                    hit = s
                    break
            if hit is not None:
                offs.append(hit)
        offs = np.array(offs)
        if len(offs) < 30:
            out.append((None, None))
            continue
        med = float(np.median(offs))
        keep = np.abs(offs - med) < max(2.5, 2.2 * np.std(offs))
        out.append((float(np.median(offs[keep])) if keep.any() else med, len(offs)))
    return out


def expand_edges(Q, per_edge):
    """把每条边沿外法线平移 per_edge[i]，返回新的四边形（相邻边求交）。"""
    center = Q.mean(axis=0)
    lines = []
    for e in range(4):
        p, q = Q[e], Q[(e + 1) % 4]
        d = q - p
        ln = np.linalg.norm(d)
        n = np.array([-d[1], d[0]], float) / ln
        if np.dot(n, center - p) > 0:
            n = -n
        off = per_edge[e] if per_edge[e] is not None else 0.0
        p2 = p + n * off
        lines.append((p2, d / ln))
    newQ = []
    for e in range(4):
        (c1, d1), (c2, d2) = lines[e - 1], lines[e]
        A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
        b = c2 - c1
        if abs(np.linalg.det(A)) < 1e-9:
            newQ.append(Q[e])
            continue
        t = np.linalg.solve(A, b)
        newQ.append(c1 + d1 * t[0])
    return np.array(newQ)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registry", nargs="?", default="studio/plates.json")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--root", default=".")
    ap.add_argument("--rounds", type=int, default=2)
    args = ap.parse_args()

    reg = json.load(open(args.registry, encoding="utf-8"))
    for e in reg["environments"]:
        src = os.path.join(args.root, "public", e["env"]["src"])
        if not os.path.exists(src):
            print("跳过 %s" % e["name"])
            continue
        L = load(src)
        Q = np.array(e["env"]["quad"], float)
        m = poly_mask(Q)
        screen_level = float(np.median(L[m])) if m.any() else 180.0
        print("%-14s 屏内亮度 %.0f  阈值 %.0f" % (e["name"], screen_level, 0.6 * screen_level))

        for rd in range(args.rounds):
            offs = edge_offsets(L, Q, screen_level)
            shown = ["%s" % ("—" if o is None else "%+.1f" % o) for o, _ in offs]
            print("   轮%d 各边还需外移(px): %s" % (rd + 1, shown))
            if all(o is None or abs(o) < 0.8 for o, _ in offs):
                break
            Q = expand_edges(Q, [o for o, _ in offs])
            m = poly_mask(Q)
            screen_level = float(np.median(L[m]))

        offs = edge_offsets(L, Q, screen_level)
        res = ["%+.1f" % o if o is not None else "—" for o, _ in offs]
        print("   收敛后残差: %s" % res)
        if args.apply:
            e["env"]["quad"] = [[int(round(p[0])), int(round(p[1]))] for p in Q]
            print("   已写回 quad: %s" % e["env"]["quad"])
            # 顺带更新曝光与圆角
            w = float((np.linalg.norm(Q[1] - Q[0]) + np.linalg.norm(Q[2] - Q[3])) / 2)
            h = float((np.linalg.norm(Q[3] - Q[0]) + np.linalg.norm(Q[2] - Q[1])) / 2)
            e.setdefault("_metrics", {})["screen_w"] = round(w, 1)
            e["_metrics"]["aspect"] = round(w / h, 3)
            print("   屏宽 %.1f  宽高比 %.3f" % (w, w / h))

    if args.apply:
        json.dump(reg, open(args.registry, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\n已写回 %s" % args.registry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
