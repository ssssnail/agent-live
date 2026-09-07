# Demo Office 可替换内容定义

> 状态：当前产品边界 · 2026-09-07

## 核心决定

当前只有一种公司形态：**Demo 这种单层、固定俯视、全场所同屏的办公室**。默认 Style 是当前像素风，但美术表现仍可替换。

不再把 Big Company、Medium Company、Startup、OPC 作为产品选项，也不做园区、多楼层或视角下钻。办公室可以换布局和内容，但始终遵守同一套空间规则：单个场所、单层同屏、人物和工作行为清晰可见。

产品模型收敛为：

```text
固定的 Office Runtime + Work Semantics
                    ×
Style + Layout + Agent Skin + NPC + Props + Life Activities + Atmosphere
                    =
一个可直接使用的 Office Preset
```

## 1. 固定不变的部分

以下属于产品本身，内容包不能改写：

- 单层办公室、固定俯视镜头、整个场所同时可见。
- 宿主事件代表的真实事实，例如读取、编辑、执行、委派、等待、完成和失败。
- Work Event 的优先级；真实工作随时可以打断模拟的办公室生活。
- 移动、寻路、碰撞、气泡、状态灯、侧栏和事件回放的基础规则。
- NPC 不能冒充真实 Agent，Life Event 不能进入真实工作统计。

工作语义保持稳定，但可以由不同设施承载：

| Work Semantic | 真实含义 | 默认设施 |
| --- | --- | --- |
| `research` | 读取、搜索、分析 | 档案柜 / 电脑 |
| `create` | 写入、编辑 | 个人工位 |
| `compute` | 命令、测试、运行 | 服务器 / 电脑 |
| `plan` | 计划与任务拆解 | 白板 |
| `communicate` | Web、提问、外部通信 | 电话桌 / 电脑 |
| `collaborate` | 委派、交接、评审 | 会议桌 |
| `idle` | 没有真实任务 | 工位或 Life Activity |

## 2. 七个内部可替换插槽

这七项是开发和内容制作的边界，不是要求普通用户逐项设置。它们可以归成三组：

- **视觉表现**：Style、Agent Skin、Atmosphere。
- **空间内容**：Layout、Props、NPC。
- **生活行为**：Life Activities。

### 2.1 Style：整套美术风格

Style 只回答“所有东西怎么画”，不决定房间里有什么：

- 色板、线条、材质、光影和像素比例。
- Agent、NPC、家具与物件的统一绘制语言。
- 气泡、侧栏、按钮、字体、图标和状态特效。
- 动画节奏、粒子以及可选的界面音效。

第一版先保留当前像素风，再做第二套风格验证切换。Style 必须覆盖同一组标准对象；资源缺失时回退到默认像素资源。

### 2.2 Layout：单层办公室布局

Layout 决定同一个办公室场所如何安排：

- 墙体、门窗、通道、可行走区域和镜头边界。
- 开放工区、会议角、资料区、设备区、茶水区、休息区等区域。
- 工位、功能锚点、NPC 出生点和活动路线。
- Props 的实例、坐标、朝向和层级。

Layout 可以做成 Loft、游戏工作室、共享办公等不同办公室，但都必须是 Demo 规格的单层同屏场景。它不是新的“公司类型”。

### 2.3 Agent Skin：真实 Agent 外观

Agent Skin 决定真实 Agent 在办公室中的身份外观：

- 主 Agent 和子 Agent 的角色造型、服装、发型与配色。
- 名称、职位名、名牌和团队标识。
- 与 Style 兼容的待机、走路、工作、交接、成功和失败动作。

它只能改变表现，不能增加不存在的 Agent，也不能改变 Agent 的真实状态。

### 2.4 NPC：办公室角色

NPC 决定办公室中还有谁：

- 普通同事、前台、保安、保洁、快递员、维修人员和访客。
- 猫、狗、机器人等办公室伙伴。
- 每个 NPC 的身份、外观、值班时间、出生点和允许参与的 Life Activity。

NPC 是独立内容，可以逐个添加或移除；其行为由 Life Activities 驱动。

### 2.5 Props：家具、设备与装饰物

Props 是可独立放入 Layout 的对象：

- 工作设施：电脑桌、档案柜、服务器、白板、电话和会议桌。
- 生活设施：饮水机、咖啡机、冰箱、沙发、卫生间入口和娱乐设备。
- 装饰物：绿植、地毯、灯、海报、纸箱、垃圾桶和品牌标识。

