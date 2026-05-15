# 进度记录

## 当前阶段

V3 美团闲时消费执行 Agent 已进入比赛冲刺版，已实现执行型 Agent 展示增强并通过核心回归测试。

## 2026-05-09 下一阶段方向：轻量 Agent Runtime

已确认方向：

- 目标从“仅靠关键词/正则识别”升级为“真实 LLM 意图识别 + 本地规则校验 + 可追问 + 可复盘”的混合 Agent。
- 允许引入 Node/Python 后端、密钥和网络请求，用真实大模型 API 提升自然语言泛化能力。
- 不使用 Claude Code 等任何非官方泄露源码；只参考 Claude Code、Codex、Cursor 等公开产品形态中的通用 Agent 思想，例如任务循环、工具调用、权限确认、记忆、Trace、复盘和子任务拆解。
- 不优先引入完整重型 Agent 框架；下一步更适合在当前项目上实现自有轻量 Agent Runtime。
- “自进化”定义为自动总结经验、下次检索参考、通过回归测试降低重复错误概率，不表述为自动改代码或保证永不犯错。
- 已同步 `README.md` 和 `COMPETITION_BRIEF.md`，明确 V4 是下一阶段路线图，当前 V3 仍是纯静态 Web Demo + 本地 Mock Tools。
- V4 实施中进一步明确记忆存储职责：SQLite 是事实库，JSON 是交换格式，JSONL 是审计日志，Vector DB 仅作为后续语义检索增强。
- 记忆写入改为候选确认流：`feedback_events` 记录原始反馈，`memory_candidates` 默认 pending，用户采用/忽略/更正后才进入 `memories`。
- 敏感分级采用 L0-L3：默认只保存 L0/L1 抽象偏好，L2/L3 不进入长期记忆。

候选路径对比：

| 路径 | 做法 | 优点 | 风险 |
| --- | --- | --- | --- |
| A. 只接 LLM 意图识别 | 新增后端调用 LLM，把自然语言转结构化 JSON，再交给现有规划逻辑 | 改动最小，最快提升泛化能力 | Agent 感和复盘能力不足，容易仍像增强版解析器 |
| B. 轻量 Agent Runtime | 新增 `IntentExtractor`、`IntentValidator`、`StateMachine`、`ToolRegistry`、`Reflector`、`MemoryStore` | 最符合比赛 Demo 和后续产品化，能力边界清楚 | 工程量中等，需要设计 schema、状态和失败兜底 |
| C. 多角色 LLM Agent | 拆成 Intent Agent、Research Agent、Verifier Agent、Reflect Agent 多次调用模型 | 展示上最像多 Agent | 成本、延迟和现场稳定性风险高，容易过度设计 |

当前建议：

优先选择 B。保持一个主 Orchestrator，但内部显式拆出轻量 Runtime 模块，并把 UI Trace 从当前 `Planner -> Researchers -> Merger -> Verifier -> Revise -> Confirm/Execute` 扩展为：

```text
Understand -> Ask -> Research -> Plan -> Verify -> Execute -> Reflect
```

建议任务拆分：

1. 定义 `intent.schema.json`，明确场景、人数、时间、预算、偏好、约束、缺失字段和置信度。
2. 新增后端 `/api/plan`，封装 LLM 意图识别，并保留现有规则解析作为失败兜底。
3. 新增 `/api/feedback`，记录用户纠错、方案不满意和工具失败，并生成候选记忆。
4. 新增 `/api/memory-candidates/{id}/decision`，支持采用、忽略或更正候选记忆。
5. 在规划前检索相关经验，作为 LLM 和本地校验的上下文。
6. UI 增加 `Reflect` 阶段，展示本次是否生成新经验、下次如何避免。

当前尚未实现代码，仅完成架构方向沉淀；V3 现状仍是纯静态 Web Demo + 本地 Mock Tools。

## 2026-05-08 比赛冲刺增强

已完成：

- 首屏调整为用户视角，移除评审硬指标和 Mock 工具胶囊，硬指标仅保留在讲解材料/文档中。
- 示例入口调整为比赛演示路径：亲子主线、朋友无座、雨天重排、景点无票、人数变化、信息不足、约束冲突。
- `agentLoopTrace.stages[].lanes` 新增 Researchers 逻辑 DAG 泳道，展示天气/路线、活动/票务、餐厅/订座、团购/加购、通知/提醒。
- `servicePackage.replanEvents` 新增活动无票和人数变化两类重排事件。
- 活动无票会模拟原活动无票/限流，并替换同人群、同半径备选。
- 人数变化会提升 `partySize` 并重新检查票量、餐厅桌型和预算。
- 执行队列新增重排校验动作，异常在方案卡、Trace 和执行队列中都可见。
- 发送消息动作升级为 Mock 分享卡片，适配亲子家庭和朋友局摘要。
- `DESIGN.md` 改为比赛版两页结构，新增 `DEMO_SCRIPT.md` 作为 3 分钟讲解稿。

