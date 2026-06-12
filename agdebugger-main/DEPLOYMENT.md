# AGDebugger 增强版部署说明（Windows PowerShell）

本文档用于帮助导师在 Windows PowerShell 环境中部署并运行当前仓库中的 AGDebugger 增强版 UI。

## 1. 项目简介

本项目基于 AGDebugger，保留了原有的 AgentChat 消息单步执行、自动运行、消息队列和历史回溯能力，并增强了 workflow 调试界面。

当前版本主要用于观察和调试：

- Agent workflow 与消息队列
- Message History 与 Agent 泳道时间线
- 每次任务对应的 `run_id`
- 普通用户视图与完整 runtime trace
- 消息发送 diagnostics
- 当前 run 或全部历史的清理
- 历史消息 edit/revert 与分支重跑
- 成功、无结果、运行时错误、无进展和格式提醒等状态

## 2. 环境要求

建议准备以下环境：

- Git
- Python 3.10 或更高版本，推荐 Python 3.11
- Node.js 和 npm
- Windows PowerShell
- OpenAI API Key
- 可选：Playwright 和 Chromium，用于运行 WebSurfer

检查本机版本：

```powershell
git --version
python --version
node --version
npm --version
```

## 3. 获取代码

当前仓库地址：

```text
https://github.com/ezan001/agdebugger.git
```

可以直接将仓库克隆为 `agdebugger-main`：

```powershell
git clone https://github.com/ezan001/agdebugger.git agdebugger-main
cd agdebugger-main
```

后续命令默认项目代码目录为：

```text
agdebugger-main/
```

## 4. 安装 Python 后端环境

### 4.1 推荐：在项目目录创建 `.venv`

```powershell
cd agdebugger-main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

如果 PowerShell 禁止执行激活脚本，可以不激活环境，直接使用：

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

### 4.2 可选：使用项目外层 `.venv`

部分现有开发目录采用以下结构：

```text
工作目录/
├─ .venv/
└─ agdebugger-main/
```

这种情况下可在工作目录创建环境：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".\agdebugger-main[dev]"
```

### 4.3 WebSurfer 可选依赖

`examples/magentic-agents/scenario.py` 使用 `MultimodalWebSurfer`。如果运行时提示缺少 Playwright 或浏览器，请在当前 Python 环境中执行：

```powershell
python -m pip install playwright
python -m playwright install chromium
```

如果未激活虚拟环境，则将 `python` 替换为对应环境的 `python.exe`，例如：

```powershell
.\.venv\Scripts\python.exe -m pip install playwright
.\.venv\Scripts\python.exe -m playwright install chromium
```

该步骤建议在 WebSurfer 报错时再执行。

## 5. 安装并构建前端

```powershell
cd agdebugger-main\frontend
npm install
npm run build
```

构建命令实际执行 TypeScript 检查和 Vite 生产构建：

```text
tsc && vite build
```

生成的静态文件位于 `frontend/dist/`。AGDebugger 后端会优先查找已打包的 Web UI，也会查找当前源码目录下的 `frontend/dist`。

## 6. 设置 OpenAI API Key

不要把 API Key 写入 `scenario.py`、提交到 GitHub，或发在截图和日志中。

在当前 PowerShell 窗口临时设置：

```powershell
$env:OPENAI_API_KEY="你的_API_KEY"
```

检查环境变量是否存在时，不建议直接输出完整 Key。可以执行：

```powershell
if ($env:OPENAI_API_KEY) { "OPENAI_API_KEY 已设置" } else { "OPENAI_API_KEY 未设置" }
```

关闭当前 PowerShell 窗口后，临时环境变量会失效。

## 7. 启动示例

AGDebugger CLI 默认监听：

```text
http://127.0.0.1:8081
```

`--launch` 会尝试自动打开浏览器。

### 7.1 local-agents

如果 `.venv` 位于项目外层，使用：

```powershell
cd agdebugger-main\examples\local-agents
..\..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

如果 `.venv` 位于 `agdebugger-main` 内，使用：

```powershell
cd agdebugger-main\examples\local-agents
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

### 7.2 magentic-agents

如果 `.venv` 位于项目外层，使用：

