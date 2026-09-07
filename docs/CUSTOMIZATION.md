# Agent Office 自定义能力边界

> 状态：Creator v1 产品合同 · 2026-09-07

## 1. 适用范围

普通用户只选择官方只读 Preset。只有用户在 Coding Agent 中主动运行 `/office customize` 时，才进入多轮自定义流程。

自定义使用 Coding Agent 已经配置的模型与 Provider。Agent Office 不要求用户再次填写 API Key，不保存 Provider 凭证，也不自行调用云端模型。

自定义模式的目标是：**把用户的自然语言稳定映射到 Agent Office 已经实现的声明式能力，而不是让模型自由修改产品源码。**

## 2. 三种内容状态

| 状态 | 含义 | 是否可直接使用 |
| --- | --- | --- |
| Official Preset | 官方发布、只读并经过完整回归的办公室 | 是 |
| Draft | Agent 根据对话生成的本地草稿 | 只能预览 |
| Custom Office | Draft 通过全部校验并由用户确认后的本地办公室 | 是 |

Custom Office 必须基于一个 Official Preset，只保存允许的变化，不覆盖安装目录中的官方文件。产品升级、校验失败或用户取消时，最后一个有效版本必须仍可恢复。

## 3. Creator v1 可以映射的能力

| 用户表达 | 映射到 | 边界 |
| --- | --- | --- |
| “改成暖色、深夜、雨天” | Style / Atmosphere / Environment | 只使用已有视觉 token、天气类型和时间阶段 |
| “桌面丰富一点” | Props | 从已有 Prop Type 中选择，并放入允许的区域或插槽 |
| “增加保安、保洁或办公室猫” | NPC | 使用现有人物 renderer、外观参数和合法出生点 |
| “保安晚上八点上班” | Environment / NPC shift | 使用有效 `HH:MM` 班次，支持跨夜 |
| “空闲时去喝水或聊天” | Life Activities | 只组合已有参与者、target、pose、particle 和 step |
| “把饮水机放到休息区” | Layout / Props | 目标区域必须存在，放置后不能阻断导航 |
| “从 Tech 办公室开始” | Custom Office base | 只能引用已安装的 Official Preset |

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

现有能力能够直接表达时，说明将使用的基础 Preset、模块、角色、物件或活动，然后生成 Draft。

### B. 边界内的近似映射

没有同名能力，但已有能力可以形成接近效果时，Agent 必须先明确告诉用户：

1. 原始需求无法被当前能力精确实现。
2. 准备使用什么现有能力替代。
3. 两者在视觉或行为上有什么差异。

只有用户接受后，才能把近似方案写入 Draft。禁止静默替换。

### C. 无法映射

需求需要新增代码或运行机制时，Agent 必须：

1. 不把该项写入 Draft。
2. 明确说明它超出 Creator v1 的声明式能力。
3. 保留同一输入中其他可以实现的部分。
4. 告诉用户需要查看或修改源码，并指出最相关的入口。

混合需求应返回一张简短清单，例如：

```text
可以直接实现：增加夜班保安、调整班次、切换雨夜。
可以近似实现：把“霓虹招牌”映射为现有墙面装饰，需要你确认。
需要修改源码：新增闪电天气和人物跳舞动画。
```

## 6. 源码入口指引

| 超出边界的需求 | 建议查看的源码 |
| --- | --- |
| 新家具、新区域视觉或新天气特效 | `web/v2/office-renderer.js`、`web/v2/content/props/` |
| 新人物画法或动画 | `web/v2/sprite-renderer.js`、`web/v2/content/agent-skins/` |
| 新生活行为机制或 step | `web/app.js`、`web/v2/content/life-activities/` |
| 新工作语义或工具映射 | `src/protocol.ts`、`src/mapping.ts`、`web/app.js` |
| 新宿主事件或 Connector | `src/index.ts`、`src/protocol.ts` |
| 新空间合同、寻路或碰撞规则 | `web/v2/office-renderer.js`、`docs/OFFICE-THEMES.md` |
| 新时间、天气或班次机制 | `web/v2/environment-runtime.js`、`web/v2/content/environments/` |

查看源码意味着退出受约束的 Creator 流程，进入正常的软件开发流程。Creator Agent 只能解释入口，不能自动获得修改这些机制的权限。

## 7. 生成与验收门

每轮自定义必须按以下顺序执行：

```text
用户输入
→ 能力分类
→ 映射计划与必要确认
→ 生成 Draft
→ Schema 校验
→ 内容引用校验
→ 导航、座位与碰撞校验
→ NPC 与 Life Activity 校验
→ Environment 校验
→ 本地预览
→ 用户确认
→ 保存 Custom Office
```

任何强制校验失败都不能进入下一步。Agent 可以自动修复仍处于能力边界内的问题；如果修复需要修改源码，则必须停止并按“无法映射”处理。

只有满足以下条件才能说“已经完成”：

- Draft 符合约定 Schema。
- 所有引用的内容能力真实存在。
- 必需工作语义、座位和主要路线仍然可用。
- NPC 班次、出生点与 Life Activity 目标有效。
- 预览可以正常加载，没有运行时配置错误。
- 用户明确确认保存。

## 8. 安全边界

- 模型输出只是候选数据，不能直接作为可信配置运行。
- Creator 只允许调用 Agent Office 提供的受限工具，不直接写官方 Preset。
- API Key 和 Provider 配置始终由 Coding Agent 管理。
- Custom Office 不得包含密钥、会话内容、真实代码或绝对文件路径。
- 外部天气等数据由宿主标准化后注入，内容配置不主动联网。
- 保存前保留上一有效版本，失败时回滚而不是留下半成品。

这份边界同时约束 Creator Skill、模型输出 Schema、校验器和未来的自定义工具实现。
