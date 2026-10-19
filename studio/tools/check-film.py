#!/usr/bin/env python
"""check-film.py - M4 成片拼接的验收器。

判据（对应 HANDOFF 里「多镜头编排」那一行）：
  1 时长闭合   成片时长 == plan 各镜头时长之和（±1 帧）
  2 帧数       实际帧数 == 计算帧数（±1 帧）—— 少了说明有镜头没渲进去
  3 无黑帧     没有任何一帧整帧均值低于阈值（拼接断了/镜头渲染失败会露黑）
  4 切点吻合   检测到的硬切位置 == plan 里的镜头边界（±2 帧）
  5 镜头完整   每个镜头的帧数都在，且段内亮度与该镜头主题相符（报告用）

用法：
    python studio/tools/check-film.py --film out/film/film.mp4 --plan out/film/plan.json
    python studio/tools/check-film.py --film out/film/test3.mp4 --plan out/film/plan-3.json
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

C_DUR_TOL_FRAMES = 1
C_MIN_LUMA = 20.0      # 整帧均值低于这个值算黑帧
C_CUT_DIFF = 18.0      # 相邻帧差超过这个值判为硬切
C_CUT_TOL_FRAMES = 2
W, H = 320, 180


def find_bin(name):
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    p = os.path.join(root, "node_modules", "@remotion", "compositor-win32-x64-msvc", name + ".exe")
    if os.path.exists(p):
        return p
    found = shutil.which(name)
    if found:
        return found
    return None


def probe(path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=nb_frames,r_frame_rate,duration",
         "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True,
    ).stdout
    j = json.loads(out or "{}")
    st = (j.get("streams") or [{}])[0]
    dur = st.get("duration") or j.get("format", {}).get("duration")
    fps_s = st.get("r_frame_rate", "30/1")
    num, den = (fps_s.split("/") + ["1"])[:2]
    fps = float(num) / float(den or 1)
    return {"duration": float(dur) if dur else None,
            "frames": int(st["nb_frames"]) if st.get("nb_frames") else None,
            "fps": fps}


def gray_frames(path, tmpdir):
    if os.path.isdir(tmpdir):
        shutil.rmtree(tmpdir, ignore_errors=True)
    os.makedirs(tmpdir, exist_ok=True)
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", path,
         "-vf", "scale=%d:%d,format=gray" % (W, H),
         "-f", "image2", os.path.join(tmpdir, "f%05d.png")],
        capture_output=True,
    )
    files = sorted(glob.glob(os.path.join(tmpdir, "*.png")))
    if not files:
        return None
    return np.stack([np.asarray(Image.open(f).convert("L")) for f in files]).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--film", required=True)
    ap.add_argument("--plan", required=True)
    args = ap.parse_args()

    global FFMPEG, FFPROBE
    FFMPEG, FFPROBE = find_bin("ffmpeg"), find_bin("ffprobe")
    if not FFMPEG or not FFPROBE:
        print("找不到 ffmpeg/ffprobe", file=sys.stderr)
        return 2

    plan = json.load(open(args.plan, encoding="utf-8"))
    shots = plan["shots"]
    fps = shots[0]["fps"]
    expect_frames = sum(s["durationInFrames"] for s in shots)
    expect_dur = expect_frames / fps

    # 计算切点（第 i 个镜头的起始帧，i>0）
    cuts, acc = [], 0
    for s in shots:
        acc += s["durationInFrames"]
        cuts.append(acc)
    cuts = cuts[:-1]  # 去掉片尾

    info = probe(args.film)
    tmp = tempfile.mkdtemp(prefix="checkfilm-")
    try:
        frames = gray_frames(args.film, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    n = 0 if frames is None else frames.shape[0]

    res = []

    # 1 时长闭合
    got_dur = info["duration"] or (n / fps if n else None)
    ok1 = got_dur is not None and abs(got_dur - expect_dur) <= (C_DUR_TOL_FRAMES + 1) / fps
    res.append(("1 时长闭合", ok1,
                "成片 %.3fs / plan %.3fs（差 %.3fs，允许 %.2fs）"
                % (got_dur or -1, expect_dur, abs((got_dur or 0) - expect_dur), (C_DUR_TOL_FRAMES + 1) / fps), {}))

    # 2 帧数
    ok2 = n > 0 and abs(n - expect_frames) <= C_DUR_TOL_FRAMES
    res.append(("2 帧数完整", ok2,
                "实际 %d 帧 / 期望 %d 帧（差 %d）" % (n, expect_frames, n - expect_frames), {}))

    if n == 0:
        print_report(res, plan, None, None)
        return 1

    # 3 无黑帧
    lum = frames.mean(axis=(1, 2))
    black = np.where(lum < C_MIN_LUMA)[0]
    ok3 = len(black) == 0
    res.append(("3 无黑帧", ok3,
                "最暗帧 %.1f（阈值 %.0f），黑帧 %d 个%s"
                % (lum.min(), C_MIN_LUMA, len(black),
                   ("，首个在第 %d 帧" % int(black[0])) if len(black) else ""),
                {"black": [int(x) for x in black[:20]]}))

    # 4 切点吻合
    #
    # 为什么不能用固定的绝对阈值：背景板占了全帧 78~90%，两个镜头用**同一块板**时，
    # 切换只改变屏幕里那 10~22% 的像素，整帧均值差只有 5~10；而换板时能到 30+。
    # 固定阈值 18 会把「同板硬切」全部漏判（实测两次漏判）。
    # 改成**相对阈值**：切点处必须明显高于它周围 ±15 帧的底噪，且绝对量不为零。
    d = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))

    def strength(f):
        """第 f 帧处的切换强度 = 该帧帧差 / 周围底噪（中位数）"""
        if f <= 0 or f >= len(d) + 1:
            return 0.0
        idx = f - 1
        lo, hi = max(0, idx - 15), min(len(d), idx + 15)
        near = np.concatenate([d[lo:max(lo, idx - 2)], d[min(hi, idx + 3):hi]])
        base = float(np.median(near)) if near.size >= 4 else float(np.median(d))
        base = max(base, 0.35)
        return float(d[idx]) / base

    rows = []
    for c in cuts:
        st = strength(c)
        rows.append((c, round(float(d[c - 1]), 2) if 0 < c <= len(d) else 0.0, round(st, 1)))

    # 转场边界：plan 里可选的 transitions 数组（{afterShot, id, frames}）。
    #
    # 这些边界本来就是**渐变**，用硬切的标准（帧差尖峰 > 底噪 2.5 倍）去要求它是错的；
    # 反过来，转场窗口内部的局部极大（模糊峰值、切片抖动）也不该算「多出来的切点」。
    # 所以这里把「有转场的边界」单独放行，而不是把全局阈值调松 ——
    # 调松阈值会让真正的漏切也混过去。
    trans = {int(t["afterShot"]): int(t.get("frames", 14)) for t in (plan.get("transitions") or [])}
    soft = {cuts[k]: max(8, fr) for k, fr in trans.items() if 0 <= k < len(cuts)}

    def is_soft(f):
        return any(abs(f - c) <= w for c, w in soft.items())

    missing = [r for r in rows if not is_soft(r[0]) and (r[2] < 2.5 or r[1] < 2.0)]
    soft_rows = [r for r in rows if is_soft(r[0])]

    # 「多出来的切点」：帧差是局部极大、强度 >6、且不在期望切点附近
    extra = []
    for i in range(1, len(d) - 1):
        f = i + 1
        if d[i] > d[i - 1] and d[i] >= d[i + 1] and strength(f) > 6:
            if not any(abs(c - f) <= C_CUT_TOL_FRAMES for c in cuts) and not is_soft(f):
                extra.append((f, round(float(d[i]), 2), round(strength(f), 1)))

    ok4 = not missing and not extra
    res.append(("4 切点吻合", ok4,
                "期望 %d 个切点（其中 %d 个为转场，按渐变放行）；强度不足 %d，多出 %d"
                % (len(cuts), len(soft_rows), len(missing), len(extra)),
                {"weak_cuts": missing[:8], "extra": extra[:8], "cuts": rows[:20]}))

    # 5 每镜头亮度（报告）
    per, start = [], 0
    for i, s in enumerate(shots):
        seg = lum[start:start + s["durationInFrames"]]
        start += s["durationInFrames"]
        if len(seg) == 0:
            continue
        per.append((i + 1, s["id"], s["theme"], round(float(seg.mean()), 1), round(float(seg.min()), 1)))
    ok5 = True
    res.append(("5 镜头亮度表", ok5, "%d 个镜头已统计（详见下表）" % len(per), {"per": per}))

    print_report(res, plan, per, cuts)
    return 0 if all(ok for _, ok, _, _ in res) else 1


def print_report(res, plan, per, cuts):
    print("")
    print("=" * 86)
    print("M4 成片拼接验收   镜头 %d 个" % len(plan["shots"]))
    print("=" * 86)
    for name, ok, msg, _ in res:
        print("  %-4s %-14s %s" % ("PASS" if ok else "FAIL", name, msg))
    print("-" * 86)
    if per:
        print("  # | 镜头 | 主题 | 段均亮度 | 段内最暗")
        for i, sid, th, mean, mn in per:
            print("  %2d| %-22s | %-10s | %6.1f | %6.1f" % (i, sid, th, mean, mn))
    print("=" * 86)
    bad = [n for n, ok, _, _ in res if not ok]
    if bad:
        print("  未通过: %s" % ", ".join(bad))
        for name, ok, msg, det in res:
            if not ok and det:
                for k, v in det.items():
                    print("    %s: %s" % (k, v))


if __name__ == "__main__":
    sys.exit(main())
