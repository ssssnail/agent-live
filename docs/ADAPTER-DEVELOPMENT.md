# Agent Live Adapter 开发指南

> 这是宿主调研与官方贡献指南。直接实现代码请先读 [Adapter SDK](ADAPTER-SDK.md)；也可以把仓库中的 `agent-live-adapter-builder` Skill 交给自己的 Coding Agent。

Adapter Package 封装一个宿主的全部接入差异：安装入口、官方事实转换、可选控制能力、正常生命周期和展示装配。它可以启动 Viewer、Runtime 或注册宿主原生 View，但不定义办公室画面，也不应猜测宿主没有提供的信息。

本文是第三方 Adapter 的主入口。公共架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，事件类型以 [`protocol.ts`](../plugins/agent-live/src/core/protocol.ts) 为准，Pi 与 Codex 实现仅作为宿主专用参考。DSH 的第一阶段方案见 [DSH-ADAPTER-DESIGN.md](DSH-ADAPTER-DESIGN.md)。

## 1. 先确认宿主真正开放了什么

开始编码前，先阅读宿主的官方文档、SDK 类型和示例，并记录以下内容：

| 调查项 | 需要回答的问题 |
| --- | --- |
| 官方扩展机制 | 官方称它为 Extension、Plugin、App Server、Hook、SDK，还是其他名称？ |
| 安装入口 | 用户如何安装、启用、升级和卸载？是否需要重启宿主？ |
| 生命周期 | 能否知道会话、用户请求、Agent 工作和工具执行何时开始或结束？ |
| 数据粒度 | 提供完整对象、完成事件，还是增量更新？字段是否稳定、是否包含 ID？ |
| 控制能力 | 能否创建或恢复会话、提交输入、中断运行、处理审批？ |
| 多 Agent | 是否正式提供 Subagent 的身份、父子关系、任务和退出事件？ |
| 历史能力 | 能否读取持久化会话、Turn 和工具记录？是否需要轮询？ |
| UI 与命令 | 能否注册命令、按钮、WebView，或者只能返回本地 URL？ |
| 安全与清理 | 权限由谁审批？页面、会话或宿主退出时如何停止本地服务？ |

描述调查结果时按以下优先级使用术语：

1. 宿主官方术语和真实方法名。
2. 行业通用术语，例如 JSON-RPC、notification、callback、polling。
3. Agent Live 内部能力分类。

不要把 Agent Live 的分类写成宿主的官方概念。比如 Codex 官方使用 App Server、Thread、Turn、Item、request 和 notification；“Controller Adapter”只是我们对这组能力的归纳。

如果宿主没有正式公开所需能力，应明确降级或停止实现。不要读取私有数据库、注入宿主进程、解析不稳定日志或伪造事件，除非实现被明确标记为实验性方案，并由用户主动选择。

## 2. 选择可实现的接入能力

不同能力彼此独立；宿主支持一种，不代表一定支持其他能力。

| Agent Live 分类 | 行业含义 | 常见官方形态 | 对用户的效果 |
| --- | --- | --- | --- |
| 实时观察 | 接收宿主正在发生的事实 | Extension callbacks、SDK events、JSON-RPC notifications | 用户继续在原宿主工作，办公室实时变化 |
| 任务控制 | 从外部驱动宿主任务 | App Server、client SDK、session APIs | Agent Live 客户端可以提交和中断任务 |
| 节点上报 | 宿主在指定节点调用处理器 | lifecycle hooks、command hooks | 只能展示 Hook 明确提供的粒度 |
| 历史重建 | 读取已持久化的任务记录 | history/session/thread APIs | 可以延迟展示或回放，通常需要查询或轮询 |

实时观察不等于获取宿主内部全部事件。Adapter 只能使用官方接口实际暴露的字段。任务控制接口也可能只返回聚合结果，不保证拥有实时观察能力。

公共 SDK 不要求开发者填写一份容易失真的能力清单。`observe` 来自必需的 `connect()`；控制能力和嵌入式 View 根据实际实现的方法自动推导：

```ts
export interface AdapterCapabilities {
  observe: boolean;
  prompt: boolean;
  interrupt: boolean;
  modelSelect: boolean;
  approve: boolean;
  embeddedView: boolean;
}
```

