// Remotion 配置
// 文档：https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config";

/**
 * 【重要】渲染后端
 *
 * Remotion 默认的 Chromium 渲染后端在 Windows 上会退化成 SwiftShader（纯 CPU 软件光栅化）。
 * 我们这个场景是 3D + Bloom 后处理，属于"填充率密集型"，软件光栅化下会慢得离谱：
 * 实测 60 帧 1080p 首帧段：默认后端 109.0s → ANGLE(D3D11 硬件) 10.5s，约 10 倍差距。
 *
 * 'angle' = 走 Direct3D 11 硬件加速。若换了没有独显/驱动异常的环境报错，
 * 可以改成 'swangle' 或 'swiftshader'，或按需在命令行覆盖：npx remotion render --gl=swangle
 */
Config.setChromiumOpenGlRenderer("angle");

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
