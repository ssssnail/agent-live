# Agent Live 基础组件库

> 状态：目标内容架构 · 2026-09-07

## 1. 核心定义

Agent Live 只维护一套基础组件全集，称为 **Component Library**。Official Preset 和 Custom Office 都不能私自定义另一套运行能力，只能从组件库中选择、实例化和覆盖允许的参数。

```text
Office Engine
固定绘制、移动、事件和校验能力
        ↓
Component Library
全部可复用的声明式组件
        ↓
Office Spec
一间办公室的完整组装结果
        ↓
├── Official Preset
└── Custom Office
```

“全集”表示所有可被组装器使用的能力都有唯一、可查询的登记，不表示页面启动时加载全部资源。Runtime 只加载当前 Office Spec 实际引用的组件，以保持本地性能。

## 2. 五个正式概念

| 概念 | 职责 | 是否可修改 |
| --- | --- | --- |
| Office Engine | 实现渲染、寻路、事件优先级和运行机制 | 只能修改源码 |
| Component Library | 登记所有可以安全组合的基础组件 | 由项目开发者维护 |
| Office Spec | 描述一间办公室最终使用哪些组件 | 由编译器生成并校验 |
| Official Preset | 官方命名、测试并发布的只读 Office Spec | 普通用户只能选择 |
| Custom Office | 用户通过 Creator 生成并保存在本地的 Office Spec | 用户可继续迭代 |

此外还有两个辅助概念：

- **Capability Catalog**：Component Library 面向 Agent 的机器可读索引，只公布真实实现并已通过校验的能力。
- **Draft**：尚未通过全部校验或尚未被用户确认的临时 Office Spec，只能预览，不能替换最后一个有效版本。

## 3. 基础组件的共同合同

每个组件只有一个职责和一个稳定 ID，并提供足够的信息让 Agent 选择、让编译器组装、让校验器拒绝非法组合：

```json
{
  "schemaVersion": 1,
  "kind": "prop",
  "id": "builtin/water-cooler",
  "name": "饮水机",
  "description": "供角色接水的落地设施",
  "version": "1.0.0",
  "contract": "single-office-v1",
  "tags": ["service", "water", "floor"],
  "capabilities": ["water"],
  "renderer": "water-cooler"
}
```

共同规则：

- `id` 在整个组件库中唯一，发布后保持稳定。
- `kind` 决定字段合同，不能用额外字段绕过 Runtime 能力。
- `description` 和 `tags` 面向 Creator Agent，不能只依赖文件名猜测用途。
- `capabilities` 必须对应 Engine 已实现的能力词汇。
- 组件只包含声明式数据，不包含任意 JavaScript、Shell、密钥或远程请求。
- Renderer 不存在、兼容条件不满足或必需引用缺失时，组件不可进入 Office Spec。

## 4. 组件全集的分类

### 4.1 Style

定义统一的美术语言：UI、Canvas、角色、状态和粒子色板。Style 不定义家具、坐标、NPC 和行为。

Creator v1 只能选择已登记 Style，并覆盖白名单中的少量语义参数；不直接开放全部底层颜色 token。

### 4.2 Layout（房间骨架）

定义单层办公室的固定空间骨架：墙体、通道、座位、工作目标、区域和可放置插槽。Layout 是内容作者的概念，不是 Creator 的可选项——一个 Office 自带它的房间。

Layout 必须提供：

- 384×216 的 `single-office-v1` 逻辑画布。
- 8 个可分配座位。
- `research/create/compute/plan/communicate/collaborate` 六种工作落点。
- 可达的入口、通道和 NPC 出生点。
- 具名 Zone，例如 `work-area`、`lounge`、`service-area`。
- 具名 Placement Slot，而不是让 Creator 生成任意坐标。

插槽示例：

```json
{
  "id": "lounge-decoration-1",
  "zone": "lounge",
  "accepts": ["plant", "dumbbell", "vending-machine"],
  "maxSize": { "width": 18, "height": 28 },
  "required": false
}
```

### 4.3 Prop Type

定义一种家具、设备或装饰物的尺寸、Renderer、能力标签和放置条件。Prop Type 不保存它在某间办公室里的坐标；Office Spec 只把它分配到 Layout 的合法插槽。

### 4.4 Agent Skin

定义真实 Agent 的角色画法、身份配色和 Engine 已支持的动作。它只能改变表现，不能创造不存在的 Agent 或状态。

### 4.5 NPC Template

定义可复用的非 Agent 角色，例如老板、保洁、前台、秘书和会务人员。模板包含默认身份、外观、允许活动和可覆盖字段；具体名称、班次和出生点由 Office Spec 实例化。

NPC Template 不包含真实 `agentId`、工具调用、Token 和任务状态。

### 4.6 Activity Recipe

