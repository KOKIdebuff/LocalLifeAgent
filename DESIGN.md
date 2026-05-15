# 设计文档：美团闲时消费执行 Agent

## 1. 问题理解

赛题核心不是“推荐去哪玩”，而是把一句模糊的周末需求变成可执行、可确认、可兜底的本地生活服务包。本 Demo 保持纯静态 Web 实现，所有天气、路线、活动、餐厅、票量、订座、团购、加购、通知均为本地 Mock，不接真实美团、地图、库存、支付、预约或消息系统。

产品目标：

- 一句话输入后，解析时间窗、同行关系、人数、预算、距离、体力和餐饮偏好。
- 生成 2-3 个候选服务包，包含时间轴、活动、餐厅、路线、预算、风险和推荐理由。
- 用户确认后模拟执行买票、订座、排队、团购、加购、分享卡片和提醒。
- 显性处理下雨、餐厅满座、活动无票、人数变化、孩子累了、预算太高等异常。

## 2. Agent 架构

当前实现是单 Orchestrator + Mock Tools，不引入真实多 Agent 或后端服务。为了让评委看清 Task-Completion 链路，UI 展示 `agentLoopTrace`：

```text
Planner -> Researchers -> Merger -> Verifier -> Revise -> Confirm/Execute
```

关键阶段：

- `Planner`：抽取同行关系、时间、人数、偏好和冲突约束；信息不足时先追问。
- `Researchers`：以逻辑 DAG 泳道展示 Mock 查证，包括天气/路线、活动/票务、餐厅/订座、团购/加购、通知/提醒。
- `Merger`：合成多个可执行服务包，选择综合分最高且风险最低的推荐方案。
- `Verifier`：检查时间、距离、预算、预约可用性和高影响动作确认。
- `Revise`：触发异常重排，记录替换原因，并同步到方案卡、Trace 和执行队列。

## 3. Mock 工具与数据

核心工具集中在 `agent-core.js`：

- `get_weather(location, time_range)`：返回天气、温度、户外适配和风险。
- `search_activities(location, time_range, group_profile, preferences)`：返回活动候选、票量、适龄和人群标签。
- `search_restaurants(location, party_size, group_profile, preferences)`：返回餐厅、排队、订座、桌型和餐饮偏好。
- `check_route(origin, destination, transport_mode)`：返回距离、耗时和交通方式。
- `check_availability(target_id, time, party_size)`：检查票量、座位、时段和异常状态。

Mock 数据保留可解释字段，例如儿童友好、低负担餐、聊天适配、座位容量、票量库存和可预约时段。并发不通过真实网络实现，而是通过 Researchers 泳道展示逻辑并行研究、Mock 时延和兜底状态，避免现场部署风险。

## 4. Planning 与异常兜底

规划采用“硬约束过滤 + 软约束打分”：

- 硬约束：时间窗、距离、同行人群、票量/座位、活动营业时间、高影响动作确认。
- 软约束：少排队、低体力、低预算、亲子/长辈/朋友适配、室内外偏好、拍照和聊天体验。
- 输出解释：每个方案展示评分维度、推荐理由、风险提示和可替换节点。

异常机制：

| 异常 | 检测逻辑 | 兜底动作 |
| --- | --- | --- |
| 下雨 | 天气 Mock 返回户外不适合 | 优先室内活动并重算路线 |
| 餐厅满座 | 订座 Mock 返回不可用 | 替换同商圈可订座餐厅 |
| 活动无票 | 票务 Mock 返回无票/限流 | 替换同人群、同半径活动 |
| 人数变化 | 重排事件改变 `partySize` | 重新检查票量、座位和预算 |
| 孩子累了 | 触发低体力重排 | 降低距离和活动强度 |
| 预算太高 | 触发预算重排 | 选择低价活动和更高优惠套餐 |

## 5. Demo 演示路径

比赛现场建议按 3 分钟节奏展示：

1. 亲子主线：一句话输入后生成时间轴、服务包、工具 Trace 和执行队列。
2. 活动无票：点击“景点无票”，展示原活动不可用后自动替换。
3. 朋友无座或人数变化：展示餐厅订座失败、桌型变化和预算重算。
4. 确认执行：点击确认后模拟买票、订座、排队、团购、加购、分享卡片和提醒。
5. 边界说明：所有外部能力为本地 Mock，不做真实交易或真实消息发送。

