# Agent Live 技术文档

> 版本 0.3.0（开发中）· 最后校准 2026-09-13 · Node 22+

> 本文主要记录最初的 Pi / Local Runtime / Browser 实现细节。跨宿主职责与最新公共合同以 [ARCHITECTURE.md](ARCHITECTURE.md)、[ADAPTER-SDK.md](ADAPTER-SDK.md) 和各宿主 Adapter 设计为准。

## 1. 架构总览

当前公共架构、依赖方向和 Adapter Contract 以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准。本文件继续记录协议、Pi 映射和渲染实现细节。

```text
Pi / Codex → Adapter → Core → Runtime → Browser Renderer
                                      ↕ optional host controls
```

关键点：

- Pi 的服务跑在 Pi 进程内；Codex 使用随页面生命周期运行的轻量客户端。两者都没有守护进程。
- 画面事件通过 SSE 单向传输；Codex 的 Prompt、模型、停止和授权通过本地 HTTP 控制接口回传。
- 前后端共享 `protocol.ts` 定义的事件词汇，但前端是纯 JS（无构建步骤），靠约定而非类型检查保持一致。
- 原版和 V2 共用 `app.js` 的事件状态机；V2 的地图、角色、导航和视觉 token 由内容配置与两个原生 renderer 提供，不加载原版 `office.js` / `sprites.js`。

## 2. 运行环境与依赖

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node | ≥ 22 | 直接跑 `.ts` 靠原生 type stripping，不引入 tsx/jiti |
| npm 依赖 | **零** | 只用 `node:http` / `node:fs` / `node:path` / `node:url` / `node:child_process` |
| 前端依赖 | **零** | 原版用全局脚本；V2 用浏览器原生 ES modules；均无打包 |
| pi | 0.84.x | 依赖其扩展 API 与事件名 |

零依赖是硬约束：扩展在 pi 的运行环境里加载，引入 npm 包会带来解析和版本问题。

代价：不能使用不可擦除的 TypeScript 语法（如 parameter properties、enum），只能用类型注解形式。

## 3. 目录结构

```
agent-live/
├── index.ts              # Pi 兼容入口，re-export 官方 Pi Adapter
├── package.json          # type: module；pi.extensions 声明入口
├── README.md
├── docs/                 # 产品、愿景、内容模型、平台能力与技术文档
├── plugins/agent-live/scripts/
│   ├── preview.ts        # 脱离 pi 单独起服务，用于调视觉
│   ├── validate-content.ts # 校验 V2 内容合同
│   └── validate-environment.ts # 校验时间、天气与 NPC 班次
├── plugins/agent-live/src/
│   ├── core/             # 标准协议、状态与工具语义
│   ├── runtime/          # 共享本地服务和生命周期
│   └── adapters/         # Adapter Contract、Pi 与 Codex 实现
└── plugins/agent-live/web/
    ├── index.html        # 原版入口（冻结回归基线）
    ├── style.css         # 原版深色像素风 UI
    ├── sprites.js        # 原版程序化角色与粒子
    ├── office.js         # 原版地图、家具、导航数据
    ├── app.js            # 两入口共用的 SSE、演出编排与动画循环
    ├── v2.html           # 配置化入口
    └── v2/
        ├── bootstrap.js        # 内容加载、校验、token 应用与启动
        ├── environment-runtime.js # 时间、天气、照明与 NPC 班次
        ├── office-renderer.js  # Layout / Props / Style 原生 renderer
        ├── sprite-renderer.js  # Agent Skin / Style 原生 renderer
        ├── parity.html/.js     # 原版与 V2 的逐像素回归
        └── content/            # 八类内容、三套正式 Preset 与内部回归内容
```

## 4. 生命周期

