# 参与潮汐前线开发

[English](CONTRIBUTING.md) · **简体中文** · [日本語](CONTRIBUTING.ja.md)

## 本机运行

按 [中文 README](README.zh-CN.md#安装与启动) 克隆源码并执行 `./install.sh`。需要 Linux、Bash、g++（C++17）和支持 WebGL2 / Ogg 的浏览器。默认地址为 `http://127.0.0.1:8787`，用 Ctrl+C 停止。

开发验证使用 Node.js 22 或更新版本；项目没有 npm 包依赖。`npm test` 运行规则、UI / WebGL 调用、武器、等级图片和版本回归检查。

```bash
npm test
```

音频相关改动还应使用 FFmpeg / ffprobe 运行 `npm run test:audio`。经济、战斗或 NPC 规则改动可用 `npm run test:simulate -- 1000` 检查批量模拟结果。最后在实际浏览器中检查涉及的交互、画面或声音；轻量 DOM / WebGL 测试不会替代真实浏览器验证。

## 修改约定

- 游戏规则和存档迁移主要位于 `src/core.js`；界面和输入位于 `src/main.js`，渲染位于 `src/render.js`，语言处理位于 `src/i18n.js`。
- 调整战斗规则时检查历史战报是否仍按原规则回放；涉及存档格式时验证旧档迁移，避免丢失资源或部队。
- 新增界面文案时检查中文、英文、日文；新增等级图时保持独立 PNG、透明通道及 `src/previews.js` 中的路径一致。
- 新增或替换音乐、音效和图片时维护来源及署名；现有音乐说明位于 `CREDITS.zh-CN.md`。
- 编译产物 `tidal-front-server`、ZIP、日志和缓存留在本机。提交源码和游戏需要的原始资源。

## 反馈问题或提交修改

在 [GitHub Issues](https://github.com/lingsie/Tidal-Front/issues) 中附上游戏版本、操作系统、浏览器版本、复现步骤，以及实际结果和预期结果。涉及画面或声音时，截图或短视频有助于定位。

Pull request 说明修改解决了什么问题、涉及哪些行为，以及做过哪些验证。按改动范围补充有意义的现有检查，无需为文案改动新增测试。
