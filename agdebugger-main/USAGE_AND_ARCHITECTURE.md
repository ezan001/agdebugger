# AGDebugger 修改版使用说明与架构说明

本文档面向已经完成部署、但还不熟悉 AGDebugger 的使用者。它不是部署文档，而是说明当前修改版 UI 如何使用、页面各区域代表什么、AGDebugger 与实际 agent team 的关系是什么，以及为什么某些输入会报错。

如需从零安装环境，请先看同目录下的 `DEPLOYMENT.md`。

## 1. AGDebugger 的定位

AGDebugger 不是直接解题的模型，也不是一个固定的 agent 系统。它是一个多 agent workflow 调试器。

它的核心作用是把 AutoGen AgentChat team 的运行过程可视化，方便观察和干预：

- 用户任务如何进入 workflow
- 消息如何进入后端 queue
- 哪些 agent 收到消息、发送响应
- runtime trace 中有哪些内部事件
- 当前 run 是否混入旧历史
- WebSurfer 或其他 agent 是否报错
- reset、edit、revert、retry 是否真的影响后续 workflow
- timeline 中不同 agent 的事件顺序
- diagnostics 中 payload 生成、发送、校验、入队、启动是否成功

因此，AGDebugger 本身负责“调试和展示”，真正执行任务的是启动时传入的 `scenario.py` 中创建的 agent team。

## 2. 当前 agent 关系

当前仓库中有两个主要示例。

### local-agents

文件：`examples/local-agents/scenario.py`

该示例创建了两个本地 agent：

```python
agent1 = LocalAgent("LOCAL_AGENT_1", model_client=model_client)
agent2 = LocalAgent("LOCAL_AGENT_2", model_client=model_client)
team = RoundRobinGroupChat([agent1, agent2], termination_condition=termination)
```

这个示例主要用于验证消息流、queue、step、history、edit/revert 等调试能力。示例中的 `LocalAgent` 期望处理数字，因此在 UI 中应输入数字，例如 `0`。

### magentic-agents

文件：`examples/magentic-agents/scenario.py`

该示例显式创建的工具 agent 只有一个：

```python
surfer = MultimodalWebSurfer(
    "WebSurfer",
    model_client=model_client,
)
team = MagenticOneGroupChat([surfer], model_client=model_client)
```

当前实际关系是：

- `MagenticOneOrchestrator`：总控 Agent，由 `MagenticOneGroupChat` 内部创建，负责规划、分配任务、汇总结果。
- `WebSurfer`：网页浏览 Agent，负责打开网页、读取页面内容，并把结果返回给总控。

当前 `magentic-agents` 不是完整论文版或 GAIA 5-agent team。它没有自动加载：

- `FileSurfer`
- `Coder`
- `Executor`

UI 中的 GAIA 模式只调整答案格式和调试提示，不会自动新增 agent。当前可用 agent 始终由启动的 `scenario.py` 决定。

### magentic-code-agents（实验性）

文件：`examples/magentic-code-agents/scenario.py`

该示例是在现有 WebSurfer + MagenticOneOrchestrator 思路上新增 Python 代码能力的实验版本。它没有修改 `examples/magentic-agents/`，适合单独启动、单独测试。

当前实际关系是：

- `MagenticOneOrchestrator`：总控 Agent，由 `MagenticOneGroupChat` 内部创建。
- `WebSurfer`：网页浏览 Agent，负责打开网页和读取页面。
- `PythonCoder`：代码编写 Agent，负责为计算、文本处理、格式校验编写简短 Python 代码。
- `PythonExecutor`：代码执行 Agent，使用 `LocalCommandLineCodeExecutor` 在本示例目录下的 `workspace/` 中执行 Python 代码。

安全约束：

- 执行目录固定为 `examples/magentic-code-agents/workspace/`。
- 单个代码块超时为 20 秒。
- `CodeExecutorAgent` 仅允许 `python` 代码块。
- approval 函数会拒绝明显危险的 `os.system`、`subprocess`、`shutil.rmtree`、绝对路径文件访问、`eval`、`exec` 等模式。
- 该示例仍然会在本机执行 LLM 生成的 Python 代码，因此只建议用于受控实验任务，不建议处理敏感文件或运行不可信复杂指令。

当前依赖环境已确认包含：

- `AssistantAgent`
- `CodeExecutorAgent`
- `LocalCommandLineCodeExecutor`

如果其他机器缺少这些类，通常需要更新 AutoGen 相关包，例如重新安装项目依赖：

```powershell
python -m pip install -e ".[dev]"
```

或升级 `autogen-agentchat`、`autogen-ext`。不要为了该实验场景修改原有 `magentic-agents`。

推荐测试任务：

```text
Open https://example.com, count the number of words in the main paragraph using Python, and answer with only the number.
```

