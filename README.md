# Swarm Cursors

把任意网页重新「建造」一遍的 Safari 扩展：页面先被清空，一群彩色光标当着你的面绘制选框、逐字键入、复制组件，最后落在真实网页上。

- iOS / iPadOS 15+，macOS 11+，visionOS 1.0+
- Safari Web Extension + 原生 SwiftUI 设置 App（同一个工程）
- 建造过程中页面始终可点击、可滚动、可输入

## 功能

| 能力 | 说明 |
| --- | --- |
| 全站开关 | 工具栏按钮单击切换 ON / OFF，徽章显示状态；App 内「在所有网页上绘制」与之同步 |
| 建造速度 | 1× / 2× / 3×，沿用引擎原始配速 |
| 光标数量 | 自动估算并在积压时增援；或手动锁定 6–48 |
| 声音 | 键盘与点击音效开关 |
| 实时增删 | 新出现的弹窗、toast 会被单独绘制；关闭的元素由光标擦除 |
| 多页接力 | SPA 路由切换后重建新视图继续绘制 |
| 原生交互 | 遮罩只作用于绘制，命中判定始终交给真实网页 |

## 使用

1. 打开 App，把 Safari 扩展启用一次（设置 → App → Safari → 扩展 → Swarm Cursors）。
2. 工具栏按钮切换 ON / OFF；ON 时所有站点自动绘制，OFF 时扩展不存在。
3. 速度、光标数、声音在 App 演播室中调整，改动于下次页面加载生效。

## 工作原理

**遮罩**：`content/mask.js` 在 `document_start` 把待绘制元素标记为不可见（`opacity`），页面保留自己的背景，不叠加任何画布。

**归属**：引擎扫描出元素与绘制任务，每个任务绑定真实 DOM 节点；任务完成（光标画完）才解除该节点遮罩。文字任务未落地前，其容器框不提前出现。

**顺序**：绘制与叠放都按页面的层叠键排序，背景先于前景，后出现的节点按同一规则归位。

**兜底**：引擎缺席或未启动时整页一次性归还，不做逐元素淡入。

## 目录

```
App/              SwiftUI App（演播室、指南、关于）
Extension/        Safari 扩展宿主与原生消息桥
web-extension/    manifest、background、content（mask.js / swarm.js）
tools/            build-extension.mjs、install-macos.sh、tests/
```

## 构建

```bash
node tools/build-extension.mjs          # 生成 web-extension/content
bash tools/install-macos.sh             # 构建、签名、替换 /Applications 下的应用
```

测试：

```bash
node tools/tests/visual-fidelity.cjs
node tools/tests/adaptive-workers.cjs
node tools/tests/ancestor-handoff.cjs
node tools/tests/switch-regression.mjs
```

## 致谢

动画灵感来自 Joel Califa 的 Swarm。
