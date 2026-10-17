# HANDOFF.md — 项目状态交接（任何新会话先读这一份）

> 用途：DSH 会话上下文到 80% 会自动压缩（保留 16%，损失细节）。
> 这一份是**外置的状态**，压缩后或换新会话，读它就能冷启动继续。
> 最后更新：2026-10-17

---

## 1. 目标（一句话）

**输入口播音频（mp3）+ 带时间戳字幕（srt）→ 输出 3 分钟 1080p 科普成片，气质对标 `D:\codex\参考视频\ref_adv\ref_adv.mp4`。**

配套澄清：
- 参考片的**高清母带**在 `D:\REMOTIONAI\cankaoshipin\`（shipin3→shipin1→shipin2，合计 161.19s）
- `ref_adv.mp4` 是它的压缩代理（1080p30 / 1.11 Mbps），之前所有分析都基于它，现已用母带复核

## 2. 已确认的人类决策（不要再改，除非人类改口）

| 项 | 决定 |
|---|---|
| 规格 | 1080p，**30 或 60fps 二选一**（60fps 实测 39ms/帧 → 3 分钟片 7.1 分钟） |
| 即梦图片模型 | **只准用 `--model_version=4.0`（免费）或 `4.7`（1 积分/张）** |
| 即梦用法 | 4.0 探路迭代，**关键画面用 4.7** |
| 分镜方式 | **AI 读 SRT 自动分配版式**（人类只审成片） |
| 口播 | **mp3 与 TTS 双路，同一套管线** |
| 版式要求 | 六种版式全要；**素材每镜头不重复**；版式可重复但**必须换版面**，不能看出是重播 |
| 视觉偏好 | 亮调（不要暗调夜景压到底）；屏幕内容要**清晰可读**；**保留末尾弹出字体的方式** |
| 协作 | codex 写代码，dsh 验收；见 `COLLAB.md` |

## 3. 参考片的量化基准（实测，不是观感）

在 320×180 灰度、30fps 口径下：

| 指标 | 参考片 | 我们当前 |
|---|---|---|
| 中位帧差 | 1.453 | 0.16 |
| **静止帧占比** | **2.4%** | **10.4%** |
| 最长连续冻结 | — | 0.20s |
| 整帧平均亮度 | **109.3** | 89.1 |
| 屏幕区平均亮度 | **109.9** | 128.4 |
| 相机位移为零的帧 | 98.5% | 100%（我们本来就不动） |

**重要判断**：参考片那个 1.453 中位帧差属于「能力演示片」节奏（屏幕约每 0.6s 整屏换页），
**不适用于科普解说**。真正该守的指标是「静止帧 <3%」和「最长冻结 <0.3s」。

## 4. 关键技术结论（省得重新踩）

1. **参考片是亮调片**（整帧 109），不是暗调片。这决定了 UI 要走浅色面板/白底文档。
2. **"丝滑"= 每一帧都有东西在动**，不是一直在动。参考片同一镜头内静止帧仅 2.4%。
3. **参考片的屏幕 = 一个活着的应用**：列表高亮自动下移、计时器每秒真跳、面板换页、工作区漂移。
4. **三层架构成立**：写实环境（即梦背景板）+ 扁平内容（实时绘制）+ 矢量文字。
5. **环境是静态的、相机锁死** → 背景板用静帧即可，3D 渲染成本归零。
6. **即梦免费 4.0 出的背景板，质量碾压手搓 Three.js**（手搓版已归档到 `studio/_archive-3d/`）。

## 5. 当前代码状态

**M1 已完成并验收通过 8/8（2026-10-17）。** 现在是「一个镜头 = 一份 JSON」。

```
motion-lab/
├─ studio/
│  ├─ shot/                     ← M1：声明式渲染器（新，主线）
│  │  ├─ types.ts               ShotSpec / Theme / LayoutContent / validateSpec / MIN_FONT_PX
│  │  ├─ themes.ts              4 套主题 token（M2 只消费不改）
│  │  ├─ chrome.ts              共享绘制原语 + 掠光/扫描线/底噪/底部渐隐
│  │  ├─ homography.ts          单应矩阵 + screenWidthInFrame（有效字号换算）
│  │  ├─ EnvLayer.tsx           环境层（背景板 + exposure）
│  │  ├─ ScreenLayer.tsx        内容层（圆角裁剪 + 相机 + 版式 + 后处理）
│  │  ├─ OverlayLayer.tsx       强调层（扁平矢量文字，末尾弹出）
│  │  ├─ ShotRenderer.tsx       三层合成 + calculateMetadata（时长由 JSON 决定）
│  │  └─ layouts/
│  │     ├─ index.ts            layout × variant → LayoutDraw 分发表
│  │     ├─ doc.ts              v0 单栏全幅 / v1 大纲侧栏 / v2 卡片网格
│  │     └─ chart.ts            v0 全幅折线 / v1 分栏 KPI / v2 排行榜
│  ├─ shots/demo.json           ← 6 个验收镜头，只改它就换画面
│  ├─ Composite.tsx             M1 之前的硬编码版（回归对照，M2 结束删）
│  ├─ LiveUI.tsx                LiveUI 参考实现（M2 结束删）
│  ├─ M1-DESIGN.md              施工图 + 验收判据 + §9 实测结果与判据修正
│  ├─ PLAYBOOK.md               流程规则 + 19 条踩坑
│  └─ tools/
│     ├─ render-batch.ps1       一条命令渲全部（先 typecheck；stills/video/solid）
│     ├─ check-shot.py          8 条验收，数字 + PASS/FAIL
│     ├─ patch-plate.py         去背景板左上角水印（扩散修补）
│     ├─ quad-snap.py           求屏幕四角（边缘吸附）
│     ├─ check-overflow.py      品红探针溢出计数
│     └─ verify-env.ps1         环境体检（11 项）
└─ public/plates/               即梦背景板（desk-night.png 已去水印）
```

跑法：
```powershell
# 一条命令渲 6 个镜头（静帧 + 品红探针 + 视频）
.\studio\tools\render-batch.ps1 -Mode both -WithSolid