它仍然不是完整 5-agent GAIA team，因为没有新增 FileSurfer，也没有做完整的文件读取、代码沙箱隔离和 benchmark runner。

## 3. UI 页面区域说明

当前前端主入口是 `frontend/src/App.tsx`。页面大体分为左、中、右三栏。

### 左侧输入与控制区

主要组件：

- `SendMessage.tsx`
- `MessageDiagnostics.tsx`
- `MessageQueue.tsx`
- `RunControls.tsx`

左侧用于发送 workflow 消息、查看发送链路、查看后端 queue 和控制自动或手动执行。

常见操作模式：

- `START_TASK`：开始一个新任务，默认发送给 Orchestrator。
- `SEND_MESSAGE`：向某个具体 agent 发送中途干预消息。
- `RESET_AND_EDIT`：回溯到某个 checkpoint，并用编辑后的消息重跑。
- `RETRY_FROM_HERE`：回溯到某个 checkpoint，不编辑内容，直接从该点重跑。

运行方式：

- `auto`：发送后自动启动 workflow。
- `manual`：发送后进入 queue，需要手动 step。

GAIA 模式说明：只追加 `FINAL ANSWER` 风格的格式提示，不会加载 FileSurfer、Coder 或 Executor。

### 中间 Message History

主要组件：

- `MessageList.tsx`
- `MessageCard.tsx`
- `frontend/src/utils/trace-display.ts`

Message History 展示当前 run 的可读消息。修改版 UI 默认不是直接展示所有 runtime trace，而是显示“普通视图”：

- 保留用户任务、Orchestrator 计划或分配、WebSurfer 结果、最终答案、任务结束、错误事件。
- 隐藏 `None`、`GroupChatRequestPublish`、`GroupChatReset`、`ResetMessage`、空响应等内部事件。
- 折叠连续重复或高度相似的失败、无结果、无进展事件。
- 对 `GroupChatMessage` 和 `GroupChatAgentResponse` 中语义重复的内容做折叠。

每张消息卡片会显示当前任务内编号，例如 `#1`、`#2`。原始 timestamp 保留在 tooltip 或 details 中，避免把全局历史编号误认为当前任务步骤数。

### 右侧 Agent 泳道与 timeline

主要组件：

- `ConversationOverview.tsx`
- `frontend/src/utils/display-name.ts`
- `frontend/src/utils/event-display.ts`

右侧展示 Agent 泳道与 workflow 时间线。它和中间 Message History 使用同一套当前 run 过滤结果：

- 关闭“显示全部历史”时，只显示当前 run。
- 打开“显示全部历史”时，才显示所有历史。

点击右侧 timeline 节点，会跳转到中间对应的 Message History 卡片。

泳道名称经过规范化处理：

- 去掉 UUID
- 去掉 `/default`
- 合并 `MagenticOneOrchestrator_xxx/default` 到“总控 Agent”
- 合并 `WebSurfer_xxx/default` 到“网页浏览 Agent”

空泳道默认不显示，除非它属于当前实际 team 或当前 run 中确实有事件。

### Details

Message History 和 timeline 中的节点都保留 raw 事件信息。普通视图会把 WebSurfer 截图对象等复杂对象显示为：

```text
[截图对象，点击 Details 查看]
```

完整 JSON 仍然保留在 Details 或 raw trace 中，避免页面直接显示 `[object Object]`。

### Diagnostics

Diagnostics 展示从前端发送消息到后端 workflow 的链路状态。后端主要逻辑在 `src/agdebugger/app.py` 的 `/api/workflow/messages`。

它会记录：

- 前端 payload 是否生成
- payload 是否发送
- 后端 raw body 是否收到
- schema 是否校验通过
- 是否成功转换为 workflow message
- 是否成功加入 message queue
- workflow 是否启动
- 第一个 agent 是否处理了消息

如果“发消息就报错”，优先看 Diagnostics，而不是只看 Message History。

### 当前任务摘要

Message History 顶部有当前任务摘要，包含：

- task
- run_id
- 普通视图消息数
- 完整 trace 事件数
- 隐藏内部事件数
- 折叠重复事件数
- 错误事件数
- no_result 数
- no_progress 数
- format_warning 数
- 使用到的 agent

“复制当前任务摘要”按钮会复制这些信息，方便记录 GAIA 或其他手动测试结果。

### 显示全部历史 / 显示完整 trace

两个开关含义不同：

- “显示全部历史”：跨 run 展示后端保留的历史。
- “显示完整 trace”：展示当前过滤范围内的所有 raw runtime events。

完整 trace 数量可能远大于普通视图消息数。例如 65 条 trace 不代表 agent 真实对话了 65 轮，可能包含内部 publish、reset、空响应、浏览器状态、重复无进展事件等。

### Reset current run / Reset all

