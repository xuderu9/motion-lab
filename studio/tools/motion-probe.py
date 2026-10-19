#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
运动结构探针 —— 回答「为什么我们的片子像 PPT，参考片不像」。

不用颜色/光影去解释，只用**时间维度**的可测量：

  1. 活动度   diff / 真变化像素比 / 整块换掉的像素比（turnover）
  2. 持续性   每个像素「多少秒没变过」，据此算 hold1 / hold3
              —— PPT 的特征是：一大片东西放上去就不动了，hold3 很高
  3. 元素寿命 用「t 与 t-k 的差异图」做连通域，得到正在运动的**物体**，
              跨帧按质心匹配成轨迹 → 出生/死亡速率、寿命分布、路径直线度
  4. 时间结构 长静帧段、全屏重置点、每秒元素数

为什么三套口径要一起跑：它们必须互相印证。像素级 hold3 高 ⟺ 元素寿命长 ⟺
出生速率低。任何一个对不上，就说明指标写错了，而不是片子有问题。

用法：
    py studio/tools/motion-probe.py <video> [--out out/probe/x.json] [--fps N]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import deque
from pathlib import Path

import numpy as np

FFMPEG = r"D:\codex\参考视频\_analysis\bin\ffmpeg.exe"
W, H = 480, 270          # 分析分辨率：够看清 1/60 秒级的位移，又便宜
CELL = 8                 # 连通域用的网格边长（W/CELL × H/CELL）
DIFF_T = 6               # 「真变化」阈值（灰度）
TURN_T = 18              # 「整块换掉」阈值
BLOB_K = 6               # 用 t 与 t-K 的差异找正在运动的东西
MOVE_T = 10              # 差异图二值化阈值


def open_frames(path: str):
    """按 480×270 灰度流式解码。返回 (生成器, (W,H))。"""
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-i", path,
        "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = W * H

    def gen():
        while True:
            buf = p.stdout.read(n)
            if not buf or len(buf) < n:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(H, W)
        p.stdout.close()
        p.wait()

    return gen()


class Blob:
    __slots__ = ("id", "cx", "cy", "n", "birth", "last", "path", "area")

    def __init__(self, bid, cx, cy, n, frame, area):
        self.id = bid
        self.cx = cx
        self.cy = cy
        self.n = n
        self.birth = frame
        self.last = frame
        self.path = [(cx, cy)]
        self.area = area


def label_cells(mask: np.ndarray):
    """在 (gh, gw) 布尔网格上做连通域（4 邻域），返回 [(cx, cy, area)]。"""
    gh, gw = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y0 in range(gh):
        for x0 in range(gw):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            sx = sy = cnt = 0
            while stack:
                y, x = stack.pop()
                sx += x
                sy += y
                cnt += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < gh and 0 <= nx < gw and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            out.append((sx / cnt, sy / cnt, cnt))
    return out


