# 在 Codex 中使用 Agent Live

> 以下是 Agent Live Marketplace 公开后的普通用户流程。

## 安装和启动

```bash
codex plugin marketplace add ssssnail/agent-live --ref main
codex plugin add agent-live@agent-live-marketplace
```

在 Codex 中调用 Agent Live Skill。它会返回并打开一个本地办公室地址；任务需要在该页面的输入框中发起。

## 自定义

Codex 当前采用单轮显式自定义：调用 Skill 时把修改要求写在同一句中，例如：

```text
/agent-live custom：将 Boss 改名为负责人，办公室名称改成创意工作间，并去掉 slogan。
```

修改成功后会立即保存并启用，不需要预览或确认。Custom Office 只保存在本机，不会改动官方 Preset。

Codex 当前没有持续 Creator Mode；下一次修改时再次调用 Agent Live Skill 并描述要求即可。关闭办公室网页后，本次本地服务会自动退出。
