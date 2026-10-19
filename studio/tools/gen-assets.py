# -*- coding: utf-8 -*-
"""批量生成 30 张素材（即梦 text2image），下载到 public/gen/。

用途：卡片的配图、页面底纹、3D 静物。
命名规范：
  c01~c12  卡片配图（抽象/材质/微距）
  b01~b08  背景底纹
  o01~o10  3D 静物（给实体 3D 版面当贴图/参考）
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = r"D:\codex2\REMOTIONAI2\motion-lab"
OUT = os.path.join(ROOT, "public", "gen")
DREAMINA = r"C:\Users\Admin（无密码）\bin\dreamina.exe"

PROMPTS = [
    # c01~c12 卡片配图
    ("c01", "抽象流体渐变纹理，蓝紫与橙红交融，柔和高光，无文字，正方形构图，高级质感"),
    ("c02", "金属薄片层叠特写，冷调银灰，边缘反光，极简，无文字"),
    ("c03", "纸张纤维微距特写，暖白，细腻纹理，柔和侧光，无文字"),
    ("c04", "玻璃折射光斑，深色背景，彩色棱镜光谱，无文字"),
    ("c05", "光纤束发光，冷蓝色，暗背景，科技感，无文字"),
    ("c06", "城市夜景长曝光，车流光轨，虚焦，深蓝调，无文字"),
    ("c07", "数据流线条网格，青蓝色发光，深色背景，无文字"),
    ("c08", "水珠在深色表面，微距，高光反射，极简，无文字"),
    ("c09", "亚麻布褶皱特写，米色，柔和阴影，无文字"),
    ("c10", "灯光散景虚焦，暖金色圆斑，深色背景，无文字"),
    ("c11", "岩石纹理，层理清晰，灰褐色，侧光，无文字"),
    ("c12", "电路板微距，深绿与金色走线，科技感，无文字"),
    # b01~b08 背景底纹
    ("b01", "极简暖白纸张背景，几乎无纹理，柔和均匀受光，无任何物体和文字"),
    ("b02", "深蓝到黑的平滑渐变背景，中心有极淡光晕，无物体无文字"),
    ("b03", "摄影棚柔和顶光背景，浅灰渐变，干净，无物体无文字"),
    ("b04", "磨砂玻璃背景，半透光，柔和渐变，无文字"),
    ("b05", "米色亚麻布平铺背景，细微纹理，柔和，无文字"),
    ("b06", "深灰水泥墙面背景，粗糙质感，柔和侧光，无文字"),
    ("b07", "光斑散景背景，暗色调，暖色圆斑，无文字"),
    ("b08", "淡紫到粉的柔和渐变背景，极简，无文字"),
    # o01~o10 3D 静物
    ("o01", "白色石膏几何体静物，球体与立方体，极简摄影棚打光，浅灰背景，无文字"),
    ("o02", "抛光金属球体，强烈环境反射，深色背景，产品摄影，无文字"),
    ("o03", "透明玻璃立方体，折射光线，深色背景，产品摄影，无文字"),
    ("o04", "亚克力圆环，半透明橙红，柔和光，浅色背景，无文字"),
    ("o05", "木质球体，细腻木纹，自然光，浅色背景，无文字"),
    ("o06", "白色陶瓷圆锥，极简，柔和阴影，浅灰背景，无文字"),
    ("o07", "铬合金几何体组合，立方体与圆柱，强反光，深色背景，无文字"),
    ("o08", "半透明树脂块，内部包裹气泡，暖光透过，无文字"),
    ("o09", "磨砂塑料几何体，柔和轮廓，浅色背景，产品摄影，无文字"),
    ("o10", "金属丝网格球体，细致结构，深色背景，无文字"),
]


def gen(key: str, prompt: str) -> list[str]:
    cmd = [
        DREAMINA, "text2image", f"--prompt={prompt}", "--ratio=16:9",
        "--resolution_type=2k", "--model_version=4.7", "--generate_num=1", "--poll=300",
    ]
    r = subprocess.run(cmd, capture_output=True)
    raw = (r.stdout or b"") + (r.stderr or b"")
    txt = raw.decode("utf-8", errors="ignore")
    i = txt.find("{")
    if i < 0:
        return []
    try:
        d = json.loads(txt[i:])
        imgs = d["result_json"]["images"]
        return [im["image_url"] for im in imgs]
    except Exception as e:
        print("parse fail", key, e, file=sys.stderr)
        return []


def main():
    os.makedirs(OUT, exist_ok=True)
    done = set()
    for f in os.listdir(OUT):
        if f.endswith(".png"):
            done.add(f[:-4])
    todo = [(k, p) for k, p in PROMPTS if k not in done]
    print(f"待生成 {len(todo)} 张（已有 {len(done)}）", flush=True)
    for k, p in todo:
        urls = gen(k, p)
        if not urls:
            print(f"{k} 失败", flush=True)
            continue
        dst = os.path.join(OUT, k + ".png")
        try:
            urllib.request.urlretrieve(urls[0], dst)
            print(f"{k} ok  {os.path.getsize(dst)//1024}KB", flush=True)
        except Exception as e:
            print(f"{k} 下载失败 {e}", flush=True)


if __name__ == "__main__":
    main()
