# Live Agent Show 产品愿景

> 状态：已收敛方向 · 2026-09-07

相关分析：[Pi / Codex / Cursor 平台能力](./PLATFORM-CAPABILITIES.md) · [产品形态与用户入口](./PRODUCT-FORMS.md) · [Office 可配置内容模型](./OFFICE-THEMES.md) · [基础组件库](./COMPONENT-LIBRARY.md)

## 1. 产品定义

**Live Agent Show 把 AI Agent 的真实工作，实时呈现在一间有生命的办公室里。**

这里的 Show 不是舞台剧，也不是让用户创造任意世界；它表示“工作正在现场发生，并且看得见”。办公室是固定的产品世界观，读取文件、执行命令、编辑代码、任务委派、等待和完成，都有稳定的办公叙事。

当前只做 Demo 规格的单层办公室。用户可以替换美术风格、单层布局、Agent 外观、NPC、物件、办公室生活、环境视觉和公共运行环境，但不能改变真实工作语义和基础运行规则。

一句话可以表达为：

> Watch your AI agents work—live in their office.

## 2. 产品层级

| 层级 | 定义 | 当前对应 |
| --- | --- | --- |
| Agent Live | 产品品牌 | 整个产品 |
| Adapter | 从不同宿主读取其开放的 Agent 事实 | 已有 Pi、Codex、DSH；未来可继续接入 Cursor 等宿主 |
| OfficeEvent | 与宿主无关的真实工作事件 | Pi、Codex、DSH 官方事实的转换结果 |
| Office Engine | 将事件转成办公室位置、动作和状态 | 当前 `OfficeState`、映射与前端状态机 |
| Office Runtime | 单层办公室的渲染、移动、寻路、气泡和状态规则 | 当前 Demo 前端状态机 |
| Component Library | 八类基础组件的唯一全集与 Capability Catalog | 当前内容目录正在迁移为该结构 |
| Office Spec | 一间办公室最终引用和实例化的组件集合 | Official Preset 与 Custom Office 的共同合同 |
| Official Preset | 为普通用户准备的只读 Office Spec | 当前三个正式办公室 |
| Custom Office | Creator 多轮生成、校验并保存在本地的 Office Spec | 后续 Creator 纵向链路 |
| Episode | 一次可实时观看或回放的任务 | 一次 session / task |

无论接入哪个宿主，核心体验都保持一致：Agent 在办公室中工作。不同宿主只会因为开放能力不同而出现信息精度差异，不会变成不同产品。

## 3. 真实工作与开放的办公表现

产品固定 Agent 真实工作的语义，但不把每种工作写死到一件家具：

| 真实行为 | 固定语义 | 可选办公表现 |
| --- | --- | --- |
| 读取、搜索、分析 | `research` | 个人电脑、资料室、书架或档案柜 |
| 写入、编辑 | `create` | 个人工位、设计台或共享工作桌 |
| 命令、测试、运行 | `compute` | 个人电脑、服务器、机房或测试实验室 |
| 计划、任务拆解 | `plan` | 白板、项目室或会议屏幕 |
| 网络、提问、外部服务 | `communicate` | 电话间、前台、会议室或个人电脑 |
| 委派、交接、评审 | `collaborate` | 会议桌、站会区或休息区 |

Office 给设施标注能力，Office Engine 再为工作语义选择合适地点。因此办公室可以自由增加房间和设施；没有专用设施时，工作回退到个人工位。不能改变的是宿主事件的事实含义，而不是某张地图上的固定坐标。

## 4. 可组合的 Office 内容

当前固定为 Demo 的单层同屏办公室，不再定义 Company Scale。可替换内容拆成八个插槽：

- **Style**：像素、手绘等整体美术语言，覆盖角色、家具、气泡、侧栏、颜色和特效。
- **Layout**：同一单层办公室内的墙体、区域、家具坐标、功能锚点、座位和路径。
- **Agent Skin**：真实 Agent 的角色造型、职位、制服与身份外观。
- **NPC**：保安、清洁工、前台、访客、普通同事和宠物等办公室角色。
- **Props**：工位、服务器、白板、饮水机、沙发、游戏机、绿植等功能或装饰物件。
- **Life Activities**：喝水、休息、聊天、划水、娱乐，以及 NPC 的巡逻、打扫和接待等模拟日常。
- **Atmosphere**：白天、雨夜等状态的色板、窗外、粒子和声音表现。
- **Environment**：本地或固定时间、外部天气输入、自动照明和 NPC 班次。