后端 reset API 在 `src/agdebugger/app.py` 中：

- `/api/debugger/reset-current-run`
- `/api/debugger/reset-all`

对应后端实现位于 `src/agdebugger/backend.py` 的 `reset_debugger()`。

区别：

- `Reset current run`：停止运行、清空 queue，并删除当前 run 对应的 history 和 diagnostics。
- `Reset all`：停止运行、清空 queue、清空全部 history、diagnostics、logs、runs 和 current_run_id。

浏览器 `Ctrl+F5` 只刷新前端页面，不会清除后端内存历史。如果页面显示旧记录，应使用 `Reset all`。

### edit/revert 回溯编辑

MessageCard 上的回溯按钮会调用后端：

```text
POST /api/editAndRevertHistoryMessage
```

后端会：

- 停止当前处理
- 清空 queue
- 保存当前 session
- 截断 checkpoint 之后的 history
- 创建 branch run
- 重新发送原消息或编辑后的消息
- 尝试加载 checkpoint 对应的 agent state

如果 checkpoint 附近没有可恢复状态，后端会给出 warning，但仍会尽量继续重跑。

## 4. 正确使用方式

### local-agents

启动 local-agents 后，输入应为数字，例如：

```text
0
```

不要输入自然语言问题。local 示例 agent 的逻辑期望数字输入，如果输入自然语言，可能触发 int 转换或示例逻辑错误。这不是 UI 发消息失败，而是示例 agent 的输入约束。

### magentic-agents

启动前确认已设置 API Key：

```powershell
$env:OPENAI_API_KEY="你的_API_KEY"
```

建议每轮测试前先点击：

```text
Reset all
```

然后在 `START_TASK` 模式下输入自然语言任务，例如：

```text
Open https://example.com and tell me the main heading in one sentence.
```

推荐先用简单网页任务确认 WebSurfer 正常，再测试更复杂问题。

## 5. 常见报错原因

### local-agents 输入了自然语言

local 示例不是通用问答系统。它适合输入数字，例如 `0`。自然语言可能导致示例 agent 内部转换失败。

### OPENAI_API_KEY 未设置

magentic-agents 使用 `OpenAIChatCompletionClient(model="gpt-4o")`。如果没有在同一个 PowerShell 窗口中设置 API Key，模型调用会失败。

检查方式：

```powershell
if ($env:OPENAI_API_KEY) { "OPENAI_API_KEY 已设置" } else { "OPENAI_API_KEY 未设置" }
```

不要把 API Key 写入代码或提交到 GitHub。

### Playwright / Chromium 未安装

`WebSurfer` 依赖浏览器能力。如果报 Playwright 或 Chromium 相关错误，可在当前 Python 环境中执行：

```powershell
python -m pip install playwright
python -m playwright install chromium
```

如果使用虚拟环境，请把 `python` 换成对应的 `.venv\Scripts\python.exe`。

### 端口占用

AGDebugger 默认端口通常是 `8081`。如果端口被占用，可以指定新端口：

```powershell
agdebugger scenario:get_agent_team --launch --port 8082
```

### 旧 run / queue 没清空

如果旧任务仍在运行或 queue 中还有消息，新任务可能被阻止或显示混乱。当前后端在 `START_TASK` 前会检查未处理消息，并在必要时停止旧 loop。

如果不确定状态，点击：

```text
Reset all
```

再重新开始任务。

### Ctrl+F5 不能清后端历史

`Ctrl+F5` 只刷新浏览器，不会清空后端内存。后端 history、runs、diagnostics 仍在 Python 进程中。

要真正清空，请使用 UI 中的：

```text
Reset all
```

### invalid URL 可能进入 no_progress

无效 URL、无法访问的网站、重复导航失败，可能产生多条相似 trace。普通视图会折叠为 no_progress，提示重置或编辑任务后重试。

这不一定是系统 runtime failed。只有 `GroupChatError`、非空 error/exception、diagnostics error/failed、后端异常等才属于 runtime_error。

### 当前 agent team 能力有限

当前 magentic-agents 只有 Orchestrator + WebSurfer。它可以做网页浏览类任务，但不等于完整 GAIA team。

例如需要本地文件读取、写代码、执行代码、多工具联合验证的 GAIA Level 1 或更高问题，当前示例不一定能通过。

## 6. 当前修改后的功能进展

当前修改版相对原始 AGDebugger 增强了以下能力：

