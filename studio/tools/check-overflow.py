from PIL import Image
import numpy as np
RENDER = r"D:\codex2\REMOTIONAI2\motion-lab\out\magenta.png"
IDEAL = [(465,414),(948,414),(1068,778),(583,851)]
img = Image.open(RENDER).convert("RGB").resize((1920,1080), Image.LANCZOS)
a = np.asarray(img).astype(np.int16)
r,g,b = a[:,:,0],a[:,:,1],a[:,:,2]
mag = (r>200)&(b>200)&(g<90)          # 纯品红，照片里不存在
ys,xs = np.mgrid[0:1080,0:1920]
P = np.array(IDEAL,float)
ins = np.ones(xs.shape,bool)
for i in range(4):
    ax,ay=P[i]; bx,by=P[(i+1)%4]
    ins &= ((bx-ax)*(ys-ay)-(by-ay)*(xs-ax))>=0
n=int(mag.sum()); nout=int((mag&~ins).sum())
print("品红像素:",n)
print("溢出屏幕:",nout, "(%.3f%%)"%(100.0*nout/max(1,n)))
if nout:
    yy,xx=np.where(mag&~ins)
    print("溢出范围 x[%d,%d] y[%d,%d]"%(xx.min(),xx.max(),yy.min(),yy.max()))
    worst=0;which=-1
    for i in range(4):
        p1,p2=P[i],P[(i+1)%4]
        d=p2-p1; nv=np.array([-d[1],d[0]]); nv/=np.linalg.norm(nv)
        dist=(xx-p1[0])*nv[0]+(yy-p1[1])*nv[1]
        if dist.max()>worst: worst=float(dist.max()); which=i
    print("最远越界 %.1fpx 在【%s】边"%(worst,["上","右","下","左"][which]))
else:
    print("零溢出 ✅")
