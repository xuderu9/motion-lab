#!/usr/bin/env python
"""check-shot.py - M1 acceptance verifier.

一条命令跑完 M1-DESIGN §5 的 8 条验收，输出数字 + PASS/FAIL 表。

用法：
    python studio/tools/check-shot.py                     # 默认 out/m1
    python studio/tools/check-shot.py --dir out/m1 --skip-video
    python studio/tools/check-shot.py --dir out/m1 --json-out out/m1/report.json

依赖：
    · node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe（Remotion 自带）
      注意：这个 ffmpeg 是精简构建，**没有 rawvideo / null 的编码器**，
      所以不能用 `-f rawvideo -` 或 `signalstats + -f null`。
      只能用 `-f image2` 导出小尺寸灰度 PNG 再读（见 extract_gray）。
    · numpy / Pillow（DSH bundled python 里都有）

口径说明（很重要，别改回去）：
    · 亮度用**整帧**均值（和参考片的 109.3 同口径）
    · 帧动用**屏幕区**均值（屏幕只占全帧 9.39%，用整帧会被背景摊薄到 1/10）
    · 两处的缩放都是 160x120，和参考片 320x180 的采样密度同一量级
"""

import argparse
import glob
import itertools
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LAYOUT_DIR = os.path.join(ROOT, "studio", "shot", "layouts")

# ---- 判据阈值（M1-DESIGN §5，修正处已在该文档里注明）------------------------
C_DECLARATIVE_MIN = 0.12      # #1 屏幕区内显著差异像素占比（每对）
C_DECLARATIVE_SAME_FAMILY = 0.20  # #1 同版式不同变体（证「变体只改排布也看得出」）
C_DIFF_CHANNEL = 24           # #1 单像素算「不同」的通道差
C_OVERFLOW_PX = 0             # #2 溢出像素
C_OVERFLOW_EDGE = 3           # #2 屏幕边缘抗锯齿环带宽度（像素）
C_BRIGHT_MEAN = 105.0         # #3 整片平均
C_BRIGHT_TOL = 12.0
C_BRIGHT_LIGHT_MIN = 110.0    # #3 亮页帧下限
C_BRIGHT_DARK_MIN = 94.0      # #3 暗页帧下限
C_FREEZE_MAX_S = 0.30         # #4 最长连续冻结
C_STATIC_MAX = 0.03           # #4 静止帧占比
C_STATIC_DIFF = 0.5           # #4 屏幕区帧差低于此值算「没动」
C_LIVELY_MIN = 1.0            # #4 屏幕区帧差中位数（参考片整帧 1.453）
C_MIN_EFFECTIVE_PX = 10.0     # #5 屏幕内正文有效字号
C_MOTION_MIN = 3              # #8 每变体常驻运动源数量

SCREEN_SAMPLE = (160, 120)    # 屏幕区采样尺寸
FRAME_SAMPLE = (320, 180)     # 整帧采样尺寸


# ---- 基础工具 ---------------------------------------------------------------
def find_ffmpeg():
    cand = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
    if os.path.exists(cand):
        return cand
    for name in ("ffmpeg.exe", "ffmpeg"):
        found = shutil.which(name)
        if found:
            return found
    return None


def poly_mask(h, w, quad):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    inside = np.zeros((h, w), bool)
    n = len(quad)
    for i in range(n):
        x1, y1 = quad[i]
        x2, y2 = quad[(i + 1) % n]
        cond = (y1 > yy) != (y2 > yy)
        xint = (x2 - x1) * (yy - y1) / (y2 - y1 if y2 != y1 else 1e-9) + x1
        inside ^= cond & (xx < xint)
    return inside


def dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        out[1:, :] |= m[:-1, :]
        out[:-1, :] |= m[1:, :]
        out[:, 1:] |= m[:, :-1]
        out[:, :-1] |= m[:, 1:]
    return out


def quad_bbox(quad):
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    return int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))


def extract_gray(path, vf, size, tmpdir):
    """用 ffmpeg image2 导出灰度 PNG 序列并读成 (N,h,w) 数组。"""
    if os.path.isdir(tmpdir):
        shutil.rmtree(tmpdir, ignore_errors=True)
    os.makedirs(tmpdir, exist_ok=True)
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", path,
        "-vf", vf, "-f", "image2", os.path.join(tmpdir, "f%04d.png"),
    ]
    subprocess.run(cmd, capture_output=True)
    files = sorted(glob.glob(os.path.join(tmpdir, "*.png")))
    if not files:
        return None
    w, h = size
    a = np.stack([np.asarray(Image.open(f).convert("L")) for f in files]).astype(np.float32)
    return a.reshape(len(files), h, w)