## 6. 下一阶段：轻量 Agent Runtime

下一阶段目标不是直接引入重型多 Agent 框架，也不使用任何非官方泄露源码，而是参考 Claude Code、Codex、Cursor 等公开产品形态中的通用 Agent 思想：任务循环、工具调用、权限确认、记忆、Trace、复盘和子任务拆解。代码实现保持自有、轻量、可解释。

核心目标：

- 真实提升自然语言泛化能力，减少当前关键词/正则识别的表达覆盖限制。
- 保留追问机制，低置信度、缺关键信息或存在冲突时不强行规划。
- 引入可沉淀的复盘记忆，让用户纠正、执行失败和误判原因能被总结，并在下次规划时作为上下文参考。
- 继续把高影响动作放在用户确认之后，避免 Agent 自动执行不可逆动作。

推荐架构：

```text
User Input
  -> IntentExtractor        # LLM 结构化理解自然语言
  -> IntentValidator        # Schema 校验、置信度、缺字段和冲突检测
  -> StateMachine           # understand / ask / research / plan / verify / execute / reflect
  -> ToolRegistry           # 天气、路线、活动、餐厅、票务、订座、通知等工具
  -> Planner + Verifier     # 复用现有服务包生成、评分和风险校验
  -> Reflector              # 总结用户纠错、执行失败和误判原因
  -> MemoryStore            # 候选记忆确认后写入 SQLite，下次检索相关经验
```

关键模块边界：

- `IntentExtractor`：调用真实大模型 API，把用户输入转成统一 JSON，例如场景、人数、时间、偏好、约束、缺失字段和置信度。
- `IntentValidator`：不信任 LLM 原始输出，必须做 schema 校验、枚举约束、默认值补全和冲突检测。
- `StateMachine`：显式管理 Agent 状态，信息不足时停在 `ask`，工具失败时进入 `revise` 或 `reflect`。
- `ToolRegistry`：把 Mock Tools 和未来真实 API 包装成同一接口，便于逐步替换而不影响 Planner。
- `Reflector`：把失败案例转成结构化经验，例如 `input`、`wrong_parse`、`user_correction`、`failure_reason`、`lesson`、`prevention`。
- `MemoryStore`：SQLite 作为结构化事实库，JSON 作为 API 交换格式，JSONL 作为审计日志；Vector DB 只作为后续语义检索增强，不在第一版引入。

记忆闭环：

```text
反馈 / 规划结束
  -> Memory Extractor 抽取候选
  -> Memory Critic 做敏感分级与可复用性判断
  -> UI 展示“建议沉淀的经验”
  -> 用户采用 / 忽略 / 自行更正
  -> 写入 active memories
  -> 下次规划前检索
```

SQLite 表分层：

- `feedback_events`：原始反馈日志，不直接作为长期记忆使用。
- `memory_candidates`：待确认候选，默认 `pending`。
- `memories`：用户采用后的长期结构化记忆。
- `memory_usage_events`：记录本次规划引用了哪些记忆，便于 Trace 展示。

敏感分级：

| 级别 | 示例 | 默认处理 |
| --- | --- | --- |
| L0 普通偏好 | 喜欢慢节奏、少排队、偏好地铁 | 可以进入长期记忆 |
| L1 弱敏感偏好 | 预算敏感、带孩子、常从某城市出发 | 保存概括版，避免过细 |
| L2 高敏感信息 | 具体住址、手机号、身份证号、订单号、儿童姓名生日 | 默认不进长期记忆 |
| L3 特殊敏感信息 | 疾病、宗教饮食、政治/身份属性、精确实时位置、支付信息 | 默认不保存 |

“自进化”在本项目中的定义应保持克制：系统自动总结经验、下次检索参考，并通过回归测试降低重复错误概率；不表述为自动改代码，也不承诺永远不会犯同样错误。

建议新增 Agent Loop Trace：

```text
Understand -> Ask -> Research -> Plan -> Verify -> Execute -> Reflect
```

其中 `Reflect` 是下一阶段和普通推荐器拉开差异的重点：当用户纠正“不是亲子，是约会”、反馈“这个安排太赶”、或工具模拟失败时，系统需要把错误原因沉淀成经验，并在后续类似输入中优先引用。
