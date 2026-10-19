# TASK-CODEX-LIFECYCLE —— 把"版式"改成"编排谱"

> 给出方：dsh · 2026-10-19 · **状态：等 dsh 释放写锁后由 codex 接手**
> 依据：`studio/MOTION-FINDINGS.md`（逐帧实测，三条参考片 + 我们的成片，同一套口径）

---

## 0. 先看结论，不要先看代码

人类说的是「最终做成了 PPT 的感觉」。**这不是审美判断，是可测量的。**

| 指标 | 三条参考片 | 我们的 film-v4 |
|---|---|---|
| **hold3**：超过 3 秒没变过的像素占比 | 0.2% ~ 11.9% | **86.9%** |
| **active_frac**：每帧真变化的像素占比 | 1.5% ~ 2.4% | **0.10%** |
| **birth_rate**：每秒新生运动单元 | 105 ~ 133 | **23.3** |
| 整屏刷新一遍需要 | 0.7 ~ 1.1 秒 | **33 秒** |

一句话：**我们画面里 87% 的像素，从出现到镜头结束一动没动。**

参考片不是"整体在动"，是**不同元素在不同时刻生灭**，永远有 1/3 的画面在重排。
我们的是：入场 2 秒很热闹，剩下 8 秒死掉。

---

## 1. 你要做的事（范围已限定）

**只改三个文件**，不要动 `studio/shot/motion.ts`、`post.ts`、`space.ts`、`film/**`：

1. `studio/shot/lifecycle.ts`（新建）—— 编排谱原语
2. `studio/shot/layouts/page.ts` —— 三个变体全部改成编排谱驱动
3. `studio/shot/layouts/panel.ts` —— 三个变体同上

dsh 同时在做 `studio/shot/layouts/mix.ts` 和 `charts/*`，**不会碰你的三个文件**。

---

## 2. `lifecycle.ts` 要提供什么（接口固定，照抄）

```ts
export type Beat = {
  from: number;        // 秒，元素出生
  to: number;          // 秒，元素死亡（此后不再绘制）
  keys: { t: number; x: number; y: number; s?: number; a?: number; r?: number }[];  // 相对 from 的关键帧
  ease?: string;       // 取 motion.ts 的 EASE 名字
};

/** 某个元素在 t 时刻是否活着;不在就返回 null，版面**必须**因此不画它 */
export function at(beat: Beat, t: number): { x: number; y: number; s: number; a: number; r: number } | null;

/** 一组元素按 interval 错峰轮换：旧的退出、新的进场，保证画面任何时刻都有 1/3 在动 */
export function cycle<T>(items: T[], t: number, o: { slotSec: number; overlap?: number; take?: number }): { item: T; i: number; p: number; phase: "in" | "hold" | "out" }[];
```

`cycle` 的语义：把 `items` 分成若干批，每 `slotSec` 秒换一批，
换批时**旧批还在退出（overlap 秒）而新批已经在进入** —— 这就是"生生不息"。

---

## 3. 版式怎么改（验收标准写在这里）

### 3.1 page v0（章节页，参考片的主形态）

现在：5% 章节条 + 大标题 + 缩略图条 + 波形 + 播放头 → 入场后全静止。

改成：
- **标题**出生 → 放大到位 → 1.8s 后**缩小飞到左上角变成章节条**（不是消失，是迁移）
- **缩略图条**滚动：每 0.9s 整条左移一格，右侧新图进场、左侧旧图退出
- **波形**持续滚动（不是原地跳）
- **播放头**匀速走，每 4s 回绕一次并伴随一次整条重绘
- **副标题**每 2.5s 换一句（来自 content 的多句）

### 3.2 page v1 / v2

同样的原则：**任何元素都不许"挂满全程"**。每个元素必须有明确的死亡时刻。

### 3.3 panel v0（卡片矩阵）

现在：卡片错峰入场 → 静止 8 秒。