| 阶段 | 触发 | 行为 |
| --- | --- | --- |
| 启动 | `session_start` 或首次 `/agent-live` | `boot()` 建 `OfficeState`、主管上班、起 HTTP 服务、状态栏显示地址 |
| 运行 | 各类 pi 事件 | 翻译成 `OfficeEvent` 广播给所有连接的浏览器 |
| 关闭 | `session_shutdown` | 关服务、断开所有 SSE 客户端、`dispose()` 清空状态 |

`boot()` 幂等（`if (state) return`），所以 `/agent-live` 命令在 `session_start` 之前被调用也安全。

启动失败时：有 UI 就 `ctx.ui.notify(..., "error")`，无 UI（如 `pi -p` 打印模式）落到 `console.error`，避免静默失败。

## 5. 事件协议

定义在 `plugins/agent-live/src/core/protocol.ts`，被两侧共享。

### 5.1 事件表

| 事件 | 载荷 | 前端表现 |
| --- | --- | --- |
| `snapshot` | `agents[] / log[] / session` | 全量重建（清空 actors、粒子、日志 DOM） |
| `session` | `session` | 更新顶栏模型、轮次、忙碌标记 |
| `agent_join` | `agent` | 新建小人；非主管从门口进场并喊"我来了" |
| `agent_leave` | `id, ok` | 浮对勾/叉号，走回门口后销毁 |
| `agent_state` | `id, state, detail` | 状态灯换色，员工卡刷新 |
| `task` | `id, task` | 主管的任务写进底部任务条 |
| `thought` | `id, text` | 蓝色思考气泡（取末尾 52 字） |
| `say` | `id, text` | 灰色汇报气泡（取开头 90 字） |
| `action` | `id, action, label, toolCallId` | 走向对应工位，工位点亮，黄色动作气泡 |
| `action_end` | `id, toolCallId, ok` | 工位熄灭，回工位；失败浮叉号 |
| `delegate` | `from, to, task` | 入会面队列，播双人交接 |
| `usage` | `id, tokens, cost` | 员工卡与顶栏成本刷新 |
| `log` | `item` | 追加一条动态 |

### 5.2 核心类型

```ts
type AgentState = "idle" | "thinking" | "working" | "waiting" | "talking" | "done" | "error";
type OfficeAction = "type" | "archive" | "server" | "whiteboard" | "phone" | "delegate" | "coffee";

interface AgentView {
  id: string; name: string; role: string;
  parent?: string;          // 有父即子 agent，前端据此决定进场方式
  state: AgentState; detail?: string; action?: OfficeAction;
  task?: string; thought?: string; model?: string;
  tokens: number; cost: number; toolCalls: number;
  joinedAt: number; seat?: number;
}
```

`seat` 由服务端分配，前端不自行计算，保证多客户端看到同一布局。

## 6. pi 事件 → 办公室事件

`plugins/agent-live/src/adapters/pi/adapter.ts` 的翻译规则：

| pi 事件 | 处理 |
| --- | --- |
| `session_start` | `boot()` |
| `session_shutdown` | 关服务并清空状态 |
| `model_select` / `thinking_level_select` | 更新 session 信息 |
| `before_agent_start` | 写入任务（`event.prompt` 压缩空白后截 300 字），状态转 thinking |
| `message_start` | **重置流式游标**，状态转 thinking |
| `message_update` | 提取 thinking 与 text 的增量（见 6.1），推思考、切换 thinking/talking |
| `message_end` | 强制 flush 思考缓冲、发 say、累加 usage |
| `turn_start` / `turn_end` | 更新 busy 与轮次（`turnIndex + 1`） |
| `tool_execution_start` | 起动作；若是委派工具则拉子 agent 进场 |
| `tool_execution_update` | 同步子 agent 进度 |
| `tool_execution_end` | 结束动作；子 agent 按各自 `exitCode` 定成败，未定论的用工具整体结果兜底，延迟 2.6s 离场 |
| `agent_end` / `agent_settled` | flush 思考，转 idle，busy 置 false |

### 6.1 流式增量提取