| 字段 | 为 `true` 的最低条件 |
| --- | --- |
| `observe` | 能在任务运行期间持续获得至少状态或工作事件，而不只是启动后读取一次结果 |
| `prompt` | Adapter 能通过宿主正式接口提交新的用户请求 |
| `interrupt` | Adapter 能通过宿主正式接口请求停止当前工作 |
| `modelSelect` | Adapter 能读取或设置当前任务使用的模型；只显示固定名称不算支持 |
| `approve` | Adapter 能通过宿主正式接口提交审批决定 |
| `embeddedView` | 宿主提供正式 View Slot，且 Adapter 实现了挂载与清理 |

Subagent、模型信息和 Token 用量属于宿主事实：宿主提供可靠数据时直接映射为公共事件，不需要再声明一套开关。暂时无法映射的官方能力可以留在 Adapter 内部，但不能泄漏到 Core。

## 3. Adapter 与其他模块的边界

```text
宿主官方接口
      ↓
Adapter Package：入口、连接、接收、控制、翻译与正常生命周期
      ↓ OfficeEvent
Core：状态和宿主无关语义
      ↓
Presentation：本地 Runtime 或宿主原生 View
      ↓
Office Engine：人物、路径、活动和环境
      ↓
Renderer
```

Adapter 应该负责：

- 根据宿主官方生命周期接收事实事件。
- 为真实 Agent 维护稳定 ID 和父子关系。
- 把宿主事件转换成 `OfficeEvent` 或调用 `OfficeState` 的对应操作。
- 在宿主允许时实现提交请求、中断和审批等控制方法。

同一个 Adapter Package 还应该负责：

- 建立和关闭所需的宿主连接。
- 创建并装配 Core 与选定的 Runtime 或原生 View。
- 注册宿主命令、View、Skill、Tool 与安装入口。
- 按宿主要求决定何时启动、保持和关闭。
- 明确拥有并释放订阅、定时器、本地服务和自己创建的子进程。

Adapter 不应该负责：

- 指定人物坐标、路径、工位或家具。
- 创建 NPC、生活事件或视觉特效。
- 决定人物如何移动、使用设施或播放动画。
- 根据输出文本猜测工具、Subagent 或任务是否成功。
- 把宿主专用对象加入 `OfficeEvent`。
- 绕过公共 Creator、Compiler、Validator 修改 Custom Office。
- 为了让画面更丰富而生成宿主没有报告的工作事实。

## 4. 公共事件协议

所有 Adapter 最终使用 [`OfficeEvent`](../plugins/agent-live/src/core/protocol.ts)。

| 事件 | 含义 | 关键要求 |
| --- | --- | --- |
| `snapshot` | 当前完整状态，用于 Viewer 首次连接或恢复 | Agent、Session、日志必须自洽 |
| `session` | 会话模型、思考等级、忙闲和 Turn 数变化 | 不确定字段应省略，不要猜测 |
| `agent_join` | 一个真实 Agent 加入 | `id` 在其生命周期内稳定 |
| `agent_leave` | 一个真实 Agent 离开 | 必须对应已有 Agent；宿主不知道成功与否时省略 `ok`，不得猜测 |
| `agent_state` | Agent 的工作状态变化 | 使用公共 `AgentState` |
| `task` | 当前用户任务的短描述 | 控制长度，不复制完整敏感上下文 |
| `thought` | 宿主明确允许展示的思考摘要 | 不得把私有推理冒充摘要 |
| `say` | 面向用户的 Agent 文本增量或完成文本 | 流式内容不能重复累计 |
| `action` | 一次真实工具或工作动作开始 | `toolCallId` 必须可关联 |
| `action_end` | 对应动作完成 | `ok` 来自宿主事实 |
| `delegate` | 父 Agent 把任务交给子 Agent | 双方 ID 必须稳定 |
| `usage` | 当前会话的用量 | 产品统一使用会话累计口径 |

公共状态为 `idle`、`thinking`、`working`、`waiting`、`talking`、`done`、`error`。公共动作为 `type`、`archive`、`server`、`whiteboard`、`phone`、`delegate`、`coffee`。

宿主工具名称应先通过公共映射转换为工作语义。没有可靠映射时，回退到普通工作动作，而不是增加宿主专用枚举。Layout 再决定动作最终发生在哪个设施。

## 5. 建立事件映射表

编码前先提交一张映射表。左侧必须使用宿主官方名称，右侧才使用 Agent Live 事件。

```text
宿主官方事件/方法          可用字段                    Agent Live
────────────────────────────────────────────────────────────────
<session started>          session id, model           session + agent_join
<user request started>     text, turn id               task + thinking
<tool started>             tool name, call id          action
<tool completed>           call id, status             action_end
<assistant delta>          text delta                  say
<task completed>           status, usage               done/error + usage
<subagent started>         child id, parent id, task    agent_join + delegate
<subagent completed>       child id, status             agent_leave
```