def probe(path: str, fps_hint: float | None = None):
    gen = open_frames(path)
    it = iter(gen)

    ring = deque(maxlen=BLOB_K + 1)
    age = None                # 连续多少帧没变
    alive: dict[int, Blob] = {}
    next_id = 0
    done: list[Blob] = []

    t = 0
    fps = fps_hint or 60.0

    s_diff, s_active, s_turn = [], [], []
    s_hold1, s_hold3, s_nblob = [], [], []
    holds = []                # 连续静帧段长度（帧）
    cur_hold = 0
    resets = 0                # 全屏重置次数

    for f in it:
        if age is None:
            age = np.zeros((H, W), dtype=np.int32)
            ring.append(f.astype(np.int16))
            t += 1
            continue

        prev = ring[-1]
        d = np.abs(f.astype(np.int16) - prev)
        mean_d = float(d.mean())
        chg = d > DIFF_T
        s_diff.append(mean_d)
        s_active.append(float(chg.mean()))
        tur = float((d > TURN_T).mean())
        s_turn.append(tur)
        if tur > 0.15:
            resets += 1

        age = np.where(chg, 0, age + 1)
        s_hold1.append(float((age > fps * 1.0).mean()))
        s_hold3.append(float((age > fps * 3.0).mean()))

        # 长静帧段
        if mean_d < 0.35:
            cur_hold += 1
        else:
            if cur_hold >= 6:
                holds.append(cur_hold)
            cur_hold = 0

        ring.append(f.astype(np.int16))

        # ── 元素：t 与 t-K 的差异 ─────────────────────────────
        if len(ring) > BLOB_K:
            past = ring[0]
            m = (np.abs(f.astype(np.int16) - past) > MOVE_T)
            gh, gw = H // CELL, W // CELL
            cells = m[: gh * CELL, : gw * CELL].reshape(gh, CELL, gw, CELL).mean(axis=(1, 3))
            cm = cells > 0.18
            blobs = label_cells(cm)
            s_nblob.append(len(blobs))

            # 匹配：质心距离 + 面积比
            used = set()
            for (cx, cy, area) in blobs:
                best, bestd = None, 1e9
                for bid, b in alive.items():
                    if bid in used:
                        continue
                    dd = ((b.cx - cx) ** 2 + (b.cy - cy) ** 2) ** 0.5
                    if dd < 4.0 and dd < bestd and 0.25 < area / max(b.area, 1) < 4.0:
                        best, bestd = bid, dd
                if best is None:
                    alive[next_id] = Blob(next_id, cx, cy, 1, t, area)
                    next_id += 1
                else:
                    b = alive[best]
                    b.cx, b.cy, b.area, b.n = cx, cy, area, b.n + 1
                    b.last = t
                    b.path.append((cx, cy))
                    used.add(best)

            for bid in list(alive):
                if alive[bid].last < t - 2:
                    done.append(alive.pop(bid))

        t += 1

    done.extend(alive.values())

    # ── 汇总 ──────────────────────────────────────────────
    dur = t / fps
    life = np.array([(b.last - b.birth + 1) / fps for b in done]) if done else np.array([])
    # 只统计活得够久、动得够远的轨迹，避免噪声
    good = [b for b in done if (b.last - b.birth) >= fps * 0.08 and len(b.path) >= 4]
    straight, speed, span = [], [], []
    for b in good:
        p = np.array(b.path, dtype=float) * CELL
        seg = np.hypot(*np.diff(p, axis=0).T)
        L = float(seg.sum())
        if L < 6:
            continue
        D = float(np.hypot(*(p[-1] - p[0])))
        straight.append(D / L)
        speed.append(L / ((b.last - b.birth + 1) / fps))
        span.append(L)

    def q(a, k):
        return float(np.percentile(a, k)) if len(a) else 0.0

    res = {
        "video": str(path),
        "duration_sec": round(dur, 2),
        "fps_assumed": fps,
        # 1 活动度
        "diff_median": round(float(np.median(s_diff)) if s_diff else 0, 3),
        "active_frac_median": round(float(np.median(s_active)) if s_active else 0, 4),
        "turnover_median": round(float(np.median(s_turn)) if s_turn else 0, 4),
        "reset_count": resets,
        "reset_per_min": round(resets / dur * 60, 1) if dur else 0,
        # 2 持续性
        "hold1_median": round(float(np.median(s_hold1)) if s_hold1 else 0, 4),
        "hold3_median": round(float(np.median(s_hold3)) if s_hold3 else 0, 4),
        "hold3_p90": round(q(s_hold3, 90), 4),
        "static_run_count": len(holds),
        "static_run_sec_total": round(sum(holds) / fps, 2),
        "static_run_frac": round(sum(holds) / max(1, t), 4),
        # 3 元素
        "blobs_per_frame_median": round(float(np.median(s_nblob)) if s_nblob else 0, 1),
        "birth_per_sec": round(len(done) / dur, 2) if dur else 0,
        "life_median_sec": round(float(np.median(life)) if len(life) else 0, 2),
        "life_p90_sec": round(q(life, 90), 2),
        "straightness_median": round(float(np.median(straight)) if straight else 0, 3),
        "speed_median_px_s": round(float(np.median(speed)) if speed else 0, 1),
        "span_median_px": round(float(np.median(span)) if span else 0, 1),
        "tracks_used": len(straight),
    }
    return res, {"diff": s_diff, "turn": s_turn, "hold3": s_hold3}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="")
    ap.add_argument("--fps", type=float, default=None)
    ap.add_argument("--scale", type=int, default=1, help="降采样倍数，用来滤掉颗粒噪声、只看结构")
    args = ap.parse_args()

    # 降采样是**方法论**，不是偷懒：
    # 逐帧胶片颗粒会让每个像素每帧都变，hold3 会被噪声压到 0 —— 那是骗指标，不是动起来了。
    # --scale 4 把 480×270 降到 120×68，颗粒被平均掉，剩下的才是「结构有没有动」。
    global W, H
    if args.scale > 1:
        W, H = W // args.scale, H // args.scale
    res, series = probe(args.video, args.fps)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    if args.out:
        p = Path(args.out)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"summary": res, "series": series}, ensure_ascii=False), encoding="utf-8")
        print(f"\n[probe] -> {p}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
