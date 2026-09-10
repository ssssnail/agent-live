# Agent Live

> Give coding agents a live pixel office. Agent Live is a local-first visualization engine with official integrations for Pi, Codex and DeepSeek Harness. English contributor documentation starts with the [Adapter SDK](docs/ADAPTER-SDK.md) and [contribution guide](CONTRIBUTING.md).

把 coding agent 的思考过程和协作过程，实时渲染成旁边一间像素办公室。

你在左边 vibe coding，右边这间办公室里的小人就是当前跑着的 agent：它在想什么会冒思考气泡，
它要读文件就走去档案柜，要跑命令就走去服务器机架，把活派给别人就拉着对方去会议桌交接。

```
Coding Agent 宿主 ──> Adapter ──OfficeEvent──> Agent Live Engine ──> Viewer
```

开发入口：[Adapter SDK](docs/ADAPTER-SDK.md) · [贡献指南](CONTRIBUTING.md) · [架构](docs/ARCHITECTURE.md) · [开发者接入指南](docs/DEVELOPER.md) · [Adapter 调研与贡献指南](docs/ADAPTER-DEVELOPMENT.md) · [基础组件库](docs/COMPONENT-LIBRARY.md) · [Preset 配置手册](docs/PRESET-CONFIG.md) · [自定义能力边界](docs/CUSTOMIZATION.md)。不想手写 Adapter 时，可以把 [`agent-live-adapter-builder`](skills/agent-live-adapter-builder/SKILL.md) Skill 交给自己的 Coding Agent。

## 快速开始

运行源码和本地验证需要 Node.js 22 或更高版本。

| 宿主 | 官方接入形态 | 使用位置 | Creator |
| --- | --- | --- | --- |
| Pi | 进程内 Extension + 本地 Viewer | 用户继续在 Pi 中工作 | 会话级 `custom / exit` |
| Codex | App Server 轻量客户端 + 本地 Viewer | 在 Agent Live 页面提交 Codex 任务 | Skill 调用当轮自定义 |
| DeepSeek Harness | 原生 `conversation.view` Plugin | DSH 当前会话中的 Agent Live View | 会话级 `custom / exit` |

下面选择自己的宿主安装；三个 Adapter 共用同一套 Engine、OfficeEvent、内容和 Creator 校验。

### Pi

从 GitHub 安装：

```bash
pi install git:github.com/ssssnail/agent-live
```

重新启动 Pi 后输入：

```text
/agent-live
```

开发时也可以直接安装本地目录：

```bash
pi install /absolute/path/to/agent-live
```

启动 pi 后会自动拉起本地服务（默认 <http://localhost:7788>，端口被占用会自动顺延）：

| 命令 | 作用 |
| --- | --- |
| `/agent-live` | 打开办公室页面 |
| `/agent-live demo` | 打开演示场景（不消耗 token，用来看效果） |
| `/agent-live status` | 打印当前地址 |
| `/agent-live close` | 关闭当前本地服务 |
| `/agent-live preset [id]` | 查看或打开官方 Preset |
| `/agent-live custom` | 进入 Creator Mode，后续自然语言只修改当前办公室 |
| `/agent-live exit` | 退出 Creator Mode，恢复普通任务 |

### Codex

从第三方 Marketplace 安装：

```bash
codex plugin marketplace add ssssnail/agent-live --ref main
codex plugin add agent-live@agent-live-marketplace
```

Codex 中调用 Agent Live Skill 即可打开办公室。Codex 插件目前使用单轮显式自定义：调用 Skill 时同时描述修改；它不声称能向后续普通 Codex 对话持续注入 Creator 状态。

### DeepSeek Harness

当前从仓库构建并注册官方 DSH Adapter：

```bash
npm ci --prefix plugins/agent-live/dsh
npm run build --prefix plugins/agent-live/dsh
dsh plugin --profile web add ./plugins/agent-live/dsh
```

重新加载 DSH 后，当前会话会出现 `Agent Live` View。聊天、停止、模型和审批仍由 DSH 官方 UI 管理。

不启动 pi 也能看画面：

```bash
npm run preview      # 然后打开 http://localhost:7788/?demo=1
```

原版 Demo 永久保留在 `/?demo=1`。基于可替换内容架构的入口位于 `/v2.html?demo=1`；顶部 Preset 选择器提供 Tech 开放式办公室、长形会议室和老式办公室，旧原型与回归组合保留为内部内容。V2 使用自己的办公室与角色 renderer，只与原版共用固定的 `plugins/agent-live/web/app.js` Runtime。后续视觉和内容调整只在新版入口继续。

正式 Preset 共用本地 Environment 配置：时间取用户本地时钟，窗外支持 `clear/cloudy/rain/snow`，室内灯光按时段变化，NPC 默认 06:00 上班、18:00 下班。核心不会主动访问天气服务；宿主可用 `?weather=rain` 或 `window.OfficeEnvironment.update({ weather: "rain" })` 注入外部天气。

`plugins/agent-live/web/big-company.*` 是已停止推进的视觉探索，不属于当前产品入口。

环境变量：`AGENT_LIVE_PI_PORT` 改端口，`AGENT_LIVE_AUTO_OPEN=1` 让会话启动时自动开浏览器。

Agent Live 只在本机 `127.0.0.1` 启动 HTTP/SSE 服务，不需要云端后端，也不会主动上传代码、会话日志或使用统计。Pi 扩展会在本地读取当前会话事件并将它们发送给本机浏览器页面。

升级或卸载：

