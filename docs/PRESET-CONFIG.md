# Office Preset 配置手册

> 面向直接修改本地内容的开发者 · 2026-09-07

## 1. 配置在哪里

所有内容都在 `web/v2/content/`，不依赖后端服务：

```text
web/v2/content/
├── catalog.json                 # 顶部选择器中显示哪些 Preset
├── presets/                     # Preset：只负责组合其他模块
├── styles/                      # 整体美术风格与 UI / Canvas tokens
├── layouts/                     # 房间、座位、通道、物件实例和行为目标点
├── agent-skins/                 # 真实 Agent 的外观和职位配色
├── props/                       # 可用物件类型及能力
├── npcs/                        # NPC 身份、外观和出生点
├── life-activities/             # Agent / NPC 的本地生活行为
├── atmospheres/                 # 环境的视觉覆盖、特效和声音
└── environments/                # 时钟、天气输入、灯光和 NPC 班次
```

修改配置后刷新页面即可生效。开发服务不会缓存这些 JSON。

## 2. 最安全的新建方式

不要直接覆盖 `demo-office`。它是原版的逐像素回归基准。

新建一个 Preset 时：

1. 复制最接近的现有模块，只修改真正需要变化的部分。
2. 在 `presets/` 新建组合文件，例如 `my-office.json`。
3. 在 `catalog.json` 登记它，让顶部选择器可以看到。
4. 执行 `npm run validate:content`。
5. 打开 `/v2.html?demo=1&preset=my-office` 预览。

默认端口是 7788；被占用时会自动顺延，以终端实际输出为准。

## 3. 当前 Preset 组合