每行还应注明通信形式、事件粒度、是否可能重复或乱序、ID 作用域，以及缺失时的降级行为。

一个实时 Adapter 至少要能稳定产生：主 Agent 加入、会话忙闲、任务与真实状态、至少一种真实工作动作或可靠回答、正常与异常结束，以及初始 `snapshot`。

如果只能读取完成后的历史，不应声明 `observe: true`；应等待公共 Replay 合同建立后接入历史重建。

## 6. 推荐实现结构

第三方 Adapter 默认是独立 Node 包，不进入 Agent Live 源码目录，也不修改其他 Adapter：

```text
agent-live-adapter-<host>/
├── adapter.ts       官方事件到 Core 的转换
├── client.ts        可选：官方协议或 SDK 的薄封装
├── launcher.ts      可选：连接、Runtime 与正常退出策略
├── view.ts          可选：宿主原生 View 集成
├── entry.ts         宿主插件或扩展入口
└── types.ts         可选：宿主公开类型的最小本地声明
```

公共 SDK 示例：

```ts
import { defineAdapter } from "@iniesta8888/agent-live";

export default defineAdapter({
  id: "example",
  name: "Example Agent",
  connect({ host, office }) {
    return host.subscribe((event) => {
      const mapped = mapHostEvent(event);
      if (mapped) office.publish(mapped);
    });
  },
});
```

使用独立 Viewer 的最小骨架：

```ts
const runtime = new AgentLiveRuntime(cwd);
const adapter = createHostEventAdapter({ state: runtime.state, hostClient });

try {
  await adapter.start();
  await runtime.start({ port, onViewerCountChange: handleViewerCount });
} catch (error) {
  await Promise.allSettled([adapter.close(), runtime.close()]);
  throw error;
}

// 何时执行由当前宿主的 Adapter 策略决定。
await Promise.allSettled([adapter.close(), runtime.close()]);
```

这只是职责示例，不是要求所有 Adapter 实现相同的 `start/close` 接口。具体回调注册、连接恢复和退出时机必须遵循宿主官方生命周期。宿主提供正式 View Slot 时，Adapter 可以直接注册原生 View，不创建 `AgentLiveRuntime`，也不能为了结构一致而额外启动 HTTP 服务。

Agent Live 的公共资源兜底完全位于 Engine/Runtime 内部，Adapter 开发者不需要也不能向其中登记资源。它只负责 Agent Live 公共实现启动或占用的本地服务、连接、定时器、内存事件记录和临时文件。宿主连接、宿主进程以及 Adapter 自己创建的资源，均由宿主和 Adapter 按其正式生命周期负责。

官方事件直接映射到 Core，不先发明 `<Host>Fact`。如果同一官方通道中的 started/completed、增量/完成事件需要关联，可在 Adapter 内使用私有 map 或 cursor；它们是协议适配细节，不是共享业务层。一个事实只选择一个权威来源，禁止为了“更完整”同时订阅多个来源并重复发出 OfficeEvent。

## 7. 身份、顺序和异常处理

### Agent 身份

- 主 Agent 可以使用 Adapter 内部稳定 ID，例如 `main`。
- Subagent 优先使用宿主提供的 thread/session/agent ID。
- 昵称和角色不能作为唯一 ID。
- 同一个 Agent 的后续事件必须复用 ID，不能重复加入并替换主 Agent。
- Agent 数量与工位数量相互独立；超出画面容量由公共上限处理。

### 事件顺序

- 收到动作结束但没有开始时，不伪造完整调用。
- 重复通知按宿主事件 ID 或 `toolCallId` 去重。
- 增量文本只追加新片段；完成事件不能再次追加全文。
- Turn 完成后清理未结束动作并进入稳定状态。
- 中断请求成功不代表已经停止；等待宿主正式完成或取消通知。

### 连接与退出

- 本地服务只监听 `127.0.0.1`。
- Adapter 必须明确自己拥有的宿主连接、View 和 Runtime（如有）。
- Viewer 关闭后按公共生命周期退出，不遗留轮询器、子进程或监听器。
- 宿主断线时有限恢复，不能无限高速重连。
- 定时器、订阅和子进程都必须在 `close()` 中释放。

## 8. Creator 接入是独立能力

Creator 不属于事件映射，也不要求 Adapter 复制 Creator、Compiler 或 Validator。宿主若支持命令、Tool 和每轮上下文扩展，Adapter 只负责把这些官方扩展点绑定到 Agent Live 提供的公共 Creator 合同。

