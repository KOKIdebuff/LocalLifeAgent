# 本地生活执行 Agent

<!-- 建议添加徽章：版本、CI 状态、许可证 -->

一个以本地 Mock 数据为主的本地生活规划与模拟执行原型。用户输入一句自然语言目标后，系统会识别时间、同行关系、预算、距离和偏好，生成多个候选方案，并展示查证、确认、异常重排、模拟执行和反馈复盘流程。

项目默认可作为静态 Web Demo 独立运行；仓库同时提供可选的 FastAPI 后端，用于意图识别、反馈复盘、候选记忆、审计记录和薄层 Runtime 状态聚合。

> [!IMPORTANT]
> 项目不接入真实商家、地图、餐厅库存、支付、订座或消息平台。订座、下单、排队、买票、团购、通知和提醒均为模拟执行，不会产生真实交易。

## 在线演示

在线体验地址：

http://106.14.46.98/

## 核心特性

- **自然语言规划**：解析时间、人数、同行关系、预算、距离、饮食偏好和体力限制。
- **多候选方案**：生成 2 至 3 个服务包，并基于约束推荐更稳妥的方案。
- **可解释流程**：通过 `agentLoopTrace` 展示 `understand`、`planner`、`researchers`、`merger`、`verifier`、`revise` 和 `reflect` 阶段。
- **异常重排**：覆盖下雨、餐厅满座、活动无票、孩子疲劳、预算超限和人数变化等情况。
- **候选项切换**：支持活动、餐厅和交通候选的预览、采用、恢复原方案及单步撤销。
- **方案保存与恢复**：在浏览器本地保存选中方案，支持详情查看、局部重排和按模拟执行状态恢复。
- **模拟执行队列**：在用户确认后模拟预约、排队、购票、团购、加购、通知和提醒。
- **反馈与记忆闭环**：将反馈转换为候选记忆，仅在用户明确采用或更正后写入长期记忆。
- **可选 LLM 增强**：配置模型后，可通过 LangGraph 意图识别节点或直接 LLM 路径增强意图解析。
- **失败降级**：后端不可用、未配置密钥或模型置信度不足时，前端回退到本地规则。
- **契约驱动**：使用 JSON Schema 描述意图、反馈记忆、Runtime 状态机和 V5 UI Contract。

## 相关文档

- [设计文档](DESIGN.md)
- [比赛项目定义](COMPETITION_BRIEF.md)
- [LangGraph 接入边界](LANGGRAPH_INTEGRATION.md)
- [V4 Runtime 实施计划](specs/001-v4-runtime-state-machine-memory-loop/plan.md)
- [V4 Runtime 契约](specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md)
- [V5 Generative UI、协同与执行契约](V5_GENERATIVE_UI_COLLABORATION_PLAN.md)
- [V5 方案生命周期契约](V5_PLAN_LIFECYCLE_CONTRACT.md)
- [项目进度](progress.md)
- [工程复盘](lessons.md)

## 项目边界

### Mock 与地点数据

- 天气、路线、活动、餐厅、票务、订座、排队、团购、通知和提醒结果均为本地 Mock。
- 营业时间、距离、余位、预约结果和实时路况等字段不承诺实时准确。
- 地点候选采用“本地 POI 种子 + 可选 LLM 补全 + 可行性校验”的设计。
- 热门城市优先使用 POI 种子；冷门城市候选应标记为“模拟检索结果”，不能表述为实时 API 数据。
- 项目保留未来接入真实 API 的工具接口形态，但当前不包含真实生活服务平台集成。

### 当前架构状态

| 层级 | 当前状态 | 职责 |
| --- | --- | --- |
| V3 主链路 | 已实现 | 前端本地规划、Mock 工具、候选生成、重排和模拟执行 |
| V4 alpha | 已实现但仍在收敛 | 后端意图识别、反馈、候选记忆、审计日志和薄层 `POST /api/runtime` |
| V4 Product-grade Runtime | 契约已冻结，完整实现未完成 | 持久 Session、Transition Engine、事件、恢复点和稳定适配器 |
| V5 Generative UI | 前端契约、适配器和部分交互已实现 | 卡片渲染、候选切换、保存方案和兼容回退 |
| 本地真实协同与完整执行域 | 规划中 | 分享状态、协作者反馈、执行生命周期和审计持久化 |

核心规划仍由单 Orchestrator 与本地 Mock Tools 完成，不是真实多 Agent 并发。LangGraph 当前只包裹后端意图识别与校验，不接管规划、评分、重排或执行队列。

## 技术栈

