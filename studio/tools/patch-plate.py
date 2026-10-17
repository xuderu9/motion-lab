#!/usr/bin/env python
"""patch-plate.py - 去掉生成背景板左上角烧进去的水印描边。

问题：即梦 出的背景板左上角有一条白色圆角矩形描边，还带一条向右延伸的淡横线。
这些都烧在像素里了。试过但不行的办法，别再试：
  · ffmpeg delogo        -> 留硬边
  · 整块中值滤波          -> 把书脊高光一起压平
  · 逐像素取邻域中值       -> 细线边缘留鬼影
  · 用同场景另一张板当供体  -> 两张板是同一版生成，水印位置完全一样（corr=0.996），换了等于没换

可行的办法：**扩散修补（harmonic fill）**。
把检测到的细亮线膨胀成掩膜，掩膜内像素用 Jacobi 迭代求调和函数（四邻域平均，
掩膜外像素作为 Dirichlet 边界固定不动）。对一条 10px 宽的带子，
调和插值的结果和大范围景深虚化的背景在数学上就是一回事，所以看不出来。

用法：
    python studio/tools/patch-plate.py public/plates/desk-night.png            # 只诊断
    python studio/tools/patch-plate.py public/plates/desk-night.png --preview out/preview-plate.png
    python studio/tools/patch-plate.py public/plates/desk-night.png --write

判据（脚本自己打印）：
    residual top-hat in mask  -> 必须为 0（原图上这里是 25~40）
    changed pixels            -> 必须全部落在掩膜膨胀后的范围内
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def tophat(g, medsize):
    gi = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "L")
    med = np.asarray(gi.filter(ImageFilter.MedianFilter(medsize))).astype(np.float32)
    return g - med


def dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        out[1:, :] |= m[:-1, :]
        out[:-1, :] |= m[1:, :]
        out[:, 1:] |= m[:, :-1]
        out[:, :-1] |= m[:, 1:]
    return out


def box_blur(a, r):
    """快速盒式模糊（用于把掩膜边缘柔化，避免扩散边界出现一刀切）"""
    k = 2 * r + 1
    out = a.astype(np.float32)
    for axis in (0, 1):
        c = np.cumsum(np.pad(out, [(k // 2, k // 2) if i == axis else (0, 0) for i in range(2)], mode="edge"), axis=axis)
        sl0 = [slice(None)] * 2
        sl1 = [slice(None)] * 2
        sl0[axis] = slice(k, None)
        sl1[axis] = slice(0, -k)
        out = (c[tuple(sl0)] - c[tuple(sl1)]) / k
    return out


def diffusion_fill(a, mask, iters=1500, margin=24):
    """掩膜内做 Jacobi 调和插值；掩膜外像素固定。"""
    H, W = a.shape[:2]
    ys, xs = np.nonzero(mask)
    y0, y1 = max(0, ys.min() - margin), min(H, ys.max() + 1 + margin)
    x0, x1 = max(0, xs.min() - margin), min(W, xs.max() + 1 + margin)
    sub = a[y0:y1, x0:x1].copy()
    m = mask[y0:y1, x0:x1].copy()
    if not m.any() or m.all():
        return a

    # 初值：掩膜外像素的均值，能显著减少迭代次数
    sub[m] = sub[~m].mean(axis=0)

    for _ in range(iters):
        nb = (
            np.roll(sub, 1, axis=0)
            + np.roll(sub, -1, axis=0)
            + np.roll(sub, 1, axis=1)
            + np.roll(sub, -1, axis=1)
        ) * 0.25
        sub[m] = nb[m]

    a[y0:y1, x0:x1] = sub
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--preview")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--search", default="0,0,460,170", help="outline search window x0,y0,x1,y1")
    ap.add_argument("--thresh", type=float, default=10.0, help="top-hat threshold for the outline")
    ap.add_argument("--floor", type=float, default=115.0, help="ignore pixels darker than this")
    ap.add_argument("--medsize", type=int, default=15)
    ap.add_argument("--tailext", type=int, default=1000, help="scan the faint trailing line up to this x")
    ap.add_argument("--tailthresh", type=float, default=4.0)
    ap.add_argument("--dilate", type=int, default=3)
    ap.add_argument("--iters", type=int, default=1500)
    ap.add_argument("--passes", type=int, default=4, help="extra detect-and-heal passes for faint lines")
    args = ap.parse_args()

    im = Image.open(args.plate).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    H, W = a.shape[:2]
    scale = W / 1920.0
    orig = a.copy()

    g = luma(a)
    th = tophat(g, args.medsize)

    # 1) 描边主体
    sx0, sy0, sx1, sy1 = (int(v) for v in args.search.split(","))
    core = np.zeros((H, W), bool)
    core[sy0:sy1, sx0:sx1] = (th[sy0:sy1, sx0:sx1] > args.thresh) & (g[sy0:sy1, sx0:sx1] > args.floor)
    if core.sum() < 60:
        print("no watermark outline detected - nothing to do")
        return 0
    ys, xs = np.nonzero(core)
    bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    print("outline: %d px  plate bbox x %d..%d y %d..%d" % (core.sum(), bx0, bx1, by0, by1))
    print("         1920-space x %.0f..%.0f y %.0f..%.0f" % (bx0 / scale, bx1 / scale, by0 / scale, by1 / scale))

    # 2) 右端那条淡横线：只在描边下沿 ±8 的窄带里找
    band = np.zeros((H, W), bool)
    ty0 = max(0, by1 - 8)
    ty1 = min(H, by1 + 9)
    band[ty0:ty1, bx1:min(W, args.tailext)] = True
    tail = band & (th > args.tailthresh) & (g > 70)
    if tail.any():
        tys, txs = np.nonzero(tail)
        print("tail: %d px  x %d..%d  y %d..%d" % (tail.sum(), txs.min(), txs.max(), tys.min(), tys.max()))
    else:
        print("tail: none")

    # 修补区：整条上方带（覆盖描边 + 向右的淡横线 + 下沿余留）
    region = np.zeros((H, W), bool)
    region[max(0, by0 - 12):min(H, by1 + 12), 0:min(W, args.tailext)] = True

    mask = dilate(core | tail, args.dilate)
    total = int(mask.sum())
    a = diffusion_fill(a, mask, iters=args.iters)

    # 3) 复检：淡线往往比值域更低，单次检测漏掉，所以「检测-修补」迭代到收敛
    for p in range(args.passes):
        th2 = tophat(luma(a), args.medsize)
        thr = args.thresh * 0.6 if p == 0 else args.thresh * 0.4
        flr = args.floor * 0.75 if p == 0 else args.floor * 0.6
        extra = region & (th2 > thr) & (luma(a) > flr)
        if extra.sum() < 30:
            break
        extra = dilate(extra, 3)
        total += int(extra.sum())
        a = diffusion_fill(a, extra, iters=args.iters)
        print("  pass %d: +%d px (thr=%.1f floor=%.1f)" % (p + 1, int(extra.sum()), thr, flr))

    print("total masked px healed: %d" % total)

    # --- 校验 ---
    th_after = tophat(luma(a), args.medsize)
    res = th_after[mask].max()
    print("residual top-hat inside mask: max %.2f (was %.2f)" % (res, th[mask].max()))

    diff = np.abs(a - orig).max(axis=2) > 0.5
    leaked = int((diff & ~mask).sum())
    print("changed px: %d   outside mask: %d" % (int(diff.sum()), leaked))

    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    if args.preview:
        d = os.path.dirname(args.preview)
        if d:
            os.makedirs(d, exist_ok=True)
        img.save(args.preview)
        print("preview ->", args.preview)
    if args.write:
        img.save(args.plate)
        print("WROTE", args.plate)
    if not args.preview and not args.write:
        print("dry run (pass --preview or --write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