pi 的 `message_update` 携带的是**累积的完整 message**，不是增量。所以维护两个游标：

```ts
const thinking = joinBlocks(message.content, "thinking");
if (thinking.length > thinkingCursor) {
  state.pushThought(MAIN, thinking.slice(thinkingCursor));
  thinkingCursor = thinking.length;
}
```

`message_start` 时归零。`joinBlocks` 从 `content` 数组里筛出指定类型的块并拼接，兼容 `content` 是纯字符串的情况。

### 6.2 思考节流

推理 token 到得很快，逐字广播会让气泡永远只显示一两个字。`state.ts` 的策略：

- 缓冲 180ms（`THOUGHT_FLUSH_MS`）后批量刷新。
- 非强制刷新时，**不足 12 字（`MIN_THOUGHT_CHARS`）的片段继续留在缓冲里**，避免开头冒出一个字的气泡。
- `message_end` / `agent_end` / `agent_settled` 强制刷新，保证尾巴不丢。
- 定时器 `unref()`，不阻止进程退出。

实测（真实模型一次会话）刷新出的块长度为 126 字、78 字，符合预期。

## 7. 工具 → 工位映射

`plugins/agent-live/src/core/mapping.ts`。按工具名正则匹配，**不硬编码具体工具**，所以自定义工具也能自动归位：

| 正则 | 工位 |
| --- | --- |
| `^(read\|ls\|glob\|grep\|find\|rg\|search_files\|list)` | `archive` 档案柜 |
| `^(write\|edit\|multi_edit\|apply_patch\|create\|notebook)` | `type` 自己工位 |
| `^(bash\|shell\|exec\|run\|terminal)` | `server` 服务器机架 |
| `^(todo\|plan\|task_list\|note)` | `whiteboard` 白板 |
| `(browser\|web\|fetch\|http\|curl\|search)` | `phone` 电话桌 |
| `^(ask_user\|question\|confirm)` | `phone` 电话桌 |
| `^(subagent\|task\|dispatch_agent\|spawn_agent\|agent)$` | `delegate` 会议桌 |
| 兜底 | `type` |

`labelForTool()` 另生成中文标签，会从参数里挑最有信息量的字段并做路径缩写（`…/core/session-manager.ts`）：

| 工具 | 标签样例 |
| --- | --- |
| read | `查阅 …/core/session-manager.ts` |
| bash | `执行 npm test -- session` |
| grep | `检索 /getSession/` |
| ask_user | `请示 要不要加 TTL？` |

## 8. 委派解析

`describeDelegation()` 把 subagent 工具接受的三种参数形态归一成一个扁平列表：

| 形态 | 参数 | 结果 |
| --- | --- | --- |
| 单个 | `{ agent, task }`（或 `prompt`/`description`/`subagent_type`） | 1 条，slot 0 |
| 并行 | `{ tasks: [{agent, task}, …] }` | N 条，slot 为下标 |
| 链式 | `{ chain: [{agent, task}, …] }` | N 条，slot 为下标 |

子 agent 的 id 为 `` `${toolCallId}:${slot}` ``，保证并行/链式各路互不冲突，且工具结束时能精确回收。

`syncDelegationProgress()` 读取 `details.results[]`（或 `details.tasks[]`），逐条处理：

1. 有 `usage` 就累加 token 与成本。
2. 看 `exitCode`。**`-1` 表示这一路还在跑**（subagent 扩展的约定）；已出数值则按 `exitCode !== 0` 或 `stopReason` 为 `error`/`aborted` 判成败，设成 done/error 后**跳过后续镜像**——否则每次进度回传都会把已交付的人重新拽去工位。
3. 还在跑的，取最后一条 assistant 消息镜像状态：含 `toolCall` → 起对应动作；含 thinking → 转 thinking 并推思考；含 text → 转 talking。

