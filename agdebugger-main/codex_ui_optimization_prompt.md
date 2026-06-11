# Codex 指令：继续优化 AGDebugger 网页 UI 可视化

## 当前背景

AGDebugger 项目已经可以正常运行。local-agents 和 magentic-agents 两组测试都已经成功：

1. local-agents 输入数字 `0`，workflow 可以正常运行。
2. magentic-agents 输入：
   `Open https://example.com and tell me the main heading in one sentence.`
   workflow 可以正常调用 WebSurfer，并返回 `Example Domain`。

当前核心问题已经不再是后端收到 None。现在要做的是第二轮 UI 优化：让 AGDebugger 的网页可视化更符合人类习惯，更容易理解和操作。

请不要重构核心 workflow，不要破坏已经跑通的 `/api/workflow/messages`、message diagnostics、message queue、auto/manual step 等逻辑。请优先做小范围、可测试、可回滚的 UI 优化。

---

## 总体目标

优化 AGDebugger Web UI 的可读性和交互体验：

1. 每次发送新的 `START_TASK` 时，默认清除或隐藏上一个问题的历史。
2. UI 上不要直接展示超长 agent/session ID。
3. 右侧 “Agent 泳道与工作流时间线” 中的事件卡片可以点击，点击后跳转到中间对应的 Message History。
4. Timeline 和 Message History 默认使用更符合人类习惯的短名称和中文事件说明。
5. 保留开发者调试能力：原始完整 ID、raw message、payload、details 不要删除，可以放到 Details、tooltip 或开发者模式里。

---

## 需求 1：统一简化 agent 名称

请新增统一工具函数，例如：

`frontend/src/utils/display-name.ts`

功能：把机器化长名称转成人类可读短名称。

输入示例：

- `MagenticOneOrchestrator_3536746d-c862-4a0f-9cda-7f685d801f31/3536746d-c862-4a0f-9cda-7f685d801f31`
- `WebSurfer_3536746d-c862-4a0f-9cda-7f685d801f31`
- `LOCAL_AGENT_1_49334bc5-f401-4f75-b45e-8c656671d639`

输出示例：

- `总控 Agent`
- `网页浏览 Agent`
- `LOCAL_AGENT_1`

处理规则：

- 去掉 `/` 后面的 session id。
- 去掉末尾 UUID。
- 如果字符串中包含 UUID，默认隐藏。
- 常见名称映射：
  - `MagenticOneOrchestrator` → `总控 Agent`
  - `WebSurfer` → `网页浏览 Agent`
  - `RoundRobinGroupChatManager` → `轮询群聊管理器`
  - `Orchestrator` → `总控 Agent`
  - `User` → `用户`
- UI 默认显示短名称。
- 原始完整名称保留在 tooltip、title、Details 或开发者模式里。

请应用到：

- 顶部 agent 标签
- Message History 的 sender / receiver
- 右侧 Agent 泳道标题
- 右侧 timeline 事件卡片
- Message tooltip / details

---

## 需求 2：新 START_TASK 清空旧问题历史

用户希望每次问新问题时，旧问题的 Message History 和 timeline 不要继续混在当前问题里。

当用户在左侧工作流消息面板选择 `START_TASK` 并点击发送时：

1. 清空当前前端展示的 Message History。
2. 清空右侧 Agent 泳道与工作流时间线。
3. 清空或重置消息发送链路诊断面板。
4. 将当前任务视为新的 run/session。

推荐实现方式：

优先使用前端过滤方案，降低后端风险：

- 每次发送 `START_TASK` 时生成一个 `currentRunId` 或记录 `sessionStartedAt`。
- UI 只展示本次 START_TASK 之后产生的 messages、diagnostics、timeline events。
- 旧数据可以仍然留在后端，但默认不展示。
- 增加一个“显示全部历史 / 开发者模式”开关，用于调试完整历史。

注意：

- 只在 `START_TASK` 时清空或切换当前 session 视图。
- 不要在普通 `SEND_MESSAGE`、`RESET_AND_EDIT`、`RETRY_FROM_HERE` 时无脑清空历史。
- 不要影响 manual step / auto run 逻辑。

如果后端已有安全的 session reset/history reset 机制，可以复用；如果没有，不要强行大改后端。

---

## 需求 3：timeline 点击跳转 Message History

请为 Message History 中的每条消息生成稳定 DOM id，例如：

`message-history-item-${messageIndex}`

或者使用 timestamp / message id / session id 组合生成。

右侧 “Agent 泳道与工作流时间线” 中每个事件卡片需要保存它对应的 message index、timestamp 或 event id。

交互要求：

- 点击右侧 timeline 卡片时：
  1. 中间 Message History 自动滚动到对应消息。
  2. 对应消息卡片高亮 1.5 到 2 秒。
  3. 可选：自动展开 Details。
  4. 如果找不到对应消息，不要报错；可以 `console.warn` 并轻微提示。
- 使用：
  `scrollIntoView({ behavior: "smooth", block: "center" })`
- 高亮样式：
  - 边框变成蓝色或橙色
  - 背景轻微变亮
  - 2 秒后恢复
- timeline 卡片 hover：
  - `cursor: pointer`
  - hover background
  - title 显示“点击跳转到对应消息”

