# 设计文档：本地生活执行 Agent

## 1. 问题理解

赛题核心不是“推荐去哪玩”，而是把一句模糊的周末需求变成可执行、可确认、可兜底的本地生活服务包。

当前项目需要同时满足两件事：

1. 比赛主链路要稳定、可解释、可演示。
2. 后续演进路线要能平滑过渡到更真实的 Agent Runtime，而不是推倒重来。

对外统一定位为“本地生活执行 Agent”。当前按产品原型推进，商业化叙事暂不展开；此阶段只讲执行闭环，不承诺收费模型、商户分成、真实交易或真实平台接入。

因此本项目采用“主链路保守、增强链路渐进”的设计。

## 2. 当前架构分层

### 2.1 比赛主链路

比赛主链路仍以本地前端编排为主：

```text
User Input
  -> agent-core.js
  -> Mock Tools
  -> Candidate Plans
  -> Execution Queue
```

这条链路的特点是：

- 不依赖真实平台。
- 不依赖后端即可运行。
- 适合现场演示和兜底。

### 2.2 已落地的增强链路

仓库中已经存在一条可选增强链路：

```text
User Input
  -> 前端交互层
  -> 可选后端增强
  -> 意图识别与校验
  -> agent-core.js planRequest()
  -> 反馈复盘与候选记忆流
```

这条链路的特点是：

- 如果后端可用，会增强意图识别与复盘能力。
- 如果后端不可用，会自动回退到本地规则。
- 它已经存在，但还不应被表述成“完整 V4 Runtime”。

## 3. 比赛主链路设计

### 3.1 规划骨架

当前 UI 展示的 `agentLoopTrace` 已经是：

```text
Understand -> Ask/Plan -> Research -> Merger -> Verifier -> Revise -> Reflect -> Confirm/Execute
```

其中真正决定方案生成的核心仍是单 Orchestrator + 本地 Mock Tools。

### 3.2 关键阶段职责

- `Understand`：展示理解来源、置信度、摘要和是否引用历史经验。
- `Planner`：抽取同行关系、时间、人数、偏好和冲突约束；普通模糊输入优先用可解释假设生成方案，安全或关键可执行性缺口再软追问或保守降级。
- `Researchers`：用逻辑 DAG 泳道展示天气/路线、活动/票务、餐厅/订座、团购/加购、通知/提醒等 Mock 查证。
- `Merger`：合成多个可执行服务包，选择综合分最高且风险最低的推荐方案。
- `Verifier`：检查时间、距离、预算、预约可用性和高影响动作确认。
- `Revise`：处理下雨、餐厅满座、活动无票、人数变化、孩子累了、预算太高等异常重排。
- `Reflect`：承接用户纠错、方案不满意或工具失败后的复盘入口。
- `Confirm/Execute`：只在用户确认后模拟执行高影响动作。

### 3.3 主链路最终架构

比赛主链路确定保留单 Orchestrator + Mock Tools。

前端 `agent-core.js` 继续负责自然语言规则兜底、Mock 工具调用、候选服务包生成、方案评分、动态重排和执行队列。后端增强链路只提供意图识别、反馈复盘、结构化记忆和后续 LangGraph 编排能力，不接管主链路规划。

这样做的目标是保证演示链路稳定、可解释、可回滚，同时让后端增强能力可以渐进演进。

## 4. Mock 工具与数据设计

核心工具集中在 `agent-core.js`：

- `get_weather(location, time_range)`：返回天气、温度、户外适配和风险。
- `search_activities(location, time_range, group_profile, preferences)`：返回活动候选、票量、适龄和人群标签。
- `search_restaurants(location, party_size, group_profile, preferences)`：返回餐厅、排队、订座、桌型和餐饮偏好。
- `check_route(origin, destination, transport_mode)`：返回距离、耗时和交通方式。
- `check_availability(target_id, time, party_size)`：检查票量、座位、时段和异常状态。

Mock 数据保留可解释字段，例如：

- 儿童友好
- 低负担餐
- 聊天适配
- 座位容量
- 票量库存
- 可预约时段

这样做的原因是：

- 便于演示 Agent 不是硬编码推荐文案。
- 便于回归测试验证约束和兜底是否生效。
- 便于未来把 Mock Tools 平滑替换成真实 API 适配层。

### 4.1 地点数据与实时字段边界

本项目存在一个必须明确的工程矛盾：比赛希望“全 Mock”以保证稳定，又希望“任意城市给出真实地点名”以提升现场真实感。当前选择不是把所有内容都伪装成真实 API，而是分层处理。

候选路径：

