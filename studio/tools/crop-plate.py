#!/usr/bin/env python
"""crop-plate.py - 把背景板裁到「屏幕占比」落在目标区间。

为什么需要：即梦 很难把平板放到指定的画面比例里。16 张候选里，屏幕占比落在
9%~18% 的只有 4 张。但**太小可以裁大，太大裁不了** ——
裁掉四周等于把屏幕放大：面积按 (裁剪倍率)² 增长。

代价：画布会按裁剪倍率放回 2560x1440，等效于上采样。
因为背景是大光圈虚化，上采样几乎看不出来；平板边框会略软，
所以裁剪倍率尽量控制在 1.4 以内（面积放大 ≈2 倍）。

用法：
    # 1) 先测出 quad 和当前面积
    python studio/tools/detect-screen.py plate-E4.png --json env-E4.json
    # 2) 裁到目标面积
    python studio/tools/crop-plate.py plate-E4.png --env env-E4.json --target-area 0.11 --out plate-E4c.png
    # 3) 对裁好的图重新测一遍（quad / exposure 都会变）
    python studio/tools/detect-screen.py plate-E4c.png --json env-E4c.json
"""

import argparse
import json
import math
import os
import sys

from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MIN_AREA, MAX_AREA = 0.090, 0.180


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--env", required=True, help="detect-screen.py 输出的 env json")
    ap.add_argument("--target-area", type=float, default=0.11)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-zoom", type=float, default=1.45, help="裁剪倍率上限，超过就放弃")
    args = ap.parse_args()

    env = json.load(open(args.env, encoding="utf-8"))
    quad = env["quad"]
    area = env.get("_metrics", {}).get("area_pct", 0) / 100.0
    if area <= 0:
        print("env json 里没有 area_pct，先重新跑 detect-screen.py", file=sys.stderr)
        return 2

    im = Image.open(args.plate).convert("RGB")
    W, H = im.size
    sx = W / 1920.0  # json 的坐标是 1920 空间

    cx = sum(p[0] for p in quad) / 4.0
    cy = sum(p[1] for p in quad) / 4.0

    z = math.sqrt(args.target_area / area)
    if z <= 1.001:
        print("当前 %.2f%% 已经不小于目标 %.2f%%，不需要裁" % (area * 100, args.target_area * 100))
        return 0
    if z > args.max_zoom:
        print("需要放大 %.2f 倍（上限 %.2f），上采样会太软 —— 建议重新生成"
              % (z, args.max_zoom), file=sys.stderr)
        return 3

    cw = 1920.0 / z
    ch = 1080.0 / z
    x0 = min(max(cx - cw / 2, 0), 1920 - cw)
    y0 = min(max(cy - ch / 2, 0), 1080 - ch)

    box = (int(round(x0 * sx)), int(round(y0 * sx)),
           int(round((x0 + cw) * sx)), int(round((y0 + ch) * sx)))
    out = im.crop(box).resize((W, H), Image.LANCZOS)

    d = os.path.dirname(args.out)
    if d:
        os.makedirs(d, exist_ok=True)
    out.save(args.out)
    print("放大 %.2f 倍  %.2f%% -> %.2f%%" % (z, area * 100, area * z * z * 100))
    print("裁剪框(原图像素) %s  输出 %sx%s" % (box, W, H))
    print("-> %s" % args.out)
    print("注意：裁剪后 quad 和 exposure 都变了，必须重新跑 detect-screen.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