---

## 需求 4：timeline 事件名改成人类可读

当前右侧 timeline 显示很多机器事件名，例如：

- `GroupChatStart`
- `GroupChatMessage`
- `GroupChatAgentResponse`
- `GroupChatRequestPublish`
- `GroupChatTermination`
- `GroupChatError`
- `None`

请新增事件名映射函数，例如：

`frontend/src/utils/event-display.ts`

映射规则：

- `GroupChatStart` → `工作流开始`
- `GroupChatMessage` → `Agent 发言`
- `GroupChatAgentResponse` → `Agent 响应`
- `GroupChatRequestPublish` → `请求 Agent 执行`
- `GroupChatTermination` → `任务结束`
- `GroupChatError` → `执行错误`
- `None` → 默认隐藏，或显示为 `内部空响应`

要求：

- 普通 UI 默认显示中文可读标签。
- 原始 event type 放在 tooltip 或 Details。
- `None processed` 默认不要显眼展示，除非开发者模式打开。
- 错误事件保留红色。
- 成功处理事件保留绿色。
- 队列中事件保留黄色。
- 用户 edit 分支保留紫色。

---

## 需求 5：优化 Message History 可读性

Message History 顶部不要显示完整 UUID。

推荐展示形式：

- `用户 → 总控 Agent`
- `总控 Agent → Group`
- `网页浏览 Agent → Group`
- `LOCAL_AGENT_1 → Group`

消息右上角可以从：

- `Send - GroupChatStart`
- `Publish - GroupChatMessage`
- `Response - GroupChatAgentResponse`

优化为：

- `发送 - 工作流开始`
- `广播 - Agent 发言`
- `响应 - Agent 响应`

原始 type 保留在 Details 中。

---

## 需求 6：修复 `[object Object]`

当前 WebSurfer 消息里可能出现：

`Here is a screenshot of the page.,[object Object]`

这说明对象被前端直接字符串化了。

请修复展示逻辑：

- 如果消息内容里有对象，不要直接渲染成 `[object Object]`。
- 可选方案：
  1. 如果是截图或图片 metadata，显示 `[截图对象，点击 Details 查看]`
  2. 在 Details 中用 pretty JSON 展示对象
  3. 如果对象不可渲染，隐藏 raw object，并显示简短提示
- 普通用户视图中不要出现 `[object Object]`。

---

## 需求 7：保留并优化消息发送链路诊断

左侧“消息发送链路诊断”已经有价值，请保留。

显示项继续使用：

- `前端 payload 已生成`
- `payload 已发送`
- `后端 raw body 已收到`
- `后端 schema 校验通过`
- `已转换为 workflow message`
- `已加入 message queue`
- `workflow 已启动或 resume`
- `第一个 agent 已处理消息`

要求：

- 成功绿色
- 失败红色
- pending 灰色或黄色
- 点击每一项可以展开原始 detail
- 新 `START_TASK` 时清空并显示本轮诊断

---

## 建议优先修改文件

请先阅读组件结构，再做修改。重点检查：

- `frontend/src/App.tsx`
- `frontend/src/components/ConversationOverview.tsx`
- `frontend/src/components/MessageList.tsx`
- `frontend/src/components/MessageCard.tsx`
- `frontend/src/components/MessageDiagnostics.tsx`
- `frontend/src/components/viz/MessageHistoryChart.tsx`
- `frontend/src/components/viz/MessageTooltip.tsx`
- `frontend/src/shared-types.ts`
- `frontend/src/utils/default-messages.ts`
- `frontend/src/api.ts`

如确实需要后端支持，再检查：

- `src/agdebugger/app.py`
- `src/agdebugger/backend.py`
- `src/agdebugger/types.py`

不要盲目重写整个 UI。优先做小范围、可测试、可回滚的修改。

---

## 测试命令

前端构建：

```powershell
cd C:\Users\wangy\Downloads\agdebugger\agdebugger-main\frontend
npm run build
```

后端测试：

```powershell
cd C:\Users\wangy\Downloads\agdebugger\agdebugger-main
..\.venv\Scripts\python.exe -m pytest tests/test_workflow_contract.py
```

如有能力，再跑：

```powershell
..\.venv\Scripts\python.exe -m pytest
```

---

## 人工验收标准

修改完成后，我会这样验收：

1. 启动 local-agents，输入 `0`，workflow 能正常运行。
2. 启动 magentic-agents，输入：
   `Open https://example.com and tell me the main heading in one sentence.`
   workflow 能正常运行，并返回 `Example Domain`。
3. 第二次发送新 START_TASK 时，旧问题的 Message History 和右侧 timeline 默认清空或隐藏。
4. UI 中不再大面积显示 UUID 长 ID。
5. 右侧 timeline 点击某一条事件，中间 Message History 自动跳到对应消息。
6. 普通视图中不再直接出现 `[object Object]`。
7. Details / 开发者模式中仍能看到原始完整信息，方便调试。

---

## 优先级

请优先实现这三项：

1. 新 START_TASK 清空或隐藏旧历史。
2. 统一短名称显示，去掉长 UUID。
3. timeline 点击跳转到对应 Message History。

这三项完成后，再处理事件中文映射、`[object Object]`、诊断面板细节优化。