具有功能的 Prop 要声明能力标签，例如 `research`、`compute`、`coffee` 或 `leisure`；纯装饰物不参与行为映射。

### 2.6 Life Activities：非 Agent 工作事件

Life Activity 决定角色空闲时会做什么：

- Agent 接水、喝咖啡、休息、聊天、划水、去卫生间或娱乐。
- NPC 巡逻、打扫、接待、送件或维修。
- 午休、访客到来、生日庆祝等低频公共事件。

每个活动声明参与者、需要的 Props、持续时间、冷却时间、概率和动画。所有 Life Activity 都可被新的 Work Event 打断，并明确标记为模拟事件。

### 2.7 Atmosphere：环境状态

Atmosphere 在不改变 Layout 的情况下切换：

- 白天、黄昏和深夜。
- 晴天、雨天、雪天和窗外景色。
- 节日装饰、环境光、背景音乐与环境音。

## 3. 边界判断

遇到新内容时按这张表归类：

| 用户想改变的内容 | 所属插槽 |
| --- | --- |
| 整体从像素风变成手绘风 | Style |
| 工位、会议桌和茶水区的位置 | Layout |
| 阿派穿什么、长什么样 | Agent Skin |
| 是否出现保安或办公室猫 | NPC |
| 是否摆放饮水机、沙发或游戏机 | Props |
| 空闲时去接水、聊天或巡逻 | Life Activities |
| 当前是雨夜还是白天 | Atmosphere |
| “执行命令”是否真的发生 | 不可替换，由 Work Event 决定 |
| “执行命令”去服务器还是电脑 | Layout 中 Props 的能力映射 |

关键区别是：**Style 是对象的画法，Layout 和 Props 决定场景里有什么，Life Activities 决定空闲时发生什么。**

## 4. Office Preset：用户实际选择的单位

普通用户不需要逐项配置七个插槽。一个 Preset 是经过验证的完整组合，也是产品界面默认暴露的选择单位：

```json
{
  "id": "pixel-office-night",
  "name": "像素办公室 · 雨夜",
  "style": "pixel-classic",
  "layout": "demo-office",
  "agentSkin": "tiny-developers",
  "npcs": ["cleaner", "office-cat"],
  "props": ["default-workstations", "coffee-corner", "lounge"],
  "lifeActivities": ["get-water", "coffee-break", "cleaning-round"],
  "atmosphere": "rainy-night"
}
```

第一版由官方提供兼容的 Preset。高级配置和创作者工具以后再允许单独替换插槽，暂不承诺任意模块之间都能自由组合。

## 5. 当前实现对应关系

当前已经有两条明确分开的实现路径：

- **原版基线**：`web/office.js`、`web/sprites.js`、`web/style.css` 和 `web/app.js`。只用于保留已验证的 Demo，不再承接新内容开发。
- **V2 内容入口**：`web/v2.html` 与 `web/v2/bootstrap.js`。Bootstrap 解析 Preset、加载并校验七类内容、应用 UI tokens，然后启动 Runtime。
- **V2 原生办公室渲染**：`web/v2/office-renderer.js` 从 Layout、Props 和 Style 配置生成地图、设施、导航与工作特效，不加载原版 `web/office.js`。
- **V2 原生角色渲染**：`web/v2/sprite-renderer.js` 从 Agent Skin 和 Style 配置生成角色与粒子，不加载原版 `web/sprites.js`。
- **共享固定 Runtime**：`web/app.js` 仍由原版和 V2 共用，负责 SSE、状态机、移动、气泡、交接、侧栏与动画循环。
- **工作事实层**：`src/protocol.ts`、`src/mapping.ts` 和 `src/state.ts` 负责 Work Event、工具映射和会话状态，不属于可替换内容。

七类内容已经按目录拆分到 `web/v2/content/`。当前有六个内置 Preset、两套 Style 和四套 Layout；饮水、保洁与支持人员的本地 Life Activity 已经跑通，真实 Work Event 仍可立即打断 Agent 的生活行为。

新增的两套空间组织已经进入正式 V2 入口：

- `old-school-office`：6 个固定格子间、独立经理室、正式会议室、档案 / 复印区、计算机房、前台和茶水间。档案读取、命令执行、规划、通信和委派都有独立落点。
- `boardroom-office`：一张长桌承载 8 个座位，主 Agent 固定在桌首；主屏、决策墙、AV 控制台、会议电话、资料车和茶水边柜承担其他工作语义。主 Agent 的真实说话气泡会直接出现在桌首，形成“老板讲话”的效果。

