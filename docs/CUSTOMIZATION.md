# Agent Live 自定义能力边界

> 状态：完整 Office 自定义、持久选择与文字区 · 2026-09-12

官方顺序固定为 tech（科技）、meetingroom（会议室）、oldschool（格子间），自定义 Office 排在后面。使用列表中的编号或唯一的完整名称；同名 Office 请使用编号。Pi、DSH 和本地网页读取同一 Registry 顺序。网页选择也会保存，重新启动读取已选 Office。

### 文字与空物件位

三个正式 Office 各提供 3 个默认空闲的物件位：两个绿植位，以及一个饮水机/售货机位；另有通用 staff-entry。具体容量和可选类型通过 Creator 的 list_components.room 获取。

每个 Office 还提供 company（公司铭牌/文字 Logo）、notice（公告）和 slogan（区域标语）三个文字区，默认留空。用户可以说“公司牌写蜗牛科技，公告写今天专注交付”。模型映射为：

```json
{ "texts": { "company": "蜗牛科技", "notice": "今天专注交付", "slogan": "一起完成" } }
```

公司名上限 24 字符，公告和标语各 48 字符。只接受单行纯文本，禁止模型提供坐标、HTML 或图片路径。文字显示在房间预留牌面上；空间不足时显示省略号。未提供的字段保留，空字符串隐藏该区域，texts: null 清除全部自定义文字。图片 Logo 尚未在本轮开放。

文字与家具、NPC 一起经过校验并持久化，不需要预览或确认保存。未知文字区及超长输入会拒绝该次修改，当前 Office 保持原样；模型应在工具失败后修正输入。

## 1. 适用范围

普通用户只选择官方只读 Preset。支持会话上下文注入的宿主通过 `/agent-live custom` 显式进入多轮自定义，并通过 `/agent-live exit` 明确退出；普通模式下的自然语言不应被误判成办公室修改。

自定义使用 Coding Agent 已经配置的模型与 Provider。Agent Live 不要求用户再次填写 API Key，不保存 Provider 凭证，也不自行调用云端模型。

自定义模式的目标是：**把用户的自然语言稳定映射到 Agent Live 已经实现的声明式能力，而不是让模型自由修改产品源码。**

## 2. 两种内容状态

| 状态 | 含义 | 是否可直接使用 |
| --- | --- | --- |
| Official Preset | 官方发布、只读并经过完整回归的办公室 | 是 |
| Custom Office | 由 Creator 原子校验、保存并选择的本地办公室 | 是 |

Custom Office 由某个 Official Preset 派生：第一笔改动就会生成一个内容完整继承的副本（房间、摆放、NPC、活动、组件全都带过来），不覆盖安装目录中的官方文件。校验或保存失败时，当前有效版本保持不变。

Creator 只从最接近的 Official Preset 修改，用户不需要先理解内部 Schema，也不需要手工选择每个组件。公开命令只有四条：

```text
/agent-live list presets
/agent-live preset <number or name>
/agent-live custom
/agent-live exit
```

“给我做一个警察局”这类需求的处理方式：**先选中最接近的完整 Preset Office，再修改名称、人员与身份、家具、风格和活动**；“警察局”这个说法本身不产生新的房间结构。如果用户要求的是全新的房间结构（新的墙体、区域、通道、座位或工作落点），统一回答：**这需要新增一个 Office Preset，需要修改源码**，Creator 不做这件事。

一个 Office 自带它所在的房间，**房间不能单独更换**：想换房间就是换一个 Preset Office（`/agent-live preset <number or name>`），或者编辑那个 Preset Office 得到一份自己的副本。Layout 因此是内容作者（Component Library）的概念，不是 Creator 的操作。

Creator Mode 是会话级模态状态，但不是内容草稿状态。每次合法修改都会经过校验后直接生效；每轮回复都应提示 Creator Mode 仍在运行以及 `/agent-live exit`。模式内出现明显无关或指代不清的项目开发请求时不直接执行，而是让用户选择继续编辑、退出或列出 Preset。

## 3. Creator v1 可以映射的能力

| 用户表达 | 映射到 | 边界 |
| --- | --- | --- |
| “改成暖色、深夜、雨天” | Style / Atmosphere / Environment | 只使用已有视觉 token、天气类型和时间阶段 |
| “桌面丰富一点” | Props | 从已有 Prop Type 中选择，并放入允许的区域或插槽 |
| “增加老板、保洁或前台” | NPC | 只能选择 Capability Catalog 中已登记的 NPC Template |
| “保洁晚上八点上班” | Environment / NPC shift | 使用有效 `HH:MM` 班次，支持跨夜 |
| “空闲时去喝水或聊天” | Life Activities | 只组合已有参与者、target、pose、particle 和 step |
| “把饮水机放到休息区” | Props / slot | 目标槽位必须存在，放置后不能阻断导航 |
| “从 Tech 办公室开始” | Custom Office base | 引用已安装的 Preset Office，房间与内容完整继承 |
| “换成会议室的房间” | 不支持就地更换 | 选中那个 Preset Office 再编辑；房间随它带来，成本与改别的东西相同 |

