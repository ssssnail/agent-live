# Pi 能力与 Live Agent Show 演出上限

> 核对版本：`@earendil-works/pi-coding-agent 0.84.2`
> 更新时间：2026-09-06

## 结论

Pi 对 Live Agent Show 的价值不只是事件数量多，而是同时开放了五个层面：

1. 完整的 Agent、消息、工具和 Session 生命周期。
2. Token 级文本、思考和 Tool Call 增量。
3. Session 树、分支、压缩、标签和自定义持久化数据。
4. 命令、快捷键、TUI 组件与跨扩展 EventBus。
5. 可以双向控制会话的 Extension API 和 RPC。

因此 Pi 可以支持三个逐步增强的产品层级：

- **事实直播**：完整表现主 Agent 正在做什么。
- **多 Agent 世界**：通过 Subagent Bridge 表现多个 Agent 的真实内部动作。
- **导演模式**：用户从 Viewer 中干预、分叉和控制会话。

当前 Agent Office 已经完成了第一层的主要骨架，但只用了 Pi 高价值接口的一部分。近期最值得补的不是更多家具，而是精确流事件、Session 持久化、异常/压缩剧情和 Subagent Bridge。

## 1. 安装与分发

Pi 已经有完整的 Package Manager：

```bash
pi install npm:@scope/live-agent-show
pi install git:github.com/org/live-agent-show
pi install ./local/path
pi remove npm:@scope/live-agent-show
pi update --extensions
pi list
pi config
```

支持用户级和项目级安装；项目设置在获得信任后还能自动安装缺失包。一个 Pi Package 可以同时携带：

- Extension
- Skill
- Prompt Template
- Theme
- npm 运行依赖

这意味着产品可以做到真正的一次安装：插件订阅事件、启动 Runtime、注册 `/show` 命令，并加载统一 Viewer。当前项目已经有 `pi.extensions` 声明，但 `private: true`，仍属于本地开发包，还没有整理成可发布的 Pi Package。

Pi Package 中的 Extension 拥有完整系统权限，因此“一键安装”必须同时配套源码可审查、依赖最小化、版本锁定和明确的本地/联网说明。

## 2. Pi 开放了哪些事件

### 2.1 Session 与时间线

Pi 暴露：

- `session_start`
- `session_info_changed`
- `session_before_switch`
- `session_before_fork`
- `session_before_compact / session_compact`
- `session_before_tree / session_tree`
- `session_shutdown`

Session 本身是 append-only JSONL 树，每个 Entry 都有 `id`、`parentId` 和时间戳，原生支持：

- 新建、恢复和切换会话。
- 从任意节点 Fork。
- 树形分支导航。
- Compaction 与 Branch Summary。
- Entry Label。
- Extension Custom Entry。

对 Live Show 来说，这已经是一套天然的 Episode 格式：Session 是一集，Turn 是段落，Branch 是不同 Take，Label 可以作为章节标记，Custom Entry 可以保存 Scene 边界。

### 2.2 Agent、Turn 与 Message

Pi 暴露：

- `before_agent_start`
- `agent_start / agent_end / agent_settled`
- `turn_start / turn_end`
- `message_start / message_update / message_end`

其中 `message_update.assistantMessageEvent` 不是简单的累计文本，而是明确区分：

- `text_start / text_delta / text_end`
- `thinking_start / thinking_delta / thinking_end`
- `toolcall_start / toolcall_delta / toolcall_end`
- `done / error`

这允许画面在 Agent 还没真正执行工具时，就根据正在形成的 Tool Call 安排走位；也可以让字幕与思考状态准确开始、更新和结束。

### 2.3 工具生命周期

Pi 同时开放两组工具事件：

- 执行层：`tool_execution_start / update / end`
- 拦截层：`tool_call / tool_result`

执行层提供参数、流式部分结果、最终结果和错误状态。并行工具模式下，多个 Tool Update 可以交错到达，结束顺序也可以不同。

拦截层允许扩展：

- 在执行前查看或修改参数。
- 阻止工具调用并提供原因。
- 在执行后修改内容、Details、错误状态和 Usage。