def screen_series(path, quad, tmpdir):
    x0, y0, x1, y1 = quad_bbox(quad)
    w, h = SCREEN_SAMPLE
    vf = "crop=%d:%d:%d:%d,scale=%d:%d,format=gray" % (x1 - x0, y1 - y0, x0, y0, w, h)
    return extract_gray(path, vf, (w, h), tmpdir)


def frame_series(path, tmpdir):
    w, h = FRAME_SAMPLE
    return extract_gray(path, "scale=%d:%d,format=gray" % (w, h), (w, h), tmpdir)


def parse_motion_sources():
    res = {}
    for path in glob.glob(os.path.join(LAYOUT_DIR, "*.ts")):
        src = open(path, encoding="utf-8").read()
        m = re.search(r"_MOTION_SOURCES[^=]*=\s*\{(.*?)\n\};", src, re.S)
        if not m:
            continue
        family = os.path.splitext(os.path.basename(path))[0]
        for vm in re.finditer(r"(\d+):\s*\[(.*?)\]", m.group(1), re.S):
            res.setdefault(family, {})[int(vm.group(1))] = re.findall(r'"([^"]+)"', vm.group(2))
    return res


def parse_font_sizes():
    sizes = []
    for path in glob.glob(os.path.join(LAYOUT_DIR, "*.ts")):
        src = open(path, encoding="utf-8").read()
        sizes += [int(v) for v in re.findall(r"size:\s*(\d+)", src)]
        sizes += [int(v) for v in re.findall(r"setFont\(g,\s*(\d+)", src)]
        sizes += [int(v) for v in re.findall(r"ellipsize\(g,[^,]+,[^,]+,\s*(\d+)", src)]
        sizes += [int(v) for v in re.findall(r"wrapLines\(g,[^,]+,[^,]+,\s*(\d+)", src)]
        sizes += [int(v) for v in re.findall(r"measure\(g,[^,]+,\s*(\d+)", src)]
    return (min(sizes) if sizes else 0), sorted(set(sizes))


def parse_theme_lightness():
    src = open(os.path.join(ROOT, "studio", "shot", "themes.ts"), encoding="utf-8").read()
    res = {}
    for block in re.finditer(r":\s*Theme\s*=\s*\{(.*?)\n\};", src, re.S):
        nm = re.search(r'name:\s*"([^"]+)"', block.group(1))
        lt = re.search(r"isLight:\s*(true|false)", block.group(1))
        if nm and lt:
            res[nm.group(1)] = lt.group(1) == "true"
    return res


# ---- 检查项 -----------------------------------------------------------------
def check_declarative(stills, quads, layouts, variants):
    names = sorted(stills)
    if len(names) < 2:
        return False, "需要 ≥2 个静帧", {}
    arrs, masks = {}, {}
    for k in names:
        a = np.asarray(Image.open(stills[k]).convert("RGB")).astype(np.int16)
        arrs[k] = a
        masks[k] = poly_mask(a.shape[0], a.shape[1], quads[k])

    rows, worst = [], 2.0
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            ka, kb = names[i], names[j]
            dd = np.abs(arrs[ka] - arrs[kb]).max(axis=2) > C_DIFF_CHANNEL
            whole = float(dd.mean())
            screen = float(dd[masks[ka]].mean())
            same_family = layouts[ka] == layouts[kb] and variants[ka] != variants[kb]
            rows.append((ka, kb, whole, screen, same_family))
            worst = min(worst, screen)

    fam_rows = [r for r in rows if r[4]]
    fam_worst = min((r[3] for r in fam_rows), default=2.0)
    ok = worst > C_DECLARATIVE_MIN and fam_worst > C_DECLARATIVE_SAME_FAMILY
    msg = "屏幕区最相似的一对 %.1f%%（>%.0f%%）；同版式变体最低 %.1f%%（>%.0f%%）" % (
        worst * 100, C_DECLARATIVE_MIN * 100, fam_worst * 100, C_DECLARATIVE_SAME_FAMILY * 100)
    return ok, msg, {"rows": rows, "min_screen": worst, "min_same_family": fam_worst}


