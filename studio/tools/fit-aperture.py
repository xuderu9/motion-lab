#!/usr/bin/env python
"""fit-aperture.py - 直接量出背景板里屏幕「开口」的四条边和圆角半径。

为什么需要它：detect-screen 的梯度吸附会被屏幕内侧的暗角/反光带偏，
逐边「最大化亮度台阶」也会偏向更亮的那一圈反光。两者都只能保证
「找到了一块像屏幕的区域」，不能保证「这条线就是屏幕边缘」。

这里换个不依赖极值的方法：沿每条边的法线扫一条亮度剖面，取
**外暗→内亮的 50% 过零点**（几何边缘的定义），再用鲁棒直线拟合出四条边，
最后求交点得到四角；同时在每个角附近取弧上的点，拟合圆得到圆角半径。

用法：
    python studio/tools/fit-aperture.py public/plates/window-day.png \
        --quad "377,254;919,196;1101,688;580,821"
    python studio/tools/fit-aperture.py <plate> --quad ... --apply studio/plates.json --name window-day
"""

import argparse
import json
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FRAME_W, FRAME_H = 1920, 1080
CANVAS_W, CANVAS_H = 1600, 1200


def luma(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def load_plate(path):
    im = Image.open(path).convert("RGB").resize((FRAME_W, FRAME_H), Image.LANCZOS)
    return luma(np.asarray(im).astype(np.float32))


def sample(L, pt):
    x, y = float(pt[0]), float(pt[1])
    if not (0 <= x < FRAME_W - 1 and 0 <= y < FRAME_H - 1):
        return None
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    fx, fy = x - x0, y - y0
    return (
        L[y0, x0] * (1 - fx) * (1 - fy)
        + L[y0, x0 + 1] * fx * (1 - fy)
        + L[y0 + 1, x0] * (1 - fx) * fy
        + L[y0 + 1, x0 + 1] * fx * fy
    )


def outward_normal(p, q, center):
    d = np.array(q, float) - np.array(p, float)
    ln = np.hypot(*d)
    if ln < 1:
        return None
    n = np.array([-d[1], d[0]]) / ln
    mid = (np.array(p, float) + np.array(q, float)) / 2
    if np.dot(n, mid - center) < 0:
        n = -n
    return n


def crossing_along_normal(L, base, n, span=45, steps=181):
    """沿法线取亮度剖面，返回「外暗→内亮」的 50% 过零点（相对 base 的偏移，正=外侧）。"""
    ss = np.linspace(span, -span, steps)          # 从外往里扫
    vals = np.empty(steps, dtype=np.float32)
    for i, s in enumerate(ss):
        v = sample(L, base + n * s)
        vals[i] = np.nan if v is None else v
    if np.isnan(vals).any():
        return None
    outer = vals[: steps // 3].mean()              # 外侧（边框）
    inner = vals[-steps // 3 :].mean()             # 内侧（屏幕）
    if inner - outer < 15:                         # 台阶太小，这条线不可信
        return None
    th = (inner + outer) / 2.0
    # 从外往里，找第一次越过阈值
    for i in range(1, steps):
        if vals[i - 1] < th <= vals[i]:
            # 线性插值到过零点
            t = (th - vals[i - 1]) / max(1e-6, vals[i] - vals[i - 1])
            return float(ss[i - 1] + (ss[i] - ss[i - 1]) * t)
    return None


def fit_line(pts):
    """总体最小二乘（TLS）直线拟合，返回 (点, 单位方向)。"""
    A = np.asarray(pts, float)
    c = A.mean(axis=0)
    u, s, vt = np.linalg.svd(A - c)
    return c, vt[0] / np.linalg.norm(vt[0])


def intersect(l1, l2):
    c1, d1 = l1
    c2, d2 = l2
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    b = c2 - c1
    det = np.linalg.det(A)
    if abs(det) < 1e-9:
        return None
    t = np.linalg.solve(A, b)
    return c1 + d1 * t[0]


def fit_circle(pts):
    """代数最小二乘拟合圆，返回 (cx, cy, r)。"""
    A = np.asarray(pts, float)
    x, y = A[:, 0], A[:, 1]
    M = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x * x + y * y
    sol, *_ = np.linalg.lstsq(M, b, rcond=None)
    cx, cy, c = sol
    r = np.sqrt(max(0.0, c + cx * cx + cy * cy))
    return float(cx), float(cy), float(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--quad", required=True, help="起点四边形 x1,y1;x2,y2;x3,y3;x4,y4（1920 空间）")
    ap.add_argument("--samples", type=int, default=90)
    ap.add_argument("--apply", default=None, help="把结果写回注册表 json")
    ap.add_argument("--name", default=None, help="环境名（配合 --apply）")
    ap.add_argument("--overlay", default=None)
    args = ap.parse_args()

    nums = [float(v) for v in args.quad.replace(";", ",").split(",")]
    Q = np.array([[nums[0], nums[1]], [nums[2], nums[3]],
                  [nums[4], nums[5]], [nums[6], nums[7]]], float)
    L = load_plate(args.plate)
    center = Q.mean(axis=0)

    edges, stats = [], []
    for e in range(4):
        p, q = Q[e], Q[(e + 1) % 4]
        n = outward_normal(p, q, center)
        pts, offs = [], []
        for t in np.linspace(0.10, 0.90, args.samples):
            base = p + (q - p) * t
            s = crossing_along_normal(L, base, n)
            if s is None:
                continue
            offs.append(s)
            pts.append(base + n * s)
        if len(pts) < 12:
            print("边%d 采样不足（%d），放弃" % (e, len(pts)), file=sys.stderr)
            return 3
        # 去掉离群（反光圈/图标造成的误判）
        offs = np.array(offs)
        med = np.median(offs)
        keep = np.abs(offs - med) < max(3.0, 2.5 * np.std(offs))
        pts = [pt for pt, k in zip(pts, keep) if k]
        edges.append(fit_line(pts))
        stats.append((e, float(med), float(np.median(offs[keep]) if keep.any() else med), len(pts)))

    # 四角 = 相邻边交点
    newQ = []
    for e in range(4):
        pt = intersect(edges[e - 1], edges[e])
        if pt is None:
            print("角%d 求解失败" % e, file=sys.stderr)
            return 4
        newQ.append(pt)
    newQ = np.array(newQ)

    # 圆角半径：在每个角附近，沿两条边各退 r，取弧上的点拟合圆
    radii = []
    for e in range(4):
        corner = newQ[e]
        p1 = newQ[e - 1]
        p2 = newQ[(e + 1) % 4]
        d1 = (p1 - corner) / np.linalg.norm(p1 - corner)
        d2 = (p2 - corner) / np.linalg.norm(p2 - corner)
        arc = []
        for r in np.linspace(12, 90, 26):
            for d in (d1, d2):
                pt = corner + d * r
                if 0 <= pt[0] < FRAME_W - 1 and 0 <= pt[1] < FRAME_H - 1:
                    arc.append(pt)
        # 对每个候选半径，检查该点是否在「亮侧」——真实圆角把角上的亮点切掉
        best = None
        for r in range(10, 96):
            ok = 0
            tot = 0
            for k in range(24):
                th = -np.pi / 4 + (np.pi / 2) * k / 23
                # 角内侧的弧点
                u = (d1 * np.cos(th + np.pi / 4) + d2 * np.sin(th + np.pi / 4))
                u = u / max(1e-9, np.linalg.norm(u))
                pt = corner + u * r
                v = sample(L, pt)
                if v is None:
                    continue
                tot += 1
                ok += 1 if v > 120 else 0
            if tot >= 18 and ok / tot > 0.75:
                best = r if best is None else max(best, r)
        if best:
            radii.append(best)

    r_frame = float(np.median(radii)) if radii else 24.0
    w_f = float(np.linalg.norm(newQ[1] - newQ[0]))
    h_f = float(np.linalg.norm(newQ[2] - newQ[1]))
    r_canvas = r_frame * CANVAS_W / w_f

    print("")
    print("=== 量出的开口 ===  %s" % args.plate)
    for i, nm in enumerate(["TL", "TR", "BR", "BL"]):
        print("  %s = (%7.1f, %7.1f)   原 quad = (%7.1f, %7.1f)   位移 %5.1fpx"
              % (nm, newQ[i][0], newQ[i][1], Q[i][0], Q[i][1], float(np.linalg.norm(newQ[i] - Q[i]))))
    print("  边宽 %.1f x %.1f px   宽高比 %.3f  (画布 %.3f)" % (w_f, h_f, w_f / h_f, CANVAS_W / CANVAS_H))
    print("  圆角半径 %.1f px（成片空间）-> 画布空间 %.0f" % (r_frame, r_canvas))
    print("  每边过零点中位偏移 %s" % [round(s[1], 1) for s in stats])
    print("")
    print("  提示：屏幕占比会随开口变大而变化，exposure 需要重算（跑 detect-screen --seed-quad 新角）")

    quad_out = [[int(round(p[0])), int(round(p[1]))] for p in newQ]
    print("  quad: %s" % ";".join("%d,%d" % (p[0], p[1]) for p in quad_out))

    if args.apply:
        reg = json.load(open(args.apply, encoding="utf-8"))
        hit = False
        for e in reg["environments"]:
            if e["name"] == args.name:
                e["env"]["quad"] = quad_out
                e["env"]["cornerRadius"] = int(round(r_canvas))
                e["_quadScale"] = 1.0
                hit = True
        if not hit:
            print("注册表里没有 %s" % args.name, file=sys.stderr)
            return 5
        json.dump(reg, open(args.apply, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("  已写回 %s" % args.name)

    if args.overlay:
        im = Image.open(args.plate).convert("RGB").resize((FRAME_W, FRAME_H), Image.LANCZOS)
        from PIL import ImageDraw
        d = ImageDraw.Draw(im)
        d.line([tuple(p) for p in Q] + [tuple(Q[0])], fill=(255, 60, 60), width=3)
        d.line([tuple(p) for p in newQ] + [tuple(newQ[0])], fill=(60, 255, 120), width=2)
        im.save(args.overlay)
        print("  叠加图 -> %s（红=原 quad，绿=量出的开口）" % args.overlay)

    return 0


if __name__ == "__main__":
    sys.exit(main())