| 文件名 / URL 参数 | Style | Layout | Agent Skin | NPC | Life | Atmosphere | Environment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tech-open-office` | `pixel-classic` | `tech-open-office` | `tiny-developers` | `tech-office-staff` | `tech-office-routines` | `default` | `local-office` |
| `boardroom-office` | `pixel-classic` | `boardroom-office` | `tiny-developers` | `boardroom-staff` | `boardroom-routines` | `default` | `local-office` |
| `old-school-office` | `warm-studio` | `old-school-office` | `studio-team` | `old-school-staff` | `old-school-routines` | `default` | `local-office` |
| `refined-demo` | `pixel-classic` | `demo-office` | `tiny-developers` | `none` | `none` | `default` | `static-office` |
| `demo-office` | `pixel-classic` | `demo-office` | `tiny-developers` | `none` | `none` | `default` | `static-office` |
| `lively-office` | `pixel-classic` | `lively-office` | `tiny-developers` | `office-staff` | `office-basics` | `default` | `static-office` |
| `night-shift` | `pixel-classic` | `lively-office` | `tiny-developers` | `office-staff` | `office-basics` | `rainy-night` | `rainy-night` |
| `cozy-studio` | `warm-studio` | `lively-office` | `studio-team` | `office-staff` | `office-basics` | `default` | `static-office` |

前三项是顶部选择器中的正式 Preset，其余五项只用于历史原型与回归验证。

这些组合说明了两种常用方式：

- Atmosphere 控制雨夜的视觉覆盖，Environment 控制固定 22:00、降雨输入和 NPC 班次。
- 同时换 Style 和 Agent Skin：`lively-office` → `cozy-studio`。
- 换掉整个空间组织：`old-school-office` 使用格子间、经理室、档案 / 复印区与机房；`boardroom-office` 把一张长会议桌变成全部 Agent 的固定工作现场。

## 4. Preset：组合入口

文件位置：`web/v2/content/presets/<文件名>.json`

```json
{
  "schemaVersion": 1,
  "kind": "preset",
  "id": "builtin/my-office",
  "name": "我的办公室",
  "version": "1.0.0",
  "engine": { "min": "0.2.0" },
  "contract": "single-office-v1",
  "content": {
    "style": "pixel-classic",
    "layout": "lively-office",
    "agentSkin": "tiny-developers",
    "props": "default-office",
    "npcs": "office-staff",
    "lifeActivities": "office-basics",
    "atmosphere": "default",
    "environment": "local-office"
  }
}
```

`content` 中填写的是对应 JSON 的**文件名，不带 `.json`**。文件内部的 `id` 是稳定内容 ID，两者含义不同。

把新 Preset 加到 `catalog.json`：

```json
{
  "id": "my-office",
  "name": "我的办公室"
}
```

`catalog.json` 的顺序就是顶部选择器的显示顺序。

## 5. Style：整体美术风格

文件位置：`web/v2/content/styles/`

Style 当前分为四组 token：

```json
{
  "tokens": {
    "css": {},
    "canvas": {},
    "character": {
      "pips": {},
      "particles": {}
    },
    "motion": {}
  }
}
```

- `css`：页面背景、侧栏、边框、文字、强调色和状态色。
- `canvas`：地板、墙面、家具、屏幕、植物、饮水机等场景颜色。
- `character`：人物基础颜色、状态灯和粒子颜色。
- `motion`：预留的移动与气泡节奏配置。

当前 Style 不支持 `extends`。新建 Style 时应复制完整的 `pixel-classic.json` 或 `warm-studio.json` 再改颜色，避免遗漏 renderer 使用的 token。

Style 只改变“怎么画”，不要在这里放座位、坐标、NPC 或行为规则。

## 6. Layout：办公室空间

文件位置：`web/v2/content/layouts/`

第一版必须遵守 `single-office-v1`：

- 逻辑画布固定为 384×216。
- 固定单层俯视、全办公室同屏。
- 保留 8 个可分配座位。
- 所有目标点必须能通过横向通道和纵向连接到达。
- 必须提供 `research/create/compute/plan/communicate/collaborate` 六种工作能力。

核心结构：

```json
{
  "navigation": {
    "lanes": [46, 100, 162],
    "connectors": [76, 140, 204, 276]
  },
  "seats": [],
  "targets": {
    "water": { "x": 338, "y": 190, "dir": "right", "lane": 2 }
  },
  "stations": {
    "research": { "kind": "target", "target": "archive" },
    "create": { "kind": "seat" }
  },
  "propInstances": [
    { "id": "water-main", "type": "water-cooler", "x": 346, "y": 172 }
  ]
}
```

注意：

- `lane` 是 `navigation.lanes` 的数组下标，不是实际 y 坐标。
- `targets` 是角色站立的位置，不是家具左上角坐标。
- `dir` 可用 `up/down/left/right`，表示到达后的朝向。
- `propInstances[].type` 必须存在于当前 Props registry。
- `propInstances[].id` 在同一个 Layout 内必须唯一。
- 新增 NPC 时，其 `spawn` 也必须是这里已有的 target。
- Life Activity 的每一个 step 同样只能引用这里已有的 target。
- `seats[].renderer` 可选；省略时是标准 `workstation`。内置扩展布局还使用 `cubicle-workstation`、`executive-seat` 和 `boardroom-seat`，让座位能够面向不同方向并贴合对应家具。

当前内置 Layout：

| Layout | 空间结构 | 座位组织 | 主要工作映射 |
| --- | --- | --- | --- |
| `demo-office` | 原版单层办公室 | 两排独立工位 | 档案柜、服务器、白板、电话桌、会议桌 |
| `lively-office` | 原版空间的生活化版本 | 两排独立工位 | 增加饮水、保洁与会议区生活目标点 |
| `old-school-office` | 格子间 + 经理室 + 正式会议室 + 后勤区 | 6 个格子间、1 个经理席、1 个会议席 | 档案 / 复印、机房、会议白板、前台电话 |
| `boardroom-office` | 一间大会议室 | 8 个两侧席，老板 NPC 在桌首 | Agent 坐席工作、老板统一指挥、会务沿桌外服务 |

## 7. Props：物件类型

文件位置：`web/v2/content/props/`

```json
{
  "types": {
    "water-cooler": {
      "size": { "width": 16, "height": 26 },
      "capabilities": ["water"],
      "renderer": "water-cooler"
    }
  }
}
```

- `size`：默认绘制尺寸。
- `capabilities`：该物件能承载的行为，例如 `research`、`compute`、`water`。
- `renderer`：`office-renderer.js` 中已有的绘制类型。

只增加同类型物件实例时，修改 Layout 即可。增加全新的 `renderer` 名称时，还必须在 `web/v2/office-renderer.js` 实现一次画法。

当前已有 renderer：

```text
rug, door, window, workstation, whiteboard, phone-table,
archive-cabinet, server-rack, coffee-machine, water-cooler,
meeting-table, plant, venetian-window, cubicle-cell,
executive-desk, copy-station, reception-desk, presentation-screen,
boardroom-table, av-console, sideboard, vending-machine,
office-clock, service-cart,
notice-board, wall-calendar, coat-rack, floor-fan,
lounge-sofa, dumbbell, restroom-door, boss-desk
```

`default-office.json` 只包含原版物件；`extended-office.json` 在保留这些物件的同时加入格子间、老派后勤设施和长桌会议室所需的 renderer。新布局若引用这些扩展物件，Preset 的 `props` 必须选择 `extended-office`。

## 8. Agent Skin：真实 Agent 外观

文件位置：`web/v2/content/agent-skins/`

```json
{
  "animations": ["idle", "walk", "sit", "type", "reach", "talk"],
  "palettes": {
    "skin": ["#f0cba3"],
    "hair": ["#2f2418"],
    "fallbackShirts": ["#4a78c8"],
    "defaultTrim": "#2b3242",
    "leadBadge": "#ffcc4d",
    "agentBadge": "#8fb8ff"
  },
  "roles": {
    "planner": {
      "title": "规划师",
      "shirt": "#4a78c8",
      "trim": "#33569a"
    }
  }
}
```

`roles` 的 key 按宿主传入的 Agent 名称小写匹配。没有匹配项时使用 `fallbackShirts` 稳定生成外观。

当前 renderer 是程序化像素人物。只改颜色和职位不需要改代码；要换成人物图片或增加新的骨骼/帧动画，需要扩展 `sprite-renderer.js`。

## 9. NPC：办公室角色

文件位置：`web/v2/content/npcs/`

```json
{
  "entries": [
    {
      "id": "cleaner-lin",
      "name": "林姨",
      "role": "cleaner",
      "title": "保洁",
      "spawn": "cleaner-entry",
      "appearance": {
        "skin": "#d69f70",
        "hair": "#30333b",
        "shirt": "#4f9d88",
        "trim": "#347264",
        "badge": "#b7eadb"
      }
    }
  ]
}
```

- `id` 必须唯一。
- `spawn` 引用 Layout target。
- `role` 用于匹配 Life Activity 的参与者。
- `appearance` 可直接覆盖程序化人物的 palette。
- `shift` 可覆盖 Environment 中按角色或全局定义的班次，例如 `{ "start": "20:00", "end": "08:00" }`。

NPC 只存在于本地办公室，不会进入真实 Agent、工具、任务、Token 或成本统计。

## 10. Life Activities：办公室生活

文件位置：`web/v2/content/life-activities/`

Agent 接水示例：

```json
{
  "id": "get-water",
  "name": "接水",
  "participant": { "kind": "agent", "states": ["idle"] },
  "requires": ["water-main"],
  "onlyWhenSessionIdle": true,
  "interruptible": true,
  "startBubble": "去接杯水",
  "initialDelayMs": [4500, 7500],
  "cooldownMs": [22000, 36000],
  "steps": [
    {
      "target": "water",
      "durationMs": 3200,
      "pose": "stand",
      "bubble": "接杯水，歇一下",
      "hot": "water"
    }
  ]
}
```

NPC 多步骤巡检示例：

```json
{
  "participant": { "kind": "npc", "roles": ["cleaner"] },
  "steps": [
    { "target": "clean-north", "durationMs": 2300, "pose": "reach", "bubble": "擦擦桌面", "particle": "spark" },
    { "target": "clean-south", "durationMs": 2600, "pose": "reach", "bubble": "这边也收拾一下", "particle": "spark" }
  ]
}
```

字段说明：

- `participant.kind`：`agent` 或 `npc`。
- `states`：允许参与的真实 Agent 状态；生活行为建议只使用 `idle`。
- `roles`：允许参与的 NPC role。
- `requires`：Layout 中必须存在的 Prop Instance ID。
- `onlyWhenSessionIdle`：整个真实会话空闲时才允许开始。
- `interruptible`：是否允许工作事件打断；Agent Life 必须设置为 `true`。
- `initialDelayMs` / `cooldownMs`：可以是固定数字，也可以是 `[最小值, 最大值]`。
- `steps`：按顺序执行的目标点与停留动作。
- `pose`：当前支持 `stand/reach/talk/sit/type`。
- `hot`：让对应设施进入工作动画状态，例如饮水机使用 `water`。
- `particle`：当前可使用 `key/paper/spark/check/cross/bang`。

Life Activity 只产生画面行为和绿色生活气泡，不写入动态日志，也不改变真实 Token、成本或工具统计。新的 Work Event 会优先抢占 Agent 的生活行为。

## 11. Environment：公共运行环境

文件位置：`web/v2/content/environments/`

Environment 统一管理所有 Preset 都会用到的运行规则：

- `clock.mode`：`local` 使用用户本地时间，`fixed` 使用 `fixedTime`。
- `clock.phases`：定义上午、中午、傍晚和夜晚的边界。
- `clock.preview`：演示模式是否压缩播放一天。
- `weather`：天气来源、默认条件和允许值。
- `lighting`：哪些时间阶段开启室内灯光。
- `npcSchedule`：NPC 默认班次、按角色覆盖和上下班气泡。

正式三个 Preset 共用 `local-office.json`，所以修改一次即可统一调整时间、天气和 06:00–18:00 的 NPC 作息。优先级为：单个 NPC `shift` > `roleOverrides` > `defaultShift`。

外部天气由宿主传入，核心不会自行联网：

```text
/v2.html?preset=tech-open-office&weather=rain&time=19:00
```

```js
window.OfficeEnvironment.update({ weather: "snow" });
window.dispatchEvent(new CustomEvent("agent-office:environment", {
  detail: { weather: "cloudy" }
}));
```

支持 `clear/cloudy/rain/snow`。详细接入方式见 [开发者接入指南](DEVELOPER.md)。

## 12. Atmosphere：环境视觉

文件位置：`web/v2/content/atmospheres/`

```json
{
  "styleOverrides": {
    "css": {
      "bg": "#070a12",
      "panel": "#101724"
    },
    "canvas": {
      "floorA": "#202c3a",
      "glass": "#254867",
      "rain": "#8bc8f2"
    },
    "character": {}
  },
  "windowScene": "rainy-night",
  "ambientEffects": ["rain-window"],
  "audio": null
}
```

Atmosphere 是对 Style 的局部覆盖，所以不需要复制完整 token。它回答“雨夜画成什么颜色”，Environment 回答“现在是不是雨夜”。当前窗口天气已支持晴、阴、雨、雪；新的视觉表现仍需先在 renderer 中实现。

## 13. 哪些只改配置，哪些需要代码

| 修改内容 | 只改 JSON | 需要扩展代码 |
| --- | --- | --- |
| 调整颜色、职位配色和状态色 | 是 | 否 |
| 移动物件、目标点、NPC 出生点 | 是 | 否 |
| 添加已有类型的家具 | 是 | 否 |
| 添加使用现有人物画法的 NPC | 是 | 否 |
| 组合已有模块成为新 Preset | 是 | 否 |
| 修改时间阶段、天气输入、灯光和 NPC 班次 | 是 | 否 |
| 编排已有 pose / particle 的生活行为 | 是 | 否 |
| 新家具画法 | 声明部分 | `office-renderer.js` |
| 新人物动画或图片角色 | 声明部分 | `sprite-renderer.js` |
| 新 Life step 类型或交互机制 | 声明部分 | `app.js` Runtime |
| 新天气特效或声音系统 | 声明部分 | renderer / Runtime |
| 新真实工作语义 | 否 | protocol、mapping、Runtime 与内容共同修改 |

判断标准：**配置负责组合和参数，renderer / Runtime 负责系统尚未具备的能力。**

## 14. 校验与预览

修改完先运行：

```bash
npm run validate:content
npm run validate:environment
npm run check
```

校验会检查：

- Catalog 是否包含所有 Preset。
- 八类引用文件是否存在，manifest 是否正确。
- Layout 是否满足 `single-office-v1`。
- 座位、工作能力、Target 和 Prop 引用是否有效。
- NPC 的出生点是否存在。
- Life Activity 所需物件和步骤目标是否存在。
- Environment 的时间模式、天气条件和默认 NPC 班次是否完整。
- `demo-office` 是否仍保持无 NPC、无 Life Activity 的基准合同。

启动预览：

```bash
npm run preview
```

浏览器地址：

```text
http://localhost:7788/v2.html?demo=1&preset=my-office
```

原版像素回归页：

```text
http://localhost:7788/v2/parity.html
```

只有 `PASS 15 pixel parity cases` 时，才说明 `demo-office` 的原版画面没有被新配置影响。