| 路径 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 严格全 Mock | 地点、营业时间、排队和执行结果都由本地 Mock 生成 | 最稳定、最可控 | 任意城市真实地点名较弱，现场容易显得假 |
| 真实地点 API + Mock 执行动作 | 地点搜索接真实地图/生活服务 API，订座下单等执行动作 Mock | 地点真实性最强 | API Key、限流、网络和超时会增加现场风险，也偏离全 Mock 口径 |
| 本地真实 POI 种子库 + LLM 补全 + Mock API | 地点名尽量真实，实时类字段和执行动作全部由 Mock API 返回 | 稳定性、真实感和可解释性较均衡 | 不能承诺营业时间、距离、排队等实时准确 |

当前采用第三种路径。

边界定义：

- 地点名候选：优先由本地真实 POI 种子库提供，缺口由真实 LLM 补全，后续可替换为真实 API 适配层。
- 实时类字段：营业状态、距离、路况、余位、排队、可预约状态统一由 Mock API 返回。
- 执行动作：订座、下单、发消息、提醒、买票、团购统一由 Mock API 模拟执行。
- 降级策略：无法确认真实地点名时，不编造“来自真实 API”的证据；应返回类型化候选，并在 UI 或日志中标记为“模拟检索结果”。

这种边界保证 Demo 能承受现场随机输入，同时不把实验性能力包装成已接入真实生活服务平台。

### 4.2 POI 候选生成策略

地点候选采用三级策略：

1. 热门城市 POI 种子库：覆盖北京、上海、广州、深圳、杭州、成都、重庆、南京、武汉、西安、苏州等高概率演示城市。
2. 城市通用真实地点类型：每个城市至少支持商场、公园、博物馆、科技馆、儿童乐园、亲子餐厅、展览空间等类型化候选。
3. 冷门城市 fallback：由 LLM 生成候选地点名，再经过类型、时间窗、同行关系和风险规则校验；无法校验为真实 POI 时，标记为“模拟检索结果”。

可行性校验至少检查：

- 是否匹配用户同行关系，例如亲子、朋友、情侣、长辈或同事。
- 是否匹配活动时长、距离偏好和预算。
- 是否存在明显不合理的时间安排。
- 是否需要把结果降级为类型化候选。

### 4.3 Mock API 字段边界

以下字段不来自真实地图、真实商家库存或真实预约平台，而是由 Mock API 生成：

- 实时营业状态。
- 距离和路线耗时。
- 排队情况。
- 余位和可预约状态。
- 票量和活动可用性。
- 预约、下单、排队、买票、团购、消息和提醒执行结果。

Mock API 可以模拟失败、超时、无结果、满座、无票和需要人工确认，但这些状态都是可控演示数据，不代表真实平台状态。

### 4.4 产品化目标范围

已明确采用偏产品化方案，而不是最小比赛稳态。

产品化目标：

- 热门城市 POI 种子库覆盖 30 个以上城市。
- 每个城市、每类地点准备 5 个以上真实 POI。
- fallback 带置信度、来源和替代推荐。
- Mock API 支持完整失败率、超时、重试和降级策略配置。
- UI 接近产品级，包含筛选、地图感、详情页和多轮修改。

优势：

- 完成度更高，现场更像真实产品。
- 更能支撑任意城市输入和评审追问。
- 更容易展示 LangGraph + Tool + Mock API 的工程化能力。

风险：

- 1 个月内成本偏高。
- 数据整理和 UI 细节容易挤压核心 Agent 闭环。
- 需要优先保证主链路稳定，不应为了扩大 POI 和 UI 细节牺牲端到端可演示性。

### 4.5 LLM 使用边界

真实 LLM 可以用于：

- 自然语言意图识别。
- 城市和区域理解。
- 地点名候选补全。
- 输出表达润色。

真实 LLM 不应直接决定：

- 高影响执行动作是否成功。
- 真实库存、真实排队、真实营业时间或真实距离。
- 是否已经完成真实预约、下单或消息发送。

所有 LLM 输出都应经过本地 schema/规则校验；置信度不足、字段缺失或存在冲突时，回退到追问或本地规则兜底。

## 5. 规则规划与异常兜底

规划采用“硬约束过滤 + 软约束打分”：

- 硬约束：时间窗、距离、同行人群、票量/座位、营业时间、高影响动作确认。
- 软约束：少排队、低体力、低预算、亲子/长辈/朋友适配、室内外偏好、拍照和聊天体验。
- 输出解释：每个方案展示评分维度、推荐理由、风险提示和可替换节点。

异常机制覆盖：

| 异常 | 检测逻辑 | 兜底动作 |
| --- | --- | --- |
| 下雨 | 天气 Mock 返回户外不适合 | 优先室内活动并重算路线 |
| 餐厅满座 | 订座 Mock 返回不可用 | 替换同商圈可订座餐厅 |
| 活动无票 | 票务 Mock 返回无票/限流 | 替换同人群、同半径活动 |
| 人数变化 | 重排事件改变 `partySize` | 重新检查票量、座位和预算 |
| 孩子累了 | 触发低体力重排 | 降低距离和活动强度 |
| 预算太高 | 触发预算重排 | 选择低价活动和更高优惠套餐 |

