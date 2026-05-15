# 美团闲时消费执行 Agent Demo

这是一个纯静态 Web Demo，用 Mock 美团工具展示“周末吃喝玩乐一键安排”的执行闭环。项目不接入真实美团接口，不做真实支付、真实下单或真实消息发送。

赛题边界：不要求接入真实商家、真实地图、真实餐厅库存、真实支付/预约系统，也不要求爬取实时数据。本 Demo 的数据、状态和工具结果均为本地 Mock，用于验证 Agent 的规划、风险判断、确认和模拟执行闭环。

核心链路：

1. 用户输入一句自然语言生活目标。
2. Planner / Orchestrator 识别时间、同行关系、人数、偏好、预算、距离和体力限制。
3. 信息不足时先追问，不默认亲子、朋友或情侣。
4. Researchers 以逻辑并行研究通道组织 Mock 工具：天气路线、活动、餐厅、订座排队团购。
5. Merger 生成 2-3 个候选服务包，并推荐最稳方案。
6. Verifier 检查时间、距离、预算、预约可用性和高影响动作确认。
7. Revise 在下雨、餐厅满座、孩子累了或预算太高时触发重排。
8. 用户确认后，模拟执行订座、排队、买票、买团购、下单加购、发消息和提醒。

`agentLoopTrace` 是轻量可解释编排：底层仍是单 Orchestrator + 本地 Mock Tools，不做真实多 Agent 并发，不接入真实美团 API。

## 下一阶段路线图

当前 V3 仍是纯静态 Web Demo，不包含后端、真实大模型调用、真实美团接口或真实交易能力。下一阶段 V4 的目标是升级为轻量 Agent Runtime，用真实 LLM 提升自然语言泛化能力，同时保留本地规则校验、追问和用户确认。

V4 计划只参考 Claude Code、Codex、Cursor 等公开产品形态中的通用 Agent 思想，例如任务循环、工具调用、权限确认、记忆、Trace、复盘和子任务拆解；不使用任何非官方泄露源码，也不直接引入重型多 Agent 框架。

推荐方向：

- 新增 Python/FastAPI 后端，用 `/api/intent` 封装真实 LLM 意图识别。
- 定义 `intent.schema.json`，约束场景、人数、时间、预算、偏好、缺失字段和置信度。
- 保留当前规则解析作为失败兜底，并用 `IntentValidator` 做 schema 校验、默认值补全和冲突检测。
- 新增 `/api/feedback` 和 `/api/memory-candidates/{id}/decision`，反馈先生成记忆候选，用户采用/忽略/更正后才长期生效。
- SQLite 是结构化事实库，JSON 是前后端交换格式，JSONL 是审计日志，Vector DB 仅作为后续语义检索增强。
- 默认只保存 L0/L1 抽象偏好；L2/L3 高敏感信息不进长期记忆。
- Agent Loop Trace 扩展为 `Understand -> Ask -> Research -> Plan -> Verify -> Execute -> Reflect`。
- “自进化”仅表示自动总结经验、下次检索参考、降低重复错误概率；不表示自动改代码，也不承诺永不犯错。

V4 后端运行：

```powershell
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

启动后访问 `http://127.0.0.1:8000/`。如果未配置 `OPENAI_API_KEY` 或后端不可用，前端会自动回退本地规则解析。

比赛冲刺版新增展示重点：

- 用户首屏聚焦自然语言目标输入，不直接展示评审硬指标或 Mock 边界。
- 讲解材料保留硬指标：方案生成 <30s、Mock 工具响应 <3s、端到端演示 <2min、异常覆盖 6 类。
- Researchers 阶段用逻辑 DAG 泳道展示天气/路线、活动/票务、餐厅/订座、团购/加购、通知/提醒。
- 动态重排覆盖下雨、餐厅满座、活动无票、人数变化、孩子累了、预算太高。
- 确认执行后生成 Mock 分享卡片，模拟发给老婆/朋友群。

## 运行方式

直接用浏览器打开：

```text
C:\Users\yuzupoon\Desktop\LocalLifeAgent\index.html
```

也可以启动一个本地静态服务：

```powershell
npx http-server .
```

本项目没有运行时依赖。`npx http-server` 只是可选的浏览器访问方式。

## 验证方式

使用 Node 运行核心逻辑回归：

```powershell
npm test
```

验证覆盖：

- 朋友局、亲子局、家人/长辈局、情侣局、独自探索、同事局。
- 信息不足追问和约束冲突替代方案。
- 餐厅无座后的备选替换。
- 闲时错峰推荐、优惠和预算指标。
- 下雨、餐厅满座、孩子累了、预算太高四类动态重排。
- 活动无票、人数变化两类比赛现场异常演示。
- 团购、订座、排队和人工确认动作不得伪造成成功。
- `agentLoopTrace` 五阶段和 Researchers 逻辑 DAG 泳道。

## 文件说明

- `index.html`：Web Demo 页面结构。
- `styles.css`：执行驾驶舱样式。
- `app.js`：页面交互、Agent Loop Trace、追问状态、重排事件、方案选择和执行队列展示。
- `agent-core.js`：自然语言解析、Mock 美团工具、轻量编排 trace、规划评分、服务包生成和执行模拟核心。
- `tests.js`：无依赖回归测试。
- `DESIGN.md`：规划策略和工具调用设计说明。
- `DEMO_SCRIPT.md`：3 分钟比赛讲解稿。