定义 Runtime 已实现的办公室生活序列，例如接水、聊天、散步、玩手机、上厕所、巡检和资料流转。

Recipe 只能引用 Capability Catalog 中存在的参与者、Prop、Target、Pose、Particle 和 Step。真实 Work Event 始终拥有更高优先级。

### 4.7 Atmosphere

定义一种环境状态如何呈现，例如雨夜的色板、窗外粒子和环境声音。它回答“画成什么样”，不判断此刻是什么时间和天气。

### 4.8 Environment Policy

定义本地或固定时间、时间阶段、天气输入、自动照明和 NPC 班次。它回答“当前是什么状态”，不包含美术资源或空间坐标。

## 5. Engine 能力词汇

以下不是可以任意添加的内容组件，而是 Office Engine 已实现并由 Capability Catalog 公布的有限词汇：

| 能力 | 当前词汇 |
| --- | --- |
| Work Semantic | `research/create/compute/plan/communicate/collaborate` |
| Weather | `clear/cloudy/rain/snow` |
| Character Pose | `stand/sit/walk/type/reach/talk/phone` 中 Renderer 实际支持的子集 |
| Particle | `key/paper/check/bang/cross/spark` |
| Participant | `agent/npc`，可附加状态、角色和最少人数约束 |

只有代码已实现、共享校验器能验证、至少一个回归用例能覆盖的词汇，才可以出现在 Capability Catalog 中。文档示例不能单独构成可用能力。

## 6. Office Spec

Office Spec 是 Preset 与 Custom Office 共用的最终组装合同。目标形态如下：

```json
{
  "schemaVersion": 1,
  "id": "local/night-tech-office",
  "name": "雨夜 Tech 办公室",
  "layout": "builtin/tech-open-office",
  "style": "builtin/pixel-classic",
  "agentSkin": "builtin/tiny-developers",
  "placements": [
    { "component": "builtin/water-cooler", "slot": "lounge-service-1" },
    { "component": "builtin/dumbbell", "slot": "lounge-fitness-1" }
  ],
  "npcs": [
    {
      "template": "builtin/cleaner",
      "id": "cleaner-lin",
      "name": "林姨",
      "spawn": "service-entry",
      "shift": { "start": "20:00", "end": "06:00" }
    }
  ],
  "activities": ["builtin/get-water", "builtin/phone-break"],
  "atmosphere": "builtin/rainy-night",
  "environment": "builtin/local-office-environment"
}
```

这是当前 Office Seed/Spec 合同的概念示例。实际输入还必须带 `kind`，实例化物件必须带唯一 `id`；最终以 `src/content/schema.ts` 为准。Official Preset 和 Custom Office 已由同一个 Compiler 与 Validator 解析。

## 7. Preset Office 与自定义

运行 `/agent-live custom` 后，宿主 Agent 会根据描述选择最接近的 Preset Office 作为起点：

```text
Tech 开放式办公室
长形会议室
老式办公室
你的 Custom Office
```

- 选择一个 Preset Office：加载它的 Office Spec，再生成受限制的差异。
- 对 Preset Office 动第一笔改动，就会生成一个内容完整继承的 Custom Office：房间、摆放、NPC、活动和组件全都带过来。

一个 Office 自带它的房间，**房间不单独提供、也不支持就地更换**。想换房间就是选中那个 Preset Office 再编辑——和改任何其它东西的成本一样。Layout 因此只是内容作者的概念（见 [Preset 配置手册](PRESET-CONFIG.md)）。

## 8. 当前内置能力盘点

当前 Component Library 已经具备以下内容基础：

| 组件族 | 当前数量 | 备注 |
| --- | ---: | --- |
| Style | 2 | 经典像素、暖调工作室 |
| Layout | 5 | 其中 3 套为正式用户 Preset |
| Agent Skin | 2 | 共享程序化像素人物 |
| Prop Type | 32 | 唯一组件 ID、尺寸、renderer 与能力声明已集中登记 |
| NPC Template | 6 | 支持默认身份、性别、外观、班次与确定性随机 Profile |
| Life Activity | 14 | 17 个 Layout 实现共享统一 Activity Recipe |
| Atmosphere | 2 | 默认、雨夜 |
| Environment | 3 | 本地动态、静态兼容、固定雨夜 |

这些能力已经供三个 Official Office 和 Custom Office 共用。自由组合仍受 Layout 的 Zone、Placement Slot、NPC Spawn、活动实现和全局容量上限约束。

## 9. 当前实现状态

上述迁移已经完成：组件唯一 ID、NPC Template、Activity Recipe、Zone、Placement Slot、统一 Validator、Office Spec 编译、Official Office 重建、Draft 预览、撤销、保存和回滚均已进入主线。新增组件时应扩展 Library 与对应 Renderer/Runtime 能力；Creator 不会生成未登记组件或任意坐标。