def check_overflow(solids, quads):
    if not solids:
        return False, "没有 solid 探针静帧（render-batch.ps1 -WithSolid）", {}
    worst, rows = 0, []
    for sid, path in sorted(solids.items()):
        img = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
        h, w = img.shape[:2]
        magenta = (img[:, :, 0] > 200) & (img[:, :, 1] < 70) & (img[:, :, 2] > 200)
        m = poly_mask(h, w, quads[sid])
        # 屏幕边缘有一圈抗锯齿（1~2px），不算溢出：把 mask 外扩 C_OVERFLOW_EDGE 溶掉
        edge_band = dilate(m, C_OVERFLOW_EDGE) & ~m
        outside = int((magenta & ~m & ~edge_band).sum())
        rows.append((sid, int((magenta & m).sum()), outside))
        worst = max(worst, outside)
    return worst <= C_OVERFLOW_PX, "最差溢出 %d 像素（边缘 %dpx 抗锯齿环带已排除）" % (worst, C_OVERFLOW_EDGE), {"rows": rows}


def check_brightness(frame_means, themes, lightness):
    if not frame_means:
        return None, "没有视频", {}
    light, dark = [], []
    for sid, series in frame_means.items():
        (light if lightness.get(themes[sid], True) else dark).extend(series)
    allv = light + dark
    mean_all = float(np.mean(allv))
    mean_light = float(np.mean(light)) if light else None
    mean_dark = float(np.mean(dark)) if dark else None
    ok = abs(mean_all - C_BRIGHT_MEAN) <= C_BRIGHT_TOL
    msgs = ["整片 %.1f（%.0f±%.0f）" % (mean_all, C_BRIGHT_MEAN, C_BRIGHT_TOL)]
    if mean_light is not None:
        ok = ok and mean_light >= C_BRIGHT_LIGHT_MIN
        msgs.append("亮页帧 %.1f（≥%.0f）" % (mean_light, C_BRIGHT_LIGHT_MIN))
    if mean_dark is not None:
        ok = ok and mean_dark >= C_BRIGHT_DARK_MIN
        msgs.append("暗页帧 %.1f（≥%.0f）" % (mean_dark, C_BRIGHT_DARK_MIN))
    return ok, "；".join(msgs), {"mean_all": mean_all, "mean_light": mean_light, "mean_dark": mean_dark}


def check_motion_quality(screen_diffs, fps):
    if not screen_diffs:
        return None, "没有视频", {}
    rows = {}
    worst_freeze, worst_static, min_median = 0.0, 0.0, 99.0
    for sid, d in screen_diffs.items():
        static = d < C_STATIC_DIFF
        run = best = 0
        for s in static:
            run = run + 1 if s else 0
            best = max(best, run)
        freeze = best / float(fps)
        ratio = float(static.mean())
        med = float(np.median(d))
        rows[sid] = {"median": med, "static": ratio, "freeze": freeze}
        worst_freeze = max(worst_freeze, freeze)
        worst_static = max(worst_static, ratio)
        min_median = min(min_median, med)
    ok = worst_freeze < C_FREEZE_MAX_S and worst_static < C_STATIC_MAX and min_median >= C_LIVELY_MIN
    msg = "最长冻结 %.2fs（<%.2fs）；静止帧 %.1f%%（<%.0f%%）；帧差中位数最低 %.2f（≥%.1f，参考片 1.45）" % (
        worst_freeze, C_FREEZE_MAX_S, worst_static * 100, C_STATIC_MAX * 100, min_median, C_LIVELY_MIN)
    return ok, msg, {"per": rows, "worst_freeze": worst_freeze, "worst_static": worst_static, "min_median": min_median}


def check_readability(quads):
    min_font, all_sizes = parse_font_sizes()
    scales = []
    for q in quads.values():
        tl, tr, br, bl = q
        top = ((tr[0] - tl[0]) ** 2 + (tr[1] - tl[1]) ** 2) ** 0.5
        bot = ((br[0] - bl[0]) ** 2 + (br[1] - bl[1]) ** 2) ** 0.5
        scales.append(((top + bot) / 2.0) / 1600.0)
    scale = float(np.mean(scales))
    eff = min_font * scale
    ok = eff >= C_MIN_EFFECTIVE_PX
    return ok, "最小画布字号 %dpx × 缩放 %.3f = %.2fpx（≥%.0f）" % (min_font, scale, eff, C_MIN_EFFECTIVE_PX), {
        "min_font": min_font, "scale": scale, "effective": eff, "sizes": all_sizes}