两套 Layout 都保持 `single-office-v1`：384×216、单层同屏、8 个可分配座位、连通导航和六种必需 Work Semantic。独立原型页仍作为设计参考保留，正式产品使用 `/v2.html?preset=...`。

## 6. 当前 Demo 的基准合同

配置化不能改变 Demo 已经验证过的基本体验。第一版以以下数据作为 `single-office-v1` 合同：

| 项目 | 当前基准 | 约束 |
| --- | --- | --- |
| 逻辑画布 | 384 × 216 | Layout 使用同一逻辑坐标系；当前像素 Style 显示时做整数倍缩放 |
| 镜头 | 单层固定俯视 | 整间办公室始终同屏，不允许平移、缩放或下钻 |
| 人数 | 1 个主 Agent + 最多 7 个子 Agent | 共用 8 个可分配座位 |
| 导航 | 3 条横向通道 + 4 条纵向连接 | 所有座位和功能锚点必须连通 |
| 必需工作能力 | `research/create/compute/plan/communicate/collaborate` | 缺少专用设施时回退到个人工位 |
| 当前功能点 | 档案柜、工位、服务器、白板、电话桌、会议桌 | 可以换外观或位置，不能让工作事件失去落点 |
| 当前生活设施 | 咖啡机 | 后续加入饮水、休息和娱乐设施 |

当前 `OfficeAction` 是面向具体家具的事件协议：`type/archive/server/whiteboard/phone/delegate/coffee`。其中前六项用于真实工作，`coffee` 是尚未接入工具映射的生活设施保留项。V2 目前仍接收这组事件以保持宿主协议稳定，但内容侧使用 Work Semantic 和能力标签；咖啡等行为归入 Life Activity，由 Runtime 决定当前 Layout 中实际去哪个 Prop。

## 7. 通用内容清单

每个可替换模块都有一个声明文件，并共享最小元数据：

```json
{
  "schemaVersion": 1,
  "kind": "style | layout | agent-skin | npc | prop | life-activity | atmosphere | preset",
  "id": "作者命名空间/稳定-id",
  "name": "用户可见名称",
  "version": "1.0.0",
  "engine": { "min": "0.2.0" }
}
```

约束：

- `id` 发布后不可改变；展示名称可以本地化。
- 内容引用只使用 `id`，不依赖目录名或用户可见名称。
- 第一版只加载声明式 JSON、图片、字体和音频，不允许内容包执行任意 JavaScript。
- 模块必须声明兼容的 Runtime 合同，第一版只有 `single-office-v1`。
- 内置默认资源永远存在；可选内容缺失时回退，必需能力缺失时拒绝加载并给出具体错误。

建议的目录不是用户功能，而是实现时的清晰边界：

```text
content/
  styles/
  layouts/
  agent-skins/
  npcs/
  props/
  life-activities/
  atmospheres/
  presets/
```

## 8. 各插槽的最小数据合同

### 8.1 Style

第一版 Style 只替换视觉 token，不替换布局几何或运行逻辑：

```json
{
  "kind": "style",
  "id": "builtin/pixel-classic",
  "contract": "office-2d-style-v1",
  "tokens": {
    "colors": {},
    "typography": {},
    "ui": {},
    "effects": {},
    "motion": {}
  }
}
```

`colors` 同时覆盖办公室、角色、状态和 UI；`motion` 只允许调整速度感、粒子数量和动画节奏，不能改变事件顺序。等 Style token 切换稳定以后，才考虑精灵图或完全不同的 renderer。

### 8.2 Layout

Layout 是一份单层空间数据：

```json
{
  "kind": "layout",
  "id": "builtin/demo-office",
  "contract": "single-office-v1",
  "canvas": { "width": 384, "height": 216 },
  "navigation": { "lanes": [], "connectors": [] },
  "seats": [],
  "stations": {},
  "propInstances": [],
  "npcSpawns": [],
  "camera": { "mode": "fixed", "fit": "contain" }
}
```

其中：

- `seats` 提供座位编号、人物锚点、朝向和最近通道。
- `stations` 把 Work Semantic 映射到带相应能力的 Prop anchor。
- `propInstances` 只记录类型、坐标、朝向和少量外观覆盖。
- `npcSpawns` 是出生点和路线入口，不等于自动启用某个 NPC。

Layout 校验必须确认：画布规格正确、座位不重叠、锚点位于可行走区域、所有必需能力可达、所有通道相互连通。

### 8.3 Prop Type 与 Prop Instance

家具定义和家具摆放必须分开：