- 修复消息无法进入 workflow、后端收到 None 的问题。
- 增加 `/api/workflow/messages` 的 payload 校验和 diagnostics。
- 每次 `START_TASK` 创建或记录 `run_id`、`started_at`、`start_timestamp`。
- 前端优先按 `run_id` 过滤当前任务，没有 `run_id` 时 fallback 到 started_at 或 timestamp。
- Message History 和右侧 timeline 使用同步过滤结果。
- 普通视图和完整 trace 分离。
- 区分 `success`、`no_result`、`runtime_error`、`no_progress`、`format_warning`。
- 只有真正 runtime_error 进入失败泳道。
- `GroupChatTermination`、`StopMessage` 且 `error=null` 显示为正常结束。
- 支持 `Reset current run` 和 `Reset all`。
- 动态显示当前 Agent team，不硬编码 5-agent。
- 增加“复制当前任务摘要”。
- 支持 edit/revert 分支重跑，并创建 branch run 标记。
- 折叠重复 trace、内部空事件和语义重复消息。
- 修复复杂对象直接显示为 `[object Object]` 的问题。

## 7. 当前限制

当前 `examples/magentic-agents/scenario.py` 是简化版：

- 内部总控：`MagenticOneOrchestrator`
- 显式工具 agent：`WebSurfer`

它不是完整论文版 5-agent GAIA team。GAIA 模式也不会自动增加 agent。

后续如果要支持更完整的 GAIA workflow，建议单独新增：

```text
examples/gaia-agents/
```

并显式接入 FileSurfer、Coder、Executor 等 agent。该工作涉及文件解析、代码执行安全、依赖管理和行为变化，建议单独评估。

## 8. 推荐测试流程

以下流程适合导师验收当前 UI 和 workflow 调试能力。

### 8.1 启动 magentic-agents

进入示例目录：

```powershell
cd agdebugger-main\examples\magentic-agents
```

如果 `.venv` 在 `agdebugger-main` 外层：

```powershell
..\..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

如果 `.venv` 在 `agdebugger-main` 内：

```powershell
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

如果端口被占用：

```powershell
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch --port 8082
```

### 8.2 Reset all

打开页面后先点击：

```text
Reset all
```

确认旧 run、queue、diagnostics 和 history 已清空。

### 8.3 测试 example.com

在 `START_TASK` 模式下输入：

```text
Open https://example.com and tell me the main heading in one sentence.
```

重点观察：

- 当前团队应显示 Orchestrator + WebSurfer。
- 普通视图不应显示大量内部事件。
- timeline 点击节点应能跳到 Message History。
- 最终答案应包含 `Example Domain`。
- 成功结束不应进入失败泳道。

### 8.4 测试 Python 官网版本号

输入：

```text
Find the official page for the Python programming language and tell me the current latest stable Python 3 release version shown there. Answer with only the version number.
```

重点观察：

- 第二次任务不应混入第一次任务历史。
- 关闭“显示全部历史”时，Message History 和 timeline 都只显示当前 run。
- 打开“显示完整 trace”后可以看到 raw runtime events。

### 8.5 测试 invalid URL

输入一个无效 URL，例如：

```text
Open https://not-a-real-domain-for-agdebugger-test.invalid and tell me the main heading.
```

重点观察：

- 无法访问或找不到结果应显示为 no_result 或 no_progress。
- 不应刷出大量重复失败卡片。
- 只有真实 runtime_error 才进入红色失败泳道。

### 8.6 测试 edit/revert

在某条可回溯的 Message History 卡片上点击回溯按钮，或编辑消息后保存并回溯。

重点观察：

- UI 应创建新的 branch run。
- Message History 和 timeline 应显示从哪个 timestamp 分叉。
- 修改后的消息应真正进入后端 workflow，而不是只改前端显示。

### 8.7 测试实验性 magentic-code-agents

该场景不替代 `magentic-agents`，需要单独进入新目录启动：

```powershell
cd agdebugger-main\examples\magentic-code-agents
```

如果 `.venv` 在 `agdebugger-main` 外层：

```powershell
..\..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

如果 `.venv` 在 `agdebugger-main` 内：

```powershell
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

推荐输入：

```text
Open https://example.com, count the number of words in the main paragraph using Python, and answer with only the number.
```

重点观察：

- 当前团队应显示 Orchestrator、WebSurfer、PythonCoder、PythonExecutor。
- PythonExecutor 的代码执行应发生在 `examples/magentic-code-agents/workspace/`。
- timeline 应能展示代码编写和代码执行相关事件。
- 如果代码触发安全拒绝，应作为可解释事件展示，而不是影响原有 WebSurfer workflow。

## 9. 构建和测试命令

前端构建：

```powershell
cd agdebugger-main\frontend
npm run build
```

后端 workflow 契约测试：

```powershell
cd agdebugger-main
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_workflow.ps1
```

`scripts/test_workflow.ps1` 会优先查找：

1. `agdebugger-main\.venv\Scripts\python.exe`
2. `agdebugger-main` 外层的 `.venv\Scripts\python.exe`
3. 当前 PowerShell 中的 `python`

因此它不依赖某个固定 Python 3.11 安装路径。