Live Show 默认只应该观察，不能偷偷改变工具行为；但这些接口让可选的“安全门”和“审批场景”成为可能。

### 2.4 用户、模型、上下文和 Provider

Pi 还暴露：

- `input`：用户输入、图片、来源，以及 mid-stream 时是 steer 还是 follow-up。
- `user_bash`：用户自己执行的 `!` / `!!` 命令。
- `model_select`。
- `thinking_level_select`。
- `context`。
- `before_provider_request / headers`。
- `after_provider_response`：HTTP 状态和响应头。
- 当前 Context Usage、有效 System Prompt、活动工具列表。

因此可以准确区分“Agent 做的事”和“用户亲自做的事”，也可以表达模型切换、上下文压力、Provider 请求、限流和失败恢复。

## 3. Extension 可以对 Pi 做什么

### 3.1 注册产品入口

扩展可以注册 Slash Command、Keyboard Shortcut、CLI Flag 和自动补全。Live Show 可以提供：

```text
/show              打开当前演出
/show status       查看连接状态
/show replay       打开当前 Episode 回放
/show privacy      选择采集级别
--show             启动 Pi 时自动连接 Runtime
```

### 3.2 在 Pi TUI 内提供轻量控制台

Pi UI API 支持：

- Status、Working Message、Working Indicator。
- Header、Footer、编辑器上方/下方 Widget。
- 通知、选择、确认、输入和多行编辑器。
- 自定义 Overlay、Component 和 Editor。
- 自定义 Tool、Message、Entry Renderer。
- Markdown Transformer。

安装包里的示例甚至包含实时游戏和 35 FPS 的 DOOM Overlay，说明 TUI 组件能力很强。不过 Live Show 没必要在终端重做完整像素办公室，更合理的是提供一条“导演状态栏”：

```text
🎬 LIVE · 调查代码 · 3 位演员 · 2 个工具运行中 · Viewer 已连接
```

完整演出继续放在统一 Viewer 中。

### 3.3 持久化演出数据

扩展可以：

- `appendEntry(customType, data)` 把 Show 数据写入 Session，但不发给模型。
- `setLabel(entryId, label)` 给时间线节点加章节标签。
- 从 `sessionManager.getBranch()`、`getEntries()`、`getTree()` 恢复状态。
- 设置 Session Name。

这意味着 Scene、Beat、角色加入、关键错误、用户干预等可以和 Pi Session 一起保存。恢复、Fork 或回放时不需要重新猜测全部剧情。

### 3.4 跨扩展通信

`pi.events` 是进程内共享 EventBus：

```ts
pi.events.emit("live-show:actor", event);
pi.events.on("live-show:actor", handler);
```

它最适合解决当前的多人问题。Subagent Extension 可以把它从子进程 JSON 流中得到的事件，转换成标准角色事件发到父 Pi 进程；Live Show 只消费稳定协议，不再解析私有的 `details.results[]`。

需要注意：EventBus 是当前 Pi 进程内的。示例 Subagent 会启动独立 Pi 子进程，因此桥接逻辑应该位于父进程中的 Subagent Extension，负责转发子进程 JSON 事件。

## 4. RPC 可以把 Viewer 变成导演台

`pi --mode rpc` 使用 stdin/stdout JSONL。除了接收完整事件流，还能执行：

- Prompt、Steer、Follow-up。
- Abort。
- 新建和切换 Session。
- 设置 Model 和 Thinking Level。
- Compact 与 Auto Compaction。
- 开关 Auto Retry。
- 执行或中止 Bash。
- 获取 Session Stats、Messages、Entries 和 Tree。
- Fork、Clone、导出 HTML。
- 响应 Extension UI 的 Select、Confirm、Input、Editor。

这允许未来的 Viewer 不只是看，还可以提供：

- “Cut”：中止当前运行。
- “给演员递纸条”：发送 Steer。
- “下一场再说”：发送 Follow-up。
- “换演员”：切模型或 Thinking Level。
- “另拍一版”：从当前节点 Fork。
- “整理剧本”：触发 Compaction。

这是可行的第二产品模式，但不应混入第一版被动观察插件。控制能力会增加安全、状态同步和用户预期成本。

## 5. 当前 Agent Office 已经用了什么

