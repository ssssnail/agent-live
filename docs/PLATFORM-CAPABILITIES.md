# Live Agent Show 平台能力分析

> 更新时间：2026-09-06
> 分析对象：Pi、OpenAI Codex、Cursor

本地已核对 Pi `0.84.2` 与 Codex CLI `0.147.0`；当前环境未安装 Cursor，因此 Cursor 部分按其公开文档评估。

Pi 的逐项接口审计与演出设计见 [Pi 能力与 Live Agent Show 演出上限](./PI-CAPABILITIES.md)。

## 结论先行

三家都足以支撑 Live Agent Show，但适合的接入方式和最终画面不同：

- **Pi** 最适合继续完善 Agent Live 和事件映射。扩展直接运行在 Agent 会话内，文字、思考和工具过程都能实时拿到；短板是多 Agent 没有统一的原生拓扑，需要依赖具体委派工具的返回结构。
- **Codex** 在“由 Live Agent Show 管理会话”的模式下信息最完整。App Server 已暴露线程、回合、计划、命令、文件修改、MCP、网页搜索、审批、Token、多 Agent 协作和历史回放等结构化事件，最接近完整的制作系统。
- **Cursor** 有三套不同深度的入口：IDE Hooks 适合无感旁观现有工作流；CLI JSON 流适合由产品启动本地演出；Cloud Agents SSE 适合远程任务和多任务状态汇总。它的优势是落地场景多，但三种入口需要分别适配。

一个重要判断是：**不能只做“三个平台适配器”，还要定义三种演出模式。**

1. `Sidecar Live`：旁观用户本来就在使用的 Agent。
2. `Managed Live`：Live Agent Show 启动并管理 Agent，会获得最高事件完整度。
3. `Replay`：导入会话记录，重建可以回看和分享的 Episode。

## 能力矩阵

| 能力 | Pi Extension / RPC | Codex App Server | Cursor IDE Hooks | Cursor CLI | Cursor Cloud Agents |
|---|---|---|---|---|---|
| 旁观现有工作流 | 强 | 弱，官方接口更适合作为客户端 | 强 | 弱，需要由 LAS 启动 | 不适用，面向云任务 |
| 文本实时流 | Token 级 | Delta 级 | 消息完成后为主 | Delta 级 | Delta 级 |
| 思考过程 | Delta 级，取决于模型 | 摘要/内容事件，取决于模型和配置 | 思考块完成后 | Print 模式不提供 | Delta 级 |
| 工具生命周期 | 开始/更新/结束 | 类型最丰富，含输出和状态 | 前置/后置/失败 | 开始/完成/结果 | 开始/完成/结果 |
| 文件与命令 | 工具事件，需要解析工具类型 | 原生结构化 Item | 专用 Hooks + 通用工具 Hook | 工具事件 | 工具事件 |
| 计划与任务进度 | 需要扩展约定 | 原生计划更新 | 需要从工具或消息推断 | 需要推断 | 部分来自交互步骤 |
| 多 Agent 拓扑 | 依赖具体委派工具 | 原生协作 Item、线程关系和状态 | 原生 Subagent Hooks | 取决于 CLI 暴露 | 云任务/交互流，内部层级视事件而定 |
| 审批/等待用户 | 需要扩展或 UI 约定 | 原生审批和用户输入请求 | Hook 可参与控制，系统审批状态并非完整事件面 | 取决于运行策略 | 以状态/交互事件为主 |
| Token/上下文 | 消息 Usage，可做实时统计 | 原生 Token Usage 更新 | 压缩前提供上下文使用量 | 输出协议未承诺完整 Usage | SSE 未承诺完整 Usage |
| 历史与回放 | Session JSONL | Thread/Turn/Item 可读取 | Transcript 路径 | 需自行保存 JSONL | Run 及事件流，可恢复连接 |
| 最适合的演出 | 本地单 Agent 精细直播 | 完整 Agent 制作系统 | IDE 无感伴随式直播 | 本地托管演出 | 云端团队直播 |

注：这里的“思考过程”不应被产品定义为必须展示模型的原始思维链。Live Agent Show 应统一使用可公开的状态、意图摘要、计划与工具行为；平台不提供时也不做虚构补全。

## Pi：可以做到什么程度

### 最强项

Pi 的 Extension API 和 RPC 事件都非常适合直播：

- Agent、Turn、Message、Tool 均有开始、更新、结束事件。
- Message Update 能提供文本、思考和工具调用参数的增量。
- Tool Execution Update 可以让角色持续执行动画，而不只是瞬间切换状态。
- Retry、Compaction、Queue 等运行状态可以转译成“返工”“整理上下文”“等待下一项任务”等剧情节拍。
- Session JSONL 可以生成 Episode 回放。