验证：

```powershell
npm test
node --check .\agent-core.js
node --check .\app.js
node --check .\tests.js
```

结果：通过，`npm test` 输出 `All agent-core tests passed.`

## 已完成

- 已确认赛题边界：不要求接入真实商家、真实地图、真实餐厅库存、真实支付/预约系统，也不要求真实爬取实时数据；当前实现继续以本地 Mock 数据和 Mock Tools 展示 Agent 闭环。
- 参考 `未命名文档(28).pdf`，将定位从“本地探索活动规划器”纠偏为“美团闲时消费决策与执行 Agent”。
- 保持纯静态 Web Demo，不接真实 API，不新增框架，不做真实支付、真实下单或真实消息发送。
- 页面升级为执行驾驶舱：
  - 首屏改为“周末吃喝玩乐一键安排”。
  - 左侧展示用户目标和动态重排入口。
  - 中间展示 Agent Loop Trace、原始 Mock Tool 调用和候选方案。
  - 右侧展示美团服务包、执行队列和最终模拟结果。
- 核心数据扩展为美团服务包：
  - `servicePackage.itineraryItems`：时间轴。
  - `servicePackage.meituanActions`：订座、排队、买票、买团购、下单加购、通知、提醒。
  - `servicePackage.businessMetrics`：节省排队时间、优惠金额、总预算、闲时匹配度、节省决策时间。
  - `servicePackage.replanEvents`：下雨、餐厅满座、孩子累了、预算太高。
- 新增轻量可解释编排：
  - `agentLoopTrace` 固定展示 planner、researchers、merger、verifier、revise 五阶段。
  - researchers 是逻辑研究通道，不是真实多 Agent 并发。
  - 信息不足时停在 planner 追问，不假装调用工具。
- 增加闲时错峰策略：
  - 主动避开 12:00-13:30 和 18:00-19:30。
  - 展示少排队、优惠、预算和闲时匹配度。
- 增加动态重排：
  - 下雨换室内。
  - 餐厅满座替换餐厅。
  - 孩子累了降低体力消耗。
  - 预算太高优先低价套餐。
- 执行动作升级：
  - `book_ticket`。
  - `reserve_table`。
  - `join_queue`。
  - `buy_deal`。
  - `order_item`。
  - `send_message`。
  - `set_reminder`。
- 文档同步更新：
  - `README.md`。
  - `DESIGN.md`。
  - `lessons.md`。

## 验证结果

已执行：

```powershell
npm test
node --check .\agent-core.js
node --check .\app.js
node --check .\tests.js
```

结果：通过，`npm test` 输出 `All agent-core tests passed.`

## 当前结论

V3 已明显区别于普通推荐列表，主线变成“复合周末局服务包”：玩、吃、排队、订座、团购、加购、通知和突发重排。它更贴近赛题里的“帮用户把事情做完”，也更接近美团/千问这类生活服务 Agent 的产品范式。

Agent Loop Trace 进一步把这条主线表达为“拆解、查证、合成、校验、重排、确认执行”，适合比赛现场解释系统不是普通推荐列表，也不是不可控的重型多 Agent 实验。

## 剩余风险

- 仍是 Mock 数据，不能声称接入真实美团内部能力。
- 尚未做真实浏览器多视口截图检查。
- 动态重排是事件级模拟，不是完整多轮自然语言状态机。
- `agentLoopTrace` 是可解释 trace，不代表真实并发 researcher 或真实平台能力。

## 下一步

1. 用浏览器人工检查四条演示路径：亲子主线、朋友无座替换、下雨重排、确认执行订单包。
2. 如果继续做 V3 比赛静态版，优先录制 1 分钟讲解脚本和优化视觉层级。
3. 如果进入 V4 Agent 能力升级，优先实现轻量 Agent Runtime 的 `IntentExtractor`、`IntentValidator` 和 `Reflector`，再考虑替换真实生活服务 API。

## Done When

- 文档中的当前项目状态统一表述为 V3 美团闲时消费执行 Agent，不再把当前状态称为 V1 或 V2。
- `COMPETITION_BRIEF.md`、`DESIGN.md`、`README.md` 和 `progress.md` 对赛题边界保持一致：仅使用本地 Mock 数据和 Mock Tools。
- `V2_UPGRADE_PLAN.md` 明确标注为历史升级计划，不作为当前状态说明。
- `npm test`、`node --check .\agent-core.js`、`node --check .\app.js` 和 `node --check .\tests.js` 通过。
- Agent Loop Trace 能展示 planner、researchers、merger、verifier、revise，且信息不足时 researchers 为空。
- 浏览器人工跑通四条比赛演示路径：亲子主线、朋友无座替换、下雨重排、确认执行订单包。
- 对外讲解不声称接入真实美团、真实地图、真实餐厅库存、真实支付、真实预约或真实消息发送。