本机版本的 `ExtensionAPI` 提供 33 个 `pi.on(...)` 事件入口，当前扩展注册了其中 15 个。数量并不等于产品完成度，但能说明我们主要使用了基础直播链路，Session 树、输入、Provider、拦截和跨扩展协作仍未展开。

当前扩展已经接入：

- Session Start / Shutdown。
- Model 与 Thinking Level 变化。
- Before Agent Start。
- Message Start / Update / End。
- Turn Start / End。
- Tool Execution Start / Update / End。
- Agent End / Settled。
- Assistant Usage、Token 和 Cost。
- `/office` 命令、Status 和 Notification。
- 对 Subagent `details.results[]` 的兼容解析。

已经可以完成：主 Agent 思考、说话、去工位、工具成败、派活、子角色进出和片尾资源统计。

## 6. 高价值但尚未使用的 Pi 能力

| Pi 能力 | 当前状态 | 对演出的直接价值 |
| --- | --- | --- |
| 精确 `assistantMessageEvent` | 仍主要解析累计 Message | 字幕、思考、Tool Call 开始/结束更准确 |
| 通用 Tool Execution Update | 只用于 Subagent | 所有长任务都能有真实进度和持续动作 |
| Input / User Bash | 未接 | 区分导演指令、插话和用户亲自操作 |
| Provider Request / Response | 未接 | 请求中、网络错误、限流与重试剧情 |
| Tool Call / Result | 未接 | 执行前动作、安全门和更准确的结果摘要 |
| Session Compact | 未接 | 章节切换、上下文整理和恢复剧情 |
| Session Fork / Tree | 未接 | Alternate Takes 与分支回放 |
| Custom Entry / Label | 未接 | Scene 持久化、章节索引和稳定回放 |
| EventBus | 未接 | 标准 Subagent Bridge 和第三方扩展联动 |
| TUI Widget / Shortcut / Flag | 未接 | 原生入口、直播状态条和隐私控制 |
| RPC 控制 | 未接 | 可选导演模式 |

## 7. Live Show 可以做到哪些“好玩的”场景

下面只列 Pi 接口可以真实支撑的场景，不依靠虚构 Agent 行为。

### 7.1 开场打板

`input` 和 `before_agent_start` 到来时：

- 用户的任务像剧本一样送入办公室。
- 根据 Session Name 和 Prompt 生成 Episode 标题。
- Agent 入场，打板显示模型、Thinking Level 和当前工具集。
- 如果附带图片，显示为一份视觉资料，而不是展示敏感原图。

### 7.2 Agent 在工具生成阶段就开始走位

利用 `toolcall_start / delta / end`：

- 一旦模型开始生成 `read`，角色就看向档案柜。
- 路径参数逐渐形成时，工作单上的目标文件逐渐补全。
- Tool Call 完成后正式出发。
- `tool_execution_start` 时恰好到达工位。

这样动作与真实 LLM 节奏同步，比工具已经开始后再突然移动自然很多。

### 7.3 并行工具蒙太奇

Pi 允许并行工具，Update 会交错到达。一个 Agent 不能被虚构成多个角色，因此可以：

- Agent 留在中央调度桌。
- 多张真实 Tool Ticket 分别飞向服务器、档案柜和文件工位。
- 各工位按真实开始、进度和完成时间运行。
- 结束后 Ticket 带着结果回到 Agent。

这既忠于事实，也解决“一个角色同时应该站在哪里”的问题。

### 7.4 上下文整理变成章节转场

利用 Context Usage 和 Compaction 事件：

- 上下文接近阈值时，办公室资料逐渐堆满。
- Compaction 开始后，Agent 把旧资料装进档案盒。
- 完成后生成一个可点击的“前情提要”文件夹。
- 时间线自动插入新章节。

如果是 Overflow 后自动重试，则表现为“整理现场后重拍”，而不是普通报错。

### 7.5 网络故障与自动重试

Provider Response 可以在普通 Extension 模式观察；Auto Retry 和 Summarization Retry 的精确尝试次数、延迟与结果则来自 JSON/RPC 事件流。因此完整的重试倒计时属于 Managed/RPC 模式，普通插件模式只能展示它确实观察到的请求失败与恢复。