工具整体结束时（`tool_execution_end`）只给**尚未定论**的子 agent 兜底，不覆盖上面的单条结论。并行三路里一路失败，那一路才能独立显示为失败。

## 9. 服务端

`plugins/agent-live/src/runtime/server.ts`，约 170 行。

### 9.1 路由

| 路径 | 行为 |
| --- | --- |
| `/events` | SSE。先写 `: connected`，**立刻推一份 snapshot**，再订阅增量；25s 心跳 `: ping`；`req.close` 时清理订阅与心跳 |
| `/api/state` | 返回当前 snapshot 的 JSON，用于脚本化检查 |
| 其他 | 静态文件，根路径映射到 `index.html` |

响应头带 `x-accel-buffering: no` 与 `cache-control: no-cache, no-transform`，避免代理缓冲导致事件延迟。

### 9.2 端口探测

从 `AGENT_LIVE_PI_PORT`（默认 7788）开始，遇 `EADDRINUSE` 递增，最多尝试 12 次（7788–7800）。这样多个 pi 会话可以并存，各占一个端口，互不干扰。

### 9.3 静态文件与安全

- `WEB_ROOT = path.resolve(moduleDir(), "..", "web")`。`moduleDir()` 优先用 `import.meta.url`，失败回退 `__dirname` / `cwd`。
  - **软链接接入时仍然正确**：根 `index.ts` 只做 re-export，`import.meta.url` 解析到真实的 `plugins/agent-live/src/`，`../web` 因此指向真实项目目录。
- 解析后校验 `filePath.startsWith(WEB_ROOT)`，否则 403，防目录穿越。
- MIME 白名单，未知扩展名回落 `application/octet-stream`。
- **只绑 `127.0.0.1`**。事件流、完整状态和宿主控制状态使用本地访问令牌，并拒绝非本机 `Host` / `Origin`；仍不得暴露到局域网或公网。

### 9.4 广播容错

`OfficeState.emit()` 对每个监听器单独 try/catch。一个死掉的浏览器连接不能中断 agent 主循环——这是整个设计里唯一的强约束。

## 10. 状态机

`plugins/agent-live/src/core/state.ts`，`OfficeState` 类。

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `MAX_LOG` | 200 | 内存里保留的日志条数 |
| `THOUGHT_FLUSH_MS` | 180 | 思考批量刷新间隔 |
| `MIN_THOUGHT_CHARS` | 12 | 非强制刷新的最小片段长度 |
| `SCENE_LIMITS.seats` | 8 | 可坐工位总数 |
| `SCENE_LIMITS.agents` | 16 | 同一办公室中的真实 Agent 上限 |

- `snapshot()` 只带**最后 60 条**日志，新连接的客户端不至于一次性灌进 200 条。
- 座位用 `Set<number>` 管理，`claimSeat()` 取第一个空位，`leave()` 归还。座位已满时返回 `-1`，Agent 不带 `seat` 字段，由 Engine 使用站立位置；人数和工位数量不再强绑定。
- `addLog()` 的第四个参数 `broadcast` 控制是否额外发 `log` 事件。thought / say / tool 三类传 `false`，因为它们已有各自的专门事件，前端收到后自己写进动态栏（见 §11.7）；join / leave / delegate 传 `true`，由服务端直接广播。两类日志都会进 `snapshot` 的历史记录。

## 11. 前端渲染

`plugins/agent-live/web/app.js`。

### 11.1 分辨率与缩放

逻辑分辨率固定 384×216（16:9）。320×200 装不下 8 个工位加家具，所以放大到 384×216。

```js
dpr   = min(devicePixelRatio, 2);
scale = max(1, floor(min(canvasW / 384, canvasH / 216)));   // 必须是整数
offX  = floor((canvasW - 384 * scale) / 2);                  // 偏移也取整
```

整数缩放 + 整数偏移 = 每个逻辑像素恰好落在整数个设备像素上，边缘不糊。

### 11.2 双层变换

