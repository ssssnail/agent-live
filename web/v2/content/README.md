# V2 Content

一个 Preset 通过文件名组合八类本地内容：`styles`、`layouts`、`agent-skins`、`props`、`npcs`、`life-activities`、`atmospheres` 和 `environments`。

这是当前可运行的过渡格式。目标架构会把重复定义整理成统一 Component Library，由同一个 Office Spec Compiler 组装 Official Preset 和 Custom Office；定义见 [`docs/COMPONENT-LIBRARY.md`](../../../docs/COMPONENT-LIBRARY.md)。

最短工作流：

1. 复制最接近的 Preset 及需要修改的模块。
2. 保持 `demo-office` 不变。
3. 在 `catalog.json` 登记新 Preset。
4. 执行 `npm run check`。
5. 用 `/v2.html?demo=1&preset=<id>` 预览。

`Environment` 管理时钟、天气输入、灯光和 NPC 班次；`Atmosphere` 只管理这些状态的视觉覆盖。正式办公场景默认共用 `environments/local-office.json`。

完整说明见 [`docs/PRESET-CONFIG.md`](../../../docs/PRESET-CONFIG.md) 和 [`docs/DEVELOPER.md`](../../../docs/DEVELOPER.md)。