| 范围 | 技术 |
| --- | --- |
| 前端 | HTML、CSS、原生 JavaScript |
| 后端 | Python、FastAPI、Pydantic、HTTPX |
| 可选编排 | LangGraph |
| 本地存储 | SQLite、JSONL、浏览器 `localStorage` |
| 契约 | JSON Schema Draft 2020-12 |
| 测试 | Node.js、`unittest`、pytest |

## 快速开始

### 环境要求

- Python 3.12 或更高版本
- Node.js：仅用于运行前端测试和可选静态服务器
- PowerShell：以下命令以 Windows PowerShell 为例

<!-- 请补充：项目支持的最低 Node.js 版本 -->

### 运行静态 Demo

静态模式不依赖 Python 后端。可以直接打开仓库根目录中的 `index.html`，或启动本地静态服务器：

```powershell
npx http-server .
```

根据终端输出访问对应地址。前端无法访问后端时，会自动使用本地规则。

### 运行可选后端

1. 创建虚拟环境：

```powershell
python -m venv .venv
```

2. 安装依赖：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. 创建本地配置：

```powershell
Copy-Item .env.example .env
```

4. 按需编辑 `.env`。不要提交真实密钥。

5. 启动服务：

```powershell
.\.venv\Scripts\python.exe -m uvicorn server:app `
  --reload `
  --host 127.0.0.1 `
  --port 8000 `
  --env-file .env
```

6. 打开 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。

也可以使用项目脚本启动后端，但该命令依赖当前终端已激活正确的 Python 环境，并且不会自动加载 `.env`：

```powershell
$env:OPENAI_API_KEY = "your_api_key_here"
npm run dev:api
```

## 使用示例

### Web Demo

1. 输入自然语言目标，例如：

```text
周六下午想和家人出去玩 4 小时，别离家太远，晚上一起吃饭。
```

2. 点击生成按钮，查看系统识别的约束、候选方案和推荐结果。
3. 切换活动、餐厅或交通候选，先检查时间、预算和风险变化，再决定是否采用。
4. 选择方案并确认模拟执行。
5. 在反馈区域提交修正，检查是否生成候选记忆。
6. 仅在内容准确且不含敏感信息时采用或更正候选记忆。

普通模糊输入会优先使用可解释假设继续规划；缺失信息影响安全或关键可执行性时，系统会软追问或保守降级。

### API 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

响应包含模型配置状态、SQLite 可用性、数据库路径和 LangGraph 可用性。

### 意图识别

```powershell
$body = @{
  input = "周六下午和家人出去玩，预算 500 元"
  overrides = @{}
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/intent `
  -ContentType "application/json" `
  -Body $body
```

未配置 `OPENAI_API_KEY` 时，该端点返回可识别的缺少密钥错误；Web 前端会继续回退到本地规则。

### 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 查询模型、SQLite 和 LangGraph 状态 |
| `POST` | `/api/intent` | 执行后端意图识别 |
| `POST` | `/api/runtime` | 聚合薄层 Runtime 状态与后端增强结果 |
| `POST` | `/api/feedback` | 保存反馈并生成候选记忆 |
| `POST` | `/api/memory-candidates/{candidate_id}/decision` | 采用、忽略或更正候选记忆 |

`runtime.schema.json` 规定 `feedback` 与 `memoryDecision` 互斥，同一请求只能包含其中一个字段，冲突错误语义为 `mutually_exclusive_operations`。当前 alpha handler 尚未实现对应的运行时互斥校验，调用方应主动遵守该契约。

> [!NOTE]
> 前端保留对 `/api/generative-plan` 的 V5 后端规划尝试，但当前 `server.py` 未实现该端点。V5 默认关闭；启用后若请求失败，会在 `adapterFallback` 开启时回退到本地 adapter。

## 配置

### 环境变量

复制 `.env.example` 后配置以下变量：

| 变量 | 示例值 | 用途 |
| --- | --- | --- |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 API 根地址 |
| `OPENAI_API_KEY` | `your_api_key_here` | 模型访问密钥 |
| `OPENAI_MODEL` | `gpt-4.1-mini` | 意图识别使用的模型 |
| `LLM_TIMEOUT_SECONDS` | `8` | LLM 请求超时秒数 |
| `LLM_CONFIDENCE_THRESHOLD` | `0.72` | 意图结果最低置信度 |
| `AGENT_MEMORY_DB` | `memory/agent_memory.sqlite` | SQLite 记忆数据库路径 |
| `SERVE_STATIC` | `1` | 是否由 FastAPI 挂载仓库根目录静态文件；设为 `0` 时关闭 |