```js
ctx.setTransform(scale, 0, 0, scale, offX, offY);  // 第一层：场景、小人、粒子
  Office.drawRoom(...); Sprites.drawCharacter(...); Sprites.drawParticle(...);
ctx.setTransform(1, 0, 0, 1, 0, 0);                // 第二层：名牌、气泡
  drawLabel(...); drawBubble(...);
```

文字如果跟着场景一起放大会变成马赛克，所以在未缩放的坐标系里绘制，字号按 `scale` 比例算并夹最小值（名牌 `max(10*dpr, scale*3)`，气泡 `max(11*dpr, scale*3.2)`）。

### 11.3 主循环

`requestAnimationFrame`，`dt` 上限 0.05s（切走标签页再回来不会瞬移）。顺序：`update(dt, now)` → `render(now)`。

小人按 `y` 坐标排序后绘制，实现前后遮挡关系。

### 11.4 移动

曼哈顿移动：每帧只沿一个轴走，速度 `SPEED = 44` 逻辑 px/s。到达路点则弹出下一个；路径走完时套用 `dest` 的朝向与走道编号，姿势切回 `restPose()`。

`restPose()` 由动作决定：档案柜/机架/白板 → `reach`，电话 → `talk`，会面中 → `talk`，工作中且无动作或打字 → `type`，其余 → `sit`/`stand`。

### 11.5 气泡

逐字显示（46 字/秒），最多 3 行，自动换行按字符宽度测量。气泡框会被夹在画布内（`x` 钳制到 `[4dpr, canvasW - boxW - 4dpr]`），尖角随之偏移但仍指向小人。

### 11.6 粒子

| 类型 | 用途 |
| --- | --- |
| `key` | 打字 |
| `paper` | 翻档案 / 交接纸条 |
| `spark` | 跑命令 |
| `check` | 成功 |
| `cross` | 失败 |
| `bang` | 接到任务 |

工作中每 0.26s 发一个（服务器机架 0.18s，更密）。带 `target` 的粒子做插值飞行（用于纸条从 A 飞到 B），其余按速度直线运动并淡出。

### 11.7 动态栏

服务端只为 join / leave / delegate 广播 `log` 事件（§10）。thought / say / action 到达时由 `feed(agentId, kind, text)` 自行写入，用的是**事件全文**；气泡只显示裁剪后的片段（思考取末尾 52 字、汇报取开头 90 字）。分开处理是有意的：瞥一眼看气泡，回头查细节看动态栏。

`logLine()` 负责建 DOM 并把节点数压在 220 以内，`snapshot` 里的历史日志走同一个函数。

## 12. 地图与寻路

原版实现在 `plugins/agent-live/web/office.js`；V2 的同一组导航数据来自 `plugins/agent-live/web/v2/content/layouts/demo-office.json`，由 `plugins/agent-live/web/v2/office-renderer.js` 暴露给 Runtime。二者都使用 8px 网格和整数像素绘制。

导航靠固定走道而非通用寻路算法：

```
LANES = [46, 100, 162]        // 三条横向走道
VCONN = [76, 140, 204, 276]   // 四条纵向通道
```

`path(from, target)` 生成轴对齐路点：

1. 从当前位置垂直走上自己所在的走道
2. 若目标在别的走道，选一条**总距离最短**的纵向通道横穿过去
3. 沿目标走道横向移动到目标 x
4. 垂直进入目标锚点

每个锚点带 `{x, y, dir, lane}`，`lane` 是它属于哪条走道。因为所有家具都摆在走道之间的空隙里，这个路由天然不会穿过桌子——不需要碰撞检测，也不需要 A*。

`SEATS` 为两排各 4 个工位（cx = 44/108/172/236，第一排挂 lane 1，第二排挂 lane 2）。`TARGETS` 定义 archive / server / whiteboard / phone / coffee / meetA / meetB / entry，其中 `meetA(108,190,朝右)` 与 `meetB(244,190,朝左)` 正好面对面。