## 6. V4 alpha 已落地部分

当前已经存在但仍属于增强链路的能力包括：

- 可选后端增强入口。
- 意图识别与基础校验。
- 反馈复盘与候选记忆确认。
- 结构化记忆与审计日志。

### 6.1 后端职责

当前后端主要负责：

- 调用真实 LLM 做结构化意图识别。
- 对意图做基础归一化与字段校验。
- 保存反馈事件。
- 生成候选记忆。
- 支持用户采用、忽略或更正候选记忆。
- 保存长期结构化记忆。
- 记录审计事件。

### 6.2 前后端协作方式

当前不是“后端全权规划”，而是：

1. 前端优先尝试调用可选后端增强。
2. 如果后端成功且置信度足够，用返回结果增强前端规划输入。
3. 如果后端失败、缺密钥或低置信度，前端直接回退本地规则。
4. 用户在前端提交反馈时，再调用后端写入反馈与候选记忆。

这种方式的优点：

- 不会破坏现有比赛主链路。
- 增强能力可渐进接入。
- 失败时有明确兜底。

它的不足：

- 当前契约还不够清晰。
- 设计上还属于 alpha 过渡形态。

### 6.3 LangGraph 轻量编排边界

当前已引入可选 LangGraph 作为 Python 后端 V4 alpha 的轻量编排层，现阶段主要包裹 `/api/intent` 的意图识别和校验；反馈复盘、候选记忆和候选记忆决策仍沿用现有后端逻辑，后续再逐步纳入图编排。

LangGraph 不替代 `agent-core.js`，不接管 Mock Tools、方案评分、动态重排、执行队列、高影响动作确认和记忆敏感信息规则。LangGraph trace 只保留在后端日志或审计记录中，不映射到前端 `agentLoopTrace`。当前仓库已包含最小接入代码与依赖声明，具体边界见 `LANGGRAPH_INTEGRATION.md`。

## 7. 记忆闭环设计

当前记忆体系不是“直接把聊天都存起来”，而是候选确认流：

```text
反馈 / 纠错
  -> 反馈记录
  -> 候选提取
  -> 候选待确认
  -> 用户 adopt / ignore / correct
  -> 长期记忆
  -> 下次规划前检索参考
```

结构化记忆分层：

- 原始反馈日志。
- 待确认候选。
- 用户采用后的长期结构化记忆。
- 记忆引用记录。

### 敏感分级

| 级别 | 示例 | 默认处理 |
| --- | --- | --- |
| L0 普通偏好 | 喜欢慢节奏、少排队、偏好地铁 | 可以进入长期记忆 |
| L1 弱敏感偏好 | 预算敏感、带孩子、常从某城市出发 | 保存概括版，避免过细 |
| L2 高敏感信息 | 具体住址、身份信息、联系方式、交易标识、儿童姓名生日 | 默认不进长期记忆 |
| L3 特殊敏感信息 | 疾病、宗教饮食、政治/身份属性、精确实时位置、支付信息 | 默认不保存 |

这样设计的原因是：

- 允许系统复盘经验。
- 又不把实验性记忆能力伪装成无边界的“永久记住一切”。
- 保留用户确认、可审查和可回滚能力。

## 8. 最终架构结论

### 8.1 LangGraph 的当前结论

基于 1 个月开发周期、Web UI、现场随机输入、可接真实 LLM、执行动作仍需 Mock 的约束，当前路线是 LangGraph 轻量编排 + 业务逻辑自研，但落点限定在 V4 alpha 后端增强链路。

仓库已经包含 `graph_runtime.py`、`intent.schema.json` 和 `test_graph_runtime.py`。`/api/intent` 在依赖可用并配置密钥后优先走 LangGraph 意图识别节点；失败、不可用或低置信度时保留原后端 LLM / 本地规则兜底。LangGraph 目前只包裹意图识别和校验，不接管主链路规划、Mock Tools、评分、重排或执行队列。

目标技术栈：

```text
LangGraph + FastAPI + 本地 Mock 数据库 + 真实 LLM
```

后续推荐节点：

```text
IntentExtractor
  -> IntentValidator
  -> ConstraintBuilder
  -> PoiCandidateProvider
  -> ToolRegistry
  -> Planner
  -> Verifier
  -> Revise
  -> MockExecutor
  -> Reflector
```

原则：