`.env`、SQLite 文件和审计 JSONL 已由 `.gitignore` 排除。

### V5 前端开关

V5 开关按以下优先级合并：默认值、Runtime 配置、`localStorage`、`sessionStorage`、URL 查询参数、请求覆盖和安全保护。

| 开关 | 默认值 | 说明 |
| --- | --- | --- |
| `v5GenerativeUI` | `false` | 启用 V5 卡片渲染流程 |
| `adapterFallback` | `true` | V5 后端不可用时使用本地 adapter |
| `localReplan` | `true` | 启用本地候选切换与重排 |
| `collaborationPlaceholder` | `false` | 展示协同占位能力 |
| `executionImplementationRequired` | `false` | 标识是否要求真实执行域实现 |
| `localCollaborationState` | `true` | 声明本地协同状态能力 |
| `simulatedExecutionLifecycle` | `true` | 声明模拟执行生命周期能力 |

例如，通过 URL 临时启用 V5：

```text
http://127.0.0.1:8000/?v5GenerativeUI=true&adapterFallback=true
```

也可以设置浏览器存储项，例如 `localLife.v5GenerativeUI=true`。

## 测试与验证

PowerShell 下使用 `npm.cmd`，避免脚本执行策略拦截 `npm.ps1`。

### 完整基线

```powershell
npm.cmd test

.\.venv\Scripts\python.exe -m py_compile `
  .\server.py `
  .\backend_core.py `
  .\graph_runtime.py `
  .\test_backend_core.py `
  .\test_graph_runtime.py `
  .\test_contract_schemas.py `
  .\test_runtime_api.py

.\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py

.\.venv\Scripts\python.exe -m pytest `
  .\test_backend_core.py `
  .\test_graph_runtime.py `
  .\test_runtime_api.py `
  -q
```

如本地已安装 Spec Kit CLI，可额外执行：

```powershell
.\.venv\Scripts\specify.exe check
```

### 当前验证结果

- Node 测试：5 个测试入口全部通过。
- 契约测试：23 项 `unittest` 通过。
- 后端测试：40 项 pytest 通过。
- Python 源码与测试文件：语法检查通过。
- 已知非阻塞项：LangGraph/LangChain 与 Starlette TestClient 存在依赖弃用警告；部分 Windows 环境可能出现 pytest 缓存目录警告。

测试覆盖本地规划、约束冲突、异常重排、模拟执行边界、候选切换、保存方案、V5 adapter/renderer、记忆敏感信息拦截、Runtime 状态契约和 API 错误恢复。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `index.html`、`styles.css` | Web 工作台结构与样式 |
| `app.js` | 页面状态、路由、弹窗、执行队列、反馈和 V5 集成 |
| `agent-core.js` | 本地解析、Mock 工具、规划评分、重排与执行模拟 |
| `candidate-switcher.js` | 候选预览、采用、恢复和撤销 |
| `saved-plans.js` | 方案快照、版本、局部重排与恢复策略 |
| `v5-contract.js` | V5 feature flag、payload 校验和能力约束 |
| `v5-adapter.js` | 将现有规划结果转换为 V5 UI Contract |
| `v5-renderer.js` | V5 卡片与时间线渲染 |
| `server.py` | FastAPI 路由、静态资源和薄层 Runtime |
| `backend_core.py` | 意图校验、反馈、SQLite 记忆和候选决策 |
| `graph_runtime.py` | 可选 LangGraph 意图识别编排 |
| `*.schema.json` | 意图、反馈记忆、Runtime 和 UI 契约 |
| `runtime-state-machine.json` | V4 Runtime P0 状态机事实源 |
| `specs/` | V4 Runtime 规格、计划、任务和测试矩阵 |
| `progress.md`、`lessons.md` | 进度记录与工程复盘 |

## 路线图

### Demo

- 稳定本地 Mock 主链路。
- 保持模拟执行口径一致。
- 保证无后端时仍可演示。

### Alpha

- 完善契约、低置信度降级和请求互斥。
- 保留记忆引用与敏感信息边界。
- 持续维护前后端自动化测试。

### Beta

- 实现 V4 Product-grade Headless Runtime，包括持久 Session、Transition Engine、事件和恢复点。
- 推进 V5 Generative UI、本地协同状态、执行队列和可回滚方案分支。
- 将热门城市 POI 种子扩展到 30 个以上城市，每个城市、每类地点准备 5 个以上 POI。
- 为冷门城市 fallback 展示置信度、来源和替代推荐。
- 为 Mock API 增加可配置、可复现的失败率、超时、重试和降级策略。
- 继续完善筛选、地图感、详情页和多轮修改体验。
