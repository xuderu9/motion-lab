#!/usr/bin/env python
"""measure-fit.py - 在「纯色探针」渲染帧上量画布边缘到黑边框的距离。

为什么在渲染帧上量而不是在背景板上量：
  · 不涉及任何坐标系换算（quad、plate 缩放、exposure 全都不相关）
  · 量的就是用户眼睛看到的那张图
  · 品红和黑边框的对比极强，阈值不会含糊

判据：沿四边形每条边采点，从画布边缘向外扫，**第一次遇到 luma < 55** 的位置
就是黑边框。距离为 0 表示正好贴住；正数表示还有多少像素的屏幕没被盖住（内缩）；
负数表示画布已经压到边框上（外扩过度）。

用法：
    python studio/tools/measure-fit.py --frame out/probe-radius/stills/p-window-day.png \
        --quad "355,240;929,178;1122,700;570,841"
"""

import argparse
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DARK = 55.0     # 黑边框判定阈值
SPAN = 80.0     # 向外最多找 80px


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True)
    ap.add_argument("--quad", required=True)
    ap.add_argument("--samples", type=int, default=120)
    ap.add_argument("--corners", action="store_true", help="只量四个角的缝（画布弧到设备弧的距离）")
    args = ap.parse_args()

    a = np.asarray(Image.open(args.frame).convert("RGB")).astype(np.float32)
    L = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    H, W = L.shape

    nums = [float(v) for v in args.quad.replace(";", ",").split(",")]
    Q = np.array([[nums[0], nums[1]], [nums[2], nums[3]],
                  [nums[4], nums[5]], [nums[6], nums[7]]], float)
    c = Q.mean(axis=0)

    def at(x, y):
        xi, yi = int(np.clip(x, 0, W - 1)), int(np.clip(y, 0, H - 1))
        return float(L[yi, xi])

    if args.corners:
        # 沿对角线从四边形顶点往中心走，量「品红出现点」到「屏幕(亮)消失点」的距离。
        # 这正是用户看到的「四角没对齐」——边上贴死、角上露白。
        print("  %-4s %-10s" % ("角", "角缝px"))
        gaps = []
        for e in range(4):
            corner = Q[e]
            diag = c - corner
            diag = diag / np.linalg.norm(diag)
            first_screen = None
            first_magenta = None
            for s_ in np.arange(0.0, 130.0, 0.5):
                v = L[int(np.clip(corner[1] + diag[1] * s_, 0, H - 1)),
                      int(np.clip(corner[0] + diag[0] * s_, 0, W - 1))]
                rgb = a[int(np.clip(corner[1] + diag[1] * s_, 0, H - 1)),
                        int(np.clip(corner[0] + diag[0] * s_, 0, W - 1))]
                is_magenta = rgb[0] > 150 and rgb[2] > 150 and rgb[1] < 110
                if first_magenta is None and is_magenta:
                    first_magenta = s_
                if first_screen is None and (v > 70 and not is_magenta):
                    first_screen = s_
                if first_magenta is not None and first_screen is not None:
                    break
            if first_magenta is not None and first_screen is not None:
                g = first_magenta - first_screen
                gaps.append(g)
                print("  %-4s %8.1f" % (["TL", "TR", "BR", "BL"][e], g))
            else:
                print("  %-4s   测不到（magenta=%s screen=%s）" % (
                    ["TL", "TR", "BR", "BL"][e], first_magenta, first_screen))
        if gaps:
            print("")
            print("  角缝中位 %.1fpx  判读：>3px = 圆角太大（露屏幕）；<0 = 圆角太小（盖边框）" % float(np.median(gaps)))
        return 0

    names = ["上", "右", "下", "左"]
    print("  %-4s %-10s %-10s %-10s" % ("边", "中位间距", "最小", "最大"))
    allmed = []
    for e in range(4):
        p, q = Q[e], Q[(e + 1) % 4]
        d = q - p
        ln = np.linalg.norm(d)
        n = np.array([-d[1], d[0]], float) / ln
        if np.dot(n, c - p) > 0:
            n = -n                       # 指向外侧
        gaps = []
        for t in np.linspace(0.06, 0.94, args.samples):
            base = p + d * t
            hit = None
            for s in np.arange(0.0, SPAN, 0.5):
                v = at(base[0] + n[0] * s, base[1] + n[1] * s)
                if v < DARK:
                    hit = s
                    break
            if hit is not None:
                gaps.append(hit)
        if not gaps:
            print("  %-4s 整条边上 %0.fpx 内都没遇到边框（画布外扩过多或该边不在图上）" % (names[e], SPAN))
            allmed.append(None)
            continue
        g = np.array(gaps)
        med = float(np.median(g))
        allmed.append(med)
        print("  %-4s %7.1fpx %9.1fpx %9.1fpx   (采到 %d/%d)" % (
            names[e], med, g.min(), g.max(), len(g), args.samples))

    ok = [m for m in allmed if m is not None]
    if ok:
        print("")
        print("  平均间距 %.1fpx   判读：0 = 正好贴边框；>2px = 还有屏幕没盖住；aborted = 已压到边框"
              % (sum(ok) / len(ok)))
        print("  建议：把四条边都向外移 %.1fpx（用 refit-quad.py --apply 或手工改 quad）" % (sum(ok) / len(ok)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
