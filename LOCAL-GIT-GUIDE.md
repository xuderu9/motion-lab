# MotionLab 本地 Git 操作指南

## 📋 前置准备

### 1. 下载整合包

下载链接：[motion-lab-full-for-agents.tar.gz](https://coze-coding-project.tos.coze.site/cli_attachment/2026-10-16/4487559359508896_bbcab1db93ab6a790f2f987fe81fb4ee_motion-lab-full-for-agents.tar.gz?sign=1792203833-54169595db-0-e24c788376151b2fd11220b54a1febd6b90d7a563ec06d708e3aa1cc18192440)

### 2. 解压到本地

```bash
# 解压到 F:\remotion\
cd F:\remotion
tar -xzf motion-lab-full-for-agents.tar.gz

# 或者用 7-Zip 解压
```

### 3. 进入项目目录

```bash
cd motion-lab-full/motion-lab
```

---

## 🔧 Git 初始化

### 1. 初始化 Git 仓库

```bash
git init
git config user.name "你的用户名"
git config user.email "你的邮箱"
```

### 2. 提交初始代码

```bash
git add .
git commit -m "init: MotionLab v1 - 基础架构和组件"
```

### 3. 创建各 AI 的工作分支

```bash
# 创建 Codex 的工作分支
git checkout -b agent-codex/3d-optimization

# 回到主分支
git checkout master

# 创建 Kimi 的工作分支
git checkout -b agent-kimi/performance

# 回到主分支
git checkout master

# 创建 Trae 的工作分支
git checkout -b agent-trae/effects

# 回到主分支
git checkout master
```

### 4. 查看所有分支

```bash
git branch -a
```

应该看到：
```
* master
  agent-codex/3d-optimization
  agent-kimi/performance
  agent-trae/effects
```

---

## 📋 任务分配

### Agent 1: Codex（3D 场景优化）

**分支**：`agent-codex/3d-optimization`

**任务**：升级 3D 场景到游戏级画面质感

**具体工作**：
1. 升级 PBR 材质系统（MeshStandardMaterial）
2. 添加复杂光照系统（多光源 + 阴影）
3. 改进纹理质量（程序化纹理）

**参考文件**：
- `TASK-CODEX-3D.md`（详细任务说明）

**切换分支**：
```bash
git checkout agent-codex/3d-optimization
```

**完成后提交**：
```bash
git add .
git commit -m "feat: 升级 3D 场景的 PBR 材质和光照"
```

---

### Agent 2: Kimi（性能优化）

**分支**：`agent-kimi/performance`

**任务**：优化渲染性能

**具体工作**：
1. 使用 `useMemo` 缓存计算结果
2. 使用 `React.memo` 优化组件重渲染
3. 优化 shader 性能
4. 平衡质量和性能

**参考文件**：
- `TASK-KIMI-PERFORMANCE.md`（详细任务说明）

**切换分支**：
```bash
git checkout agent-kimi/performance
```

**完成后提交**：
```bash
git add .
git commit -m "perf: 优化渲染性能"
```

---

### Agent 3: Trae（视觉效果）

**分支**：`agent-trae/effects`

**任务**：添加后处理效果和特效

**具体工作**：
1. 添加后处理管线（Bloom + DOF + ToneMapping）
2. 添加特效组件（粒子爆炸、渐变转场等）
3. 优化视觉效果

**参考文件**：
- `TASK-TRAE-EFFECTS.md`（详细任务说明）

**切换分支**：
```bash
git checkout agent-trae/effects
```

**完成后提交**：
```bash
git add .
git commit -m "feat: 添加后处理效果和特效"
```

---

## 🔄 整合流程

### 1. 收集各 AI 的代码

每个 AI 完成后，你需要：

```bash
# 切换到对应的分支，查看代码
git checkout agent-codex/3d-optimization
# 查看代码，确认没问题

# 回到主分支
git checkout master

# 合并 Codex 的代码
git merge agent-codex/3d-optimization

# 重复其他 AI...
```

### 2. 解决冲突（如果有）

如果有冲突，需要手动解决：

```bash
# 查看冲突文件
git status

# 手动编辑冲突文件
# 解决冲突后
git add .
git commit -m "merge: 解决合并冲突"
```

### 3. 测试效果

```bash
npm install
npm run dev
# 浏览器打开 http://localhost:3000
```

### 4. 发给 Claw 整合（如果需要）

如果整合有问题，可以把代码发给我（Claw），我来解决。

---

## 📞 联系方式

如有问题，请联系用户（晚风徐徐）。

---

**文档版本**：v1.0  
**最后更新**：2026-10-16