```json
{
  "kind": "prop",
  "id": "builtin/server-rack",
  "size": { "width": 48, "height": 32 },
  "collision": [],
  "anchors": [{ "id": "operate", "x": 24, "y": 42, "dir": "up" }],
  "capabilities": ["compute"],
  "states": ["idle", "active", "success", "error"],
  "renderer": "server-rack"
}
```

```json
{
  "id": "server-main",
  "type": "builtin/server-rack",
  "x": 296,
  "y": 116,
  "dir": "down"
}
```

同一种服务器可以在多个 Layout 中重复摆放，也可以由 Style 改变画法。能力属于 Prop Type，坐标属于 Prop Instance。

### 8.4 Agent Skin

第一版继续使用当前程序化像素角色，只把参数抽离：

```json
{
  "kind": "agent-skin",
  "id": "builtin/tiny-developers",
  "contract": "pixel-character-v1",
  "palettes": {},
  "roles": {},
  "animations": ["idle", "walk", "sit", "type", "reach", "talk"]
}
```

运行时仍根据 Agent ID 稳定生成外观；role 可以覆盖服装与职位名称。Skin 必须提供 Runtime 所需的全部动作，不能用缺失动作改变某种工作是否可表现。

### 8.5 NPC

NPC 只定义身份和可参与活动，不直接编写工作逻辑：

```json
{
  "kind": "npc",
  "id": "builtin/cleaner",
  "role": "cleaner",
  "skin": "builtin/tiny-office-staff",
  "spawnTag": "service-entry",
  "schedule": "office-hours",
  "activities": ["builtin/cleaning-round", "builtin/coffee-break"]
}
```

NPC 没有宿主 `agentId`、token、工具调用和真实工作状态。侧栏和事件记录必须使用独立的 NPC 标识。

### 8.6 Life Activity

第一版 Life Activity 是有限的声明式动作序列，不开放脚本：

```json
{
  "kind": "life-activity",
  "id": "builtin/get-water",
  "participants": { "kinds": ["agent", "npc"], "min": 1, "max": 1 },
  "requires": ["water"],
  "timing": { "durationMs": 9000, "cooldownMs": 120000, "weight": 1 },
  "interruptible": true,
  "steps": [
    { "type": "go-to", "capability": "water" },
    { "type": "pose", "name": "reach", "durationMs": 1800 },
    { "type": "bubble", "text": "接杯水" },
    { "type": "return" }
  ]
}
```

允许的 step 由 Runtime 白名单提供，例如 `go-to`、`pose`、`wait`、`bubble`、`effect` 和 `return`。新的 Work Event 到达时，Runtime 终止生活动作、清除模拟气泡，并重新按真实工作定位角色。

### 8.7 Atmosphere

Atmosphere 只提供环境覆盖：

```json
{
  "kind": "atmosphere",
  "id": "builtin/rainy-night",
  "styleOverrides": {},
  "windowScene": "rain-night",
  "ambientEffects": ["rain"],
  "audio": { "loop": "rain-room.ogg", "volume": 0.25 }
}
```

它可以改变窗外、环境色、装饰层和声音，但不能增加碰撞、移动锚点、角色或工作事件。

## 9. Runtime 的事件优先级

同一个角色同一时间只能由一类事件控制。优先级固定为：

```text
Work Event > 工作后的归位动作 > Life Activity > Ambient Idle
```

- **Work Event**：来自宿主，包含思考、工具调用、委派、等待、完成和失败，拥有最高优先级。
- **归位动作**：一次真实工作结束后，角色走回工位或下一个真实工作地点。
- **Life Activity**：本地模拟的接水、聊天、休息等，只能占用明确空闲的角色。
- **Ambient Idle**：原地呼吸、看屏幕、窗外光点等不需要调度的环境动画。

Agent 参与 Life Activity 必须同时满足：

- 状态为 `idle`，没有正在执行的工具、委派交接或离场动作。
- 最近一段安静时间内没有新的 Work Event；默认可从 8–15 秒之间随机触发。
- 活动需要的设施存在且可达，没有被其他活动独占。
- 当前参与人数、冷却时间和出现概率满足要求。

NPC 不需要等待 Agent 会话空闲，可以独立巡逻或打扫，但必须避开正在进行的工作交接和主要通道。新的 Work Event 到来时：

1. 立即取消该 Agent 尚未完成的 Life Activity。
2. 释放设施占用，清理模拟气泡和模拟特效。
3. 从当前位置重新寻路到真实工作锚点，不要求先返回工位。
4. 仅在 Office Life 日志中记录“活动被工作打断”，不写入真实任务统计。