# 8 条验收
python studio\tools\check-shot.py --dir out/m1 --json-out out\m1\report.json

# 单镜头
npx remotion still studio/index.ts Shot out/x.png --frame=72 --props=out/m1/props/s01-doc-fullbleed.json
```

## 6. 关键常量（改之前先想清楚）

| 位置 | 常量 | 当前值 | 说明 |
|---|---|---|---|
| `Composite.tsx` | `QUAD` | `[[468,416],[946,416],[1065,777],[585,849]]` | 屏幕四角，TL/TR/BR/BL，1920 坐标系 |
| `Composite.tsx` | `SHOW_QUAD` | `false` | 改 true 渲调试红框 |
| `LiveUI.tsx` | `CORNER_R` | `76` | 画布空间圆角半径（≈ 成片 23px） |
| `LiveUI.tsx` | `SOLID_DEBUG` | `false` | 改 true 渲纯品红探针，配合 check-overflow.py |
| `LiveUI.tsx` | `W/H` | `1600×1200` | **必须 4:3**，平板屏幕是 4:3 |
| `shot/types.ts` | `resolveEnv` 默认 exposure | **1.14** | 背景板提亮；1.10 时暗页帧会跌破 94 |
| `shot/types.ts` | `resolveOverlayAt` | **0.68 × 时长** | 强调层入场点；0.55 时压暗帧太多，整片平均亮度被拉穿 |
| `shot/types.ts` | `MIN_FONT_PX` | **34** | 34 × 0.301 = 10.24px ≥ 验收下限 10px |
| `shot/chrome.ts` | `barsV` speed 默认 | **2.6** | 单频 sine 在峰值附近几乎不动，一半时间像静止 |
| 渲染 | concurrency | **8** | 之前用 1 是为已归档的 3D 管线，现已不需要 |

**改屏幕/换背景板的标准流程**：`quad-snap.py` 求 QUAD → `SOLID_DEBUG=true` 渲一帧 →
`check-overflow.py` 确认溢出 0 → 关掉调试出片。

## 7. 性能基准（实测）

| 配置 | 每帧 | 3 分钟片 |
|---|---|---|
| 1080p30，c=1 | 74 ms | 6.7 分钟 |
| 1080p30，**c=8** | **30 ms** | **2.7 分钟** |
| 1080p60，c=8 | 39 ms | 7.1 分钟 |

## 8. 待办（一周计划）

> **M1 的完整施工图在 [`studio/M1-DESIGN.md`](./studio/M1-DESIGN.md)** ——
> 含 ShotSpec 数据结构、三层组件结构、主题 token、变体分发方式、7 条验收标准、三个必须避开的设计陷阱。
> 动手做 M1 之前必读。

| 天 | 内容 | 验收 |
|---|---|---|
| ~~D1~~ | ~~M1 组件化 + 声明式渲染器 + doc/chart 各 3 变体~~ | **已完成，8/8 PASS** |
| D2 | M2 前半：code + timeline 两版式各 3 变体（6 版面） | 4 版式可用 |
| D3 | M2 后半：map + cards 两版式各 3 变体（6 版面） | 18 变体可用（**风险日**，退路：先做 12 个） |
| D4 | M3 分镜规划器 + M4 拼接 | 第一条端到端片子 |
| D5 | M5 字幕 + 音频双路 | 完整成片 |
| D6 | M6 批量 + 真实 SRT 跑通 | 产线可用 |
| D7 | 缓冲 | 交付 |

**六种版式**：数据图表 / 文档清单 / 代码窗口 / 地图航线 / 时间轴叙事 / 卡片素材墙。
**每版式 3 变体 + 4 套主题配色**，由分镜规划器加硬约束（相邻不同版式变体、不同主题、同 set 间隔 ≥4）。

## 9. 即梦 CLI 现状

- `dreamina` v1.4.20 → `C:\Users\Admin（无密码）\bin\dreamina.exe`（已登录，余额 **683**）
- `dreamina-canvas` v1.0.3 → `D:\jimeng-cli\dreamina-canvas.exe`（已登录）
- 生成图片：`dreamina text2image --prompt="..." --ratio=16:9 --resolution_type=2k --model_version=4.7 --generate_num=4 --poll=240`
- **水印处理**：即梦出图左上角有"AI生成"水印，用 `ffmpeg -vf "delogo=x=44:y=44:w=424:h=130"` 抹掉

## 10. 冷启动检查清单

新会话开始，按顺序：

1. 读这份 `HANDOFF.md`
2. 读 `studio/PLAYBOOK.md`（五条规则 + 12 条踩坑）
3. `git log --oneline -20` 看最近进展
4. 读 `COLLAB.md` 确认当前锁在谁手上
5. 跑一次 `npx remotion still studio/index.ts Composite out/probe.png --frame=120` 确认能出图
6. 再动手
