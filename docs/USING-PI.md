# 在 Pi 中使用 Agent Live

> 以下是 Agent Live 仓库公开并完成发布后的普通用户流程。

## 安装和启动

发布到 npm 后，推荐一条命令安装：

```bash
pi install npm:@iniesta8888/agent-live-pi
```

重启 Pi，然后输入：

```text
/agent-live
```

浏览器会打开本地像素办公室。此后继续在 Pi 中工作即可。

## 选择办公室

```text
/agent-live list presets
/agent-live preset tech
```

还可以选择 `meetingroom` 或 `oldschool`。

## 自定义

先进入 Creator Mode：

```text
/agent-live custom
```

然后直接描述修改，例如：

```text
把 Agent 改名为主程序，办公室名称改成像素工作室，再增加两名同事。
```

完成后退出：

```text
/agent-live exit
```

修改会保存为本机 Custom Office，不会改动官方 Preset。关闭本地服务可使用 `/agent-live close`。

## 清空本地数据

```text
/agent-live reset
```

该命令只显示提示。确认删除全部 Custom Office、当前选择及其他 Agent Live 本地数据时，再执行 `/agent-live reset confirm`。插件和内置 Preset 不会删除，完成后自动恢复 `tech` Office，仍可继续使用。