`stationKey(action, seat)` 返回高亮用的工位 id：`type`/`delegate`/空 → `desk{seat}`，其余 → 动作名本身。

## 13. 会面编排

委派事件先进 `meetQueue`，同一时刻只有一场 `meeting`。状态机：

```
delegate 事件 → 入队
  ↓ (无进行中的会面)
phase = "walk"   双方 goTo(meetA / meetB)，主管冒"派活：…"
  ↓ (双方 path 清空，或超时 5s)
phase = "hand"   纸条飞行 + 感叹号 + 子 agent 复述 + 双音提示
  ↓ (1.5s)
endMeeting()     清 inMeeting，各自 retarget()
```

`inMeeting` 标志在会面期间抑制 `retarget()`，防止其他事件把人从会议桌上拽走。超时兜底保证任何寻路异常都不会让队列永久卡死。

## 14. 演示模式

`runDemo()` 在 `plugins/agent-live/web/app.js` 内，通过 `apply()` 灌入伪造事件，与真实 SSE 走完全相同的渲染路径。

**演示脚本不额外发 `log` 事件**，只在委派处发一条（因为服务端确实会为委派单独广播日志），其余动态条目全由 §11.7 的 `feed()` 产生。这条约束必须保持：早期演示脚本给每条思考 / 汇报 / 工具都手工补了一条 `log`，正好掩盖住了前端漏写日志的缺口，代价是演示成了唯一“好使”的模式。

`?demo=1` 自动播放，否则 `connect()` 建立 SSE。演示只播一遍，不循环。

后端曾有一份对称的 `runDemo()`，已删除：两份脚本会各自漂移，留前端这份就够，`/agent-live demo` 只负责用 `?demo=1` 打开浏览器。

## 15. 安装与部署

```bash
ln -sfn /absolute/path/to/agent-live ~/.pi/agent/extensions/agent-live
```

pi 要求扩展位于 `~/.pi/agent/extensions/` 下的子目录，且入口是该目录根的 `index.ts`。项目的实际代码在 `plugins/agent-live/src/`，所以根 `index.ts` 只有一行：

```ts
export { default } from "./src/adapters/pi/adapter.ts";
```

这样既满足 pi 的发现规则，又不必把源码平铺到根目录，也不用改用户的 `settings.json`。

## 16. 配置项

| 环境变量 | 默认 | 作用 |
| --- | --- | --- |
| `AGENT_LIVE_PI_PORT` | 7788 | 起始端口，冲突时向后探测 12 次 |
| `AGENT_LIVE_AUTO_OPEN` | 未设置 | 设为 `1` 则会话启动时自动打开浏览器 |

## 17. 验证记录

以下均为实跑结果，非推断。

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| 扩展可加载 | `pi --list-models` | 退出码 0，无报错 |
| 服务在真实会话中启动 | `pi -p` 后轮询 `/api/state` | 第 8 次轮询（约 3.2s）拿到 snapshot，主管带真实模型名与任务 |
| 真实事件流完整 | 会话期间 `curl -N /events` | `agent_state`×14、`session`×6、`usage`×3、`thought`×3、`say`×2、`action`×2、`action_end`×2、`snapshot`×1 |
| 工具映射正确 | 同上 | `bash ls -la` → `action:server`/"执行 ls -la"；`read package.json` → `action:archive`/"查阅 package.json" |
| 思考分块合理 | 同上 | 刷新块长 126 字、78 字，无单字气泡 |
| 前端无运行时错误 | 浏览器 QA（console/page error/network） | 全部通过 |
| 演示全流程 | 播放中与播放后读取 DOM | 中段 3 人各就各位、状态正确；结束时子 agent 已离场，成本汇总 46.2k tok / $0.1840 |
| 动态栏（演示） | 播完读取 `#log` 文本 | 16 条、无重复；思考 / 工具 / 汇报 / 派活 四类齐全 |
| 动态栏（真实会话） | 会话期间浏览器读取 `#log` | 依次出现“阿派 上班了”、四条思考全文、“查阅 package.json”、“执行 ls -la web”、汇报全文 |
| V2 内容合同 | `npm run validate:content` | 内置 Preset 与八类内容全部通过 |
| 公共运行环境 | `npm run validate:environment` | 时间覆盖、天气覆盖、18:00 下班与跨夜班次全部通过 |
| V2 像素一致性 | `/v2/parity.html` | 房间 5 组、角色 3 组、粒子 7 组，共 15 个用例均为 0 channel differences |
| V2 完整演示 | 播放 `/v2.html?demo=1` 并检查 DOM / console | 完成至 46.2k tok / $0.1840，子 agent 正常离场，无 console error |
| V2 真实连接 | 非 demo 入口连接 SSE | 成功建立连接并接收会话状态 |

