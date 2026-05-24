# 进度记录

## 当前阶段

当前项目处于“V3 比赛主链路稳定化 + V4 alpha 增强能力已部分落地”的阶段。

更具体地说：

- 比赛主链路仍然是本地 Mock 驱动的执行型 Web Demo。
- 与旧文档不同，仓库里已经实际落地了可选后端增强、意图识别、反馈复盘和结构化记忆链路。
- 因此当前状态不能再表述为“只有纯静态前端、V4 仍完全未实现”。

## 歧义点梳理

在本次核对前，项目状态存在这些歧义：

1. `README.md` 和 `progress.md` 把当前项目写成“纯静态 V3，V4 仅为路线图”。
2. 代码中实际上已经存在可选后端、意图识别、反馈复盘和候选记忆决策链路。
3. 前端已经真实调用可选后端增强，并提供反馈写入与候选记忆决策 UI。
4. `agent-core.js` 的 trace 已经包含 `Reflect` 阶段，不再只是早期五阶段展示。

## 候选解释与判断

### 路径 A：按旧文档理解为“当前仍只有 V3 静态版”

优点：

- 对比赛讲解最简单。
- 不会让外部误以为已经接入真实平台能力。

缺点：

- 与仓库代码事实不一致。
- 后续维护者会误判哪些能力已经落地。

### 路径 B：把当前状态改写为“已经完成 V4”

优点：

- 能体现后端、意图识别和记忆闭环已经开始落地。

缺点：

- 会夸大成熟度。
- 当前已补最小 `/api/intent` 契约文件，但仍缺少完整反馈/记忆契约、完整后端测试环境和更稳定的状态机实现。

### 路径 C：明确区分“V3 主链路”和“V4 alpha 已落地能力”

优点：

- 与代码现状一致。
- 既不低估现有实现，也不把实验性能力伪装成完整 Runtime。
- 最利于后续继续演进和回滚。

缺点：

- 文档表述会比单一句话更复杂一些。

当前采用：路径 C。

## 当前已实现

### 比赛主链路

- 静态 Web Demo 可独立运行。
- 本地 Mock Tools 驱动天气、活动、餐厅、路线、票务、订座、团购、通知和提醒。
- 候选服务包生成、推荐、执行队列和高影响动作确认已完成。
- 动态重排覆盖下雨、餐厅满座、活动无票、人数变化、孩子累了、预算太高。

### 可解释编排

- `agentLoopTrace` 已包含：
  - `understand`
  - `planner`
  - `researchers`
  - `merger`
  - `verifier`
  - `revise`
  - `reflect`
- 信息不足时会停在追问，而不是伪造工具调用。

### V4 alpha 已落地能力

- 可选后端增强。
- 意图识别入口。
- 反馈复盘入口。
- 结构化记忆存储。
- 审计日志写入。
- 前端反馈面板和 `Reflect` 阶段展示。
- 可选 LangGraph 意图识别编排层，当前包裹 `load_lessons -> build_payload -> call_llm -> validate_intent`。
- 最小 `/api/intent` 契约文件 `intent.schema.json`，约束请求、成功响应、错误响应和标准化 `intent` 字段。
- 后端不可用时自动回退本地规则解析。

## 当前未完成

- 还没有完整反馈、记忆和 Runtime 状态机契约；当前只补齐了 `/api/intent` 的最小契约。
- 还没有把前端当前的增强式接入完全收敛成完整状态机式 Runtime；当前 LangGraph 只覆盖后端意图识别链路。
- 还没有完整跑通后端自动化单测环境。
- 还没有做浏览器侧完整人工回归记录。

## 2026-05-18 LangGraph 轻量接入

目标：在不破坏现有 Web Demo 和后端接口的前提下，把文档中的 LangGraph 轻量编排路线落到一个最小可回滚代码切片。

执行结果：

- 新增 `graph_runtime.py`，用 LangGraph `StateGraph` 串起后端意图识别链路。
- `/api/intent` 在 `OPENAI_API_KEY` 已配置时优先尝试 LangGraph 编排。
- 如果环境未安装 LangGraph，会自动降级到原有后端 LLM 调用路径。
- LangGraph 与原后端 LLM 成功路径统一返回 `source: "llm"` 和同一份 `intent` 结构，并通过 `runtimePath` 区分 `langgraph` 与 `direct_llm`。
- `/api/health` 增加 `langGraph` 状态，用于确认当前运行环境是否具备 LangGraph 能力。
- 新增 `test_graph_runtime.py`，验证编排层状态输出和节点复用现有校验逻辑。
- `requirements.txt` 增加 `langgraph>=0.2,<1`。

## 2026-05-19 `/api/intent` 最小契约补齐

目标：让 LangGraph 路径和原后端 LLM fallback 路径在前端消费时保持一致，避免成功结果因为 `source` 差异被误判为本地规则兜底。

执行结果：

- 新增 `intent.schema.json`，定义 `/api/intent` 请求、成功响应、错误响应、标准化 `intent` 字段和 `lessonsUsed` 的最小结构。
- LangGraph 成功路径改为返回 `source: "llm"`、`runtimePath: "langgraph"`。
- 原后端 LLM 成功路径返回 `source: "llm"`、`runtimePath: "direct_llm"`。
- 错误分支统一包含 `ok`、`source`、`runtimePath`、`intent: null`、`error` 和 `lessonsUsed`，其中缺少密钥时 `runtimePath` 为 `null`。

风险边界：

- 本次没有改变意图识别算法、prompt、校验器枚举或前端规划主链路。
- 本次契约只覆盖 `/api/intent`，不代表反馈、记忆和完整 Runtime 契约已经完成。

