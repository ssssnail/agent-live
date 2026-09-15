# 在 DeepSeek Harness 中使用 Agent Live

> 以下是 DSH Adapter 发布到包仓库后的普通用户流程。

## 安装和启动

```bash
dsh plugin --profile web add @iniesta8888/agent-live-dsh
dsh plugin --profile web install
dsh web
```

打开一个 DSH 会话，顶部会出现 `Agent Live` View。切换到该 View 即可观看；对话、停止和审批仍在 DSH 原界面完成。

## 选择办公室

在 DSH 命令输入框中执行：

```text
/agent-live list presets
/agent-live preset tech
```

还可以选择 `meetingroom` 或 `oldschool`。

## 自定义

```text
/agent-live custom
```

进入 Creator Mode 后直接描述修改，例如：

```text
将 Agent 改名为主程序，Boss 改名为负责人，再增加两名同事，办公室名称改成协作空间。
```

完成后执行：

```text
/agent-live exit
```

修改会立即保存到本机并启用，不需要预览或确认，也不会改动官方 Preset。

## 清空本地数据

执行 `/agent-live reset` 查看风险提示，再执行 `/agent-live reset confirm` 确认。它会清空全部 Agent Live 本地数据并恢复内置 `tech` Office，不会卸载 DSH Adapter。
