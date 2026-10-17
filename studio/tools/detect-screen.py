#!/usr/bin/env python
"""detect-screen.py - 在新背景板上自动找出屏幕四边形，并算出 env 参数。

为什么要有这个工具：上一次求四角花了约 10 轮「渲一帧→看→手动调坐标」。
根因是靠肉眼在缩略图上量。这里改成**程序化定位 + 输出可核对的叠加图**。

做法（两步，缺一不可）：
  1. 粗定位：亮屏假设 —— 屏幕是一块又亮又低饱和的大平面。连通域取最大块，
     用四个极值点（min/max of x+y、x-y）得到初始四边形。
     极值点只由单个像素决定，有 1~3px 抖动，所以必须第二步。
  2. 精定位：边缘吸附 —— 沿每条边采 90 点，每点沿法线 ±26px 找灰度梯度最大处，
     拟合直线（总最小二乘 + 剔除离群），四条线求交。迭代到角位移 <0.15px。
     这是 quad-snap.py 验证过的算法（上一块板收敛到 0.15px）。

不适用：屏幕是**暗色**的板子。那种情况用 --mode dark，且阈值要重调。

用法：
    python studio/tools/detect-screen.py out/plates-work/plate-A1.png --overlay out/ov.png
    python studio/tools/detect-screen.py plate.png --json out/env.json --name studio-desk.png
"""