```powershell
cd agdebugger-main\examples\magentic-agents
..\..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

如果 `.venv` 位于 `agdebugger-main` 内，使用：

```powershell
cd agdebugger-main\examples\magentic-agents
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch
```

### 7.3 修改端口

默认端口 `8081` 被占用时，可以指定其他端口：

```powershell
..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch --port 8082
```

使用外层 `.venv` 时：

```powershell
..\..\..\.venv\Scripts\agdebugger.exe scenario:get_agent_team --launch --port 8082
```

然后访问：

```text
http://127.0.0.1:8082
```

## 8. 基础验证任务

### 8.1 local-agents

启动 local-agents 后，在 `START_TASK` 模式输入：

```text
0
```

正常情况下，两个本地 Agent 会按示例逻辑处理该数字。

### 8.2 example.com

启动 magentic-agents 后输入：

```text
Open https://example.com and tell me the main heading in one sentence.
```

预期 WebSurfer 能访问页面，并返回包含 `Example Domain` 的答案。

### 8.3 Python 官网版本号

```text
Find the official page for the Python programming language and tell me the current latest stable Python 3 release version shown there. Answer with only the version number.
```

该结果会随 Python 官网当前发布版本变化，不应在部署文档中写死具体版本号。

## 9. 当前 UI 功能

### run_id 与当前任务隔离

每次 `START_TASK` 会创建新的 `run_id`。Message History、消息队列、diagnostics 和 timeline 会关联当前 run。刷新页面后，后端仍会返回当前 run 信息。

### Message History 与 timeline 同步过滤

中间 Message History 和右侧 Agent 泳道时间线使用同一组当前 run 事件。关闭“显示全部历史”时只查看当前 run；打开后可以查看后端保留的历史。

### 普通视图与完整 trace

- 普通视图会隐藏内部空事件，并折叠重复或无进展事件。
- “显示完整 trace”会显示所有 raw runtime events。
- 完整 trace 的数量不等于 Agent 实际对话轮数。

### 状态分类

当前 UI 区分：

- `success`：正常消息或任务正常结束
- `no_result`：正常运行，但目标页面没有找到所需信息
- `runtime_error`：`GroupChatError`、非空 error/exception 或 diagnostics 失败
- `no_progress`：连续重复的失败或无结果事件被折叠
- `format_warning`：答案格式不符合要求，但不属于 runtime 错误

只有真正的 `runtime_error` 会进入红色失败泳道。

### 当前 Agent team

顶部根据 `/api/agents` 的实际返回结果显示当前团队，不硬编码 Agent 数量。Agent 的完整原始名称仍保留在 tooltip 或 Details 中。

### 清理调试状态

- “清空当前 run”：停止运行、清理队列，并删除当前 run 对应的历史和 diagnostics。
- “清空全部历史”：停止运行并清除全部队列、历史、diagnostics、日志和 run 信息。该操作需要确认。

浏览器的 `Ctrl+F5` 只刷新前端，不会清除后端内存。需要真正清理时应使用 UI 中的清空按钮。

### 当前任务摘要

“复制当前任务摘要”会复制 task、run_id、final answer 候选、普通消息数、完整 trace 数、折叠数量、使用到的 Agent 和错误摘要，便于记录 GAIA 或其他人工测试。

### edit/revert 分支重跑

从历史消息回溯或编辑后，后端会创建新的 branch run，记录父 run、分叉 timestamp 和分支类型，然后将修改后的消息重新放入 workflow。

### diagnostics

左侧 diagnostics 面板显示 payload 生成、后端接收、schema 校验、workflow message 创建、入队和启动等链路信息。

## 10. 构建与测试

### 前端构建

```powershell
cd agdebugger-main\frontend
npm run build
```

### Workflow 契约测试

```powershell
cd agdebugger-main
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_workflow.ps1
```

测试脚本按以下顺序查找 Python：

1. `agdebugger-main\.venv\Scripts\python.exe`
2. `agdebugger-main` 外层的 `.venv\Scripts\python.exe`
3. 当前 PowerShell 中的 `python`

脚本还会设置 `PYTHONPATH=src`，因此不会硬编码某个 Python 3.11 安装目录。

## 11. 常见问题排查

### PowerShell 禁止执行脚本

如果出现“禁止运行脚本”或 `PSSecurityException`，可以只为当前命令绕过策略：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_workflow.ps1
```

虚拟环境激活脚本被禁止时，也可以不激活，直接调用 `.venv\Scripts\python.exe` 或 `.venv\Scripts\agdebugger.exe`。

### 端口被占用

改用其他端口：

```powershell
agdebugger scenario:get_agent_team --launch --port 8082
```

也可以检查端口：

```powershell
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
```

### `OPENAI_API_KEY` 未设置

重新在启动 AGDebugger 的同一个 PowerShell 窗口执行：

```powershell
$env:OPENAI_API_KEY="你的_API_KEY"
```

然后重新启动示例。

### WebSurfer 或 Playwright 报错

如果提示找不到 Playwright、Chromium 或浏览器可执行文件，执行：

```powershell
python -m pip install playwright
python -m playwright install chromium
```

如果使用虚拟环境，请确保这里的 `python` 与启动 `agdebugger.exe` 的环境一致。

网络代理、防火墙或目标网站限制也可能导致 WebSurfer 无法访问页面。此类“没有找到结果”与程序 runtime error 会在 UI 中分别显示。

### 页面仍显示旧历史

`Ctrl+F5` 只会清浏览器页面状态，不会清后端内存。

请使用：

- “清空当前 run”，或
- “清空全部历史”

清空全部历史后，即使重新打开“显示全部历史”，旧记录也不应再出现。

### `.venv` 路径不同

先查找当前环境中的程序：

```powershell
Get-ChildItem -Path . -Recurse -Filter agdebugger.exe
Get-Command python -ErrorAction SilentlyContinue
```

然后使用实际路径启动。推荐将 `.venv` 固定放在 `agdebugger-main\.venv`，路径最直观。

### 不要提交生成目录和环境

以下目录不应提交到 GitHub：

```text
.venv/
node_modules/
frontend/dist/
__pycache__/
.pytest_cache/
```

仓库 `.gitignore` 已包含 `.venv`、`node_modules` 和 `dist` 等规则。

## 12. 当前限制

当前 `examples/magentic-agents/scenario.py` 显式创建的工具 Agent 只有：

- `WebSurfer`

`MagenticOneGroupChat` 内部还会创建和使用 MagenticOne Orchestrator。因此 UI 中通常会看到：

- MagenticOneOrchestrator
- WebSurfer

这不是论文或完整 GAIA 系统中的 5-agent team。本轮项目没有新增：

- FileSurfer
- Coder
- Executor

UI 中的 GAIA 模式主要用于追加最终答案格式和辅助调试，不会自动加载 FileSurfer、Coder 或 Executor。实际 Agent team 始终由当前启动的 `scenario.py` 决定。