```bash
pi update --extension git:github.com/ssssnail/agent-live
pi remove git:github.com/ssssnail/agent-live
```

## 事件怎么变成画面

扩展订阅 pi 的生命周期事件，翻译成办公室里的动作：

| pi 事件 | 办公室表现 |
| --- | --- |
| `message_update` 的 thinking 增量 | 头顶思考气泡，逐字打出 |
| `message_end` 的正文 | 说话气泡 + 侧栏动态 |
| `tool_execution_start/end` | 走到对应工位干活，工位亮起、冒粒子 |
| 委派类工具调用 | 双方走到会议桌面对面，纸条交接，新人从门口进场 |
| `agent_settled` | 回工位待命 |
| `message_end` 的 usage | 顶栏与员工卡上的 token / 成本 |

工具到工位的映射在 `plugins/agent-live/src/core/mapping.ts`，按工具名正则匹配，所以自定义工具也能自动归位：

| 工具 | 工位 |
| --- | --- |
| `read` / `ls` / `grep` / `glob` | 档案柜 |
| `write` / `edit` / `apply_patch` | 自己工位打字 |
| `bash` / `shell` / `exec` | 服务器机架 |
| `todo` / `plan` | 白板 |
| `*browser*` / `web` / `fetch` / `ask_user` | 电话桌 |
| `subagent` / `task` / `dispatch_agent` | 会议桌交接 |

## 多 agent

Pi 单 agent 会话里只有“啊派”一个人。要看到真正的多人协作，需要装 pi 自带的 subagent 扩展示例
（`examples/extensions/subagent`）；装好后 `scout` / `planner` / `reviewer` / `worker`
会作为独立小人进场，各自带职位、工位和 token 统计。没装的话可以先用 `/agent-live demo` 看效果。

V2 角色定义在 `plugins/agent-live/web/v2/content/agent-skins/tiny-developers.json`，同时覆盖 pi 的 subagent 命名和 ChatDev 风格的公司职位（CEO / CTO / 程序员 / 评审员 / 设计师……）。新增角色外观应修改 Agent Skin 内容；原版 `plugins/agent-live/web/sprites.js` 只作为回归基线保留。

## 借鉴 ChatDev 的地方

参考了 [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) 的"虚拟软件公司"范式：

- **角色化**：每个 agent 有职位、专属配色和偏好工位，而不是一堆同质进程。
- **双人研讨**：ChatDev 的核心是两个 agent 结对对话，所以这里把"派活"做成两人到会议桌
  面对面交接，而不是一条日志。
- **可回放**：ChatDev 的 visualizer 能回放日志。这里状态机已经带 snapshot + 滚动日志，
  后续可以直接回放 pi 的 session JSONL。

没有采用它的头像资源——那是卡通头像，和俯视像素小人风格对不上。

## 结构

```
dist/                         编译后的公共 Node 包
plugins/agent-live/src/
  index.ts     公共 API 源入口
  adapter-sdk/ 第三方 Adapter 合同
  core/        标准事件、状态机和工具语义
  runtime/     本地 HTTP/SSE 服务与生命周期
  adapters/
    pi/          Pi 官方 Adapter
    codex/       Codex 官方 Adapter
    dsh/         DeepSeek Harness 官方 Adapter 映射
plugins/agent-live/web/
  index.html   原版入口（冻结基线）
  office.js    原版地图、家具与寻路
  sprites.js   原版像素小人和粒子
  app.js       两个入口共用的 SSE、状态机、移动、气泡与侧栏 Runtime
  v2.html      配置化入口
  v2/
    bootstrap.js         Preset 加载、校验与启动
    office-engine.js     宿主无关的空间、寻路、设施和环境查询
    environment-runtime.js  时间、天气、灯光与 NPC 班次
    office-renderer.js   从 Layout / Props / Style 绘制办公室
    sprite-renderer.js   从 Agent Skin / Style 原生渲染角色与粒子
    content/             八类内容与内置 Preset
    parity.html          原版与 V2 的逐像素回归页
plugins/agent-live/scripts/
  codex-client.ts        Codex 轻量客户端入口
  preview.ts             不接 pi 单独预览
  validate-content.ts    校验 V2 内容合同
  validate-environment.ts 校验时间、天气和 NPC 班次
skills/agent-live-adapter-builder/
  SKILL.md                 Coding Agent 开发 Adapter 的入口
  scripts/                 安全脚手架
  references/              调研与评审门
```

V2 内容合同可用下面的命令独立校验：

```bash
npm run validate:content
npm run validate:environment
npm run validate:office-engine
```

## 已知限制 / 下一步

- 当前产品选择器提供 Tech 开放式办公室、长形会议室和老式办公室三个正式 Preset；实验和回归 Preset 仍保留为内部内容。新 Layout 需遵守单层、同屏的 `single-office-v1` 合同；Agent 上限为 16，座位上限为 8，无座位 Agent 仍可在场景中活动。
- 小人仍是程序化绘制；Agent Skin 数据已经独立，未来可以在不改 Runtime 的前提下替换为精灵图。
- 子 agent 的进度依赖委派工具在 `details.results` 里回传消息，字段名换了就只能看到状态不看到细节。
- 当前回放只覆盖本次本地 Runtime 内存中的历史；尚未实现跨会话 Agent Diary。多个 Pi 会话会各占一个端口，页面各看各的。
- 思考气泡只显示最近一句，完整思考在侧栏动态里。
- Pi 与 DSH 支持会话级 `/agent-live custom` 和 `/agent-live exit`；Codex 受当前 Skill 扩展能力限制，暂时使用单轮显式自定义。