import argparse
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CANVAS_W = 1600           # 屏幕画布宽（有效字号换算基准）
DARK_SCREEN_LUMA = 50.0   # 深色主题屏内典型平均亮度（实测）
TARGET_DARK_AVG = 96.0    # 暗页帧目标（验收下限 94，留 2 分余量）
AREA_LO, AREA_HI = 0.090, 0.180   # 屏幕占比可用窗口


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def segment_screen(a, work=960, edge_thresh=10.0, luma_lo=118.0, luma_hi=238.0, seed=None, verbose=True):
    """按「不跨越边缘」的洪水填充找屏幕。

    为什么不用绝对亮度阈值：新板子的屏内亮度是个渐变（左暗右亮，140~245），
    固定阈值会把屏幕切成几块，极值点直接跑偏（第一版就是这么错的）。
    屏幕的本质特征是「内部平滑、边界突变」，所以用梯度当围墙的洪水填充才对。

    再乘三个形状/亮度约束，把窗户、灯罩这些别的亮区排掉：
      · 平均亮度落在 [118, 238]（窗户和灯罩通常 >240，夜景 >90）
      · 面积占比 [1.5%, 35%]
      · 填充率（面积 / 外接框面积）> 0.55（四边形大致都是这个量级）
    """
    h, w = a.shape[:2]
    sc = w / float(work)
    small = np.asarray(
        Image.fromarray(a.astype(np.uint8), "RGB").resize((work, int(h / sc)), Image.BOX)
    ).astype(np.float32)
    g = luma(small)
    gb = np.asarray(
        Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.0))
    ).astype(np.float32)
    gx = np.abs(np.diff(gb, axis=1, prepend=gb[:, :1]))
    gy = np.abs(np.diff(gb, axis=0, prepend=gb[:1, :]))
    barrier = (gx + gy) > edge_thresh

    H, W = g.shape
    seen = np.zeros((H, W), bool)
    cands = []

    def fill(sy, sx):
        q = deque([(sy, sx)])
        seen[sy, sx] = True
        cells = []
        while q:
            y, x = q.popleft()
            cells.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and not barrier[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        return cells

    if seed is not None:
        sx = min(max(int(seed[0] / sc), 0), W - 1)
        sy = min(max(int(seed[1] / sc), 0), H - 1)
        if barrier[sy, sx]:
            free = np.argwhere(~barrier)
            d = (free[:, 0] - sy) ** 2 + (free[:, 1] - sx) ** 2
            sy, sx = free[int(np.argmin(d))]
        cells = fill(sy, sx)
        ys = np.array([c[0] for c in cells])
        xs = np.array([c[1] for c in cells])
        return np.column_stack([xs * sc, ys * sc]), 1

    for sy in range(0, H, 6):
        for sx in range(0, W, 6):
            if barrier[sy, sx] or seen[sy, sx]:
                continue
            cells = fill(sy, sx)
            if len(cells) < 0.012 * H * W:
                continue
            ys = np.array([c[0] for c in cells])
            xs = np.array([c[1] for c in cells])
            bw = xs.max() - xs.min() + 1
            bh = ys.max() - ys.min() + 1
            fill_ratio = len(cells) / float(bw * bh)
            ml = float(g[ys, xs].mean())
            cands.append(
                dict(n=len(cells), box=(int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
                     fill=fill_ratio, luma=ml, area=len(cells) / float(H * W),
                     pts=np.column_stack([xs * sc, ys * sc]))
            )
    if verbose:
        print("  候选区域（按面积）：")
        for c in sorted(cands, key=lambda c: -c["n"])[:6]:
            print("    area %5.1f%%  luma %5.1f  fill %.2f  box %s" % (
                c["area"] * 100, c["luma"], c["fill"], c["box"]))
    good = [c for c in cands
            if 0.015 <= c["area"] <= 0.35 and luma_lo <= c["luma"] <= luma_hi and c["fill"] > 0.55]
    if not good:
        return None, 0
    best = max(good, key=lambda c: c["n"])
    return best["pts"], len(good)


def quad_from_points(pts):
    """四极值点：对凸四边形且无大角度旋转成立。"""
    X, Y = pts[:, 0], pts[:, 1]
    i = [np.argmin(X + Y), np.argmax(X - Y), np.argmax(X + Y), np.argmin(X - Y)]
    return np.array([[X[k], Y[k]] for k in i])


def _unit(v):
    n = (v[0] ** 2 + v[1] ** 2) ** 0.5
    return v / n if n else v


def refine_quad(L, quad, n=90, radius=26, iters=6, min_resp=6.0):
    """边缘吸附。返回 (quad, ok)。"""
    def grad(x, y):
        xi, yi = int(round(x)), int(round(y))
        if xi < 1 or yi < 1 or xi >= L.shape[1] - 1 or yi >= L.shape[0] - 1:
            return 0.0
        gx = L[yi, xi + 1] - L[yi, xi - 1]
        gy = L[yi + 1, xi] - L[yi - 1, xi]
        return (gx * gx + gy * gy) ** 0.5

    Q = quad.copy()
    for _ in range(iters):
        TL, TR, BR, BL = Q
        centroid = Q.mean(axis=0)
        lines = []
        for (p, q) in ((TL, TR), (TR, BR), (BR, BL), (BL, TL)):
            d = q - p
            nrm = _unit(np.array([-d[1], d[0]]))
            if np.dot(nrm, _unit((p + q) / 2 - centroid)) < 0:
                nrm = -nrm
            pts = []
            for i in range(n):
                t = 0.06 + 0.88 * i / (n - 1)
                base = p + d * t
                best_s, best_v = 0.0, -1.0
                for ss in np.arange(-radius, radius + 0.5, 0.5):
                    v = grad(base[0] + nrm[0] * ss, base[1] + nrm[1] * ss)
                    if v > best_v:
                        best_v, best_s = v, ss
                if best_v > min_resp:
                    pts.append(base + nrm * best_s)
            if len(pts) < 10:
                return Q, False
            P = np.array(pts)
            c = P.mean(axis=0)
            for _r in range(3):
                _u, _s, vt = np.linalg.svd(P - c)
                dd = vt[0]
                nv = np.array([-dd[1], dd[0]])
                res = np.abs((P - c) @ nv)
                keep = res < max(1.5, np.percentile(res, 70))
                if keep.sum() < 8:
                    break
                P = P[keep]
                c = P.mean(axis=0)
            _u, _s, vt = np.linalg.svd(P - c)
            lines.append((c, vt[0]))

        def inter(l1, l2):
            (c1, d1), (c2, d2) = l1, l2
            A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
            if abs(np.linalg.det(A)) < 1e-9:
                return None
            t = np.linalg.solve(A, c2 - c1)
            return c1 + d1 * t[0]

        top, right, bottom, left = lines
        corners = [inter(left, top), inter(top, right), inter(right, bottom), inter(bottom, left)]
        if any(v is None for v in corners):
            return Q, False
        nQ = np.array(corners)
        delta = float(np.abs(nQ - Q).max())
        Q = nQ
        if delta < 0.15:
            break
    return Q, True


def quad_metrics(quad, L):
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    inside = np.zeros((h, w), bool)
    for i in range(len(quad)):
        x1, y1 = quad[i]
        x2, y2 = quad[(i + 1) % len(quad)]
        cond = (y1 > yy) != (y2 > yy)
        xint = (x2 - x1) * (yy - y1) / (y2 - y1 if y2 != y1 else 1e-9) + x1
        inside ^= cond & (xx < xint)
    top = float(np.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]))
    bot = float(np.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]))
    return {
        "area_pct": float(inside.mean() * 100),
        "screen_w": (top + bot) / 2.0,
        "inside_luma": float(L[inside].mean()),
        "outside_luma": float(L[~inside].mean()),
    }


