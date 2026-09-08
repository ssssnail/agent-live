# Agent Live 架构

Agent Live 把 coding agent 的宿主事件转换成统一工作事件，再由本地 Runtime 渲染为办公室。项目坚持零前端依赖、无云端后端、页面关闭后退出本地服务。

## 四层结构

```text
Coding Agent
    │ host events / commands
    ▼
Adapter ─────── capabilities
    │ normalized Agent Live events
    ▼
Core + Runtime ─────── Creator
    │                  │ validated Custom Office
    ▼                  ▼
Renderer + Official Preset / local Custom Office
```

### Core

`plugins/agent-live/src/core/` 定义所有宿主共享的稳定语言：

- `protocol.ts`：Agent、Session、Action 和 OfficeEvent。
- `state.ts`：员工、任务、日志、用量和流式思考状态。
- `mapping.ts`：通用工具语义到办公室动作的映射。

Core 不得导入 Pi、Codex 或浏览器 UI。

### Runtime

`plugins/agent-live/src/runtime/` 管理一次 Agent Live 实例：

- `agent-live-runtime.ts`：统一持有 OfficeState、本地服务和清理流程。
- `server.ts`：仅监听 `127.0.0.1`，提供静态文件、SSE 和可选控制接口。

Runtime 不判断当前宿主。插件入口必须显式选择 Adapter。最后一个页面离开后，拥有服务的客户端负责关闭 Runtime 和宿主子进程。

### Adapter

`plugins/agent-live/src/adapters/` 只处理宿主差异：

- `contract.ts`：声明 Adapter 身份和能力。
- `pi/`：订阅 Pi 会话事件，是 Observer 型 Adapter。
- `codex/`：连接 Codex App Server，是 Controller 型 Adapter。

Adapter 可以少报能力，但不能直接控制坐标、NPC 或画法。接入新 coding agent 时，只新增一个目录并把宿主事件翻译成 Core 协议。

### Creator

Creator 将用户自然语言转换为受约束的 Office Patch，经 Compiler 和 Validator 生成本地 Custom Office。它不修改、不重打包 Agent Live 插件，也不新增 Runtime 能力。

Creator 尚未实现。目标目录为 `plugins/agent-live/src/creator/`，正式实现应包含：

```text
schema.ts      Office Spec 与 Patch Schema
compiler.ts    Preset + Patch → Draft
validator.ts   引用、导航、NPC、环境和能力校验
registry.ts    本地 Custom Office 的保存与选择
```

官方 Preset 随 Agent Live 发布；Custom Office 保存在用户本地。只有官方 Engine、Adapter 或组件能力升级时，用户才需要更新 GitHub 插件。

## 启动与选择

Adapter 和 Office 是两个独立选择：

```text
宿主插件入口 → 明确选择 Pi/Codex Adapter
Office Registry → Custom Office 或 Official Preset
```

- Pi 根入口：`index.ts` → `plugins/agent-live/src/adapters/pi/adapter.ts`
- Codex 启动器：`plugins/agent-live/scripts/codex-client.ts` → `plugins/agent-live/src/adapters/codex/adapter.ts`
- 没有有效 Custom Office 时回退到官方 `tech-open-office`。

禁止通过扫描本机进程猜测 Adapter。

## 依赖规则

```text
core        → 不依赖其他业务层
runtime     → core
renderer    → protocol contract + content
adapter     → core + runtime + host API
creator     → content schema + validator；不依赖 Adapter
```

审查新代码时，只要出现以下情况就应拒绝合并：

- Core 导入某个 coding agent SDK。
- Adapter 写入画面坐标或直接操作 Canvas。
- Preset 定义协议之外的新工作事件。
- Creator 通过生成任意代码绕过声明式 Schema。
- Custom Office 覆盖安装目录中的官方 Preset。

## 自定义体验

统一入口为 `/agent-live`。运行后，用户可以继续用自然语言描述修改。宿主 Agent 调用 Creator 的受限命令生成、校验和预览 Draft；全部通过后保存为本地 Custom Office，并通知当前 Runtime 重新加载内容。Pi 可以注册原生命令；Codex 通过插件 Skill 提供相同表面体验。