## 18. 已知缺陷

### 18.1 工位不做竞争处理（P2）

两个 agent 同时去档案柜会站在同一个锚点上重叠。需要给每个工位加候补站位或排队。

### 18.2 无座位 Agent 的表现较弱（P3）

Agent 与座位容量已经解耦：最多显示 16 个 Agent，前 8 个获得固定座位，其余 Agent 不再挤占最后一个座位。无座位 Agent 仍能参与工作动作和协作，但空闲时缺少明确的等待区视觉，这是后续内容优化项。

### 18.3 成本可能显示为 0（上游字段缺失）

实测部分模型 / 中继下 token 数正常累加，但成本停在 `$0.0000`——`message.usage.cost.total` 没给值。不是渲染问题，无法在本项目内解决。

### 18.4 长思考在日志里会被切成多条

180ms 批量刷新的自然结果：一段长推理在动态栏里可能表现为相邻的两三条。气泡观感正常，日志略显割裂。要连贯得在日志侧按 agent 合并相邻的 thought。

### 18.5 工具参数缺失时标签不完整

参数里没有 `path` 类字段时，`labelForTool()` 会产出光秃的“查阅”。实测在并行工具调用参数串台时见到过两条。要严谨就在拼不出提示时回落到工具名。

## 19. 扩展指南

新功能只扩展 V2；`plugins/agent-live/web/office.js` 和 `plugins/agent-live/web/sprites.js` 保持冻结。

**加一个角色外观**：在 `plugins/agent-live/web/v2/content/agent-skins/tiny-developers.json` 增加角色名、上衣与滚边配色。若它还是宿主传来的新职位名，再在 `plugins/agent-live/src/core/agents.ts` 的角色映射中增加中文名。名字匹配走小写。

**加一个已有类别的 Prop**：先在 Props registry 声明类型、尺寸、能力与 renderer，再在 Layout 的 `propInstances` 中放置实例。功能锚点必须位于可达通道上。

**加一种全新的 Prop 表现或能力**：除内容声明外，还要在 `plugins/agent-live/web/v2/office-renderer.js` 增加绘制逻辑；若它承载新的真实工作事件，再同步扩展 `plugins/agent-live/src/core/protocol.ts`、`plugins/agent-live/src/core/mapping.ts` 与 `plugins/agent-live/web/app.js` 的动作和特效分支。纯生活设施不应伪装成 Work Event。

**加一个 Layout**：创建新的 Layout JSON，保持 `single-office-v1`、384×216、8 个座位、连通导航，并为六种必需 Work Semantic 提供落点。随后新增或更新一个 Preset 引用它。座位默认使用 `workstation`，也可通过 `seats[].renderer` 选择内置的 `cubicle-workstation`、`executive-seat` 或 `boardroom-seat`。

**加一套 Style**：新建 Style JSON，完整覆盖 CSS、Canvas 与 Character tokens；布局坐标和事件语义不得放进 Style。