这意味着当前 Agent Live 已经能完整表现一个主 Agent 的工作过程：

`收到任务 → 思考 → 说话 → 使用工具 → 遇到问题 → 重试 → 完成 → 下班`

### 主要限制

Pi 核心事件描述的是主 Agent 生命周期。当前项目里的子 Agent 展示依赖某个委派工具返回的 `details.results[]`，因此：

- 能画出子 Agent，不代表 Pi 提供了统一的多 Agent 生命周期。
- 不同委派工具可能有完全不同的数据结构。
- 子 Agent 的内部思考、逐次工具调用和父子关系不一定完整可见。

要提升到真正的 Ensemble Show，需要为 Pi 定义一个标准化的 Subagent Bridge，让委派扩展主动发送：

- `child.started`
- `child.status_changed`
- `child.tool_started / completed`
- `child.message_delta`
- `child.completed / failed`
- `parent_child_link`

### 可达到的演出等级

- 单 Agent 精细直播：**9/10**
- 当前多 Agent 群像：**6/10**
- 增加标准 Subagent Bridge 后：**8/10 以上**

Pi 官方参考：

- [Extension 事件类型](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)
- [RPC 协议](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [扩展文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)

## Codex：可以做到什么程度

### 最强项

Codex App Server 是三者中最像“Live Agent Show 后端”的接口。它用 Thread、Turn、Item 组织运行过程，并提供丰富的流式通知：

- Thread 启动、恢复、分叉、状态变化和历史读取。
- Turn 开始/结束、计划更新、Diff 更新和 Token Usage 更新。
- Agent 消息、计划、推理摘要、命令执行、文件修改、MCP 调用、动态工具、网页搜索和图片查看。
- 命令输出、消息、计划和推理内容的增量。
- 命令与文件修改审批、向用户请求输入。
- 协作工具调用，包括发送者、接收者、新线程、任务说明和 Agent 状态。
- Review、Compaction 等可直接转化为独立剧情场景。

因此 Codex 可以支持目前最完整的世界行为映射：

- 计划更新显示在白板上。
- 命令执行进入终端工位，输出逐行出现。
- 文件修改在制片台累积 Diff。
- Web Search、MCP、Image View 各自进入专属区域。
- 审批时角色停在“导演门口”等待用户。
- `collabToolCall` 直接生成新角色、父子关系和交接剧情。
- Thread Fork 可以表现平行时间线或不同解决方案。
- Review Mode 可以成为“看片会”。
- Token Usage 可以表现为制作资源，但平台没有承诺直接给出准确费用。

### 主要限制

官方文档确认 App Server 可以驱动自定义客户端，但没有承诺第三方可以无条件订阅另一个 Codex Desktop 进程内部正在运行的实时事件。

所以需要区分：

- **Managed Live**：Live Agent Show 自己启动或连接 App Server，并由它发起/继续任务。能力最完整。
- **Passive Sidecar**：用户在原 Codex Desktop 中独立发起任务，Show 只想在旁边旁观。当前公开接口不能保证拿到同样完整的实时流。
- **Replay**：通过 Thread 列表、读取接口或会话数据重建历史演出，可作为降级方案。

### 可达到的演出等级

- Managed Live：**9.5/10**
- 任意现有 Desktop 会话的被动旁观：**约 4/10，取决于可连接性和宿主集成方式**
- Replay：**9/10**

Codex 官方参考：

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)

## Cursor：可以做到什么程度

Cursor 不能只看作一个入口。IDE、CLI 和 Cloud Agent 是三个不同的演出通道。

### 1. IDE Hooks：最适合旁观现有工作流

Hooks 覆盖会话、工具、命令、MCP、文件读取/修改、提示词、压缩、Agent 回复、Agent 思考块和 Subagent 生命周期。

特别有价值的是：

- `preToolUse / postToolUse / postToolUseFailure` 可以完整表现动作、结果和失败。
- `subagentStart / subagentStop` 自带任务、模型、并行状态、分支、耗时、工具数和修改文件等信息，非常适合多 Agent 场景。
- `afterAgentThought` 和 `afterAgentResponse` 能提供语义完整的段落，适合生成台词与导演旁白。
- `preCompact` 能把上下文压力转译成“整理记忆”的剧情。

限制也很明确：IDE Hook 更像语义检查点，不是所有内容的 Token 级事件流。它适合“动作实时、台词分段出现”的伴随式直播。

### 2. CLI Stream JSON：适合本地 Managed Live

`cursor-agent --print --output-format stream-json` 可输出 NDJSON：

- 系统初始化。
- Assistant 文本增量。
- Tool Call 开始、完成和结果。