def suggest_exposure(area_frac):
    """反推房间亮度：使暗页帧整帧均值达到 TARGET_DARK_AVG。

    整帧 = (1-a)·房间 + a·屏内，再扣掉强调层压暗的平均损耗（实测拟合 0.955·W+0.315）。
    """
    W = (TARGET_DARK_AVG - 0.315) / 0.955
    return (W - DARK_SCREEN_LUMA * area_frac) / (1.0 - area_frac)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--overlay", default=None)
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--edge-thresh", type=float, default=10.0)
    ap.add_argument("--seed", default=None, help="手动给一个屏幕内的像素坐标 x,y（自动失败时用）")
    ap.add_argument("--name", default=None, help="环境名，写进 env json 的 src")
    args = ap.parse_args()

    im = Image.open(args.plate).convert("RGB").resize((1920, 1080), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    L = luma(a)

    seed = None
    if args.seed:
        seed = tuple(float(v) for v in args.seed.split(","))
    pts, n_ok = segment_screen(a, edge_thresh=args.edge_thresh, seed=seed)
    if pts is None:
        print("没找到像屏幕的区域。用 --seed x,y 指定一个屏幕内的点", file=sys.stderr)
        return 2
    guess = quad_from_points(pts)

    blur = np.asarray(
        Image.fromarray(np.clip(L, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2))
    ).astype(np.float32)
    quad, snapped = refine_quad(blur, guess)
    if not snapped:
        print("! 边缘吸附失败，退回极值点结果（可能不准，务必看叠加图）")
        quad = guess

    m = quad_metrics(quad, blur)
    a_frac = m["area_pct"] / 100.0
    R = suggest_exposure(a_frac)
    exp = R / m["outside_luma"] if m["outside_luma"] > 1 else 1.0
    eff = m["screen_w"] / CANVAS_W * 34.0

    tl, tr, br, bl = quad
    top = float(np.hypot(tr[0] - tl[0], tr[1] - tl[1]))
    bot = float(np.hypot(br[0] - bl[0], br[1] - bl[1]))
    left = float(np.hypot(bl[0] - tl[0], bl[1] - tl[1]))
    right = float(np.hypot(br[0] - tr[0], br[1] - tr[1]))

    print("")
    print("=== %s ===" % os.path.basename(args.plate))
    for nm, p in zip(("TL", "TR", "BR", "BL"), quad):
        print("  %s = (%7.1f, %7.1f)" % (nm, p[0], p[1]))
    print("  屏幕宽 %.1f px   占全帧 %.2f%%   屏内 %.1f   屏外 %.1f" % (
        m["screen_w"], m["area_pct"], m["inside_luma"], m["outside_luma"]))
    print("  34px 画布字号 -> 成片 %.2fpx %s" % (eff, "OK" if eff >= 10 else "FAIL(<10px)"))
    print("  建议 exposure %.3f   (房间目标亮度 %.1f)" % (exp, R))
    ok_area = AREA_LO <= a_frac <= AREA_HI
    print("  屏幕占比窗口 %.0f%%~%.0f%% -> %s" % (
        AREA_LO * 100, AREA_HI * 100,
        "OK" if ok_area else ("偏小（字号会不够）" if a_frac < AREA_LO else "偏大（暗页帧会跌破 94）")))
    print("  边长 上%.0f 下%.0f 左%.0f 右%.0f  (左/右 %.2f, 上/下 %.2f)" % (
        top, bot, left, right, left / max(right, 1), top / max(bot, 1)))
    ratio = ((top + bot) / 2) / max((left + right) / 2, 1)
    print("  矫正宽高比 ≈ %.2f  (画布 1.333；偏差 >15%% 会看出拉伸)" % ratio)

    if args.overlay:
        d = os.path.dirname(args.overlay)
        if d:
            os.makedirs(d, exist_ok=True)
        ov = im.copy()
        dr = ImageDraw.Draw(ov)
        poly = [tuple(p) for p in quad]
        dr.line(poly + [poly[0]], fill=(255, 40, 70), width=4)
        for nm, p in zip(("TL", "TR", "BR", "BL"), quad):
            dr.ellipse([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9], fill=(255, 40, 70))
            dr.text((p[0] + 12, p[1] - 6), nm, fill=(255, 255, 0))
        ov.save(args.overlay)
        print("  叠加图 ->", args.overlay)

    payload = {
        "src": "plates/%s" % (args.name or os.path.basename(args.plate)),
        "quad": [[int(round(float(p[0]))), int(round(float(p[1])))] for p in quad],
        "cornerRadius": 76,
        "exposure": round(exp, 3),
        "_metrics": {
            "screen_w": round(m["screen_w"], 1),
            "area_pct": round(m["area_pct"], 2),
            "inside_luma": round(m["inside_luma"], 1),
            "outside_luma": round(m["outside_luma"], 1),
            "effective_font_px_at_34": round(eff, 2),
            "corrected_aspect": round(ratio, 3),
        },
    }
    if args.json_out:
        d = os.path.dirname(args.json_out)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        print("  env json ->", args.json_out)
    print("")
    return 0


if __name__ == "__main__":
    sys.exit(main())