**接新的委派工具**：若参数结构不是现有三种形态，扩展 `describeDelegation()`；若进度回传结构不同，扩展 `syncDelegationProgress()` 的 results 提取逻辑。

**换成精灵图**：`plugins/agent-live/web/v2/sprite-renderer.js` 的 `drawCharacter(c, actor, t)` 是角色绘制入口，保持 Runtime 需要的返回接口不变即可整体替换为贴图绘制。

## 20. 性能与资源

| 项 | 表现 |
| --- | --- |
| 服务端内存 | 上限约 200 条日志、4000 条内存回放事件和 16 个 Agent 对象 |
| 广播开销 | 每事件对每客户端一次 `JSON.stringify` + 一次 write |
| 前端绘制 | 每帧约 200–300 次 `fillRect`，60fps 无压力 |
| 日志 DOM | 上限 220 节点，超出从头部移除 |
| 员工卡 | 整体重建（人数少，开销可忽略） |
| 心跳 | 25s 一次，防代理断连 |

主要的 CPU 成本是 `drawRoom()` 每帧重绘全部家具。目前分辨率下无所谓；真要优化就把静态层缓存到离屏 canvas，只重绘会闪烁的部分。

## 21. 配置化 V2 入口

原版 `/?demo=1` 保持冻结，用作视觉与行为回归基线。新版 `/v2.html?demo=1` 的启动链路为：

```text
v2.html
  └─ v2/bootstrap.js
       ├─ 解析 URL 指定的 Preset（默认 builtin/tech-open-office）
       ├─ 并行加载 Style / Layout / Agent Skin / Props / NPC / Life / Atmosphere / Environment
       ├─ 校验 single-office-v1、内容引用、时间天气和 NPC 班次
       ├─ environment-runtime.js → window.OfficeEnvironment
       ├─ 应用 UI tokens 与 Atmosphere 覆盖
       ├─ office-renderer.js → window.Office
       ├─ sprite-renderer.js → window.Sprites
       └─ 动态加载固定的 app.js Office Runtime
```

V2 的办公室和角色绘制已经完全由自己的 renderer 与内容配置生成，不加载经典 `office.js` / `sprites.js`。两条入口只共用固定的 `app.js` Office Runtime，使事件协议、移动、气泡、交接和侧栏行为保持一致。五套 Layout 共用这条 Runtime；布局差异不会改变宿主事件协议。

Environment 也是本地模块：核心不主动请求天气服务。宿主可通过 URL 参数或 `window.OfficeEnvironment.update()` 注入已经标准化的天气/时间，renderer 只读取快照。这使联网、定位和密钥权限停留在 Connector 一侧，内容和画面层仍保持零网络依赖。

新增目录：

```text
plugins/agent-live/web/v2.html
plugins/agent-live/web/v2/
  bootstrap.js
  environment-runtime.js
  office-renderer.js
  sprite-renderer.js
  style.css
  parity.html
  parity.js
  content/
    presets/demo-office.json
    presets/old-school-office.json
    presets/boardroom-office.json
    styles/pixel-classic.json
    layouts/demo-office.json
    layouts/old-school-office.json
    layouts/boardroom-office.json
    agent-skins/tiny-developers.json
    props/default-office.json
    props/extended-office.json
    npcs/none.json
    npcs/old-school-staff.json
    npcs/boardroom-staff.json
    life-activities/none.json
    life-activities/old-school-routines.json
    life-activities/boardroom-routines.json
    atmospheres/default.json
    environments/local-office.json
    environments/static-office.json
    environments/rainy-night.json
```

内容合同检查使用：

```bash
npm run validate:content
```

校验失败时 V2 不启动 Runtime，并在连接状态和动态栏中显示具体错误；已加载的原版入口不受影响。视觉回归使用 `/v2/parity.html`，当前覆盖 5 组房间状态、3 组角色状态和 7 组粒子状态。