Creator 可以调整和组合现有能力，但不能因为自然语言中出现了一个新名词，就假设 Runtime 已经具备对应实现。

## 4. Creator v1 不开放的能力

以下需求不能在声明式自定义中直接生成：

- 全新的家具 renderer、人物画法、精灵图或动画系统。
- 当前不存在的天气、粒子、声音机制或 Life Activity step。
- 新的 Work Semantic、Agent 状态或宿主事件协议。
- 寻路、碰撞、座位分配、事件优先级和 Office Runtime 规则。
- 多楼层、多建筑、自由镜头或不同空间引擎。
- 页面组件、配置编辑器、Connector 或其他程序代码。
- 任意 JavaScript、Shell 命令、远程资源和未经批准的本地文件。

自定义 Agent 不得通过偷偷增加字段、输出脚本或修改源码来绕过边界，也不能把没有实现的效果描述成“已经完成”。

## 5. 所有用户输入的处理规则

Agent 必须先把一次输入拆成独立需求，再逐项分类：

### A. 精确映射

现有能力能够直接表达时，映射为一次受限 Office Patch，并原子应用到所选基础 Office。

### B. 边界内的近似映射

没有同名能力但已有能力可以形成接近效果时，Creator 不在生成过程中逐项打断用户。修改完成后统一说明原始要求、采用的现有能力以及视觉或行为差异；用户可以继续调整。

### C. 无法映射

需求需要新增代码或运行机制时，Agent 必须：

1. 不把该项写入 Office Patch。
2. 明确说明它超出 Creator v1 的声明式能力。
3. 保留同一输入中其他可以实现的部分。
4. 告诉用户需要查看或修改源码，并指出最相关的入口。

混合需求应返回一张简短清单，例如：

```text
可以直接实现：调整保洁班次、切换雨夜。
可以近似实现：把“霓虹招牌”映射为现有墙面装饰，需要你确认。
需要新增组件或修改源码：增加当前未登记的保安、闪电天气和人物跳舞动画。
```

## 6. 源码入口指引

| 超出边界的需求 | 建议查看的源码 |
| --- | --- |
| 新家具、新区域视觉或新天气特效 | `plugins/agent-live/web/v2/office-renderer.js`、`plugins/agent-live/web/v2/content/props/` |
| 新人物画法或动画 | `plugins/agent-live/web/v2/sprite-renderer.js`、`plugins/agent-live/web/v2/content/agent-skins/` |
| 新生活行为机制或 step | `plugins/agent-live/web/app.js`、`plugins/agent-live/web/v2/content/life-activities/` |
| 新工作语义或工具映射 | `plugins/agent-live/src/core/protocol.ts`、`plugins/agent-live/src/core/mapping.ts`、`plugins/agent-live/web/app.js` |
| 新宿主事件或 Connector | `plugins/agent-live/src/adapters/pi/adapter.ts`、`plugins/agent-live/src/core/protocol.ts` |
| 新空间合同、寻路或碰撞规则 | `plugins/agent-live/web/v2/office-renderer.js`、`docs/OFFICE-THEMES.md` |
| 新时间、天气或班次机制 | `plugins/agent-live/web/v2/environment-runtime.js`、`plugins/agent-live/web/v2/content/environments/` |

查看源码意味着退出受约束的 Creator 流程，进入正常的软件开发流程。Creator Agent 只能解释入口，不能自动获得修改这些机制的权限。

## 7. 生成与验收门

每轮自定义必须按以下顺序执行：

```text
用户输入
→ 能力分类
→ 映射与边界内自动修复
→ 生成受限 Office Patch
→ Schema 校验
→ 内容引用校验
→ 导航引用、座位数量与组件容量校验（当前不做几何碰撞校验）
→ NPC 与 Life Activity 校验
→ Environment 校验
→ 原子保存并选择 Custom Office
→ 页面重新加载有效内容
```

任何强制校验失败都不能进入下一步。Agent 可以自动修复仍处于能力边界内的问题；如果修复需要修改源码，则必须停止并按“无法映射”处理。

只有满足以下条件才能说“已经完成”：

- Office Patch 与生成的 Office Spec 符合约定 Schema。
- 所有引用的内容能力真实存在。
- 必需工作语义、座位和主要路线仍然可用。
- NPC 班次、出生点与 Life Activity 目标有效。
- 新 Office 可以被 Runtime 解析；失败时旧版本保持有效。

## 8. 安全边界

- 模型输出只是候选数据，不能直接作为可信配置运行。
- Creator 只允许调用 Agent Live 提供的受限工具，不直接写官方 Preset。
- Creator Mode 只保存在当前宿主进程内存中，并按宿主会话隔离；退出命令、宿主会话结束或插件卸载都会清理。
- API Key 和 Provider 配置始终由 Coding Agent 管理。
- Custom Office 不得包含密钥、会话内容、真实代码或绝对文件路径。
- 外部天气等数据由宿主标准化后注入，内容配置不主动联网。
- 先在内存中完成校验，再以原子写入替换文件；失败时不写入无效版本。

这份边界同时约束 Creator Skill、模型输出 Schema、校验器和未来的自定义工具实现。