`waiting` 不等于 `idle`。等待用户回答、等待子 Agent 或等待外部工具时，角色仍处于真实任务上下文，第一版不参加 Life Activity，只显示对应的等待表现。

## 10. Preset 的解析与兼容

Preset 是唯一面向普通用户的入口。加载顺序固定为：

1. 加载内置默认内容，建立完整可运行办公室。
2. 应用 Preset 指向的 Style 和 Atmosphere。
3. 加载 Layout，并解析其中的 Prop Type 与 Prop Instance。
4. 加载 Agent Skin 和启用的 NPC。
5. 只启用当前设施和参与者条件都满足的 Life Activities。
6. 校验导航与必需工作能力，成功后一次性切换；失败则继续使用上一个有效 Preset。

兼容原则：

| 情况 | 行为 |
| --- | --- |
| Style 缺少可选颜色或效果 | 使用内置 token |
| 可选 Prop 或 NPC 不存在 | 跳过并给出警告 |
| Life Activity 缺少所需设施 | 不启用该活动 |
| 专用工作设施缺失 | 优先回退到个人工位 |
| Layout 不连通或没有可用工位 | Preset 加载失败 |
| schema 或 Runtime 合同不兼容 | Preset 加载失败，不尝试猜测 |

Preset 切换只改变表现内容，不能清空当前会话或改写 Agent 状态。若工作正在进行，第一版可以等本轮结束后切换，避免角色在动作中途跳位。

## 11. 第一版真正要实现的范围

“定义为可替换”不等于第一版全部开放给用户。实施顺序收敛为：

| 里程碑 | 做什么 | 状态 | 用户是否看见选择器 |
| --- | --- | --- | --- |
| M0 | 把当前 Demo 原样整理成一个内置 Preset | 已完成 | 是，作为原版基准选项 |
| M1 | 抽 Style tokens、Prop registry、Layout、Agent Skin，并切换到 V2 原生渲染器 | 已完成 | 否，验证重构不改变体验 |
| M2 | 加入饮水机、保洁 NPC 与可中断的接水 / 巡检 Life Activities | 已完成 | 是，由完整 Preset 启用 |
| M3 | 制作第二套 Style，支持多个官方 Preset | 已完成 | 是，只选择完整 Preset |
| M4 | 增加老派企业办公室与大会议室长桌办公 Layout、专属 NPC 和 Life Activities | 已完成 | 是，仍以 Preset 为主 |
| Later | 导入内容包、单独替换插槽和创作者工具 | 未规划 | 有真实需求后再决定 |

M0/M1 已完成的验收：

- `/office demo` 的事件顺序、角色移动、工具落点和交接动画与当前版本一致。
- V2 房间、角色和粒子的 15 个逐像素回归用例均无差异。
- 内置 Preset 与七类内容通过 schema、引用、座位和必需工作能力校验。
- V2 原生 renderer 不加载原版 `office.js` / `sprites.js`，原版文件保持冻结。

M2–M4 新增的验收门：

- Layout 中新增的生活设施可达，NPC 路线不会破坏 1–8 名 Agent 的座位与工作落点。
- Work Event 可以立即打断 Life Activity，且不会把模拟行为写入 token、工具和任务统计。
- 内容错误有明确提示，前端不会因某张图片或某个可选 NPC 缺失而白屏。

当前迁移入口：

- 原版：`/?demo=1`，继续由 `web/office.js`、`web/sprites.js`、`web/app.js` 驱动，不在迁移中修改。
- 新版：`/v2.html?demo=1&preset=<id>`，加载 URL 指定的 Preset（缺省为 `builtin/demo-office`），再由 `web/v2/office-renderer.js` 与 `web/v2/sprite-renderer.js` 原生渲染；只与原版共用固定的 `web/app.js` Runtime。
- 回归：`/v2/parity.html` 对原版和 V2 的房间、角色与粒子做逐像素比较，当前 15 个用例均为 0 channel differences。
- 后续只在新版内容和 Runtime 上开发；原版作为视觉与行为回归基线保留。

## 12. 当前不做

- 不做 Company Scale，也不提供 Big / Medium / Startup / OPC 选择。
- 不做园区、多建筑、多楼层、房间下钻或自由镜头。
- 不开放故事规则、工作语义、地图脚本或任意世界编辑。
- 不立即建设可视化编辑器、内容市场或任意模块组合系统。
- `web/big-company.*` 只保留为一次视觉探索，不属于当前产品路线。
