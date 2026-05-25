# 本地生活执行 Agent Demo

这是一个以本地 Mock 数据为主的执行型 Agent Demo。默认可以作为静态 Web Demo 运行，用模拟工具展示“周末吃喝玩乐一键安排”的执行闭环；仓库中也包含一套可选的后端增强链路，用于实验性接入意图识别、反馈复盘和结构化记忆能力。

项目不接入真实商业平台，不做真实支付、真实下单或真实消息发送。

## 赛题边界

- 不要求接入真实商家、真实地图、真实餐厅库存、真实支付或预约系统。
- 不要求爬取实时数据。
- Demo 中的天气、路线、活动、餐厅、票务、订座、团购、通知和提醒结果均为本地 Mock。
- 高影响动作只做模拟执行，不做真实交易。

### Mock 与真实地点边界

当前比赛口径采用“外部执行动作 Mock，地点候选尽量真实”的折中方案：

- 订座、下单、排队、买票、发消息、提醒等执行动作全部为 Mock，不触达真实平台。
- 地点候选采用“本地真实 POI 种子库 + LLM 补全 + 可行性校验”的方式生成，目标是让任意城市输入时尽量出现真实存在或至少类型合理的地点候选。
- 营业时间、距离、排队、余位、预约结果、实时路况等实时类字段统一由 Mock API 返回，不承诺实时准确。
- 热门城市优先使用 POI 种子库；冷门城市由 LLM 生成候选并做可行性校验，UI 或日志中标记为“模拟检索结果”，不能伪造实时 API 结果。

因此，对外不要说项目已经接入真实地图、真实餐厅库存或真实生活服务 API；更稳妥的表达是：项目保留未来接入真实 API 的工具接口形态，但当前演示使用可控 Mock 来保证现场稳定性。

后续目标按偏产品化方案推进：

- 热门城市 POI 种子库覆盖 30 个以上城市。
- 每个城市、每类地点准备 5 个以上真实 POI。
- 冷门城市 fallback 需要展示置信度、来源和替代推荐。
- Mock API 需要配置失败率、超时、重试和降级策略。
- Web UI 向接近产品级体验推进，补齐筛选、地图感、详情页和多轮修改能力。

## 核心链路

1. 用户输入一句自然语言生活目标。
2. Planner / Orchestrator 识别时间、同行关系、人数、偏好、预算、距离和体力限制。
3. 信息不足时先追问，不默认亲子、朋友或情侣。
4. Researchers 以逻辑并行研究通道组织 Mock 工具：天气路线、活动、餐厅、订座排队团购。
5. Merger 生成 2-3 个候选服务包，并推荐最稳方案。
6. Verifier 检查时间、距离、预算、预约可用性和高影响动作确认。
7. Revise 在下雨、餐厅满座、孩子累了、预算太高、活动无票或人数变化时触发重排。
8. 用户确认后，模拟执行订座、排队、买票、买团购、下单加购、发消息和提醒。

`agentLoopTrace` 是轻量可解释编排。核心规划底层仍是单 Orchestrator + 本地 Mock Tools，不做真实多 Agent 并发，也不接入真实平台能力。

## 当前状态

当前项目更准确的状态是“V3 比赛主链路 + 已落地的 V4 alpha 实验能力”：

- 比赛主链路仍然是本地 Mock Demo，核心规划、候选方案、重排和执行队列都由前端 `agent-core.js` 完成。
- 仓库中已经落地一套可选后端增强链路，用于意图识别、反馈复盘和结构化记忆。
- 前端已经接入可选后端增强；如果后端不可用、未配置密钥或置信度不足，会自动回退到本地规则解析。
- 结构化记忆链路已经存在，支持反馈写入、候选确认和后续参考。
- UI 已显示 `Reflect` 阶段和反馈面板，支持用户提交反馈和处理候选记忆。
- 后端已提供薄层 `POST /api/runtime`，用于聚合 Runtime 状态与后端增强结果；前端主规划链路仍由 `agent-core.js` 负责。