风险边界：

- 本次没有迁移前端主规划链路。
- 本次没有把 Mock API、POI 检索、候选方案、执行队列全部改成 LangGraph 节点。
- LangGraph 节点只做流程推进和状态传递，复杂业务规则仍保留在 `backend_core.py`。

## 2026-05-18 Mock/API/LLM 边界决策

本次围绕“全 Mock”“任意城市真实地点名”“真实 LLM”“现场随机输入”和“是否引入 LangGraph”做了边界收口。

已澄清的核心边界：

1. 外部执行动作全部走 Mock API。
2. 实时营业、排队、余位、距离、路况、可预约状态也全部由 Mock API 返回。
3. 真实能力只放在地点候选层：本地真实 POI 种子库 + LLM 补全 + 可行性校验。
4. LangGraph 只做轻量编排，核心业务逻辑自研。

已选择的产品化范围：

1. 热门城市 POI 种子库覆盖 30 个以上城市。
2. 每个城市、每类地点准备 5 个以上真实 POI。
3. 冷门城市 fallback 展示置信度、来源和替代推荐。
4. Mock API 配置完整失败率、超时、重试和降级策略。
5. Web UI 接近产品级，包含筛选、地图感、详情页和多轮修改。

风险提示：

- 该路线完成度高，但 1 个月内成本偏高。
- 数据整理和 UI 细节不能挤压核心 Agent 闭环。
- Mock API 的失败率和超时必须可配置、可复现，不能让现场演示随机失控。

当前采用的工程解释：

- 执行动作全 Mock：订座、下单、排队、买票、发消息、提醒不触达真实平台。
- 地点候选尽量真实：采用本地真实 POI 种子库 + LLM 补全 + 可行性校验。
- 实时类字段来自 Mock API：营业状态、距离、路况、余位、排队、预约结果均由 Mock API 返回。
- LLM 可用于理解和候选补全，但不能直接宣称完成真实平台动作。
- LangGraph 采用轻量编排方式引入：流程调度交给 LangGraph，核心业务逻辑自研；每个节点只做一件事，工具调用、Mock API、真实 API 和异常处理封装成独立 Tool。

目标技术栈口径：

```text
LangGraph + FastAPI + 本地 Mock 数据库 + 真实 LLM
```

地点候选三级策略：

1. 热门城市 POI 种子库：覆盖 30 个以上城市，至少包含北京、上海、广州、深圳、杭州、成都、重庆、南京、武汉、西安、苏州等。
2. 城市通用真实地点类型：商场、公园、博物馆、科技馆、儿童乐园、亲子餐厅、展览空间等，每城每类 5 个以上真实 POI。
3. 冷门城市 fallback：LLM 生成候选地点名，并在 UI 或日志中标记来源、置信度和替代推荐。

本次已同步更新：

- `README.md`
- `COMPETITION_BRIEF.md`
- `DESIGN.md`
- `progress.md`
- `lessons.md`

后续实现时应把地点和工具结果显式区分为 `seed_poi`、`llm_poi_candidate`、`mock_search_result`、`mock_realtime_field`、`mock_execution` 等类似语义，避免 UI 或讲解把 Mock API 字段误说成真实实时 API。

## 已执行验证

已执行：

```powershell
npm test
python -m py_compile .\server.py .\backend_core.py .\test_backend_core.py
```

结果：

- `npm test` 通过，输出 `All agent-core tests passed.`。
- Python 后端相关文件通过语法级检查。

未完成验证：

- `pytest test_backend_core.py`

未完成原因：

- 当前环境缺少 `pytest`，执行时返回 `No module named pytest`。

## 本次文档更新

已更新：

- `README.md`
- `progress.md`
- `DESIGN.md`
- `COMPETITION_BRIEF.md`
- `DEMO_SCRIPT.md`
- `lessons.md`

更新目标：

- 统一“比赛主链路”和“增强能力”的口径。
- 修正“V4 尚未实现任何代码”的过时说法。
- 去掉公开文档中的品牌化名称。
- 弱化过深的内部实现暴露。
- 明确“真实地点名”和“执行动作 Mock”的边界，避免把实时 API 能力讲过头。

## 剩余风险

- 对外讲解时如果只说“有后端增强、意图识别、记忆闭环”，仍可能让人误解为已经接入真实生活服务平台。
- 对外讲解时如果继续说“完全没有后端”，又会和仓库代码事实冲突。
- 后端测试目前只做了语法检查，功能级验证还不完整。
- 当前实现仍然以 Mock 业务闭环为主，不应夸大为成熟的线上可用 Agent Runtime。

## 公开历史评估

- 当前文档版本已经做了去品牌化和公开仓库收敛处理。
- 但这些内容如果曾经被推送到公开远程，历史提交里仍可能保留旧表述。
- 后续可选动作是单独评估是否需要清理 Git 历史、处理缓存或接受“仅当前版本已净化”的结果。

## 下一步建议

1. 如果目标是比赛交付，继续把讲解口径固定为“Mock 主链路 + 可选增强后端”，避免叙事漂移。
2. 如果目标是继续做 V4，优先补反馈/记忆契约说明和 `pytest` 环境。
3. 如果目标是提升公开仓库可信度，补一次浏览器人工回归，并评估是否要处理公开历史。

## Done When

- `README.md`、`progress.md`、`COMPETITION_BRIEF.md`、`DESIGN.md` 对当前状态的表述一致。
- 文档不再把当前状态误写成“完全没有后端”。
- 文档也不把当前状态夸大成“完整 V4 已完成”。
- 文档已去掉品牌化名称和过深的内部实现暴露。
- 前端和后端的验证状态分别被清楚记录。