在能力允许时可以表现：

- Provider 请求时通信设备亮起。
- 限流或服务错误时红灯闪烁。
- 按真实 Delay 显示倒计时。
- 第几次重试、最终恢复或失败都有事实事件。

这比简单显示“思考中”更能解释为什么 Agent 暂时没动作。

### 7.6 用户作为导演，而不是另一个 Agent

利用 Input Source、Steer、Follow-up 和 User Bash：

- 普通新任务是新的场次。
- Agent 工作中收到 Steer，是导演递进来的紧急纸条。
- Follow-up 放到待办托盘，当前场结束后处理。
- 用户自己执行 Bash 时，由“导演操作”标识呈现，不能算成 Agent 的工作。
- Abort 是清晰的 Cut，而不是演出失败。

### 7.7 Alternate Takes

Session Tree 和 Fork 是 Pi 很独特的叙事能力：

- 从任意节点分叉成为 Take A / Take B。
- 查看当前正在播放哪条时间线。
- 比较两条路线用了哪些工具、花了多少资源、得到了什么结果。
- Branch Summary 成为另一条路线的剧情摘要。

这既好玩，也有真实的工程复盘价值。

### 7.8 真实的多 Agent 协作

增加 Subagent Bridge 后：

- 子 Agent 按真实启动顺序进场。
- Parallel、Chain 和 Single 采用不同交接动作。
- 每个子 Agent 展示真实模型、任务、工具、Turn、Token、Cost 和最终状态。
- Chain 模式中，上一位的结果作为文件交给下一位。
- Parallel 模式中，多人同时去不同工位。
- 中止时所有子进程同时撤场，不伪装成正常交付。

Pi 示例 Subagent 最多接受 8 个并行任务、默认最多 4 个同时执行；这些真实限制也可以直接反映在舞台调度中。

### 7.9 片尾演职员表

利用 Message Usage、Session Stats 和时间线：

- 总 Turn、工具调用、Token、Cost、Cache Read/Write。
- 每位 Agent 的参与时间和交付状态。
- 错误、重试、用户介入和分支次数。
- 本集修改过的文件和完成摘要。

片尾不是虚构评分，只汇总真实数据。

## 8. 应该克制使用的能力

Pi 允许扩展修改 Context、System Prompt、Tool 参数与结果，甚至注册/替换 Provider。这些能力很强，但 Live Show 默认不应该使用，因为会让“观察插件”改变 Agent 行为。

建议建立两种清晰权限：

- **Observer Mode（默认）**：只读事件、写自己的 Custom Entry、显示 UI。
- **Director Mode（明确开启）**：允许 Steer、Abort、Fork、Compact 或审批。

无论哪种模式都不应该：

- 把模型未提供的原始思维链编造出来。
- 默认上传 Prompt、源码、命令或 Tool Result。
- 自动批准 Project Trust 或危险工具。
- 静默修改 System Prompt、Context 或工具结果。

## 9. 推荐实现顺序

### P0：把事实直播做准

1. 直接消费 `assistantMessageEvent`，不再从累计 Message 猜 Delta。
2. 接入 Input、User Bash、Provider 和 Compaction；Retry 只消费当前运行模式明确提供的事实事件。
3. 为并行 Tool Call 引入 Tool Ticket，不复制 Agent。
4. 用 `appendEntry` 保存 Episode、Scene 和关键 Beat。
5. 将 `/office` 升级为 `/show`，增加状态栏与快捷入口。

### P1：把群像做真

1. 定义 `live-show:actor/v1` EventBus 协议。
2. 给 Subagent Extension 增加父进程 Bridge。
3. 将 child 的 JSON 事件逐条映射为 Actor Event。
4. 保留现有 `details.results[]` 解析作为兼容降级。

### P2：发挥 Pi 独有能力

1. Session Tree / Fork 的 Alternate Takes。
2. Compaction 的章节转场。
3. 本地 Episode 回放与片尾统计。
4. 可选 Director Mode。

## 参考

- [Pi Extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi Packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- [Pi Session Format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)
- [Pi Extension Examples](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions)
