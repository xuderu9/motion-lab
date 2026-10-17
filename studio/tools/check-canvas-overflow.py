#!/usr/bin/env python
"""check-canvas-overflow.py - 检查版式内容有没有顶到画布边界（被切掉）。

为什么需要这个：`check-shot.py` 的品红探针只能发现「内容画到了屏幕四边形外面」，
**发现不了「内容画到了 1600×1200 画布外面」** —— 那种情况会被 ScreenLayer 的
roundRect 直接裁掉，探针根本看不见，但人眼一看就是「字/卡片被切了一半」。

做法：用同一套单应矩阵把「画布边缘 6px 环带」反向映射到成片坐标，
在静帧上采样，然后看这一圈里有多少像素明显偏离该环带自身的中位色。
· 正常版式：边缘一圈就是背景色，离群像素接近 0
· 内容溢出：文字行、卡片边框会一头撞在边界上，离群像素比例明显升高

自校准：用环带自己的中位数当背景基准，不需要知道主题色。

用法：
    python studio/tools/check-canvas-overflow.py --dir out/m2 --shots-json studio/shots/m2.json
    python studio/tools/check-canvas-overflow.py --dir out/m1 --shots-json studio/shots/demo.json
"""

import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CANVAS_W, CANVAS_H = 1600, 1200
BAND = 6          # 环带宽度（画布像素）
STEP = 2          # 采样步长
OUTLIER = 45.0    # 与环带中位色的亮度差超过这个值算「有内容」
WARN_PCT = 1.5    # 离群比例超过这个数就告警（%）


def homography(quad, w, h):
    """单位正方形 -> 四边形 的 3x3 矩阵（Heckbert 闭式解）。"""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = quad
    dx1, dx2, dx3 = x1 - x2, x3 - x2, x0 - x1 + x2 - x3
    dy1, dy2, dy3 = y1 - y2, y3 - y2, y0 - y1 + y2 - y3
    if abs(dx3) < 1e-9 and abs(dy3) < 1e-9:
        a, b, c = x1 - x0, x2 - x1, x0
        d, e, f = y1 - y0, y2 - y1, y0
        g = hh = 0.0
    else:
        den = dx1 * dy2 - dx2 * dy1
        g = (dx3 * dy2 - dx2 * dy3) / den
        hh = (dx1 * dy3 - dx3 * dy1) / den
        a = x1 - x0 + g * x1
        b = x3 - x0 + hh * x3
        c = x0
        d = y1 - y0 + g * y1
        e = y3 - y0 + hh * y3
        f = y0
    # 单位正方形上的解 -> 画布像素坐标
    return np.array([
        [a / w, b / h, c],
        [d / w, e / h, f],
        [g / w, hh / h, 1.0],
    ], dtype=np.float64)


def border_samples():
    """返回 (pts, note)。已排除四个圆角区域。

    为什么必须排除圆角：画布用 roundRect(0,0,W,H,76) 裁剪，四个角在圆角半径内是
    **透明**的，会透出背景板的照片。若采样点落进去，就会把「照片的暗部」当成
    「内容溢出」—— 第一版没排除，浅色主题三个镜头恒定报 4.03%（正好是四个角的面积）。
    """
    R = 76 + 20  # 圆角半径 + 余量
    pts = []

    def push(x, y):
        if not (x < R and y < R) and not (x > CANVAS_W - R and y < R) \
           and not (x > CANVAS_W - R and y > CANVAS_H - R) \
           and not (x < R and y > CANVAS_H - R):
            pts.append((x, y))

    for x in range(BAND, CANVAS_W - BAND, STEP):
        for y in (BAND, CANVAS_H - BAND, BAND * 2, CANVAS_H - BAND * 2):
            push(x, y)
    for y in range(BAND, CANVAS_H - BAND, STEP):
        for x in (BAND, CANVAS_W - BAND, BAND * 2, CANVAS_W - BAND * 2):
            push(x, y)
    return np.array(pts, dtype=np.float64)


def sample(img, H, pts):
    p = np.hstack([pts, np.ones((len(pts), 1))])
    q = p @ H.T
    q[:, 0] /= q[:, 2]
    q[:, 1] /= q[:, 2]
    xs = np.clip(np.round(q[:, 0]).astype(int), 0, img.shape[1] - 1)
    ys = np.clip(np.round(q[:, 1]).astype(int), 0, img.shape[0] - 1)
    px = img[ys, xs]                       # (N,3) float
    lum = 0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]
    return lum


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="out/m2")
    ap.add_argument("--shots-json", default="studio/shots/m2.json")
    ap.add_argument("--warn", type=float, default=WARN_PCT)
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    specs = json.load(open(os.path.join(root, args.shots_json), encoding="utf-8"))["shots"]
    pts = border_samples()
    print("")
    print("=" * 78)
    print("画布边界溢出检查   %s   (%d 个采样点)" % (args.dir, len(pts)))
    print("=" * 78)
    rows = []
    for s in specs:
        p = os.path.join(root, args.dir, "stills", s["id"] + ".png")
        if not os.path.exists(p):
            continue
        img = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        H = homography(s["env"]["quad"], CANVAS_W, CANVAS_H)
        lum = sample(img, H, pts)
        med = float(np.median(lum))
        outl = float((np.abs(lum - med) > OUTLIER).mean() * 100.0)
        rows.append((s["id"], s["layout"], s["variant"], med, outl))

    rows.sort(key=lambda r: -r[4])
    for sid, lay, var, med, outl in rows:
        flag = "WARN" if outl > args.warn else "ok  "
        print("  %-4s %-22s %-9s v%d  环带中位亮度 %5.1f  离群 %5.2f%%" % (
            flag, sid, lay, var, med, outl))
    bad = [r for r in rows if r[4] > args.warn]
    print("-" * 78)
    if bad:
        print("  %d/%d 个镜头的内容顶到了画布边界（会被裁掉）" % (len(bad), len(rows)))
        print("  最严重: %s  %.2f%%" % (bad[0][0], bad[0][4]))
    else:
        print("  全部 %d 个镜头的画布边界是干净的" % len(rows))
    print("=" * 78)
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