这意味着：

- 不能再把仓库现状表述为“完全没有后端、完全没有意图识别或记忆能力”。
- 也不能把当前状态说成“已经完成完整 Runtime”。
- 更准确的说法是：比赛可演示主链路仍以静态 Mock 为主，后端与记忆闭环属于已落地但仍在收敛中的增强能力。

对外演示和讲解时，固定采用以下口径：

- V3 主链路：可稳定演示的本地 Mock 执行闭环，覆盖理解、规划、查证、确认、模拟执行和异常重排。
- V4 alpha 能力：仓库中已经落地的可选增强链路，包括后端意图识别、反馈复盘、候选记忆、审计日志、可选 LangGraph 意图识别编排，以及薄层 Runtime 聚合端点。
- 当前不是完整 V4 Runtime，也不是已接入真实生活服务平台；任何订座、下单、排队、买票、发消息和提醒都只做本地模拟执行。

## 下一阶段路线图

下一阶段目标不是引入重型多 Agent 框架，也不是依赖任何非官方泄露源码，而是在现有基础上把可选后端能力继续收敛成更稳定的轻量 Agent Runtime。推荐目标栈为 LangGraph 轻量编排 + FastAPI + 本地 Mock 数据库 + 可配置真实 LLM，其中 LangGraph 只负责流程调度和状态流转，核心业务逻辑仍保持自研、清晰和可测试。

当前已引入可选 LangGraph 作为 V4 alpha 后端轻量编排层，主要包裹意图识别与校验；`POST /api/runtime` 在此基础上提供薄层状态与后端增强结果聚合，不承载前端规划、候选生成或模拟执行。核心业务逻辑仍由项目自研实现。LangGraph trace 只保留在后端日志或审计记录中，不映射到前端 `agentLoopTrace`。接入边界见 `LANGGRAPH_INTEGRATION.md`。

已经落地：

- 可选后端增强。
- 意图识别入口。
- 反馈复盘与候选记忆确认链路。
- 结构化记忆与审计日志能力。
- 前端 `Reflect` 阶段与反馈 UI。
- 可选 LangGraph 意图识别编排层：`/api/intent` 在安装依赖并配置密钥后优先走 LangGraph 节点，失败或未安装时保留原后端 LLM 路径；两条成功路径都返回 `source: "llm"`，并用 `runtimePath` 区分 `langgraph` 与 `direct_llm`。
- 最小 `/api/intent` 契约文件：`intent.schema.json` 约束请求、成功响应、错误响应和标准化 `intent` 字段。
- 反馈与记忆契约文件：`feedback-memory.schema.json` 约束候选优先、显式确认后写入长期记忆的 alpha 行为。
- 薄层 Runtime 契约与端点：`runtime.schema.json` 和 `POST /api/runtime` 提供状态流转与后端增强结果聚合。
- 契约与 Runtime API 自动化测试：`test_contract_schemas.py`、`test_runtime_api.py`。
- 后端失败时的本地规则兜底。

仍待补全：

- 将前端主规划、候选生成、重排和模拟执行收敛到完整 Runtime 状态机的后续实现。
- 完整浏览器侧人工回归记录，以及对 LangGraph 依赖告警的后续处理。
- 若进入产品化阶段，再评估真实生活服务接入；当前不包含真实执行平台。
- 对“V3 主链路”和“V4 alpha 能力”的文档、讲解和演示边界持续统一。

“自进化”在本项目里只表示自动总结经验、下次检索参考、降低重复错误概率，不表示自动改代码，也不承诺永不犯错。

## 运行方式

### 1. 仅运行静态 Demo

直接用浏览器打开：

```text
C:\Users\yuzupoon\Desktop\LocalLifeAgent\index.html
```

也可以启动一个本地静态服务：

```powershell
npx http-server .
```

这种方式不依赖后端。前端若无法访问后端增强能力，会自动回退到本地规则解析。

### 2. 运行可选后端增强链路

