# Agent Office 开发者接入指南

> 面向 Preset 作者、宿主 Connector 开发者和本地二次开发者

普通用户只选择官方 Preset；自然语言创作用户遵守 [自定义能力边界](CUSTOMIZATION.md)。Official Preset 和 Custom Office 最终都从同一套 [基础组件库](COMPONENT-LIBRARY.md) 组装；声明式 Creator 不会自动修改本页涉及的 Runtime 源码。

## 1. 十分钟跑起来

```bash
git clone https://github.com/ssssnail/agent-office.git
cd agent-office
npm run check
npm run preview
```

打开终端输出的 `/v2.html?demo=1` 地址。项目没有前端构建步骤、数据库或云端服务；浏览器直接加载 ES modules 与本地 JSON。

## 2. 先选择你的接入层

| 目标 | 主要入口 | 通常需要修改 |
| --- | --- | --- |
| 新增办公室 Preset | `web/v2/content/` | 只改 JSON |
| 接入新的 Agent 宿主 | `src/index.ts`、`src/protocol.ts` | 把宿主事件翻译成 `OfficeEvent` |
| 调整工具语义 | `src/mapping.ts` | 工具名到 `OfficeAction` 的映射 |
| 新增家具画法 | `web/v2/office-renderer.js` | Renderer + Props 声明 |
| 新增人物动画 | `web/v2/sprite-renderer.js` | Renderer + Agent Skin 声明 |
| 注入真实天气/时间 | `OfficeEnvironment` | 不需要修改 Renderer |

宿主接入与内容制作相互独立：Connector 只报告“谁在做什么”，Preset 决定这件事在当前办公室如何表现。

## 3. 当前内容图与目标架构

当前可运行版本中，一个 Preset 组合八类内容：

```text
Preset
├── Style             页面和像素画法
├── Layout            空间、座位、导航、区域和目标点
├── Agent Skin        真实 Agent 外观
├── Props             可实例化物件类型
├── NPC               非 Agent 角色
├── Life Activities   本地生活行为
├── Atmosphere        环境的视觉覆盖与音效
└── Environment       时钟、天气输入、灯光和 NPC 班次
```

完整字段说明见 [Preset 配置手册](PRESET-CONFIG.md)。配置目录内也有一份就近说明：[Content README](../web/v2/content/README.md)。

这仍是按文件打包的过渡形态。Creator 目标架构为：

```text
Component Library
        ↓
统一 Compiler + Validator
        ↓
Official Preset / Custom Office
```

组件作者应优先遵守 [基础组件库](COMPONENT-LIBRARY.md) 中的唯一 ID、职责分离、Capability Catalog、Zone 和 Placement Slot 约束。

## 4. Environment 公共配置

Environment 是所有 Preset 共用的运行规则，不包含坐标或美术资源。内置正式 Preset 共用 `environments/local-office.json`：

```json
{
  "render": { "dynamicTime": true, "dynamicWeather": true },
  "clock": {
    "mode": "local",
    "phases": [
      { "id": "morning", "start": "06:00" },
      { "id": "noon", "start": "11:00" },
      { "id": "evening", "start": "17:00" },
      { "id": "night", "start": "20:00" }
    ],
    "preview": { "enabled": true, "startTime": "06:00", "durationMs": 24000 }
  },
  "weather": {
    "source": "runtime",
    "fallback": "clear",
    "allowedConditions": ["clear", "cloudy", "rain", "snow"]
  },
  "lighting": { "enabled": true, "activePhases": ["evening", "night"] },
  "npcSchedule": {
    "enabled": true,
    "defaultShift": { "start": "06:00", "end": "18:00" },
    "roleOverrides": {}
  }
}
```

NPC 默认使用公共班次。按角色覆盖夜班：

```json
"roleOverrides": {
  "security": { "start": "18:00", "end": "06:00" }
}
```

单个 NPC 还可以在 NPC 条目中用 `shift` 做最后一级覆盖：

```json
{
  "id": "night-guard",
  "role": "security",
  "shift": { "start": "20:00", "end": "08:00" }
}
```

班次优先级为：单个 NPC `shift` > `roleOverrides` > `defaultShift`。

## 5. 注入外部天气和调试时间

核心不会主动访问天气服务。Connector 获取到外部数据后，只传标准条件给本地页面。

URL 方式适合调试或启动 WebView：

```text
/v2.html?preset=tech-open-office&weather=rain
/v2.html?demo=1&preset=tech-open-office&time=19:00&weather=snow
```

运行时方式适合已经打开的 WebView：

```js
window.OfficeEnvironment.update({ weather: "cloudy" });
window.OfficeEnvironment.update({ time: "18:00" });

window.dispatchEvent(new CustomEvent("agent-office:environment", {
  detail: { weather: "rain" }
}));
```

支持的天气为 `clear`、`cloudy`、`rain`、`snow`。传入未知值或无效时间会抛出明确错误。传 `null` 可清除运行时覆盖并回到 Environment 配置。

## 6. 新建 Preset

1. 从最接近的现有 Preset 和内容模块复制一份。
2. 给每个新文件设置唯一 `id`，不要修改冻结的 `demo-office`。
3. 在 Preset 的 `content` 中填写八个文件引用。
4. 在 `catalog.json` 登记 Preset。
5. 运行 `npm run check`。
6. 打开 `/v2.html?demo=1&preset=<id>` 检查人物、路径、气泡和日夜切换。
7. 打开 `/v2/parity.html`，确认显示 `PASS 15 pixel parity cases`。

## 7. 接入新的 Agent 宿主

Connector 应把宿主能力归一为稳定的 `OfficeEvent`，不要直接控制人物坐标：

```text
宿主事件 → Connector → OfficeState → SSE → 固定 Runtime → 当前 Preset
```

最低可用事件是 `snapshot`、`agent_state`、`action/action_end` 和 `say`。支持委派时再发送 `agent_join`、`delegate`、`agent_leave`。前端通过 Layout 的 `stations` 决定动作是在工位完成、去服务器，还是采用会议室的坐席交接，不需要宿主了解画面结构。

协议和 Pi 的完整映射见 [技术文档](TECHNICAL.md)。

## 8. 提交前检查

```bash
npm run validate:content
npm run validate:environment
npm run check
```

- 配置引用、座位、目标点、Props、NPC 和 Life Activity 会被静态校验。
- Environment 测试覆盖天气覆盖、18:00 下班和跨夜班次。
- 原版 Demo 由浏览器像素回归页单独保护。

不要在内容 JSON 中加入真实网络请求、密钥或用户数据。Agent Office 的默认安全边界始终是本机 `127.0.0.1`。
