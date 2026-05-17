# 美团闲时消费执行 Agent Demo

这是一个以本地 Mock 数据为主的执行型 Agent Demo。默认可以作为静态 Web Demo 运行，用 Mock 美团工具展示“周末吃喝玩乐一键安排”的执行闭环；仓库中也已经包含一套可选的 FastAPI 后端，用于实验性接入 LLM 意图识别、反馈复盘和 SQLite 记忆闭环。

项目不接入真实美团接口，不做真实支付、真实下单或真实消息发送。

## 赛题边界

- 不要求接入真实商家、真实地图、真实餐厅库存、真实支付/预约系统。
- 不要求爬取实时数据。
- Demo 中的天气、路线、活动、餐厅、票务、订座、团购、通知和提醒结果均为本地 Mock。
- 高影响动作只做模拟执行，不做真实交易。

## 核心链路

1. 用户输入一句自然语言生活目标。
2. Planner / Orchestrator 识别时间、同行关系、人数、偏好、预算、距离和体力限制。
3. 信息不足时先追问，不默认亲子、朋友或情侣。
4. Researchers 以逻辑并行研究通道组织 Mock 工具：天气路线、活动、餐厅、订座排队团购。
5. Merger 生成 2-3 个候选服务包，并推荐最稳方案。
6. Verifier 检查时间、距离、预算、预约可用性和高影响动作确认。
7. Revise 在下雨、餐厅满座、孩子累了、预算太高、活动无票或人数变化时触发重排。
8. 用户确认后，模拟执行订座、排队、买票、买团购、下单加购、发消息和提醒。

`agentLoopTrace` 是轻量可解释编排。核心规划底层仍是单 Orchestrator + 本地 Mock Tools，不做真实多 Agent 并发，不接入真实美团 API。

## 当前状态

当前项目更准确的状态是“V3 比赛主链路 + 已落地的 V4 alpha 实验能力”：

- 比赛主链路仍然是本地 Mock Demo，核心规划、候选方案、重排和执行队列都由前端 `agent-core.js` 完成。
- 仓库中已经落地可选后端：`FastAPI`、`/api/health`、`/api/intent`、`/api/feedback`、`/api/memory-candidates/{id}/decision`。
- 前端已经接入可选后端。如果后端可用且配置了 `OPENAI_API_KEY`，会优先调用 `/api/intent`；如果后端不可用、未配置密钥或置信度不足，会自动回退到本地规则解析。
- SQLite 记忆链路已经存在：`feedback_events`、`memory_candidates`、`memories`、`memory_usage_events`。
- UI 已显示 `Reflect` 阶段和反馈面板，支持用户提交反馈、采用/忽略候选记忆。

这意味着：

- 不能再把仓库现状表述为“完全没有后端、完全没有 LLM/记忆能力”。
- 也不能把当前状态说成“已经完成 V4 Runtime”。
- 更准确的说法是：比赛可演示主链路仍以静态 Mock 为主，后端与记忆闭环属于已落地但仍在收敛中的增强能力。

## 下一阶段路线图

下一阶段目标不是引入重型多 Agent 框架，也不是依赖任何非官方泄露源码，而是在现有基础上把可选后端能力继续收敛成更稳定的轻量 Agent Runtime。

已经落地：

- Python/FastAPI 后端。
- `/api/intent` 意图识别入口。
- `/api/feedback` 和 `/api/memory-candidates/{id}/decision` 反馈复盘入口。
- SQLite 事实库和 JSONL 审计日志。
- 前端 `Reflect` 阶段与反馈 UI。
- 后端失败时的本地规则兜底。

仍待补全：

- `intent.schema.json` 等更清晰的契约文件。
- 更明确的 `IntentValidator` 和状态机边界，而不只是前端当前的增强式接入。
- 更完整的后端测试环境和自动化验证。
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

这种方式不依赖后端。前端若无法访问 `/api/intent`，会自动回退到本地规则解析。

### 2. 运行可选后端增强链路

```powershell
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

启动后访问 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。

如果未配置 `OPENAI_API_KEY`，`/api/intent` 会返回缺少密钥，前端继续回退到本地规则解析；`/api/feedback` 和记忆候选接口仍可独立使用本地 SQLite。

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
python -m py_compile .\server.py .\backend_core.py .\test_backend_core.py
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

当前已确认：

- `npm test` 可通过。
- Python 后端文件可以做语法级检查。
- `test_backend_core.py` 采用 `pytest` 风格；如果环境里未安装 `pytest`，则暂时无法执行完整后端单测。

## 文件说明

- `index.html`：Web Demo 页面结构。
- `styles.css`：执行驾驶舱样式。
- `app.js`：页面交互、Agent Loop Trace、追问状态、重排事件、方案选择、执行队列和反馈面板展示。
- `agent-core.js`：自然语言解析、Mock 美团工具、轻量编排 trace、规划评分、服务包生成和执行模拟核心。
- `server.py`：可选 FastAPI 入口，负责静态资源挂载、LLM 意图识别和反馈记忆接口。
- `backend_core.py`：后端核心逻辑，包括意图校验、SQLite 记忆存储和候选记忆决策。
- `tests.js`：无依赖前端核心回归测试。
- `test_backend_core.py`：后端逻辑单测，采用 `pytest` 风格。
- `DESIGN.md`：规划策略、工具调用和 V4 alpha 结构设计说明。
- `DEMO_SCRIPT.md`：3 分钟比赛讲解稿。
- `progress.md`：当前阶段进度与验证状态。
- `lessons.md`：关键设计复盘与经验沉淀。
