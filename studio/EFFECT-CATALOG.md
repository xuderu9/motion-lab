# 动效清单落位表

来源：`D:\DeepseekHarness\cankaoshipin\动效名称及描述.txt`（约 77 项）
本文逐项标注**能不能做、在哪做、优先级**，避免"说了一堆名字但没有一个落地"。

图例：✅ 现在就能做（canvas 2D / DOM） · 🔶 要额外工程（WebGL 或复杂模拟） ·
❌ 不适用于成片（交互类，视频里没有鼠标/滚动）

---

## 一、高级转场类（12 项）

| 名称 | 术语 | 状态 | 实现位置 |
|---|---|---|---|
| 匹配剪切转场 | Match Cut | ✅ | `Film` 层：相邻镜头首尾帧对齐 + 形状/位置继承 |
| 液体变形转场 | Liquid Morph | 🔶 | 需位移贴图，先用「遮罩 + 扰动」近似 |
| 破碎消散转场 | Shatter | ✅ | 把上一帧切成三角片，带速度/重力飞出 |
| 图形遮罩转场 | Shape Mask Wipe | ✅ | 圆形/星形/Logo 遮罩扫过 |
| 故障干扰转场 | Glitch | ✅ | RGB 通道错位 + 横向切片抖动 |
| 动态描边转场 | Stroke | ✅ | 路径 dash 生长 + 遮罩跟随 |
| 无缝缩放转场 | Seamless Zoom | ✅ | 上一镜末帧放大到越界，下一镜从放大回正常 |
| 甩镜摇移转场 | Whip Pan | ✅ | 横向运动模糊条带 + 方向性位移 |
| 透视拉扯转场 | Perspective Pull | ✅ | 沿 Z 拉伸（用 3D 投影做） |
| 漏光转场 | Light Leak | ✅ | 暖色叠加层 + 位移噪声 |
| 翻页转场 | Page Curl | 🔶 | 需要网格变形，先用「左侧掀角 + 阴影」近似 |
| 像素化转场 | Pixelate | ✅ | 逐帧加大马赛克块，再消失 |

## 二、合成特效类（11 项）

| 名称 | 术语 | 状态 | 实现位置 |
|---|---|---|---|
| 置换扭曲 | Displacement Map | 🔶 | canvas 可做：按噪声图逐像素偏移（慢，需降采样） |
| 景深 | DOF | ✅ | 多层 + 各自 blur，近实远虚 |
| 运动模糊 | Motion Blur | ✅ | 沿速度方向重绘 3~5 次带透明度 |
| 色差色散 | Chromatic Aberration | ✅ | R/B 通道偏移 1~2px |
| 光晕辉光 | Bloom / Glow | ✅ | 亮部提取 + 多次模糊叠加 |
| 镜头光斑 | Lens Flare | ✅ | 光带 + 光斑 + 星芒，跟随光源位置 |
| 胶片颗粒 | Film Grain | ✅ | 预生成噪点图序列，叠加 screen 混合 |
| 时间重映射 | Time Remapping | ✅ | 对 `t` 做缓动曲线（慢动作/快进/定格） |
| 运动跟踪 | Motion Tracking | ❌ | 需要真实拍摄素材才有意义；我们全是生成画面 |
| 暗角 | Vignette | ✅ | 径向渐变压暗四角 |
| 动态噪波 | Dynamic Noise | ✅ | 分形噪声随 t 演化（注意：**不是呼吸**，是纹理流动） |

## 三、高阶文字动效类（11 项）

| 名称 | 术语 | 状态 | 实现位置 |
|---|---|---|---|
| 文字破碎消散 | Text Shatter | ✅ | 逐字切块 + 飞散 + 旋转 |
| 粒子汇聚成字 | Particle Convergence | ✅ | 采样文字轮廓为粒子目标点，粒子从随机位收敛 |
| 三维挤出文字 | 3D Extruded Text | ✅ | 同一文字沿 Z 多次偏移绘制，形成厚度 |
| 路径文字 | Text on Path | ✅ | 沿贝塞尔曲线逐字定位 + 旋转 |
| 文字变形过渡 | Text Morph | 🔶 | 需要轮廓插值；先用「交叉溶解 + 缩放」近似 |
| 手写描边 | Handwritten Stroke | ✅ | 路径 dash 生长 |
| 文字切片错位 | Text Slice | ✅ | 横向切片 + 各自偏移入场 |
| 霓虹发光 | Neon Text | ✅ | 多重 blur 叠加 + 闪烁 |
| 景深穿梭文字 | Depth Shutter | ✅ | 用 3D 投影把文字送进送出 |
| 液化扭曲文字 | Liquify | 🔶 | 同上置换贴图 |
| 阵列文字流动 | Text Array Flow | ✅ | 大量副本排成网格/波浪，整体流动 |