它比 IDE Hooks 更适合流式对白，但 Print 模式不提供 Thinking 事件。因此画面可很流畅，心理活动需要使用状态与工具动作表达。

### 3. Cloud Agents SSE：适合远程任务

Cloud Agents API 的 Run Stream 提供：

- 状态更新。
- Assistant 和 Thinking 文本增量。
- Tool Call 开始/完成、参数与结果。
- Interaction Step、Turn End、Heartbeat、Result、Done 和 Error。
- Last-Event-ID 重连恢复。

这很适合把多个云任务接入各自的单场景办公室；如果以后需要，也可以在办公室之外提供简单的任务状态列表。

### 主要限制

- 三种入口不是同一协议，需要三个 Connector。
- IDE Extension API 主要开放 MCP 和插件路径注册，并不是完整的 Agent 实时订阅接口；本地旁观应使用 Hooks。
- IDE Hooks 的思考和回复通常是块级，而不是 Token 级。
- 标准事件面不保证提供完整 Token 或费用数据。
- 云端流与本地 Subagent Hooks 的字段深度不同，不能假设所有子 Agent 的内部动作都相同。

### 可达到的演出等级

- IDE Hooks Sidecar：**7.5/10**
- CLI Managed Live：**7/10**
- Cloud Agents Live：**9/10**

Cursor 官方参考：

- [Hooks](https://cursor.com/docs/hooks)
- [CLI 输出格式](https://docs.cursor.com/en/cli/reference/output-format)
- [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Extension API](https://cursor.com/docs/extension-api)

## 产品层应如何统一三家

不应该把原始平台事件直接喂给前端。建议引入两层抽象。

### 第一层：Connector 能力声明

每个 Connector 连接后声明能力，而不是假设三家完全一致：

```ts
interface ShowCapabilities {
  liveTextDelta: boolean;
  liveThoughtSummary: boolean;
  toolLifecycle: "none" | "start-end" | "streaming";
  fileChanges: "none" | "inferred" | "structured";
  plans: boolean;
  approvals: boolean;
  subagents: "none" | "summary" | "full";
  tokenUsage: boolean;
  replay: boolean;
  attachMode: "sidecar" | "managed" | "both";
}
```

前端根据能力优雅降级：没有实时思考就显示状态或计划；没有原生子 Agent 就显示委派任务卡；没有 Token 就不虚构制作成本。

### 第二层：Show Event v1

建议围绕剧情事实定义跨平台事件：

- `episode.started / completed / failed`
- `actor.joined / status_changed / left`
- `beat.started / updated / completed`
- `speech.delta / completed`
- `intent.updated`
- `tool.started / progress / completed / failed`
- `artifact.changed`
- `plan.updated`
- `approval.requested / resolved`
- `relationship.created`
- `usage.updated`

这一层只表达已观测事实，不把缺失信息补成剧情事实。Beat Composer 再把这些事件组合成 Scene。

## 建议的实现顺序

### 近期：把 Pi 做成完整样板

1. 补齐 Show Event v1 和 Capability 声明。
2. 将现有 Pi 事件翻译成标准事件，不再让 UI 直接理解 Pi 原始格式。
3. 定义 Pi Subagent Bridge，验证真正的多角色场景。
4. 增加 Episode 录制与回放，验证同一事件流既能直播也能复播。

### 第二步：同时验证“最深能力”和“最低接入成本”

- 用 **Codex App Server Connector** 建立能力上限：计划、审批、Diff、协作和回放全部纳入。
- 用 **Cursor IDE Hooks Connector** 建立分发上限：用户不用改变原工作流也能看到 Show。

这两个原型回答的是不同问题，缺一不可。

### 第三步：验证多任务总览

优先接 Cursor Cloud Agents 和 Codex 多线程状态，验证用户是否需要在办公室之外查看多个 Episode。该总览保持为简单列表或卡片，不改变单个任务的一体化 Office Scene，并且依赖：

- 可发现的活动任务。
- 稳定的任务标识与状态。
- 可进入的实时事件流。
- 可读取的历史与产物。

## 对产品定位的影响

Live Agent Show 不应承诺“所有平台都有一模一样的演出”，而应该公开演出保真度：

- **Full Live**：实时对白、工具、子 Agent、审批、计划、资源和回放。
- **Standard Live**：实时工具与状态，台词或思考按块更新。
- **Ambient Live**：只能感知主要阶段与结果。
- **Replay**：事件完整，但不是当前正在发生。

最终的护城河不是哪个平台事件最多，而是：**同一套剧情语法，能把不同粒度的 Agent 事实稳定转成好看、可信、可回放的演出。**