- 业务逻辑留在清晰函数和工具层，不塞进框架魔法。
- LangGraph 节点只做编排和状态推进，不直接写复杂业务规则。
- FastAPI 负责对外接口和本地 Web UI 调用。
- 本地 Mock 数据库负责 POI 种子、Mock 工具结果、审计日志和可复现测试数据。
- 真实 LLM 负责意图理解、地点候选补全和表达生成，但输出必须经过本地校验。
- 保持当前 Web Demo 可独立运行；后端/LLM/LangGraph 能力需要有降级路径，不能成为现场单点风险。

### 8.2 产品化范围决策

候选路径对比：

| 路径 | 范围 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 最小比赛稳态 | 8-10 城市、每类 2 个 POI、固定异常、演示级 UI | 最快、风险最低 | 数据薄，随机城市和产品感较弱 |
| 平衡方案 | 12 城市、每类 3 个 POI、可控异常、比赛演示级 + 主链路产品感 | 稳定性和真实感平衡 | 完成度不如真实产品 |
| 偏产品化方案 | 30+ 城市、每类 5+ POI、置信度/来源/fallback、完整 Mock API 配置、接近产品级 UI | 完成度最高，最像真实产品 | 1 个月内成本高，容易挤压核心 Agent 闭环 |

当前选择：按轻量里程碑推进，而不是一次性把偏产品化范围全部作为当前交付标准。

里程碑口径：

- Demo：稳定展示本地 Mock 主链路和模拟执行闭环。
- Alpha：补齐契约、低置信度 Runtime 降级、请求互斥、记忆引用记录说明和基础测试。
- Beta：推进 V4 Product-grade Headless Runtime，以及 V5 Generative UI、本地真实协同状态、执行队列和可回滚方案分支。

30+ 城市、每类 5+ POI、完整 Mock API 配置和接近产品级 UI 保留为 Beta 方向。

执行原则：

- 先保证已接入的 LangGraph 意图识别编排、Mock API、POI 数据、候选方案和执行队列端到端跑通。
- 再扩充 30+ 城市和每类 5+ POI。
- UI 产品化优先服务主链路，不做与核心闭环无关的大范围装饰。
- Mock API 的失败率、超时和重试必须可配置、可复现，避免现场随机失控。

### 8.3 双层状态结论

当前项目采用“双层状态”：
- V3 主链路负责稳定演示，保持本地 Mock 驱动、单 Orchestrator 编排和前端独立可运行。
- V4 alpha 后端增强负责意图识别、反馈复盘、结构化记忆、可选 LangGraph 意图识别编排和薄层 `POST /api/runtime` 状态聚合。当前代码实现是无状态薄聚合，不持久化 session，也不校验完整状态连续性。
- V4 轻量补齐方向是让 Runtime 自身判断低置信度意图，并返回可恢复降级状态；`feedback` 和 `memoryDecision` 两项能力都保留，但同一请求只能出现一个字段。两个字段同时出现时，即使其中一个为 `null`，也返回可恢复的 `mutually_exclusive_operations`。
- V4 Runtime P0 目标是轻量、持久化的 headless 状态机：后端持久化 session、通过 Transition Engine 校验状态转移，但本阶段不承诺接管完整规划。V5 不运行 Runtime 状态机。

这个结论与当前代码事实一致：项目既不是纯静态 V3，也不是已经完成的完整 V4 Runtime。对外讲解和后续实现都应持续保持这条边界。

状态转移唯一事实源是 `runtime-state-machine.json`；`runtime.schema.json`、文档表格和测试矩阵都是生成或校验产物，CI 必须检查漂移。

当前 `MemoryUsageEvent` 只定义为“记忆引用记录”，不是完整审计记录。后续轻量数据库改动可以给 `memory_usage_events` 增加 `priority_rule` 字段，默认值为 `current_request_overrides_memory`，并补充保存 memory usage 时写入该字段的测试。

### 8.4 V5 Generative UI 与协同执行边界

后续 V5 方向不应把 UI 卡片协议强行塞进 `runtime.schema.json` 主结构。新的边界是：

```text
UI Contract
  管卡片、时间轴、按钮、Banner、微调组件和分享页展示数据

Runtime / Execution
  管状态、审计、动作流转和执行生命周期

Shared Contract
  统一状态枚举、审计事件类型、ID 和 Mock 边界说明
```

V5 P0 首版范围重新冻结为 Generative UI + UI Contract + fallback + 本地真实协同 + 模拟执行生命周期 + 正式但轻量的 Plan Branch 生命周期。真实的是本地 API、SQLite 状态、分享页、反馈回流、execution / step 状态、plan branch 状态和 audit；模拟的是外部执行结果。P0 不触达真实商家、支付、订座、消息平台，不做公网分享、真实登录态、真实外部协作者，也不引入复杂版本树、局部合并、多级冲突解决或长期权限系统。当前新版 UI 的事实源就是仓库内 `index.html` / `app.js`；新版 UI 是 V5 P0 的视觉与交互基线，但不是后端范围无约束扩大的理由。