如果宿主支持 Tool、Skill、命令或生命周期 Hook，完整接入应提供：

1. 注册 `/agent-live custom` 与 `/agent-live exit` 等用户命令。
2. 将 Custom 状态限定在当前宿主会话或任务内。
3. 在 Custom 状态下绑定公共 Tool 和上下文；每次合法修改直接生效。
4. 普通状态不把自然语言误判为 Office 编辑。
5. 退出、任务结束或 Agent Live 关闭时清理 Custom 状态。

如果宿主没有这些能力，实时办公室 Adapter 仍可成立，但应声明暂不支持自然语言自定义。不要为此复制 Creator 逻辑。

## 9. 最小验证门

### 静态合同

- [ ] Adapter 包含唯一 `id`、官方产品名，且可选能力均有真实实现。
- [ ] Core、Runtime 和 Renderer 未导入宿主 SDK。
- [ ] Adapter 未写入坐标、家具、NPC 或 Preset。
- [ ] 未增加宿主专用 `OfficeEvent`。

### 单 Agent 流程

- [ ] 启动后只出现一个主 Agent。
- [ ] 用户任务进入宿主真实支持的状态。
- [ ] 工具开始与结束正确配对。
- [ ] 正常完成、失败和中断回到稳定状态。
- [ ] 可选信息缺失时页面仍正常工作。

### 多 Agent 流程

- [ ] 只有宿主正式提供 Subagent 身份与生命周期时才运行此组测试。
- [ ] 子 Agent 不替换主 Agent，并拥有不同稳定 ID。
- [ ] 委派、完成和退出顺序正确。
- [ ] 超过画面容量时不会重叠、崩溃或破坏状态。

### 生命周期

- [ ] 重复启动不会意外创建两个 Integration 实例或两个 Runtime。
- [ ] Viewer 刷新可以重新获得 `snapshot`。
- [ ] Viewer 关闭、宿主退出和异常启动都会释放服务及宿主连接。
- [ ] 重连不会重复 Agent、文本或工具事件。

### 项目回归

```bash
npm run check
npm run validate:package
```

公共合同入口是 `npm run validate:adapter-sdk`。宿主特定事件序列仍应在独立 Adapter 包内补充测试。

## 10. 提交 Adapter 时应包含什么

一个可审查的 Adapter 变更至少包含：

1. 宿主官方名称、文档链接、版本范围和安装方式。
2. 官方接口到 `OfficeEvent` 的映射表。
3. 基于公共 `defineAdapter()` 的实现代码。
4. 启动、停止、失败和可选 Subagent 的自动测试。
5. 一次真实宿主测试记录。
6. 已知限制和明确的降级行为。
7. 第三方依赖、权限、日志和本地数据说明。

评审顺序固定为：先确认宿主事实和官方接口，再检查公共协议映射，最后检查画面表现。画面正确不能替代事件和生命周期正确。

## 11. 当前官方参考实现

### Pi

入口：[`packages/pi/src/adapter.ts`](../packages/pi/src/adapter.ts)

Pi Adapter 使用 Pi Extension API 注册官方生命周期事件回调。它适合参考进程内实时观察、模型变化、工具调用和 Subagent 映射，但 Pi 专用事件名不能复制到其他宿主。

### Codex

入口：[`src/adapters/codex/adapter.ts`](../plugins/agent-live/src/adapters/codex/adapter.ts)

Codex Adapter 使用 Codex App Server 协议，通过 JSON-RPC request 控制由客户端建立的 Thread/Turn，并读取 App Server notification。它适合参考外部客户端、审批、增量 Item、停止请求和子进程清理，但 Agent Live 的“控制/观察”分类不是 Codex 官方术语。

### DeepSeek Harness

入口：[`dsh/src/adapter.ts`](../plugins/agent-live/dsh/src/adapter.ts) 与 [`dsh/src/client.tsx`](../plugins/agent-live/dsh/src/client.tsx)

DSH Adapter 使用官方 `conversation.view`，从 Web Client 已有的 Session、Conversation、模型、用量和 Subagent Projection 构造有界 Snapshot，再增量映射为 `OfficeEvent`。它适合参考宿主原生 View、Snapshot 差分、Tab 重建和无额外 HTTP Runtime 的集成；`dsh/src/index.ts` 只负责在 Host 侧注册 Creator 所需的正式扩展，不是第二条工作事件桥。

选择参考实现时，应根据宿主官方扩展形态选择最接近的一套，而不是根据画面效果选择。