改成：卡片**轮换**。使用 `cycle(cards, t, { slotSec: 2.4, overlap: 0.6, take: 3 })`：
- 任一时刻画面上有 3 张卡
- 每 2.4 秒有一张退出、一张进场（重叠 0.6s，两者同时在动）
- 退出走"上浮+淡出+轻微旋转"，进场走 `motion.ts` 的贝塞尔弧线

### 3.4 panel v1 / v2

同原则。侧栏条目轮换、表格行滚动、内嵌小卡轮换。

---

## 4. 验收（必须自己跑，不许只 typecheck）

```powershell
# 1) 渲一个镜头
npx remotion still studio/index.ts Shot out/life/page-v0.png --frame=150 --props=out/life/page-props.json

# 2) 把该镜头渲成短视频（8 秒足够）
npx remotion render studio/index.ts Shot out/life/page-v0.mp4 --props=out/life/page-props.json --concurrency=4

# 3) 测它
& "C:\Users\Admin（无密码）\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" `
  studio/tools/motion-probe.py out/life/page-v0.mp4 --fps 30 --out out/life/page-v0.json
```

**必须达到（阈值来自最慢的参考片 + 30% 余量）**：

| 指标 | 目标 |
|---|---|
| hold3 中位数 | ≤ 15% |
| hold3 p90 | ≤ 90% |
| active_frac 中位数 | ≥ 1.2% |
| birth_rate | ≥ 80 /s |
| 每帧在动的单元 | ≥ 5 |

达不到就回去改编排，**不要靠调阈值过关**。

---

## 5. 三条禁令（违反会返工）

1. **不许用周期性整屏缩放/明暗摆动凑指标**（人类明令禁止"呼吸感"）。
   数据也证明它没用：呼吸是全局同相位的，hold3 几乎不会降。
2. **不许让元素"挂满全程"**。每个元素必须有 `to`，且 `to - from` 不超过镜头时长的 70%。
3. **不许改 `motion.ts` / `post.ts` 的签名**，只准调用。

---

## 6. 交付

- 三个文件 + 一次 `git commit -m "[codex] 编排谱：page/panel 改成元素生命周期驱动"`
- 每个变体一份 `out/life/<layout>-v<n>.json`（probe 结果）+ 一张静帧
- 在 `COLLAB.md` 里写一行实测数字，**不要写"已完成"，写数字**

---

## 7. 实验补充（2026-10-19 17:05，dsh 已跑）

dsh 先拿 panel v0 做了对照实验（卡片改成 2.4 秒轮换），同一镜头渲 8 秒实测：

| 指标 | 改前 | 改后 | 空间镜头（相机飞行） | 参考 shipin3 |
|---|---|---|---|---|
| hold3 | 99.3% | 67.4% | **33.8%** | **0.2%** |
| active_frac | 0.06% | 0.76% | **3.63%** | 2.36% |
| 每帧在动的东西 | 0 | 3 | 16 | 8 |

**结论（会改变你的做法）**：
1. 只让卡片轮换，hold3 只降 1/3 —— 因为卡片只占画面 30%，
   纸底/标题/黑条/时间轴这块"家具"没动，而它才是 hold3 的大头。
2. 相机飞行把 active_frac 拉到 3.63%（**比参考片还高**），
   但 hold3 仍有 33.8% —— 那 33.8% 就是**深色背景和暗角**。
3. 参考片 hold3 = 0.2%，意味着它**没有任何一块大面积恒定区域**。

**所以你的三个版面要按「大面积持续变化」改，不只是元素轮换**：

- page：纸底不能整张不动。可以让**内容层整体缓慢推进**（阅读页滚动、缩略图带滚动、
  标题迁移到章节条），让整张纸的 60% 面积在 3 秒内都被覆盖到一次。
- panel：卡片矩阵之外，**黑条里的文字滚动**、**时间轴游标**、**背景点阵随内容重绘**。
- 目标改成：**画面里连续 3 秒没变的面积 ≤ 15%**。
- 依然禁止呼吸感（整屏缩放/明暗摆动）—— 实测它降不下 hold3。

`studio/shot/lifecycle.ts` 已由 dsh 建好并接入 panel v0（`slotCycle` / `slotTransform` / `at`），
你可以直接调用，**不要重写**。