Component Library 是上述内容的唯一全集。Office Spec 从中组装一间办公室；Official Preset 是给普通用户一键选择的只读 Office Spec，Custom Office 则由 Creator 基于某个 Official Preset 修改得到（第一笔改动即生成内容完整继承的副本）。两者使用同一个 Compiler 和 Validator。内容模块不改变：

- Agent 的真实状态与事件事实。
- Work Event 的真实事实和工作语义。
- 委派、等待、失败和完成代表的含义。

其中 Work Event 来自宿主，拥有最高优先级；Life Event 由本地办公室模拟生成，只在空闲时运行，可以随时被真实工作打断，也不能进入真实工作统计。

无论使用哪个 Preset，都保持单个场所、单层俯视、全办公室同屏，不增加园区、多楼层或视角下钻。

完整边界与组合关系见 [Office 可配置内容模型](./OFFICE-THEMES.md)。

## 5. 核心价值

视觉风格负责吸引和陪伴，真实工作信息负责留存。产品应帮助用户快速回答：

- 现在谁在做什么？
- 哪一路正在等待、失败或需要我介入？
- 多个 Agent 是否真的在并行？
- 任务进行到哪里，刚才发生了什么？
- 这次任务是否值得回放或分享？

主画面服务于“瞥一眼”，完整日志、Diff、用量和时间轴放在侧栏或回放中。不能为了画面好看制造没有真实发生的工作、协作或结论。

## 6. 建议路线图

### 阶段一：把当前办公室做扎实

- 完善 Pi 事件覆盖、多人委派、错误和等待状态。
- 将当前 Demo 明确为唯一的空间规格，不建设 Company Scale。
- 已将 Demo 拆为 Preset 与八类内容，并由 V2 原生 renderer 和 Environment Runtime 驱动。
- 将现有 `OfficeAction` 从具体家具逐步提升为 `research / create / compute / plan / communicate / collaborate` 等工作语义。
- 将项目整理成用户可一键安装的 Pi Package，并提供宿主内启动入口。

### 阶段二：先验证办公室生活的完整链路

- 加入一个饮水机 Prop、一个保洁 NPC，以及接水和巡检两类 Life Activities。
- 保证 Life Activity 只在空闲时触发，并能被新的 Work Event 立即打断。
- 保证 NPC 与模拟活动不会进入 Agent、工具、token 或任务统计。
- 用这条纵向切片验证内容模块不是只有配置文件，而是能共同驱动画面与行为。

### 阶段三：用第二套 Style 验证美术切换（已完成）

- 制作一套视觉差异明显、但布局和行为相同的 Style。
- 支持运行时选择 Style、预览和热切换。
- 验证更换资源和视觉配置不影响事件语义与状态机。
- 增加 Style 格式校验和资源缺失时的默认回退。

### 阶段四：增加布局与角色内容（进行中）

- 已增加 `old-school-office` 与 `boardroom-office` 两个单层 Layout，用设施能力标签承载相同 Work Semantics。
- 已增加前台、后勤、秘书和会务 NPC，以及文件流转、会议支持与茶水服务；保安、办公室猫和更多生活行为继续作为可选内容。
- 已用 Office Preset 将八类内容组合成顶部一键选项，并把时间、天气、照明和 NPC 班次收敛进共享 Environment。

### 阶段五：回放与更多宿主

- 保存标准 Show Event，支持时间轴、暂停、倍速和关键节点。
- 为 Codex、Cursor 等宿主按其公开能力提供 Connector。
- 在宿主能力不足时明确降级，而不是猜测或伪造状态。
- 提供独立 Viewer / WebView，统一查看实时任务和历史 Episode。

### 阶段六：有限开放内容创作

- 先让用户选择经过验证的 Office Preset，再逐步开放八类内容的替换与参数配置。
- 再提供模块与 Preset 的导入、导出、版本检查和分享。
- 只有真实需求出现后，再考虑可视化编辑器和内容市场。

## 7. 当前明确不做

- 不做任意世界生成器。
- 不让用户改写真实工作语义，但允许 Office 自由提供不同设施来承载它们。
- 不做故事规则编辑器、地图逻辑编辑器或脚本插件系统。
- 不把产品做成只有一个桌宠的小悬浮窗。
- 不为了展示原始推理而突破宿主能力和隐私边界。
- 不先建设庞大的创作者平台或主题市场。

## 8. 当前最重要的判断

Live Agent Show 的边界可以概括为：

> **一个开放而可信的办公世界：真实 Agent 工作驱动主线，独立 Office Life 让它在空闲时也持续生活。**

当前 Demo 的配置拆分、V2 原生渲染、Office Life、三套正式 Preset 与公共 Environment 已经完成。下一阶段聚焦真实宿主接入质量、开发者配置体验和发布流程，不扩张办公室世界边界。
