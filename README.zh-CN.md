# Agent Live

[English](README.md) · [简体中文](README.zh-CN.md)

[![CI](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml/badge.svg)](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml)

**让你的 Coding Agent 拥有一间实时像素办公室。**

Agent Live 将 Agent 的工作过程变成一个有生活感的小型办公空间：Agent 会实时思考、使用工具、协作、休息并完成工作。

## 为什么做这个项目

Agent Live 是一个产品经理的 vibe coding 项目，也是一次亲手体验和思考未来人类如何理解 AI、与 AI 协作的尝试。

像素办公室是最简单的一种交互界面。还可以拓展成为工作的可视化日记、任务完成过程的纪录片、人类与 Agent / Agent 与 Agent 的社交空间，甚至一款游戏。这个项目只是对这些问题的一次抛砖引玉，而不是最终答案。项目还有很多不足，也欢迎大家提出想法、参与改进，一起探索和维护它。（说实话作为一个产品经理搞起来挺费劲的，愿意转交或你直接重写也行，通知我一下最好。可联系 makeitabetterplace4u Gmail）

## 工作方式

Agent Live 在本地运行。Adapter 将 Coding Agent 的事件转换成统一的办公室语言，再由公共引擎渲染画面：
```text
Coding Agent → Adapter → OfficeEvent → Agent Live → 像素办公室
```

目前官方内置支持 Pi、Codex 和 DeepSeek Harness，并内置三种办公室：`tech`、`meetingroom` 和 `oldschool`。

## 安装和使用

### Pi
```bash
pi install npm:@iniesta8888/agent-live-pi-adapter
```
重启 Pi，然后运行 `/agent-live`。[Pi 使用说明](docs/USING-PI.md)

### Codex

```bash
codex plugin marketplace add ssssnail/agent-live --ref v0.3.1
codex plugin add agent-live@agent-live-marketplace
```

调用 Agent Live Skill，即可打开本地办公室。[Codex 使用说明](docs/USING-CODEX.md)

### DeepSeek Harness

```bash
dsh plugin --profile web add @iniesta8888/agent-live-dsh-adapter
dsh plugin --profile web install
dsh web
```

打开一个会话，然后选择 `Agent Live` View。[DeepSeek Harness 使用说明](docs/USING-DSH.md)

## 选择或自定义办公室

Pi 和 DeepSeek Harness 支持以下命令：

```text
/agent-live list presets
/agent-live preset tech
/agent-live custom
/agent-live exit
```

进入 Creator Mode 后，直接用自然语言描述修改，例如：“把办公室改名为像素工作室，再增加两名同事。”Codex 也支持相同的自定义方式，但需要作为一次明确的 Agent Live Skill 请求执行。修改经过校验后会立即生效并保存在本机。

## 基于 Agent Live 开发

与宿主无关的 [`@iniesta8888/agent-live`](https://www.npmjs.com/package/@iniesta8888/agent-live) 包含公共引擎和 Adapter SDK。开发新的宿主 Adapter，可以从 [Adapter SDK](docs/ADAPTER-SDK.md) 开始，也可以把项目内置的 Adapter Builder Skill 交给自己的 Coding Agent。

项目文档：[架构设计](docs/ARCHITECTURE.md) · [开发者指南](docs/DEVELOPER.md) · [自定义能力](docs/CUSTOMIZATION.md)

## 本地优先

Agent Live 不需要云端后端。独立 Viewer 只监听 `127.0.0.1`；自定义办公室和轻量回放数据都保存在用户本机。Agent Live 会清理由自己创建的本地服务和临时资源。

## 灵感与许可

项目灵感来自 [ChatDev](https://github.com/OpenBMB/ChatDev)，基于 [MIT License](LICENSE) 开放。