## 四、三维空间类（9 项）

| 名称 | 术语 | 状态 | 实现位置 |
|---|---|---|---|
| 三维卡片阵列 | 3D Card Array | ✅ | **已实现**（`space` v1/v2/v4） |
| 视差分层滚动 | Parallax Layers | ✅ | **已实现**（`space` v1） |
| 相机环绕 | Camera Orbit | ✅ | **已实现**（`space` v2） |
| 空间穿梭飞行 | Fly Through | ✅ | **已实现**（`space` v0 走廊） |
| 三维地面反射 | Floor Reflection | ✅ | 把元素按 y 取反再画一遍 + 渐隐 |
| 透视追踪贴合 | Perspective Tracking | ✅ | **已实现**（`screen` 单应变换） |
| 肯伯恩斯运镜 | Ken Burns | ✅ | 静图缓慢推拉摇移 |
| 相机震动 | Camera Shake | ✅ | 高频小幅随机位移（**注意：这是冲击感，不是呼吸**） |
| 三维聚光灯 | 3D Spotlight | 🔶 | 需光照模型；先用「径向亮斑 + 投影」近似 |

## 五、粒子流体类（8 项）

| 名称 | 术语 | 状态 | 实现位置 |
|---|---|---|---|
| 粒子爆炸 | Explosion | ✅ | 中心发射 + 拖尾 + 衰减 |
| 粒子拖尾 | Trail | ✅ | 记录历史位置画渐隐 |
| 流体模拟 | Fluid | 🔶 | 需 WebGL/物理；先用「噪声流场粒子」近似 |
| 烟雾升腾 | Smoke | 🔶 | 需体积纹理；先用「多层模糊噪声片」近似 |
| 火花飞溅 | Spark | ✅ | 短寿命高速粒子 + 发光 |
| 粒子线条 | Particle Line | ✅ | 粒子间连线，距离越近越亮 |
| 星云粒子 | Nebula | ✅ | 团状粒子云 + 色彩渐变 |
| 魔法粒子 | Magic | ✅ | 发光拖尾粒子 |

## 六、前端交互类（25 项）

滚动触发、视差滚动、粘性吸顶、微交互、拖拽弹性、悬停反馈、页面转场、
骨架屏、数字滚动计数、玻璃拟态、新拟态、SVG 路径动画、形状变形、
渐变流动、波浪、脉冲呼吸、故障艺术、噪波扭曲、描边生长、着色器、
画布粒子、流体模拟、后期处理、体积光、实时折射反射。

**其中 ❌ 不适用（视频里没有鼠标/滚动）：滚动触发、粘性吸顶、悬停反馈、拖拽弹性、微交互、骨架屏。**
**其余 ✅ 或 🔶 可映射到上面的类别。**
⚠️ **「脉冲呼吸动效」明确禁用**——用户讨厌整屏呼吸感，也不许用它充抵静止帧。

## 七、风格流派（11 项）

动态排版、孟菲斯、赛博朋克、蒸汽波、新丑风、极简主义、2.5D 等距、
扁平化、低多边形、MG 图形、数据可视化。

→ 落成 **主题包（theme pack）**：每包定义调色板、字体对、纹理、特效开关。
第一批做 4 包：极简主义 / 动态排版 / 数据可视化 / 2.5D 等距。

---

## 实施顺序（按"对观感影响 / 成本"排序）

### 第 1 批（已做）
- 3D Card Array / Parallax / Camera Orbit / Fly Through / Perspective Tracking ✅
- Vignette / 静态噪波 ✅

### 第 2 批（下一步，直击"卡片不够精致、轨迹太直"）
1. **缓动与曲线运动**：所有位移改成贝塞尔 + easeInOut/easeOutBack
2. **运动模糊**：给快速位移的元素叠方向性重影
3. **景深**：近层清晰、远层模糊
4. **色差 + 暗角**：轻量后期，立刻提升质感
5. **卡片精修**：双层描边、内阴影、纸质噪点、圆角与投影分级

### 第 3 批（转场族）
Whip Pan / Seamless Zoom / Shape Mask / Glitch / Light Leak / Pixelate / Stroke

### 第 4 批（文字族）
Text Slice / Text Array Flow / 3D Extruded / Handwritten / Particle Convergence / Neon

### 第 5 批（粒子族）
Explosion / Trail / Spark / Particle Line / Nebula

### 需要 WebGL 才能做好的（暂缓，`three` 已装）
Liquid Morph、Page Curl、Fluid、Smoke、Shader、Volumetric Light、Refraction
