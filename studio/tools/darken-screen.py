#!/usr/bin/env python
"""darken-screen.py - 把背景板里那块「占位屏幕」涂成深色。

为什么必须这么做：
  背景板上那块屏幕是**浅灰占位**（即梦提示词要求「纯中性灰色」）。画布用圆角矩形
  去盖它，但四边形的角是两条直线的交点，而设备屏幕的角是圆的 —— 任何盖到几何角的
  画布，在角上必然多出/少掉一块。单一半径贴不平（实测同一块板四个角 48~78px 不等，
  即梦生成的板子四角半径本来就不一致）。

  于是不管偏多少，露出来的都是**浅灰**，人眼立刻读成「四角没对齐」。
  把这层浅灰涂暗之后，同一条缝变成边框/阴影色，视觉上就对了。

做法：先按「亮区 + 边框包围」求出屏幕开口的掩码，再向内腐蚀 2px 吃掉亮边，
然后把掩码内涂成 DARK。

用法：
    python studio/tools/darken-screen.py studio/plates.json --out public/plates
    python studio/tools/darken-screen.py studio/plates.json --apply   # 就地覆盖
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
DARK = (10, 12, 16)


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def flood(mask, seed):
    """从 seed 出发在 mask 内做 4 邻域洪泛。"""
    m = np.zeros_like(mask)
    sy, sx = seed
    if not mask[sy, sx]:
        ys, xs = np.nonzero(mask)
        if len(ys) == 0:
            return m
        k = np.argmin((ys - sy) ** 2 + (xs - sx) ** 2)
        sy, sx = ys[k], xs[k]
    m[sy, sx] = True
    while True:
        nxt = m.copy()
        nxt[1:, :] |= m[:-1, :] & mask[1:, :]
        nxt[:-1, :] |= m[1:, :] & mask[:-1, :]
        nxt[:, 1:] |= m[:, :-1] & mask[:, 1:]
        nxt[:, :-1] |= m[:, 1:] & mask[:, :-1]
        nxt &= mask
        if nxt.sum() == m.sum():
            return m
        m = nxt


def erode(m, n=2):
    out = m.copy()
    for _ in range(n):
        e = out.copy()
        e[1:, :] &= out[:-1, :]
        e[:-1, :] &= out[1:, :]
        e[:, 1:] &= out[:, :-1]
        e[:, :-1] &= out[:, 1:]
        out = e
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registry", nargs="?", default="studio/plates.json")
    ap.add_argument("--root", default=".")
    ap.add_argument("--apply", action="store_true", help="就地覆盖原板")
    ap.add_argument("--out", default=None, help="输出目录（写 <name>-dark.png）")
    ap.add_argument("--suffix", default="-dark")
    args = ap.parse_args()

    reg = json.load(open(args.registry, encoding="utf-8"))
    for e in reg["environments"]:
        rel = e["env"]["src"]
        src = os.path.join(args.root, "public", rel)
        if not os.path.exists(src):
            print("跳过 %s（没有 %s）" % (e["name"], src))
            continue
        im = Image.open(src).convert("RGB")
        small = np.asarray(im.resize((FW, FH), Image.LANCZOS)).astype(np.float32)
        L = luma(small)

        Q = np.array(e["env"]["quad"], float)
        c = Q.mean(axis=0)
        cx, cy = int(c[0]), int(c[1])
        # 以四边形中心的亮度为基准，取一半作为「屏幕/边框」的分界
        center_luma = float(np.median(L[max(0, cy - 40):cy + 40, max(0, cx - 40):cx + 40]))
        th = 0.5 * center_luma
        mask = L > th
        region = flood(mask, (cy, cx))
        region = erode(region, 2)
        if center_luma < 80:
            print("跳过 %s（屏内本来就只有 %.0f，已经是暗屏，不可能露出亮缝）" % (e["name"], center_luma))
            continue
        if region.sum() > 0.30 * FW * FH:
            print("跳过 %s（洪泛占了 %.0f%% 全帧，明显漏了，不敢涂）"
                  % (e["name"], 100.0 * region.sum() / (FW * FH)))
            continue
        if region.sum() < 5000:
            print("跳过 %s（洪泛区域太小 %d）" % (e["name"], region.sum()))
            continue

        # 缩放回原图分辨率再涂
        W, H = im.size
        m_small = Image.fromarray((region * 255).astype(np.uint8), "L")
        m_full = m_small.resize((W, H), Image.LANCZOS).point(lambda v: 255 if v > 127 else 0)
        arr = np.asarray(im).copy()
        mm = np.asarray(m_full) > 127
        arr[mm] = DARK
        out_im = Image.fromarray(arr)
        pct = 100.0 * region.sum() / (FW * FH)
        print("%-14s 屏幕区域 %.2f%%  中心亮度 %.0f -> 已涂暗" % (e["name"], pct, center_luma))

        if args.apply:
            out_im.save(src)
            print("   覆盖 %s" % src)
        else:
            od = args.out or os.path.join(args.root, "out", "plates-dark")
            os.makedirs(od, exist_ok=True)
            fn = os.path.splitext(os.path.basename(rel))[0] + args.suffix + ".png"
            out_im.save(os.path.join(od, fn))
            print("   -> %s" % os.path.join(od, fn))

    return 0


if __name__ == "__main__":
    sys.exit(main())
