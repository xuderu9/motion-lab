# MotionLab Git 操作指南（已在本机验证可用）

> 本文档记录的是**这台电脑上实测跑通的**配置，不是通用模板。
> 之前的指南之所以"配不好"，主要卡在三个坑上（见下面「三个坑」一节）。

---

## 一、当前仓库状态

| 项目 | 值 |
|------|-----|
| 本地路径 | `D:\codex2\REMOTIONAI2\motion-lab` |
| 远程仓库 | https://github.com/xuderu9/motion-lab （public） |
| 主分支 | `main`（GitHub 的默认分支也是 main，两边一致） |
| 推送方式 | **SSH**（不是 HTTPS） |

查看状态：

```powershell
cd D:\codex2\REMOTIONAI2\motion-lab
git status -sb
git remote -v
git log --oneline -5
```

---

## 二、日常操作（三条命令）

```powershell
cd D:\codex2\REMOTIONAI2\motion-lab

git add -A                                              # 暂存所有改动
git commit -m "feat: 说明这次改了什么"                    # 提交
git push                                                # 推到 GitHub（已设好上游，直接 push 即可）
```

拉取别人的改动：

```powershell
git pull
```

---

## 三、三个坑（为什么之前配不好）

### 坑 1：没有任何凭据，HTTPS 会卡死

Windows 凭据管理器里**没有** GitHub 凭据，`credential.helper=manager` 会弹出
浏览器/对话框等待登录。在自动化环境里这会**永久挂住**（表现为 `git push`
几分钟没反应，还留下一堆 `git-credential-manager` 进程）。

**解决**：改用 SSH（本机的 `~/.ssh/id_ed25519` 已经绑定在 GitHub 账号 xuderu9 上）。
现仓库 `origin` 已指向 SSH：

```powershell
git remote -v
# origin  git@github.com:xuderu9/motion-lab.git (fetch)
# origin  git@github.com:xuderu9/motion-lab.git (push)
```

验证 SSH 是否通（出现 `Hi xuderu9!` 就对了，注意它退出码是 1，属正常）：

```powershell
ssh -T git@github.com
```

### 坑 2：用户名里的非 ASCII 字符把 Git 自带的 ssh 搞崩

本机用户名是 `Admin（无密码）`，含中文全角括号。
Git for Windows 自带的 MSYS 版 ssh 在解析这个家目录时会把路径编码搞坏，报：

```
Could not create directory '/c/Users/Admin\243\250\316\336\303\334\302\353\243\251/.ssh'
git@github.com: Permission denied (publickey)
```

**解决**：让 Git 改用 Windows 原生的 OpenSSH（它能正确处理中文路径）。
这条配置**只写在本仓库**里，没有动全局配置：

```powershell
git config core.sshCommand '"C:/Windows/System32/OpenSSH/ssh.exe" -o BatchMode=yes -o StrictHostKeyChecking=accept-new'
```

> 如果你希望所有仓库都生效，把那行命令的 `--global` 加上即可。

### 坑 3：没有 .gitignore，node_modules 会被提交进去

原项目**完全没有 `.gitignore`**。一旦 `npm install`，`node_modules`（几百 MB、
上万个文件）就会被 `git add -A` 一起提交，仓库瞬间废掉。

现在已经补上 `.gitignore`（忽略 `node_modules/`、`out/`、`dist/`、`.env*` 等），
以及 `.gitattributes`（统一换行符为 LF，避免 Windows 的 CRLF 把每个文件都变成
"整文件改动"）。

**新增文件前先确认它真的该进仓库**：

```powershell
git status --short          # 看一眼将要提交什么
git check-ignore -v 某路径   # 确认某路径是否已被忽略
```

---

## 四、多 AI 协作分支流程

项目里同时有多个 AI/多人改代码时，按分支隔离：

```powershell
# 开一个新分支干活
git checkout -b agent-codex/3d-optimization

# ...改代码，自测...
npm run typecheck        # 类型检查必须过
npm run render           # 能出片

git add -A
git commit -m "feat(3d): 说明改了什么"
git push -u origin agent-codex/3d-optimization
```

主干合并（推荐在 GitHub 上开 PR，避免本地冲突）：

```powershell
git checkout main
git pull
git merge --no-ff agent-codex/3d-optimization
git push
```

有冲突时：

```powershell
git status                  # 看哪些文件冲突
# 手动编辑，删掉 <<<<<<< ======= >>>>>>> 标记
git add -A
git commit -m "merge: 解决冲突"
```

---

## 五、提交前自检清单

```powershell
npm run typecheck                       # 1. TypeScript 无报错
npm run still                           # 2. 能渲出一帧
npm run render                          # 3. 能出完整视频
git status --short                      # 4. 没有 node_modules / out 混进来
```

渲染完记得确认没有残留的 `chrome-headless-shell` 进程（残留进程会干扰下一次渲染）：

```powershell
Get-Process chrome-headless-shell -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

**文档版本**：v2.0
**最后更新**：2026-10-16
**说明**：v1.0 的内容（`git init`、`git checkout master` 建三个 AI 分支那套）
是在**仓库还没建好**的前提下写的，与本机实际状态不符，已作废。