```powershell
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

启动后访问 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。

如果未配置 `OPENAI_API_KEY`，前端会继续回退到本地规则解析；反馈复盘与本地记忆能力仍可作为实验链路使用。

## 验证方式

核心前端逻辑回归：

```powershell
npm test
```

可选的 Node 语法检查：

```powershell
node --check .\agent-core.js
node --check .\app.js
node --check .\tests.js
```

可选的 Python 语法检查：

```powershell
.\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\graph_runtime.py .\test_backend_core.py .\test_graph_runtime.py .\test_contract_schemas.py .\test_runtime_api.py

.\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py
.\.venv\Scripts\pytest.exe .\test_backend_core.py .\test_graph_runtime.py .\test_runtime_api.py -q
```

当前验证覆盖：

- 朋友局、亲子局、家人/长辈局、情侣局、独自探索、同事局。
- 信息不足追问和约束冲突替代方案。
- 餐厅无座后的备选替换。
- 闲时错峰推荐、优惠和预算指标。
- 下雨、餐厅满座、孩子累了、预算太高四类动态重排。
- 活动无票、人数变化两类比赛现场异常演示。
- 团购、订座、排队和人工确认动作不得伪造成成功。
- `agentLoopTrace` 的 `understand / planner / researchers / merger / verifier / revise / reflect` 阶段。
- LLM override、本地规则兜底、反馈生成候选记忆和高敏感信息拦截。
- Runtime 契约状态表、反馈/记忆契约，以及薄层 `POST /api/runtime` 的可恢复失败、追问、反馈和候选决策路径。

当前已确认：

- `npm.cmd test` 通过，输出 `All agent-core tests passed.`。
- Python 后端与测试文件通过语法级检查。
- `test_contract_schemas.py` 通过，共 7 项测试。
- `test_runtime_api.py` 通过，共 6 项测试。
- `test_backend_core.py` 与 `test_graph_runtime.py` 通过，共 10 项测试；当前仅存在 LangGraph 依赖弃用告警，不阻塞 alpha 验证。

## 文件说明

- `index.html`：Web Demo 页面结构。
- `styles.css`：执行驾驶舱样式。
- `app.js`：页面交互、客户可读流程状态、追问状态、重排事件、方案选择、执行队列和反馈面板展示。
- `agent-core.js`：自然语言解析、Mock 工具、轻量编排 trace、规划评分、服务包生成和执行模拟核心。
- `server.py`：可选后端入口，负责静态资源挂载、意图识别、反馈复盘和薄层 Runtime 聚合接口。
- `graph_runtime.py`：可选 LangGraph 编排层，当前只包裹后端意图识别链路，不承载复杂业务规则。
- `backend_core.py`：后端核心逻辑，包括意图校验、结构化记忆存储和候选记忆决策。
- `intent.schema.json`：`/api/intent` 的最小契约，约束 LangGraph 与原后端 LLM 路径共用的输出口径。
- `feedback-memory.schema.json`：反馈与候选记忆决策的 alpha 契约。
- `runtime.schema.json`：薄层 `POST /api/runtime` 状态流转与响应契约。
- `tests.js`：无依赖前端核心回归测试。
- `test_backend_core.py`：后端逻辑单测，采用 `pytest` 风格。
- `test_graph_runtime.py`：LangGraph 编排节点的轻量单测，验证可用性状态和节点复用现有校验逻辑。
- `test_contract_schemas.py`：契约文件与 Runtime 状态转移表测试。
- `test_runtime_api.py`：薄层 Runtime API 行为测试。
- `DESIGN.md`：规划策略、工具调用和 V4 alpha 结构设计说明。
- `LANGGRAPH_INTEGRATION.md`：LangGraph 作为后端轻量编排层的接入边界说明。
- `DEMO_SCRIPT.md`：3 分钟比赛讲解稿。
- `progress.md`：当前阶段进度与验证状态。
- `lessons.md`：关键设计复盘与经验沉淀。
