# studio/ —— 「虚拟摄影棚」技术验证

> 由 dsh 于 2026-10-16 搭建。目的：验证「写实 3D 环境 + 扁平矢量内容」分层合成这条路，
> 能不能用现有依赖做出来，以及代价多大。

## 结论（先看这个）

**能。零新增依赖、零外部素材（HDRI 除外）、环境是实时渲染的。**

| 项目 | 结果 |
|---|---|
| 新增 npm 依赖 | **0**（three / fiber / drei / @react-three/postprocessing 项目里本来就有） |
| 外部素材 | 2 张 CC0 HDRI（各 ~1.7 MB，`public/hdri/`） |
| 城市夜景 | **程序化生成**（canvas 画的光斑 + 楼体剪影），零素材 |
| 屏幕 UI | **程序化生成**（canvas 每帧重绘 → CanvasTexture） |
| 分辨率 / 帧率 | 1920×1080 / 30fps |
| 相机 | **锁死**（与参考片实测一致） |
| 环境 | **静态**，只有屏幕内容在动 |

## 怎么跑

```bash
# 单帧（调试用，快）
npx remotion still  studio/index.ts StudioProof out/studio-still.png --frame=300

# 出片（30 秒 / 900 帧）
npx remotion render studio/index.ts StudioProof out/studio-proof.mp4

# 排障用的最小复现：一个方块 + 上下两块背景
npx remotion still  studio/index.ts MinTest out/min-test.png --frame=10
```

## 文件

| 文件 | 作用 |
|---|---|
| `index.ts` | 独立入口（`registerRoot`），**不碰现有 `src/`** |
| `StudioProof.tsx` | 合成：HDRI 加载、屏幕贴图逐帧重绘、后处理、扁平矢量覆盖层 |
| `Room.tsx` | 场景：桌面、窗、程序化城市散景、台灯、平板、道具、接触阴影 |

## ⚠️ 两个必须记住的坑（都花了很久才定位）

### 1. 相机必须用 `useLayoutEffect`，不能用 `useEffect`

Remotion 的截图发生在 **paint 之后、`useEffect` 之前**。
用 `useEffect` 设相机，拿到的是 R3F 的默认相机 `(0,0,5) fov 75` ——
画面会又小又偏，而且**症状看起来像是场景搭错了**，非常容易误诊。

（如果非要用 `useEffect`，就必须在里面挂一个 `delayRender()` 才能让 Remotion 等它。）

### 2. 不要同时给 `<ThreeCanvas>` 传 `camera` prop

传了的话，R3F 会在后续渲染里**重新应用**它，把你 `CameraRig` 里设的
position / fov 覆盖掉。而且 `CameraRig` 里的投影日志是在覆盖**之前**打的，
所以会出现「日志完全正确、画面完全不对」这种最误导人的现象。

**正确做法：`<ThreeCanvas>` 不传 `camera`，全部在 `CameraRig` 里用 `useLayoutEffect` 设定。**

### 3. 附带一条 PowerShell 坑（今天踩了两次）

`.ps1` / 源码文件**不要**用 `Get-Content -Raw` + `Set-Content -Encoding utf8` 改中文内容。
Windows PowerShell 5.1 会把无 BOM 的 UTF-8 按 ANSI 读进来，写出满篇乱码。
改文件用编辑工具，别用 PowerShell 文本管道。

## 场景设计说明（照着参考片还原的部分）

| 参考片实测 | 这里的实现 |
|---|---|
| 相机锁死（355/360 帧位移为 0） | 无任何运镜代码 |
| 环境静态，只有屏幕内容动 | 环境全部是静态几何 + 程序化贴图 |
| 冷暖分离 | 暖色 `pointLight`（台灯 `#ffb469`）+ 冷色 `pointLight`（夜空 `#7fb0ff`） |
| 背景必须虚 | `DepthOfField` 焦点在平板上，窗外散景自然虚化 |
| 轻微 bloom + 暗角 + 细颗粒 | `Bloom` + `Vignette` + `Noise`，**没有运动模糊** |
| 白底扁平内容层 | 覆盖层是普通 DOM（`AbsoluteFill` + 内联样式） |

## 下一步（如果要组件化）

现在 `Room.tsx` 里的东西是硬编码的。要变成可复用组件，建议的接口：

```tsx
<Studio room="desk-night" lampIntensity={2.2} dof={0.055}>
  {/* 环境层自动渲染；内容层是普通 React，贴在屏幕上或叠在最上面 */}
</Studio>
```

关键设计决策：**环境层渲一次就够**。
如果确定全片只用一个机位（参考片就是这样），甚至可以把环境渲成一张静帧 PNG，
Remotion 里直接当背景图用 —— 那时 3D 的渲染成本就归零了，
只在需要「屏幕内容随 3D 透视变化」时才走实时 Three.js。
