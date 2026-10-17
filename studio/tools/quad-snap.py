"""边缘吸附（edge snapping）：把一个近似四边形吸附到图像里真实的强边缘上。

做法（标准配准思路）：
  对每条边，沿边采 N 个点；每个点沿边的法线方向 ±R 搜索灰度梯度最大的位置；
  这些"吸附点"重新拟合直线，四条线求交，得到新四边形；迭代几轮。

为什么这个比阈值分割靠谱：
  阈值分割依赖"屏幕比周围暗"这个假设，但边框高光、下方阴影、左侧书架都会破坏它。
  梯度只依赖"这里有一条亮度突变"，正是屏幕边框的本质特征。
"""
from PIL import Image, ImageFilter
import numpy as np

SRC = r"D:\codex2\REMOTIONAI2\motion-lab\public\plates\desk-night.png"
img = Image.open(SRC).convert("RGB").resize((1920, 1080), Image.LANCZOS)
g = img.convert("L").filter(ImageFilter.GaussianBlur(1.2))
L = np.asarray(g).astype(np.float32)

def grad_at(x, y):
    """用中心差分求梯度幅值（对 x,y 取双线性近似，这里直接四舍五入取整）。"""
    xi, yi = int(round(x)), int(round(y))
    if xi < 1 or yi < 1 or xi >= 1919 or yi >= 1079:
        return 0.0
    gx = L[yi, xi + 1] - L[yi, xi - 1]
    gy = L[yi + 1, xi] - L[yi - 1, xi]
    return (gx * gx + gy * gy) ** 0.5

QUAD = np.array([[477.0, 424.0], [946.0, 411.0], [1074.0, 751.0], [584.0, 819.0]])  # TL TR BR BL
N = 90          # 每条边的采样点数
R = 26          # 搜索半径（像素）

def norm(v):
    n = (v[0] ** 2 + v[1] ** 2) ** 0.5
    return v / n if n else v

def snap_edge(p, q, outward):
    """把边 p->q 上的点沿法线吸附到最大梯度处，返回吸附后的点集。"""
    d = q - p
    nrm = norm(np.array([-d[1], d[0]]))     # 边的法线
    if np.dot(nrm, outward) < 0:            # 统一朝外
        nrm = -nrm
    pts = []
    for i in range(N):
        t = 0.06 + 0.88 * i / (N - 1)       # 端点附近不可靠，跳过
        base = p + d * t
        best_s, best_v = 0.0, -1.0
        for s in np.arange(-R, R + 0.5, 0.5):
            v = grad_at(base[0] + nrm[0] * s, base[1] + nrm[1] * s)
            if v > best_v:
                best_v, best_s = v, s
        if best_v > 6:                       # 太弱的响应不可信
            pts.append((base + nrm * best_s, best_v))
    return pts

def fit_line(pts):
    """稳健拟合：先普通拟合，剔残差>2px 的点，再拟合。返回 (方向, 过点)。"""
    P = np.array([p for p, _ in pts], float)
    if len(P) < 10:
        return None
    # 用总最小二乘（对任意方向都稳）：先取主方向
    c = P.mean(axis=0)
    u, s, vt = np.linalg.svd(P - c)
    dirv = vt[0]
    for _ in range(3):
        nrm = np.array([-dirv[1], dirv[0]])
        res = np.abs((P - c) @ nrm)
        keep = res < max(1.5, np.percentile(res, 70))
        if keep.sum() < 8:
            break
        Q = P[keep]
        c = Q.mean(axis=0)
        u, s, vt = np.linalg.svd(Q - c)
        dirv = vt[0]
    return c, dirv

def intersect(l1, l2):
    (c1, d1), (c2, d2) = l1, l2
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, c2 - c1)
    return c1 + d1 * t[0]

centric = QUAD.mean(axis=0)

for it in range(6):
    TL, TR, BR, BL = QUAD
    # 四边（按顺时针），outward 指向远离中心的方向
    edges = [(TL, TR), (TR, BR), (BR, BL), (BL, TL)]
    lines = []
    counts = []
    for (p, q) in edges:
        mid = (p + q) / 2
        outv = norm(mid - centric)
        pts = snap_edge(p, q, outv)
        counts.append(len(pts))
        lines.append(fit_line(pts))
    if any(l is None for l in lines):
        print("某条边吸附失败，停止")
        break
    top, right, bottom, left = lines
    nTL = intersect(left, top); nTR = intersect(top, right)
    nBR = intersect(right, bottom); nBL = intersect(bottom, left)
    if any(v is None for v in (nTL, nTR, nBR, nBL)):
        print("求交失败，停止")
        break
    newQ = np.array([nTL, nTR, nBR, nBL])
    delta = np.abs(newQ - QUAD).max()
    QUAD = newQ
    print(f"迭代 {it+1}: 吸附点 {counts}  最大角位移 {delta:.2f}px")
    if delta < 0.15:
        break

print("\n最终四边形：")
names = ["TL", "TR", "BR", "BL"]
for n, p in zip(names, QUAD):
    print(f"  {n} = ({p[0]:.1f}, {p[1]:.1f})")

c = QUAD.mean(axis=0)
ins = QUAD + (c - QUAD) * 0.0035      # 内缩 0.35%，绝不溢出
print("\nconst QUAD: Array<[number, number]> = [")
for p in ins:
    print(f"  [{p[0]:.0f}, {p[1]:.0f}],")
print("];")

# 边长比，用来判断透视是否合理
def dist(a, b): return float(np.linalg.norm(b - a))
print(f"\n左边长 {dist(QUAD[0], QUAD[3]):.1f}  右边长 {dist(QUAD[1], QUAD[2]):.1f}")
print(f"上边长 {dist(QUAD[0], QUAD[1]):.1f}  下边长 {dist(QUAD[3], QUAD[2]):.1f}")