关键决策：

- 后端返回 JSON，前端渲染 Generative UI 卡片，不返回 HTML。
- 新增独立 `POST /api/generative-plan` 返回卡片、时间轴、按钮和 Banner，并成为 V5 前端规划入口；契约目标是后端真实规划、真实状态、严格错误恢复，而不是只做前端包装；不把 UI cards 嵌入 `/api/runtime`。
- 保留现有 `POST /api/runtime` 的 V4 alpha 薄聚合语义；V5 另行新增 `GET /api/runtime` 运行摘要契约草案，避免改旧接口。
- UI Contract 使用 `uiSchemaVersion` 和 `cardSchemaVersion` 双层版本。
- 版本兼容契约已经冻结，详见 `V5_VERSION_COMPATIBILITY_CONTRACT.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.VersionCompatibilityContract`、`$defs.VersionCompatibilityRules` 和 `x-versionCompatibilityContract`。
- 前端不再只看完整版本号，而是识别 `v5` 版本族；如果响应属于 `v5` 家族且最低 UI Contract 字段仍满足 schema，可按 P0 能力降级渲染。
- `requiredCapabilities` 必须全部支持才可渲染；不支持的 `optionalCapabilities` 可以忽略或合并降级。
- 未知 card type 不进入主链渲染，未知 action type 隐藏按钮且不执行，未知字段可保留但不能作为渲染或业务逻辑依赖。
- 响应采用 `cards + entities` 双层结构：`cards` 只负责展示，`entities`、`timeline`、`actions` 负责业务对象和交互目标。
- `ui-contract.schema.json` 采用全量严格 schema，约束顶层响应、卡片、实体、时间轴、动作、必填字段、枚举和引用格式。
- `entityRef` 表示卡片主要展示的数据对象，`targetRef` 表示按钮、反馈、刷新等动作要作用的目标。
- 状态采用 Shared 主状态 + UI 局部状态：主流程状态对齐 Shared Contract，卡片展示状态独立但不能覆盖主流程状态。
- 后端可返回 `summaryText`、`reasonText`、`riskText`，但不能只返回不可解析自然语言；前端负责布局和按钮。
- 每张卡最低统一 `id`、`type`、`status`、`title`、`summaryText`、`actions`、`entityRef` 或 `targetRef`、`meta`。
- 卡片流正式替代现有候选方案卡；旧候选方案卡退为调试 / 兼容视图。
- P0 卡片类型白名单已经冻结，详见 `V5_CARD_TYPE_WHITELIST.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.UICardType`、`$defs.KnownUICardType`、`$defs.CardTypeWhitelistContract` 和 `x-cardTypeWhitelist`。
- P0 轻量 MVP 主渲染链实现 10 类卡片：`plan_summary`、`assumption_banner`、`activity`、`restaurant`、`transport`、`timeline`、`soft_prompt`、`share_summary`、`feedback_summary`、`execution_summary`。
- `transport` 作为独立可操作卡进入主渲染链，但必须绑定两地点之间的 `routeSegmentId + fromRef + toRef`；它不是全局交通偏好卡。`risk_notice`、`collaboration_placeholder` 保留为兼容类型，不进入首版主渲染链。
- `execution_summary` 进入 P0 主渲染链，用于展示 `/api/executions` 的模拟执行生命周期摘要；`plan_summary` 可挂 `start_local_execution` 创建本地 execution，但不得调用真实外部预约、通知、支付、订座或商家系统。
- “发给家人朋友”进入 P0 本地真实协同：创建本地 share token / snapshot，分享页可查看方案快照并提交反馈，反馈保存到 SQLite 并回流到发起人页面；不要求公网访问、真实用户身份系统或外部消息发送。
- 旧候选方案卡、服务包和执行队列可以作为 fallback / debug / 兼容 / 模拟区；V5 P0 主体验仍是 UI Contract 卡片流。
- Timeline / Gantt 首版优先桌面端横向时间轴；移动端纵向时间块可作为后续降级形态。
- 默认展示卡片短句；原因、证据和风险详情通过展开区展示。
- 普通模糊输入直接生成完整路线，并通过 Assumption Banner 说明 Mock 用户画像推断。
- 极限模糊输入先生成可展开的路线意图卡，不承诺已经生成完整时间轴；用户点击后再展开完整方案。
- 缺失信息影响体验时，用 Assumption Banner 和微调组件解决；影响安全时，用 Soft Prompting，并默认降级到安全路线。
- “换一换”升级为活动、餐厅、交通的线性候选项切换器，不再随机替换。候选按当前编辑会话内的稳定顺序前后切换，预览时间、预算、时间线和风险差异；点击“采用这个”并通过校验后才修改 Main。
- Assumption Banner 中的人数、预算、区域可直接编辑；编辑后优先局部重排，影响过大再全量重排。
- 候选切换阶段不创建或覆盖方案快照；采用候选时才保存一次采用前快照，并提供一次撤销。用户可随时“恢复原方案”回到首次生成内容。
- 候选切换失败采用“保留当前候选 + 保留当前预览 + 不修改 Main”的策略；采用失败则保留原 Main，并展示时间、预算、风险或 schema 校验原因。
- P0 局部重排子集已经冻结，详见 `V5_P0_LOCAL_REPLAN_CONTRACT.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.P0LocalReplanContract`、`$defs.P0LocalReplanRequest`、`$defs.P0LocalReplanResponse` 和 `x-p0LocalReplanContract`。
- P0 不做完整 cascade engine，只做稳定候选列表、上一个 / 下一个、位置显示、差异预览、显式采用、恢复原方案和采用后一次撤销。
- P0 正式动作是 `preview_previous_candidate`、`preview_next_candidate`、`adopt_preview_candidate`、`restore_original_candidate`、`undo_candidate_adoption`；`refresh_block` 仅保留为旧 fixture / adapter 兼容入口，不能直接修改 Main，并且在用户亲自体验审查、明确批准删除前必须保留。
- 每个可替换区块维护候选列表、当前位置、原始候选、已采用候选和受影响时间线；首版每块最多 3-5 个候选，历史仅在当前编辑会话内保留。
- 每段交通额外维护 `routeSegmentId`、`fromRef/toRef`、候选交通列表、当前预览候选、时间与预算差异、拥堵/步行/换乘风险和受影响后续时间线；切换只预览，采用后才更新 Main。
- 未采用前不得修改 Main 或已保存快照；采用后必须重新校验时间、预算、风险和 schema。
- 协同进入 P0 的本地真实实现范围：本地 share token、plan snapshot、协作者反馈、read state、execution gate 和 audit 必须可保存、可查询、可回放。外部朋友 / 家人真实触达、外部消息平台和公网分享仍保持 Mock 边界。协同采用非对称模式：协作者只提交反馈，不直接修改主方案；Agent 基于反馈生成派生 Plan B 的能力不进入 P0 自动闭环。
- 协同反馈不会自动生成派生方案；必须由发起人点击“根据反馈生成新方案”后才生成。多个反馈冲突时按“偏好方向”聚类，保留反馈目标和协作者来源，派生方案首版最多 3 个；偏好聚类需要规则词典和优先级。
- 分享页采用 `shareId + token` 做最小访问控制；token 生命周期绑定 `SessionId` 有效期。采纳新 Main 后，旧分享页保留旧 Main 快照，顶部提示“已有新版本”，并提供查看新版本按钮；查看新版本复用原 token，但只能访问同一 `planLineageId` 下的新 Main。
- `expiresAt` 表示 share token 可提交反馈的截止时间；`SessionId` 有效且 `now <= expiresAt` 时可查看并提交反馈，`SessionId` 失效或过期后只展示旧快照，不能继续提交反馈。
- 分享状态 P0 进入 SQLite，覆盖 `shares`、`share_reviewers`、`share_feedback` 和 `audit_events` 的最小写入与读回；复杂权限、真实身份和公网访问不进入 P0。
- 分享页需要支持“已读但未反馈”状态；协同与执行关键事件进入 audit，包括 `share_created`、`share_viewed`、`feedback_created`、`feedback_updated`、`execution_created`、`execution_step_advanced`、`execution_step_skipped`、`execution_step_cancelled`、`execution_cancelled`、`regeneration_requested`、`regeneration_completed`、`regeneration_failed`；`payloadJson` 采用事件级 allowlist + 脱敏。
- Mock 的是外部朋友/家人真实参与；真实的是本地分享状态、反馈事件、分支方案和执行状态被保存并参与判断。用户 UI 可以不显眼标 Mock，但文档、讲解、审计和工程口径必须说明所有外部执行、实时字段和外部协作者都未触达真实平台。
- SQLite 最终采用多个数据库文件拆分，覆盖 profile、collaboration、plan、execution、audit；每个模块各自维护一张轻量 `schema_migrations`。P0 只要求 collaboration / execution / audit 的本地最小持久化，不做复杂 SQLite 多库迁移体系。
- `Mock_User_Profile` 明确放入 SQLite，并通过 Mock API 读取；数据结构支持多用户，但首版只启用 `mock_xiaoming`，推断来源使用 JSON 字段存储。
- 方案回放采用事件溯源 + 多版本 JSON 快照，在 plan 模块保留当前方案、旧 Main、派生分支和撤销点。
- V4/V5 P0 只冻结 `/api/executions`、Execution 引用、摘要事件和 UI 降级契约，不实现 task/step 生命周期。Execution 从 P1-A 开始实现 create/query/advance/cancel；P1-B 增加 Attempt、失败分类、有限重试和 planVersion 闸门；P1-C 再通过稳定 Adapter 与 Runtime 集成。Execution 使用独立状态枚举，只与 Runtime 共享命名规范、ID 规则和审计字段。
- Cancel 允许取消单个 step 和整个 execution；必须记录 `reason`、`actor`、`time`、`affectedSteps` 并写入 audit；P0 不做真实补偿动作。
- Skip 只允许低影响 step；高影响 step 不允许 skip，只能 retry、cancel 或重新生成方案。
- Regeneration 优先走 `/api/generative-plan`，携带当前 snapshot 和反馈摘要；保存 `regeneration event`、`feedbackIds`、`previousSnapshotId`、`lineage`；失败 fallback 到 `agent-core.js` adapter。
- Regeneration 生成 derived branch，并进入轻量 Plan Branch 生命周期。
- P0 支持 Main / Derived Branch、生成、查看、采纳、拒绝和回滚到上一个 Main；只允许一个当前 active main，derived branch 最多同时 3 个，状态为 `proposed`、`adopted`、`rejected`、`archived`。
- 采纳 derived branch 后，该 branch 成为新的 main，旧 main 变成历史 main snapshot，并记录 `previousMainBranchId`；拒绝的 branch 保留 audit，不删除。
- P0 不做复杂版本树、局部合并、多级冲突解决和长期权限系统；不支持“只把 Plan B 的餐厅同步到 Plan A”。
- P0 的“确认并执行”是本地生命周期闭环，不是外部真实执行闭环；所有预约、团购、排队、通知、提醒、分享和支付动作均保持外部 Mock 边界。
- 一键下单前必须通过执行闸门：用户已确认、当前 Main Branch 明确、协同状态满足要求、无未解决 L2 / L3 风险、无待处理阻塞反馈、执行动作仍在 Mock 边界内。
- 执行失败分级处理：可恢复失败允许有限重试，阻塞失败不自动重试，高影响 Mock 动作必须有重试次数上限。
- 执行队列必须记录预约、排队、通知、提醒、团购 / 加购等每一步 Mock 结果；执行完成后默认只写审计日志，只有用户显式反馈或稳定偏好才生成记忆候选。
- 核心接口必须补 JSON schema。P0 已先落地 `ui-contract.schema.json`，覆盖 UI Contract、`/api/generative-plan`、前端 adapter fallback、本地分享反馈和 `/api/executions` 模拟执行生命周期。
- Schema 验收契约已经冻结，详见 `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.SchemaAcceptanceContract`、`$defs.SchemaGeneratedTypeTarget`、`$defs.SchemaAcceptanceTestSuite` 和 `x-schemaAcceptanceContract`。
- `ui-contract.schema.json` 是 V5 P0 UI Contract 的事实源；后续 TS/Python 类型、后端契约测试、adapter 契约测试和 fixture golden tests 都必须从该 schema 生成或校验。
- P0 golden fixtures 固定为：`success.backend-planned.v5-p0.json`、`success.adapter-fallback.v5-p0.json`、`error.schema-validation-failed.v5-p0.json`、`error.unsafe-input.v5-p0.json`、`error.version-conflict.v5-p0.json`。
- 独立 adapter 固定为 `agent-core-plan-to-ui-contract`，输入旧 `agent-core.js` plan，输出必须通过 `ui-contract.schema.json`。
- 前端 adapter 字段映射表已经冻结，详见 `V5_ADAPTER_FIELD_MAPPING.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.AdapterMappingSet` 和 `x-adapterFieldMapping`。
- P0 mock fixture 契约已经冻结，详见 `V5_MOCK_FIXTURE_CONTRACT.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.MockFixtureManifest`、`$defs.MockFixtureContract` 和 `x-mockFixtureContract`。
- `source` 明确允许 `agent_core_adapter`，用于区分后端 `mock/planned` 返回和旧 `agent-core.js` 经 adapter 转换后的 fallback 返回。
- error fixture 必须在 fixture body 内显式包含 `httpStatus`，不能只依赖 `manifest.json`。
- adapter fallback 必须配套保留 `input.agent-core-plan.v5-p0.json`，并与 `success.adapter-fallback.v5-p0.json` 成对验收。
- Feature flag 固定为 `v5GenerativeUI`、`adapterFallback`、`localReplan`、`collaborationPlaceholder`、`executionImplementationRequired`、`localCollaborationState`、`simulatedExecutionLifecycle`。
- Feature flag 读取与优先级契约已经冻结，详见 `V5_FEATURE_FLAG_CONTRACT.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.FeatureFlagContract`、`$defs.FeatureFlagResolution` 和 `x-featureFlagContract`。
- P0 默认值固定为：`v5GenerativeUI=false`、`adapterFallback=true`、`localReplan=true`、`collaborationPlaceholder=false`、`executionImplementationRequired=false`、`localCollaborationState=true`、`simulatedExecutionLifecycle=true`。
- effective flags 合成顺序固定为：schema/defaults -> runtime/build config -> localStorage/sessionStorage -> URL query override -> per-request override -> safety hard guards。
- Feature flag 已升级为能力协商层：`featureFlags` 控制前端是否尝试某体验，`capabilities` 控制后端当前是否具备某能力，`errorRecovery` 控制失败后如何保留状态和 fallback；三者不能混在一起。
- 后端能力声明只能收窄能力，不能强制前端开启 V5，也不能把模拟执行升级成真实平台执行。
- 硬保护优先级最高；`schema_validation_failed` 不渲染 V5 并走 adapter fallback，`unsafe_input` 展示 Soft Prompt，`version_conflict` 保留旧方案，候选加载或采用校验失败保留当前候选预览和 Main，`backend_timeout` / `planning_unavailable` 走 fallback。
- 后端只能收窄能力，不能在前端 effective `v5GenerativeUI=false` 时强制开启 V5 渲染。
- 全局引用采用 ULID 或 UUID，并与 `lineageId`、`sessionId`、`version` 组合使用；`entityRef` / `targetRef` 必须显式指向业务对象和交互目标。
- Cascade 完整 engine 仍保留为后续草案，覆盖锁定项、通用撤销栈、多版本快照和冲突解释；P0 实现范围以 `V5_P0_LOCAL_REPLAN_CONTRACT.md` 的候选切换子集为准。
- `/api/generative-plan` HTTP 行为固定：`200` 渲染后端 cards；`400 bad_request` 不重试并提示输入异常；`422 schema_validation_failed` 走 adapter fallback；`422 unsafe_input` 展示 Soft Prompt；`409 version_conflict` 保留旧方案并提示刷新或重试；候选切换或采用失败保留当前预览和 Main；`503 planning_unavailable`、`504 backend_timeout` 和 `500 internal_error` 走 fallback，其中 `500` 需要记录。
- P0 错误恢复矩阵已经冻结，详见 `V5_ERROR_RECOVERY_MATRIX.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.ErrorRecoveryMatrix`、`$defs.ErrorRecovery` 和 `x-errorRecoveryMatrix`。
- `ErrorRecovery` 不只保留 `recommendedAction`，还必须包含 `httpStatus`、`blocking`、`fallback`、`userMessageKey`、`preserve` 和 `telemetry`，用于统一前端展示、fallback、状态保留和审计口径。
- `runtime_state_conflict` 与 `snapshot_missing` 作为 P0 矩阵的一部分冻结：前者保留当前视图并刷新 runtime state，后者保留当前可见方案并要求重新生成。
- 超时策略固定：前端请求 6 秒，后端规划 5 秒，adapter fallback 1 秒内，cascade refresh 3 秒，schema 校验 500ms 内。
- 用户体验文案不说“后端失败”；fallback 统一表达为“已切换到稳定生成模式。”安全风险表达为“需要确认一个安全信息后再继续。”冲突表达为“当前修改会影响已锁定内容，已保留原方案。”
- 必须保留当前静态 Demo 不依赖后端的运行方式；V5 需要 feature flag，默认关闭或至少默认可回退。后端不可用时，Generative UI 回退到现有前端本地方案。
- P0 演示优先展示 UI Contract、`/api/generative-plan` mock、前端 adapter、卡片流、局部重排、本地分享反馈和 `/api/executions` 模拟执行生命周期；外部真实执行和公网协同放到后续阶段。

完整决策见 `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`。当前仅为决策沉淀，不代表代码已实现。

## 9. 下一步建议

1. 在已落地的 alpha 契约与薄层 Runtime 端点基础上，规划前端主链路向完整状态机 Runtime 的迁移边界。
2. 以项目 `.venv` 的 pytest 基线持续回归后端能力，并跟踪 LangGraph 依赖弃用告警。
3. 继续保持主链路可独立运行，不让后端增强能力成为单点风险。
4. V5 实现前先落地 UI Contract、`/api/generative-plan` mock、前端 adapter、feature flag、share / feedback 本地协同契约和 `/api/executions` 模拟执行生命周期契约；外部真实执行、公网协同、复杂权限和复杂 SQLite 迁移继续后置。
5. 把外部讲解统一成一句话：
   当前是“Mock 主链路稳定、后端增强能力已落地但仍属 alpha”的执行型 Agent Demo。