def check_batch(manifest, n_shots):
    if not os.path.exists(manifest):
        return False, "缺 manifest.json（没跑过 render-batch.ps1）", {}
    doc = json.load(open(manifest, encoding="utf-8"))
    shots = doc.get("shots", [])
    ok = len(shots) == n_shots and doc.get("failures", 1) == 0
    return ok, "%d 个镜头 / %d 失败 / 用时 %ss" % (len(shots), doc.get("failures", -1), doc.get("elapsedSec", "?")), {}


def check_motion_sources(specs):
    ms = parse_motion_sources()
    rows, ok = [], True
    for s in specs:
        fam, var = s["layout"], int(s["variant"])
        items = ms.get(fam, {}).get(var, [])
        ok = ok and len(items) >= C_MOTION_MIN
        rows.append((s["id"], fam, var, len(items), items))
    worst = min((r[3] for r in rows), default=0)
    return ok, "最少的变体有 %d 个自有运动源（≥%d）" % (worst, C_MOTION_MIN), {"rows": rows}


# ---- 主流程 -----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="out/m1")
    ap.add_argument("--shots-json", default="studio/shots/demo.json")
    ap.add_argument("--skip-video", action="store_true")
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args()

    global FFMPEG
    FFMPEG = find_ffmpeg()
    if FFMPEG is None:
        print("找不到 ffmpeg（Remotion 自带的那个）", file=sys.stderr)
        return 2

    out = args.dir if os.path.isabs(args.dir) else os.path.join(ROOT, args.dir)
    specs = json.load(open(os.path.join(ROOT, args.shots_json), encoding="utf-8"))["shots"]

    quads, themes, layouts, variants, stills, solids, videos = {}, {}, {}, {}, {}, {}, {}
    for s in specs:
        sid = s["id"]
        quads[sid] = s["env"]["quad"]
        themes[sid] = s["theme"]
        layouts[sid] = s["layout"]
        variants[sid] = int(s["variant"])
        for kind, store, ext in (("stills", stills, ".png"), ("solid", solids, ".png"), ("video", videos, ".mp4")):
            p = os.path.join(out, kind, sid + ext)
            if os.path.exists(p):
                store[sid] = p
    if args.skip_video:
        videos = {}

    fps = specs[0]["fps"]
    tmp = tempfile.mkdtemp(prefix="shotcheck-")
    frame_means, screen_diffs = {}, {}
    try:
        for sid, path in sorted(videos.items()):
            fr = frame_series(path, os.path.join(tmp, "f-" + sid))
            if fr is not None:
                frame_means[sid] = [float(v) for v in fr.mean(axis=(1, 2))]
            sc = screen_series(path, quads[sid], os.path.join(tmp, "s-" + sid))
            if sc is not None and sc.shape[0] > 1:
                screen_diffs[sid] = np.abs(np.diff(sc, axis=0)).mean(axis=(1, 2))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    lightness = parse_theme_lightness()
    res = []
    res.append(("1 声明式（只改 JSON 换画面）",) + check_declarative(stills, quads, layouts, variants))
    res.append(("2 无溢出（品红探针）",) + check_overflow(solids, quads))
    res.append(("3 亮度",) + check_brightness(frame_means, themes, lightness))
    res.append(("4 无冻结 / 有活力",) + check_motion_quality(screen_diffs, fps))
    res.append(("5 有效字号 ≥10px",) + check_readability(quads))
    res.append(("6 一条命令批量渲出",) + check_batch(os.path.join(out, "manifest.json"), len(specs)))
    res.append(("7 检查器 PASS/FAIL 表", True, "本表由 check-shot.py 生成", {}))
    res.append(("8 每变体 ≥3 个常驻微动",) + check_motion_sources(specs))

    print("")
    print("=" * 92)
    print("M1 acceptance   %s" % out)
    print("=" * 92)
    hard = 0
    for name, ok, msg, _ in res:
        mark = "SKIP" if ok is None else ("PASS" if ok else "FAIL")
        if ok is False:
            hard += 1
        print("  %-4s %-28s %s" % (mark, name, msg))
    print("-" * 92)
    if hard == 0:
        print("  ALL PASS")
    else:
        print("  %d 项未通过" % hard)
        for name, ok, msg, det in res:
            if ok is False:
                print("   - %s: %s" % (name, msg))
                for r in det.get("rows", []):
                    print("       %s" % (r,))
                for k, v in det.get("per", {}).items():
                    print("       %s %s" % (k, v))
    print("=" * 92)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump([{"name": n, "pass": o, "msg": m, "detail": d} for n, o, m, d in res],
                      fh, ensure_ascii=False, indent=2, default=str)
        print("machine report ->", args.json_out)

    return 0 if hard == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
