# 进度记录

## 2026-06-06 V5 P0 候选项切换器 UI / 前端运行时实现

目标：实现“换一换”候选项切换器的可交互 UI 和当前编辑会话内运行时，不删除
`refresh_block` 兼容入口。

已实现：

- 新增 `candidate-switcher.js`，负责稳定候选历史、前后切换、差异预览、采用、
  恢复原方案和一次撤销。
- 活动和餐厅候选从现有 Mock 数据确定性生成，每个区块最多 5 个。
- 交通作为独立行程段卡展示，每段提供原交通、打车和公共交通候选。
- 交通切换只修改绑定行程段，并联动预览后续时间线、时间、预算、拥堵、步行和换乘风险。
- preview 阶段不修改 `state.result`；采用通过本地时间、预算、风险和结构检查后才更新 Main。
- renderer 新增 `[上一个] 当前位置/总数 [下一个]`、预览/已采用状态、差异标签、
  “采用这个”“恢复原方案”“撤销采用”。
- adapter 保留 `refresh_block` 兼容 action，但不在新 UI 中直接展示；正式 UI 使用五类候选动作。
- 后端返回未包含候选切换契约时，前端保守回退到现有 adapter fallback，确保功能可用。

验证：

- `npm.cmd test`：agent-core、candidate switcher runtime、V5 frontend、workbench shell 全部通过。
- `python -m unittest test_contract_schemas -q`：23 项通过。
- `node --check`：`candidate-switcher.js`、adapter、contract、renderer、`app.js` 全部通过。
- `git diff --check` 通过，仅有既有 Windows LF/CRLF 提示。

未完成与风险：

- 当前候选历史只保存在页面会话内，刷新页面后丢失。
- “加载更多”后端接口与持久化候选历史尚未实现。
- 当前环境的内置浏览器在 Windows 沙箱中启动失败，未完成自动化可视点击验收；
  保留给用户亲自体验审查。
- `refresh_block` 未删除，且必须等待用户明确体验批准。

## 2026-06-06 V5 P0 交通行程段卡与兼容删除闸门

目标：补充候选项切换器的两项产品决策，只更新 Markdown、schema 和契约测试。

冻结内容：

- `refresh_block` 继续作为 fixture / adapter 兼容入口，不得直接修改 Main。
- 在用户亲自体验新候选切换流程并明确批准前，不得删除 `refresh_block`。
- `transport` 从 deferred 类型升级为第 10 类 P0 主渲染卡。
- 每张交通卡绑定一个两地点之间的行程段：`routeSegmentId + fromRef + toRef`。
- 每段交通维护候选交通列表、当前预览候选、原始候选、已采用候选。
- 切换交通时联动预览时间、预算、拥堵、步行、换乘风险和受影响的后续时间线。
- 预览不修改 Main 或已保存快照；采用并通过时间、预算、风险和 schema 校验后才提交。

已更新：

- `V5_P0_LOCAL_REPLAN_CONTRACT.md`
- `V5_CARD_TYPE_WHITELIST.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `DESIGN.md`
- `ui-contract.schema.json`
- `test_contract_schemas.py`

阶段边界：

- 本轮没有实现交通卡 UI、交通候选生成或运行时代码。
- 兼容动作的最终删除必须等待用户体验验收，不由实现者自行判断。

验证：

- `python -m json.tool ui-contract.schema.json` 通过。
- 本地 `$ref` 完整性检查通过。
- `python -m unittest test_contract_schemas -v`：22 项通过。
- `npm.cmd test`：agent-core、V5 frontend、workbench shell 全部通过。
- `git diff --check` 通过，仅有既有 Windows LF/CRLF 提示。

## 2026-06-06 V5 P0 “换一换”候选项切换器契约升级

目标：把“换一换”从随机或立即局部替换升级为稳定的候选项切换器。本轮只沉淀
Markdown 契约和 `ui-contract.schema.json`，不修改现有运行时代码。

已更新：

- `V5_P0_LOCAL_REPLAN_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_ERROR_RECOVERY_MATRIX.md`
- `DESIGN.md`
- `ui-contract.schema.json`
- `progress.md`
- `lessons.md`

冻结内容：

- 推荐交互为“上一个 / 当前位置与总数 / 下一个”，并提供“采用这个”和“恢复原方案”。
- 每个可替换区块维护稳定候选列表、当前位置、原始候选、已采用候选和受影响时间线。
- 候选历史只在当前编辑会话保留，首版每个区块最多 3-5 个候选，不无限循环，不做复杂分支树。
- 切换仅作预览，必须展示时间、预算、时间线和风险变化；未采用前不得修改 Main 或已保存快照。
- 采用或恢复原方案前必须重新校验时间、预算、风险和 schema。
- 采用后只支持一次撤销，不提供通用撤销栈。
- 上一个读取本地历史，不重新生成；加载更多或采用校验失败时保留当前候选、当前预览和 Main。
- 正式动作冻结为 `preview_previous_candidate`、`preview_next_candidate`、`adopt_preview_candidate`、`restore_original_candidate`、`undo_candidate_adoption`。
- `refresh_block` 仅保留为旧 fixture / adapter 兼容入口，不能直接修改 Main。

阶段边界：

- 本轮没有实现候选加载、切换 UI、差异计算、采用、恢复或撤销代码。
- 本轮没有修改协同、Execution、SQLite 或旧 `agent-core.js` fallback。
- 2026-06-04 的“点击即替换 + `lastStablePlanSnapshot`”记录是历史口径，已被本条和 `V5_P0_LOCAL_REPLAN_CONTRACT.md` 取代。

验证：

- `python -m json.tool ui-contract.schema.json` 通过。
- 本地 `$ref` 完整性检查通过。
- `python -m unittest test_contract_schemas -v`：22 项通过。
- `npm.cmd test`：agent-core、V5 frontend、workbench shell 全部通过。
- `git diff --check` 通过，仅有既有 Windows LF/CRLF 提示。

## 2026-06-06 V4 Runtime P0 架构 Blocker 决策落地

本轮只更新契约、状态机、计划和测试保护，不实现 Runtime Repository、
Transition Engine、CompatibilityAdapter 或 Execution 生命周期代码。

批准决策：

- 状态机升级为 `v4-p0-2`，使用 `confirmation_accepted`、
  `mock_execution_completed` 和 `recovery_resumed` 修正三条事件语义。
- 采用双入口、单一 Runtime Core：旧 `POST /api/runtime` 通过
  CompatibilityAdapter，新 `/api/runtime/sessions/*` 通过 RuntimeAdapter。
- V4 P0 在现有 SQLite 文件增加独立 Runtime 表和
  `runtime_schema_migrations`，不依赖 Memory 表内部结构。
- task/step 归属独立 Execution 领域；V4/V5 P0 只冻结引用、摘要事件、
  schema、fixture、disabled/mock/fallback，Execution 实现从 P1-A 开始。

强制保护：

- 旧 API golden fixtures。
- 单一权威写路径，禁止新旧双写。
- feature flag 默认关闭新 Core，保留立即回退旧路径。
- Session/Event 原子提交、幂等唯一约束、乐观锁、busy timeout。
- Runtime 与 Execution 使用不同状态机，UI 不得直接修改 Step。

## 2026-06-05 Runtime target / effective capability 拆分

目标：消除 `x-runtimeP0Capabilities` 同时承担“产品目标”和“当前可用能力”造成的
误启用风险。

冻结结论：

- `targetCapabilities` 表示 V4 P0 产品目标，只用于规划和契约验收。
- `effectiveCapabilities` 表示当前运行实现真实可调用能力，是 UI 启用、disabled、
  mock 和 fallback 判断的唯一权威来源。
- `targetCapabilities.status=supported` 明确表示契约已冻结，不表示代码已实现。
- `effectiveCapabilities` 使用独立的 `availability`：
  `available / degraded / unavailable`。
- 当前 V4 alpha 中，`contract_tests` 为 available；状态机和事件流因只有薄响应与
  临时 Event 而为 degraded；持久 session、Recovery Point、rollback、
  RuntimeAdapter 和 capability query 均为 unavailable。
- V5 不得根据 `targetCapabilities` 开启按钮或调用 Runtime 操作。
- capability contract 版本升级为 `v4-runtime-capabilities-3`。

同步文件：

- `runtime.schema.json`
- `runtime-state-machine.json`
- `test_contract_schemas.py`
- V4 Runtime data model / contract 文档
- V5 capability 与协作契约文档

## 2026-06-05 feedback / memoryDecision 请求互斥契约补齐

目标：保留 `feedback` 和 `memoryDecision` 两项能力，同时保证同一
`RuntimeRequest` 只能执行其中一项。

冻结规则：

- feedback-only 请求允许。
- memoryDecision-only 请求允许。
- 同时出现 `feedback` 和 `memoryDecision` 字段时拒绝，错误语义为
  `mutually_exclusive_operations`。
- 互斥按字段是否存在判断；即使其中一个值为 `null`，同时携带两个字段仍拒绝。
- 两项操作必须拆成两个请求，避免一次请求产生两个业务写入和不明确的状态转移。
- 本轮只完成 schema、文档和契约测试；当前 alpha handler 的运行时校验仍是待办。

## 2026-06-05 V4 Runtime P0 Session 生命周期契约补齐

目标：解决 RuntimeAdapter 已承诺 pause / resume / close / recovery，但 Session、
Event、Capability 和持久化模型无法完整表达的问题。本轮仍只修改契约、文档和
契约测试，不实现 SQLite repository、Transition Engine 或完整 rollback 执行器。

冻结结论：

- `runtimeState` 与 `lifecycleStatus` 分离；生命周期为 `active / paused / closed`。
- `PersistedRuntimeSession` 增加 `latestRecoveryPointId`、`pausedAt`、`closedAt`。
- RuntimeAdapter 公共写入口使用 `submit_event`，但输入仅是事件意图；客户端
  不能提交可信 `fromState`，正式 Event 仍由服务端校验后生成。
- 生命周期 Event 使用 `fromLifecycleStatus / toLifecycleStatus`，不伪造业务状态转移。
- P0 只保留最近稳定 Recovery Point；rollback 追加新 Event 和新 Session 版本，
  不覆盖历史、不补偿外部副作用、不做 task replay。
- Target capability 返回契约冻结状态 `supported / degraded / unsupported`；
  effective capability 使用运行时可用性 `available / degraded / unavailable`。
- SQLite P0 目标表为 `runtime_sessions`、`runtime_events`、
  `runtime_recovery_points`；不迁移 thin Runtime 临时 Session。

验证：

- `python -m unittest .\test_contract_schemas.py`：19 项通过。
- `npm.cmd test`：通过。
- `python -m py_compile .\test_contract_schemas.py .\server.py .\backend_core.py`：通过。
- 全量 Python 测试未启动：当前工作区没有虚拟环境，系统 Python 缺少
  `pytest`、`httpx` 和 `fastapi`。
- Draft 2020-12 元 schema 检查未运行：当前 Python 缺少 `jsonschema`；
  JSON 语法检查和仓库契约测试已通过。

## 2026-06-05 V4 Runtime P0 状态机事实源与并发契约冻结

目标：根据最新方案冻结 V4 Runtime P0 状态机、Session、Command/Event、乐观锁、Recovery Point 和 V5 Runtime 摘要映射契约。本轮只沉淀 schema、文档和测试，不实现数据库事务或 Transition Engine 运行代码。

当前事实源：

- `runtime-state-machine.json` 是 V4 Runtime P0 状态、事件、合法转移、终态、生命周期、guard、Recovery Point 和 replay 边界的唯一事实源。
- `runtime.schema.json` 的 `RuntimeState`、`RuntimeEventType`、`RuntimeTransition` 和 `x-runtimeTransitions` 必须与事实源一致。
- `x-runtimeTransitions` 只作说明元数据；合法转移由标准 JSON Schema `oneOf` 和后续服务端 Transition Engine 校验。
- V5 `RuntimeSummary` 使用 `runtimeState + displayPhase`：`runtimeState` 是权威业务状态，`displayPhase` 只负责展示。

字段替换：

- 废弃 `executionContractOnly`。
- 新字段为 `executionImplementationRequired`，默认 `false`。
- 历史进度中出现的 `executionContractOnly` 仅保留为历史记录，不再是当前契约。

P0 冻结规则：

- 客户端通过 RuntimeAdapter `submit_event` 提交事件意图，不能提交可信
  `fromState` 或直接持久化正式 Event。
- 非创建写操作必须携带 `expectedVersion` 和 `idempotencyKey`。
- Event 写入和 session 更新必须处于同一数据库事务。
- `done` 和 `closed` 为终态。
- Recovery Point 保存小型完整恢复快照，P0 仅保留最近稳定恢复点。
- P0 支持事件查询和最近恢复点恢复，不支持业务级 replay、重放外部动作或任意时间点恢复。
- CI 必须检查状态机事实源与 schema、文档和测试矩阵漂移。

同步文件：

- `runtime-state-machine.json`
- `runtime.schema.json`
- `ui-contract.schema.json`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `DESIGN.md`
- `test_contract_schemas.py`

## 2026-06-05 V4 Headless Runtime 边界契约沉淀

目标：把 V4 product-grade headless Runtime 的分层边界同步到 Markdown 契约和 schema，不实现新 Runtime 代码，不改变现有 V4 alpha endpoint 行为，也不扩大 V5 P0 UI 范围。

本轮沉淀：

- V4 Runtime Core 负责 session、状态机、事件、持久化和恢复点。
- `RuntimeAdapter`、`Capability Contract`、`Event Contract` 负责把 Runtime 能力包装成稳定、UI 无关的访问面。
- V5 UI Contract 负责卡片、按钮、布局和前端交互。
- V5 UI 不能直接碰 Runtime 内部实现，只能通过 RuntimeAdapter、Capability Contract 和 Event Contract 访问 Runtime。
- Runtime 不因 UI 草图中的按钮新增能力，不因页面结构写死流程，也不直接承诺 UI 层体验。

同步文件：

- `runtime.schema.json`
- `ui-contract.schema.json`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_FEATURE_FLAG_CONTRACT.md`

边界说明：

- 本轮是契约沉淀，不代表 product-grade Runtime Core 已实现。
- 现有 `POST /api/runtime` 仍保持 V4 alpha thin Runtime 聚合语义。
- V5 P0 仍通过 UI Contract、adapter fallback、capability negotiation 和 event contract 做保守接入。

## 2026-06-05 V5 P0 Plan Branch 轻量生命周期冻结

目标：根据最新决策再次同步 V5 P0 Contract、Markdown 文档和 `ui-contract.schema.json`。本轮不引入新的 P0 版本名称，仍统一称为 V5 P0；schema 内部机器可读结构名统一为 `V5P0Contract`。

历史记录状态：

- `progress.md` 下方历史记录确实存在与当前 V5 P0 决策冲突的旧口径，例如“不引入正式 branch / adopt / reject / rollback”。
- 这些旧记录保留为历史决策轨迹，不再作为当前开工基线。
- 当前 V5 P0 基线以本条、`V5_GENERATIVE_UI_COLLABORATION_PLAN.md` 和 `ui-contract.schema.json` 为准。

最新冻结决策：

| 主题 | 最终决策 |
| --- | --- |
| Main Branch | 初始方案生成后就是 `main`；同一 lineage 只有一个当前 active main。 |
| Derived Branch | 根据反馈生成；最多同时 3 个；状态为 `proposed`、`adopted`、`rejected`、`archived`。 |
| Adoption | 发起人采纳某个 derived branch 后，该 branch 成为新的 main；旧 main 变成历史 main snapshot；必须记录 `previousMainBranchId`。 |
| Rejection | 发起人可以拒绝 derived branch；rejected branch 仍保留 audit，不删除。 |
| Rollback | P0 只支持回滚到上一个 main，不做复杂版本树回滚。 |
| No Merge | P0 不做局部合并，不支持“只把 Plan B 的餐厅同步到 Plan A”；这类能力放到 V5 P1。 |
| 外部动作 | 仍然全部 mock，不接真实平台。 |

不进入 P0：

- 复杂版本树。
- 局部合并。
- 多级冲突解决。
- 长期权限系统。
- 公网分享、真实登录态、真实外部协作者。
- 真实商家、支付、订座、消息平台。

同步文件：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `DESIGN.md`
- `progress.md`

## 2026-06-04 V5 P0 最终执行与协同边界冻结

目标：再次冻结 V5 P0 Contract，并同步 Markdown 与 `ui-contract.schema.json`。本轮不引入新的 P0 版本名称，仍统一称为 V5 P0。

最终口径：

- V5 P0 实现本地真实协同状态与模拟执行生命周期。
- 真实的是本地 API、SQLite 状态、分享页、反馈回流、execution / step 状态和 audit。
- 模拟的是外部执行结果。
- P0 不触达真实商家、支付、订座、消息平台，不做公网分享、真实登录态、真实外部协作者，也不引入完整 Plan B / branch 生命周期。

具体冻结决策：

| 主题 | 最终决策 |
| --- | --- |
| Cancel | 允许取消单个 step 和整个 execution；必须记录 `reason`、`actor`、`time`、`affectedSteps`，写入 audit；P0 不做真实补偿动作。 |
| Skip | 低影响 step 可 skip；高影响 step 不允许 skip，只能 retry、cancel 或重新生成方案。 |
| Regeneration | “重新生成”优先走 `/api/generative-plan`，携带当前 snapshot 和反馈摘要；生成新的可查看方案结果；保存 `regeneration event`、`feedbackIds`、`previousSnapshotId`、`lineage`；失败 fallback 到 `agent-core.js` adapter。 |
| Plan Branch | P0 不引入正式 branch / adopt / reject / rollback；V5 P1 再升级为正式 plan branch。 |
| Execution 外部动作 | 仍然全部 mock，不接真实平台。 |

同步文件：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `DESIGN.md`
- `progress.md`

## 2026-06-04 V5 P0 契约重新冻结：本地真实协同 + 模拟执行生命周期

目标：根据最新产品判断，重新冻结 V5 P0 Contract，并同步到 Markdown 契约和 `ui-contract.schema.json`。本轮仍是契约沉淀，不实现运行时代码、API handler 或 SQLite 迁移。

当前基线以本条为准；下方较早记录保留为历史决策轨迹，其中关于“协同占位 / execution 后续”的旧口径已被本条覆盖。

核心判断：

- V5 P0 不再是“协同占位 + 前端本地模拟执行按钮”，而是“本地真实协同 + 模拟执行生命周期”。
- 真实的是本地状态、API、SQLite 持久化、分享页、反馈回流和 execution 生命周期。
- 模拟的是外部执行结果：不触达真实商家、支付、消息平台、订座系统、公网分享平台或真实身份系统。
- 新版 UI 仍是体验基线，但不是后端范围无约束扩大的理由；P0 只扩大到本地协同和模拟 execution 生命周期，不扩大到外部平台集成。

新增 P0 Blocker：

| 模块 | 是否阻塞新 P0 | 原因 |
| --- | --- | --- |
| `/api/executions` 生命周期契约 | 是 | 没有 create / query / advance / status，就无法称为模拟执行生命周期闭环。 |
| 分享页 API / token / snapshot | 是 | 没有本地 token 和 plan snapshot，就不是本地真实协同。 |
| 协同反馈写入与回流 | 是 | 没有 feedback 保存和发起人页面回流，就只是 placeholder。 |
| 本地 SQLite 协同 / execution 状态 | 是 | 本地真实状态必须可保存、可查询、可回放。 |
| 外部真实执行 | 否 | 仍不做，必须保持 Mock 边界。 |

重新冻结的 P0 最小范围：

- `/api/generative-plan` mock / fixture / schema validation / errorRecovery envelope。
- `agent-core-plan-to-ui-contract` adapter fallback，旧 `agent-core.js` 输出必须能转成 V5 UI Contract。
- UI Contract 卡片流主体验，旧 plan card 只作为 fallback / debug / 兼容视图。
- 9 类 P0 主卡片：`plan_summary`、`assumption_banner`、`activity`、`restaurant`、`timeline`、`soft_prompt`、`share_summary`、`feedback_summary`、`execution_summary`。
- `/api/executions` 模拟执行生命周期：创建 execution、查询 execution / steps / status、推进步骤；状态至少 `draft`、`ready`、`running`、`completed`、`blocked`、`cancelled`。
- 分享页：本地 token 访问、展示 plan snapshot、支持协作者提交反馈；不要求公网访问，不要求真实用户身份系统。
- 反馈回流：反馈保存到 SQLite，发起人页面能看到；P0 可只做到反馈影响提示和执行闸门，不自动生成 Plan B。
- 本地真实协同状态：保存 share、reviewer、feedback、read state、execution gate 和 audit 关键事件。

不进入 P0：

- 外部真实执行、真实商家、支付、消息平台、订座系统、真实预约 / 下单 / 通知。
- 公网分享、真实用户身份系统、复杂权限系统。
- Plan B 自动生成和完整协同分支闭环。
- 完整 cascade engine、复杂 SQLite 多库迁移、长期多版本 snapshot 管理。

同步文件：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_CARD_TYPE_WHITELIST.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `DESIGN.md`
- `README.md`
- `progress.md`

## 2026-06-04 新 UI 与 V5 P0 契约对齐决策同步

目标：把新 UI、V5 P0 Contract、fixture / adapter / capability negotiation / contract tests 的最新口径同步到 Markdown 契约和 `ui-contract.schema.json`，继续保持“新版 UI 是体验基线，但不是后端范围扩大的理由”。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `DESIGN.md`
- `README.md`
- `ui-contract.schema.json`
- `progress.md`

用户确认项：

1. 当前新版 UI 的事实源就是仓库内 `index.html` / `app.js`。
2. V5 P0 产品想要“确认并执行 / 发给家人朋友”的体验闭环，但仅做本地模拟，不做真实外部执行。
3. 本轮需要同步写入 Markdown 契约文档和 schema 契约。
4. 采用严格契约驱动，UI 降级：只实现 V5 P0 Contract，超出项 mock / placeholder / disabled / fallback。

关键决策：

- 从现有 `agent-core.js` 输出生成 P0 fixture：当前本地规划结果经 `agent-core-plan-to-ui-contract` adapter 转成 V5 JSON，作为 `success.adapter-fallback.v5-p0.json` 与 backend mock 成功样例的共同基础。
- 旧 `agent-core.js` 输出必须能转成 `ui-contract.schema.json#/$defs/GenerativePlanSuccessResponse`；schema 失败不渲染脏数据，直接 fallback。
- Feature flag 升级为能力协商层：`featureFlags` 控制前端是否尝试体验，`capabilities` 控制后端当前是否具备能力，`errorRecovery` 控制失败后如何保留状态和 fallback，三者不得混用。
- 后端 capability declaration 只能收窄能力，不能强制前端开启 V5，不能扩大 P0，也不能把模拟执行变成真实执行。
- V5 P0 主体验是 UI Contract 卡片流；旧 plan card 只作为 fallback / debug / 兼容视图。

P0 最小质量门：

| 阶段 | 要做什么 | 目的 | 是否 P0 必须 |
| --- | --- | --- | --- |
| P0-1 | schema parse + 核心 `$defs` / 枚举检查 | 防止 schema 文件坏掉 | 必须 |
| P0-2 | 3 个 golden fixture 通过 schema | 统一前后端样例 | 必须 |
| P0-3 | `/api/generative-plan` mock contract test | 保证后端 mock 可联调 | 必须 |
| P0-4 | adapter 输出 contract test | 保证 fallback 可用 | 必须 |
| P0-5 | unsafe / version / error 负例扩展 | 提高恢复路径质量 | 建议 |
| V5.1 | TS 类型生成、完整 Pydantic、复杂 snapshot | 长期维护 | 后置 |

最小 Done When：

- `ui-contract.schema.json` 可解析。
- 3 个 golden fixture 都能通过 schema。
- `/api/generative-plan` mock 成功响应和标准错误响应能通过契约测试。
- adapter fallback 输出能通过 schema。
- 未知 card 不渲染，未知 action 不执行。
- schema 校验失败时不渲染后端脏数据，走 fallback。

阶段边界：

- 本轮同步契约和文档，不实现 `/api/generative-plan` handler。
- 本轮不创建真实 fixture JSON，不实现 adapter，不新增真实 `/api/executions` 生命周期。
- 本轮不实现真实协同、分享页、复杂 SQLite、多版本 cascade、真实订座 / 支付 / 消息发送。

## 2026-06-04 V5 P0 Adapter / Fixture / Type / Flag 决策补丁

目标：把 V5 P0 开工前的四项局部决策沉淀进 Markdown 契约和 `ui-contract.schema.json`，不扩大 P0 范围，不把完整 V4 Runtime 收束升级为前置条件。

已更新：

- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `ui-contract.schema.json`
- `progress.md`

Change Log：

| 分类 | 问题描述 | 影响范围 | 是否阻塞开发 | 建议归属版本 | 是否需要用户决策 | 决策 / 默认策略 |
| --- | --- | --- | --- | --- | --- | --- |
| V5 必须项 | Runtime Adapter 的实现位置和约束需要明确。 | 前端 adapter、UI Contract、V4/V5 依赖边界 | 否 | V5 P0 | 已决策 | Adapter 实现在前端；接口、输入输出和映射规则由 `ui-contract.schema.json` 与 adapter mapping contract 约束。 |
| V5 必须项 | `/api/generative-plan` mock 是否固定 fixture 驱动需要明确。 | 后端 mock、fixtures、contract tests | 否 | V5 P0 | 已决策 | 先用 fixture 驱动，允许普通成功、`unsafe_input`、`schema_validation_failed`、`version_conflict` 四类确定性轻量分支。 |
| V5 必须项 | Schema、TS 类型和 Python 类型验收优先级需要明确。 | schema acceptance、前端类型、后端校验 | 否 | V5 P0 | 已决策 | P0 先做 schema 校验测试；TS 类型生成或至少校验；Python 先用 JSON Schema 校验，不急建完整 Pydantic 模型体系。 |
| V5 必须项 | V5 开关入口边界需要明确。 | feature flag、调试入口、正式用户功能边界 | 否 | V5 P0 | 已决策 | 支持 URL / localStorage；保留开发期调试入口，但不作为正式用户功能。 |
| V5 必须项 | 核心响应是否必须通过 golden fixtures 和 contract tests 需要明确。 | fixtures、mock endpoint、adapter、contract tests | 否 | V5 P0 | 已决策 | 所有核心响应必须走 golden fixtures 和 contract tests。 |

阶段边界：

- 本轮不实现 adapter。
- 本轮不实现 `/api/generative-plan` mock handler。
- 本轮不创建 fixture JSON。
- 本轮不生成 TS / Python 类型。
- 本轮不实现 V5 feature flag resolver 或调试入口。
- 本轮不引入完整 Runtime 接管、持久化 session、状态连续性校验、Runtime rollback、任务 replay 或 agent 执行态恢复。

## 2026-06-04 V5 P0 版本兼容契约冻结

目标：冻结 V5 P0 的版本族兼容规则，让前端不再只依赖完整版本号，而是在 `v5` 家族内按最低 UI Contract 和能力声明做保守降级渲染。

已更新：

- `ui-contract.schema.json`
- `V5_VERSION_COMPATIBILITY_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `V5_CARD_TYPE_WHITELIST.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- 前端识别 `v5` 版本族，而不是只比较完整版本号。
- 响应属于 `v5` 家族且最低 UI Contract 字段通过 schema 校验时，允许按 P0 能力降级渲染。
- `requiredCapabilities` 必须全部支持，否则 fallback。
- `optionalCapabilities` 不支持时可以忽略、合并降级或隐藏相关 UI，不阻断 P0 主卡片流。
- 未知 card type 不进入主链渲染。
- 未知 action type 隐藏按钮，且绝不执行。
- 未知字段可以保留，但前端渲染和业务逻辑不得依赖。
- schema 校验失败时必须 fallback，版本兼容不能绕过 schema。
- `UICard.type` 和 `UIAction.type` 线格式允许前向兼容字符串；P0 行为仍由 `KnownUICardType`、`KnownUIActionType` 和白名单策略约束。

阶段边界：

- 本轮没有实现前端版本兼容解析器。
- 本轮没有实现 capability negotiation UI。
- 本轮没有实现未知卡片渲染器或未知 action 执行逻辑。
- 本轮没有修改业务代码、接口实现或测试文件。

## 2026-06-04 V5 P0 局部重排子集契约冻结（历史口径，已被 2026-06-06 候选项切换器契约取代）

目标：把 P0 cascade 范围从“完整 cascade engine”收口为轻量 MVP：局部替换、单步快照和保守失败回退，避免 P0 被锁定项、撤销栈、多版本快照和复杂冲突解释拖大。

已更新：

- `ui-contract.schema.json`
- `V5_P0_LOCAL_REPLAN_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- P0 不做完整 cascade engine。
- P0 只支持一个动作：`refresh_block`。
- P0 只支持 3 类刷新目标：`activity`、`restaurant`、`transport`。
- `activity` 支持换一个活动卡片。
- `restaurant` 支持换一个餐厅卡片。
- `transport` 暂不单独成卡，只更新 `timeline.detailText` 或 `plan_summary.summaryText`。
- P0 流程固定为：点击 `refresh_block` -> 保存 `lastStablePlanSnapshot` -> 替换目标 block -> 轻量更新 summary / timeline 文案 -> schema 校验 -> 成功渲染新卡片流 -> 失败回滚到 `lastStablePlanSnapshot`。
- P0 请求最小字段包括 `requestId`、`sessionId`、`lineageId`、`version`、`targetRef`、`blockType`、`lastStablePlanSnapshot`、`featureFlags.localReplan=true`。
- P0 只支持 L0 / L1 / L3。
- L2 自动放宽约束暂不实现，遇到需要 L2 的情况直接降级为 L3。
- schema 校验失败必须回滚，失败时保留旧方案，不清空 UI。

阶段边界：

- 本轮没有实现 `refresh_block`。
- 本轮没有实现 activity / restaurant 替换逻辑。
- 本轮没有实现快照回滚。
- 本轮没有实现 schema 校验回滚。
- 本轮没有实现完整 cascade engine、锁定项复杂求解、多版本快照、撤销栈、协同参与、execution 队列联动或 SQLite 写入。

## 2026-06-04 V5 P0 Schema 验收契约冻结

目标：冻结 V5 P0 schema 验收链路，把 `ui-contract.schema.json` 固定为事实源，并明确后续类型生成、后端契约测试、adapter 契约测试和 fixture golden tests 的关系。

已更新：

- `ui-contract.schema.json`
- `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- 采用方案 C：Schema + 类型生成 + Golden Fixtures。
- `ui-contract.schema.json` 是 V5 P0 UI Contract 的事实源。
- 后续 TS 类型必须从 `ui-contract.schema.json` 生成或校验。
- 后续 Python 类型 / 后端 contract models 必须从 `ui-contract.schema.json` 生成或校验。
- 后端 contract tests 必须校验 backend planned/mock responses 是否符合 schema。
- adapter contract tests 必须校验旧 `agent-core.js` 经 adapter 转换后的输出是否符合 schema。
- fixture golden tests 必须校验 golden fixtures 是否符合 schema 和稳定快照。
- P0 golden fixtures 固定为：`success.backend-planned.v5-p0.json`、`success.adapter-fallback.v5-p0.json`、`error.schema-validation-failed.v5-p0.json`、`error.unsafe-input.v5-p0.json`、`error.version-conflict.v5-p0.json`。
- negative fixtures 必须放入 `fixtures/v5/generative-plan/invalid/`，不能作为前后端共享渲染样例。

阶段边界：

- 本轮没有生成 TS 类型。
- 本轮没有生成 Python 类型。
- 本轮没有新增 backend contract tests。
- 本轮没有新增 adapter contract tests。
- 本轮没有新增 fixture golden tests。
- 本轮没有创建实际 golden fixture JSON 文件。

## 2026-06-04 V5 P0 卡片类型白名单契约冻结

目标：冻结 P0 轻量 MVP 的卡片类型白名单，明确首版主渲染链只实现 6 类卡片，其它卡片类型保留 schema 枚举但暂不进入首版渲染主链路。

已更新：

- `ui-contract.schema.json`
- `V5_CARD_TYPE_WHITELIST.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- P0 主渲染链只实现 6 类卡片：`plan_summary`、`assumption_banner`、`activity`、`restaurant`、`timeline`、`soft_prompt`。
- `plan_summary` 必须实现，用于展示推荐方案总览。
- `assumption_banner` 必须实现，用于展示人数、预算、区域、时间等默认假设。
- `activity` 与 `restaurant` 必须实现，用于展示本地生活方案核心内容。
- `timeline` 必须实现，用于展示简易行程时间线和可执行感。
- `soft_prompt` 必须实现，用于安全或关键缺口确认，覆盖 `unsafe_input`。
- `transport` 不单独成卡，先并入 `timeline.detailText` 或 `plan_summary.summaryText`。
- `risk_notice` 不单独成卡，先由 `plan_summary.riskText` 或 `soft_prompt` 承接，独立风险卡放到 P1。
- `collaboration_placeholder` P0 不进主流程，只保留 schema 枚举。
- `execution_summary` P0 不做完整 execution 生命周期卡片，执行按钮可挂在 `plan_summary` 上。

阶段边界：

- 本轮没有实现任何卡片组件。
- 本轮没有修改前端渲染逻辑。
- 本轮没有删除 schema 中的后续卡片枚举。
- 本轮没有实现 collaboration、execution、transport standalone card 或 risk notice standalone card。

## 2026-06-04 V5 P0 错误恢复矩阵契约冻结

目标：冻结 P0 错误恢复矩阵，把 HTTP、用户展示、fallback、是否阻断、状态保留、CTA、推荐动作和 telemetry 统一到 schema 与文档，避免前端、后端和测试各自解释错误语义。

已更新：

- `ui-contract.schema.json`
- `V5_ERROR_RECOVERY_MATRIX.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- P0 矩阵覆盖：`bad_request`、`schema_validation_failed`、`unsafe_input`、`version_conflict`、`cascade_conflict`、`planning_unavailable`、`backend_timeout`、`backend_unavailable`、`internal_error`、`runtime_state_conflict`、`snapshot_missing`。
- `ErrorRecovery` 扩展为结构化对象，不再只保留 `recommendedAction`。
- `ErrorRecovery` 必须包含：`code`、`httpStatus`、`severity`、`recoverable`、`blocking`、`fallback`、`userMessageKey`、`recommendedAction`。
- `preserve` 用于表达是否保留旧方案、`lastStablePlanSnapshot`、是否禁止渲染后端脏数据，以及当前可见状态。
- `telemetry` 用于表达 `logLevel` 和 `auditRequired`。
- `schema_validation_failed` 不渲染后端脏数据，走 adapter fallback。
- `unsafe_input` 不自动 fallback，展示 Soft Prompt。
- `version_conflict` 保留旧方案。
- `cascade_conflict` 保留 `lastStablePlanSnapshot`。
- `backend_timeout`、`backend_unavailable`、`internal_error` 使用本地 `agent-core.js`，其中 `internal_error` 需要记录。
- `runtime_state_conflict` 保留当前视图并刷新 runtime state。
- `snapshot_missing` 保留当前可见方案并要求重新生成。

阶段边界：

- 本轮没有实现前端错误恢复 UI。
- 本轮没有实现后端错误 handler。
- 本轮没有实现 telemetry、audit 持久化、runtime 刷新或完整 cascade engine。
- 本轮没有修改业务代码。

## 2026-06-03 V5 P0 Feature flag 读取与优先级契约冻结

目标：冻结 V5 P0 feature flag 的名称、默认值、读取来源、冲突优先级、硬保护规则和调试解释字段，避免前端、后端和测试各自计算 effective flags。

已更新：

- `ui-contract.schema.json`
- `V5_FEATURE_FLAG_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- flag 名称继续保持 5 个：`v5GenerativeUI`、`adapterFallback`、`localReplan`、`collaborationPlaceholder`、`executionContractOnly`。
- P0 默认值固定为：`v5GenerativeUI=false`、`adapterFallback=true`、`localReplan=true`、`collaborationPlaceholder=false`、`executionContractOnly=true`。
- effective flags 合成顺序固定为：schema/defaults -> runtime/build config -> localStorage/sessionStorage -> URL query override -> per-request override -> safety hard guards。
- 业务 flag 优先级固定为：per-request override > URL query override > session/localStorage > runtime/build config > schema defaults。
- safety hard guards 优先级最高，不允许被任何 flag 覆盖。
- 硬保护错误包括：`unsafe_input`、`schema_validation_failed`、`version_conflict`、`cascade_conflict`、`backend_timeout`、`planning_unavailable`。
- 后端只能收窄能力，不能在前端 effective `v5GenerativeUI=false` 时强制开启 V5 渲染。
- 请求继续携带 `featureFlags`；可选 `featureFlagResolution` 仅用于联调解释，不作为渲染依赖。

阶段边界：

- 本轮没有实现 feature flag resolver。
- 本轮没有修改前端读取 localStorage、URL query 或 request override 的代码。
- 本轮没有修改后端 handler。
- 本轮没有新增远程 flag 服务、灰度发布或百分比 rollout 能力。

## 2026-06-03 V5 P0 mock fixture 契约冻结

目标：冻结 `/api/generative-plan` P0 mock fixture 的目录、manifest、成功样例、adapter fallback 样例、error envelope 和 invalid negative fixture 边界，避免 mock、前端渲染、adapter 验收和测试各自使用不同样例。

已更新：

- `ui-contract.schema.json`
- `V5_MOCK_FIXTURE_CONTRACT.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- `source` 明确允许 `agent_core_adapter`，用于区分后端 `mock/planned` 返回和旧 `agent-core.js` 经 adapter 转换后的 fallback 返回。
- error fixture 必须在 fixture body 内显式包含 `httpStatus`，不能只依赖 `manifest.json`。
- adapter fallback 必须配套保留旧 `agent-core.js` plan 输入样例：`input.agent-core-plan.v5-p0.json`。
- 推荐目录固定为 `fixtures/v5/generative-plan/`。
- 核心必备 fixture 固定为 `success.backend-planned.v5-p0.json`、`success.adapter-fallback.v5-p0.json`、`error.schema-validation-failed.v5-p0.json`。
- 建议补充 `error.unsafe-input.v5-p0.json` 和 `error.version-conflict.v5-p0.json`。
- schema validation 失败拆成 shared fixture 和 `invalid/` negative fixture：shared fixture 是合法 error envelope，必须过 schema；脏后端响应样例只能放 `invalid/`，不作为前后端共享渲染样例。
- success fixture 最小覆盖：1 个 selected plan、1 个 activity、1 个 restaurant、1 个 transport 或 timeline block、plan/activity/restaurant/timeline card，以及 2 到 4 个 P0 actions。

阶段边界：

- 本轮没有创建真实 fixture JSON 文件。
- 本轮没有实现 `/api/generative-plan` mock handler。
- 本轮没有实现 adapter。
- 本轮没有修改 `agent-core.js`、`app.js`、后端 handler 或业务测试。

## 2026-06-03 V5 P0 前端 adapter 字段映射契约冻结

目标：把旧 `agent-core.js` plan 到 V5 UI Contract 的字段级映射沉淀为文档和 schema，避免后续前端 adapter 实现时临场解释旧字段。

已更新：

- `ui-contract.schema.json`
- `V5_ADAPTER_FIELD_MAPPING.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结内容：

- 顶层映射：`recommendedPlanId`、`plans[]`、`executionQueue`、`agentLoopTrace`、`needsClarification`、`clarification`、`parsed.assumptions`。
- Plan 映射：`id`、`name`、`reason`、`risks[]`、`score`、`fit`、`budget`、`totalDuration`、`recommended`。
- Activity / Restaurant 映射：名称生成实体和卡片，距离、价格、标签、预约状态进入 `meta`，缺失名称生成安全 placeholder。
- Timeline 映射：P0 只保留 `timeLabel`，不强制解析 `startTime/endTime`。
- Actions 映射：只允许 P0 action 白名单；预览文本不生成真实 action；预约和消息动作只生成本地模拟或占位。
- Assumption Banner 映射：人数、预算、区域、时间预设和交通默认值进入 assumption items，缺失时不阻塞。
- Risk / Notice 映射：风险单独生成 `risk_notice`，安全风险优先展示 `soft_prompt`。
- 降级策略：空 plans、缺 activity、缺 restaurant、缺 timeline、缺 action target、schema 校验失败均有明确处理。

阶段边界：

- 本轮没有实现 adapter。
- 本轮没有修改 `agent-core.js`、`app.js`、后端 handler 或测试。
- 本轮只沉淀契约；后续实现时仍需要用 schema 校验 adapter 输出。

## 当前阶段

当前项目处于“V3 比赛主链路稳定化 + V4 alpha 薄 Runtime 后端切片已落地”的阶段。

更具体地说：

- 比赛主链路仍然是本地 Mock 驱动的执行型 Web Demo。
- 与旧文档不同，仓库里已经实际落地了可选后端增强、意图识别、反馈复盘和结构化记忆链路。
- 后端已经实现薄层 `POST /api/runtime`，并配套提供反馈/记忆与 Runtime schema、契约测试及 API 测试。
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
- 当前已有 alpha 级反馈/记忆与 Runtime 契约及薄层后端实现，但仍未将前端主规划链路迁移为完整 Runtime 状态机。

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
- 反馈与记忆契约文件 `feedback-memory.schema.json`。
- 薄层 Runtime 契约文件 `runtime.schema.json` 及 `POST /api/runtime` 聚合端点。
- `test_contract_schemas.py` 与 `test_runtime_api.py` 自动化测试。
- 后端不可用时自动回退本地规则解析。

## 当前未完成

- 还没有把前端当前的规划、候选生成、重排与模拟执行迁移为完整状态机式 Runtime；当前薄端点聚合后端增强结果，LangGraph 仍主要覆盖意图识别链路。
- 还没有接入真实生活服务执行平台；订座、下单、排队、买票、发消息和提醒仍只做 Mock。
- 还没有做浏览器侧完整人工回归记录。
- LangGraph 依赖当前存在非阻塞的弃用告警，后续升级或配置时需要消除。

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
- 截至该步骤，契约只覆盖 `/api/intent`；后续薄 Runtime 切片已经补入反馈/记忆和 Runtime alpha 契约，但仍不代表完整产品级 Runtime 已完成。

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

## 2026-05-25 状态口径校准

目标：消除 README、进度记录与 Spec Kit 工件对薄 Runtime 实现状态的互相矛盾，固定“V3 Mock 主链路 + V4 alpha 薄 Runtime 后端切片”的当前口径。

已确认事实：

- `POST /api/runtime` 已实现，用于 Runtime 状态与后端增强结果聚合；前端规划仍由 `agent-core.js` 负责。
- `feedback-memory.schema.json` 与 `runtime.schema.json` 已存在，分别覆盖反馈/候选记忆和薄 Runtime alpha 契约。
- `test_contract_schemas.py` 与 `test_runtime_api.py` 已存在并可通过验证。
- 这组能力是兼容性增量，不改变“外部执行动作全部 Mock”的产品边界，也不表示完整 V4 Runtime 已完成。

## 当前验证基线（2026-05-25 已执行）

基线规则：Python 相关验证统一使用项目虚拟环境 `.\.venv\Scripts\python.exe` 运行，不再以全局环境是否安装 `pytest` 作为项目验证状态判断依据。PowerShell 下前端回归使用 `npm.cmd`，避免 `npm.ps1` 被执行策略拦截。

已执行：

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\graph_runtime.py .\test_backend_core.py .\test_graph_runtime.py .\test_contract_schemas.py .\test_runtime_api.py
.\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py
.\.venv\Scripts\python.exe -m pytest .\test_backend_core.py .\test_graph_runtime.py .\test_runtime_api.py -q
.\.venv\Scripts\specify.exe check
```

结果：

- `npm.cmd test` 通过，输出 `All agent-core tests passed.`。
- Python 后端与测试文件通过语法级检查。
- 契约测试通过，共 7 项。
- pytest 基线通过，共 16 项：后端核心、LangGraph 编排与 Runtime API 测试均已执行。
- Spec Kit `0.8.7` 自检通过。
- pytest 运行期间出现 LangGraph 依赖的弃用告警，当前不影响测试通过，但应作为后续依赖治理事项保留。

## 2026-05-25 本轮文档更新

已更新：

- `README.md`
- `progress.md`
- `DESIGN.md`
- `lessons.md`
- `specs/001-v4-runtime-state-machine-memory-loop/spec.md`
- `specs/001-v4-runtime-state-machine-memory-loop/plan.md`
- `specs/001-v4-runtime-state-machine-memory-loop/quickstart.md`
- `specs/001-v4-runtime-state-machine-memory-loop/tasks.md`
- `specs/001-v4-runtime-state-machine-memory-loop/analysis.md`

更新目标：

- 将当前口径统一为“V3 Mock 主链路 + V4 alpha 薄 Runtime 后端切片已落地”。
- 记录薄层 `POST /api/runtime`、alpha 契约及已通过测试，消除“仅文档阶段”的过时表述。
- 固定 `.venv` pytest 与 PowerShell 前端回归命令，防止全局环境状态再次污染进度判断。
- 保持“外部执行动作全部 Mock”及“当前不是完整生产级 Runtime”的边界。

## 剩余风险

- 对外讲解时如果只说“有后端增强、意图识别、记忆闭环”，仍可能让人误解为已经接入真实生活服务平台。
- 对外讲解时如果继续说“完全没有后端”，又会和仓库代码事实冲突。
- 当前自动化验证已覆盖后端与薄 Runtime API，但尚缺完整浏览器人工回归证据。
- 当前实现仍然以 Mock 业务闭环为主，不应夸大为成熟的线上可用 Agent Runtime。
- LangGraph 依赖弃用告警尚未处理，后续升级依赖时存在小幅维护风险。

## 公开历史评估

- 当前文档版本已经做了去品牌化和公开仓库收敛处理。
- 但这些内容如果曾经被推送到公开远程，历史提交里仍可能保留旧表述。
- 后续可选动作是单独评估是否需要清理 Git 历史、处理缓存或接受“仅当前版本已净化”的结果。

## 下一步建议

1. 如果目标是比赛交付，继续把讲解口径固定为“Mock 主链路 + 可选增强后端”，避免叙事漂移。
2. 如果目标是继续做 V4，优先规划前端主规划链路向完整 Runtime 状态机的迁移边界，并处理 LangGraph 告警。
3. 如果目标是提升公开仓库可信度，补一次浏览器人工回归，并评估是否要处理公开历史。

## 2026-05-27 V4 alpha Runtime 安全与降级契约加固

目标：在新 UI 接入前，先稳定候选记忆隐私边界、失败状态语义与 SQLite 故障降级路径。

已实现：

- 候选记忆执行 `correct` 时重新分类与结构化；L2/L3 更正拒绝写入，候选保持 `pending` 可重试；`adopt` 也会防御性复核历史或异常候选。
- 敏感等级判断调整为优先识别 L3，避免“支付密码”等内容被宽泛支付规则低估。
- Runtime 的嵌套 `feedback` 与 `memoryDecision` 采用结构化输入；非法 action 或空白更正返回校验错误，不再伪造 `memory_ignored -> done`。
- SQLite 在意图/记忆读取失败时仍允许本地规划回退；在反馈或候选确认失败时返回操作可恢复状态并保留当前步骤。
- `/api/feedback` 与候选 decision 的存储故障返回 HTTP 503；健康检查在数据库不可用时仍可返回不可用状态。
- 已明确长期记忆只保存偏好与复盘经验；未来第三方平台授权所需隐私资料必须另设用途受限通道。

验证记录：

```powershell
.\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\graph_runtime.py .\test_backend_core.py .\test_graph_runtime.py .\test_contract_schemas.py .\test_runtime_api.py
.\.venv\Scripts\python.exe -m unittest .\test_contract_schemas.py
.\.venv\Scripts\python.exe -m pytest .\test_backend_core.py .\test_graph_runtime.py .\test_runtime_api.py -q
npm.cmd test
node --check .\agent-core.js; node --check .\app.js; node --check .\tests.js
.\.venv\Scripts\specify.exe check
```

阶段结果：前端回归、JavaScript 语法检查与 Spec Kit 自检通过；契约 unittest `9` 项通过，pytest `33` 项通过；仍保留既有 LangGraph 依赖弃用警告，未纳入本轮修复范围。

## 2026-05-28 V4 alpha Runtime 记忆安全二次加固

目标：根据独立只读审查结果，修复长期记忆准入绕过、敏感拒绝响应回显和 audit 提交后失败误重试问题。

已实现：

- 新增统一长期记忆准入层，`adopt` / `correct` 在写入 `memories` 前统一校验最终落库和索引字段，包括 `type`、`key`、`value`、`evidence`、`scope`、`source` 和派生 `search_text`。
- 扩展敏感识别，阻断裸手机号、长数字凭据、授权码、token、API key、secret、credential 等进入长期记忆。
- 收紧候选决策错误响应，敏感拒绝、空白更正和已决策候选不再返回完整 `candidate.value` / `candidate.evidence`。
- 将 audit JSONL 定义为 best-effort 非阻断日志；audit 写失败不再覆盖已经成功提交的 SQLite 主操作。
- 同步更新 `feedback-memory.schema.json`、`runtime.schema.json`、Runtime 契约、spec 和 readiness checklist，并补充 direct / runtime API 回归测试。

验证记录：

```powershell
.\.venv\Scripts\python.exe -m py_compile .\server.py .\backend_core.py .\test_backend_core.py .\test_runtime_api.py .\test_contract_schemas.py
.\.venv\Scripts\python.exe -m pytest .\test_backend_core.py .\test_runtime_api.py .\test_contract_schemas.py -q
npm.cmd test
git diff --check HEAD
```

阶段结果：Python 编译通过；pytest `46` 项通过，仍只有既有 LangGraph 依赖弃用告警；前端 `agent-core` 回归通过；`git diff --check HEAD` 通过，仅保留 Windows LF/CRLF 提示。

## 2026-06-01 V5 Generative UI / 协同 / 执行契约决策沉淀

目标：在不执行代码的前提下，沉淀下一阶段 Generative UI、局部重排、协同分享、Mock 用户画像和执行状态机的产品/契约决策。

已沉淀文档：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

关键决策：

- 后端返回 JSON，前端渲染 Generative UI 卡片；不返回 HTML。
- UI Contract 独立管理卡片、时间轴、按钮、Banner 和微调组件。
- Runtime / Execution 管状态、审计、动作流转；只与 UI Contract 共享状态枚举和 ID。
- 不把 UI cards 强行塞进 `runtime.schema.json` 主结构。
- 普通模糊输入直接生成完整路线；极限模糊输入 30 秒内生成可展开路线意图卡，用户点击后再生成完整时间轴。
- 默认不阻塞生成；体验类缺口用 Assumption Banner 和微调组件处理，安全类缺口用 Soft Prompting 并默认降级到安全路线。
- “换一换”采用局部替换 + 涟漪重排，替换餐厅时重算到餐厅交通、到达时间、用餐结束时间和预算。
- Mock_User_Profile 明确放入 SQLite，并通过 Mock API 暴露。
- 协同采用非对称模式：协作者只反馈，不直接修改主方案；Agent 基于反馈生成派生 Plan B，由发起人最终采纳或拒绝。
- Mock 的是朋友/家人真实参与；真实的是本地协同状态保存并参与状态机判断。
- 分享链接首版只要求本机可访问；分享页允许用户手动点“赞 / 不行 / 餐厅 OK / 评论”等反馈。
- 新增独立 execution endpoint；状态枚举、审计事件类型和 Mock 边界说明从共享 contract 引用。
- `/api/executions` 负责写入和推进执行状态；`/api/runtime` 只负责展示当前运行摘要。

阶段边界：

- 本轮没有实现代码。
- 本轮没有修改 `runtime.schema.json`。
- 本轮没有接入真实商家、真实消息、真实支付或真实协作者。
- 后续实现前应先补 UI Contract、Shared Contract、Execution Contract 和 SQLite 数据模型设计。

## 2026-06-02 V5 协同分支与分享访问决策补充

目标：继续只做决策沉淀，补齐协同反馈、派生方案、主分支采纳、分享访问控制和反馈粒度的产品边界。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `progress.md`

新增决策：

- 协同反馈不会自动生成 Plan B；必须由发起人点击“根据反馈生成新方案”后才生成派生方案。
- 协同反馈可以影响按钮、提示和建议，但不能自动覆盖当前 Main Branch。
- 多个协作者反馈冲突时，按冲突簇生成多个派生方案，而不是每条反馈生成一个方案。
- 派生方案首版最多 3 个，避免 UI 失控。
- 发起人一键采纳 Plan B 后，Plan B 成为新的 Main Branch；旧 Main Branch 保留历史，并记录 `previousMainBranchId`。
- 局部采纳首版使用“同步到主方案”按钮，不做拖拽。
- 推荐方案支持活动、餐厅、交通、预算的逐项反馈；备选方案只支持轻量整体反馈。
- “不标注 Mock”仅限用户 UI；README、演示讲解、工程文档和审计日志必须明确本地模拟协同边界。
- 分享页访问控制采用 `shareId + token`；token 首版采用“本次会话有效”。
- 协作者不能直接让执行按钮变为可用；最终仍由发起人确认。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 协同分支剩余歧义收口

目标：继续只做决策沉淀，收口 token 有效期、冲突分组规则和采纳新 Main 后旧分享页行为。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 分享 token 首版采用“本次会话有效”，不采用固定 24 小时有效期。
- 多个协作者反馈冲突时，按“偏好方向”聚类，保留反馈目标和协作者来源，最多生成 3 个派生 Plan。
- 采纳新 Main Branch 后，旧分享页保留旧 Main 快照，不自动跳转；顶部提示“已有新版本”，并提供“查看新版本”按钮。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 分享会话与偏好聚类规则补充

目标：继续只做决策沉淀，补齐 token 生命周期、偏好方向聚类规则和查看新版本的访问边界。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- token 生命周期定义为 `SessionId` 有效期；`SessionId` 失效后，分享 token 也失效。
- 按“偏好方向”聚类需要规则词典和优先级，首版方向包括清淡饮食、少走路、刺激活动、低预算等。
- 偏好聚类必须保留反馈目标和协作者来源，不能只输出不可解释的综合标签。
- 聚类优先级：安全与健康相关方向优先；明确反对优先于普通点赞；多人共同指向优先于单人反馈；发起人锁定块不被协作者反馈直接覆盖。
- “查看新版本”复用原 token，但只能访问同一 `planLineageId` 下的新 Main，不能跨方案链路访问。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 UI Contract 接口契约决策补充

目标：继续只做文档沉淀，收口 Generative UI 接口、版本、响应结构和卡片最低字段约束。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 新增独立 `POST /api/generative-plan`，专门返回卡片、时间轴、按钮和 Banner。
- 不把 UI cards 嵌入 `/api/runtime`；`/api/runtime` 仍只负责运行摘要。
- UI Contract 使用全局版本 + 单卡版本：`uiSchemaVersion` 和 `cardSchemaVersion`。
- 响应采用 `cards + entities` 双层结构：`cards` 负责渲染，`entities`、`timeline`、`actions` 负责交互语义。
- 后端可返回 `summaryText`、`reasonText`、`riskText`，前端控制布局和按钮。
- 后端不能只返回一段不可解析自然语言。
- 每张卡最低统一字段：`id`、`type`、`status`、`title`、`summaryText`、`actions`、`entityRef` 或 `targetRef`、`meta`。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。
- 具体 JSON Schema 后续单独设计。

## 2026-06-02 V5 Cascade Reschedule 失败分级决策补充

目标：继续只做文档沉淀，收口 Cascade Reschedule 的失败等级、放宽约束确认和原方案保留策略。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- Cascade 失败采用“保留原方案 + 分级降级 + 用户确认放宽约束”的策略。
- L0：系统直接完成替换，用户无感；但不自动执行任何高影响动作。
- L1：替换成功，但用轻提示说明时间、预算或交通等轻微影响。
- L2：系统预选最小放宽项，但不自动执行，必须由用户确认。
- L2 最小放宽项包括半径小幅扩大、预算档小幅上调、时间窗口小幅移动、替换为相邻类型餐厅或活动等。
- L3：无法生成可执行替代方案时，保留原方案；原方案仍可查看和执行，并提供人工确认或重新输入入口。
- L3 不清空当前方案，也不让失败结果覆盖原方案。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 协同分享生命周期、SQLite 与 audit 决策补充

目标：继续只做文档沉淀，收口协同分享 token 生命周期、刷新行为、SQLite 字段、反馈修改、已读状态和 audit 事件。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 分享 token 首版为“本次会话有效”，生命周期绑定后端生成的 demo `SessionId`。
- 只要 `SessionId` 仍有效，刷新分享页后仍可访问并提交反馈。
- `SessionId` 失效后，分享页可展示旧快照，但不能继续提交反馈。
- SQLite 建议表：`shares`、`share_reviewers`、`share_feedback`、`audit_events`。
- `shares` 字段包括 `shareId`、`tokenHash`、`sessionId`、`planId`、`planLineageId`、`mainBranchId`、`status`、`createdAt`、`expiresAt`、`latestMainBranchId`。
- `share_reviewers` 字段包括 `reviewerId`、`shareId`、`displayName`、`role`、`preferenceTags`、`status`、`viewedAt`、`lastFeedbackAt`。
- `share_feedback` 字段包括 `feedbackId`、`shareId`、`reviewerId`、`planId`、`branchId`、`targetType`、`targetId`、`reaction`、`comment`、`preferenceDirection`、`version`、`isLatest`、`createdAt`、`updatedAt`。
- `audit_events` 字段包括 `eventId`、`eventType`、`actorType`、`actorId`、`shareId`、`planId`、`payloadJson`、`createdAt`。
- 手动反馈允许多次修改；UI 展示最新反馈，SQLite 保留旧反馈为历史或通过 audit 保留。
- 修改反馈不直接改主方案，只影响建议和“根据反馈生成新方案”。
- 需要模拟“已读但未反馈”状态，例如“朋友A已查看，暂未反馈”。
- 协同分享必须进入 audit，但只记录关键事件：`share_created`、`share_viewed`、`feedback_created`、`feedback_updated`、`branch_suggested`、`branch_adopted`、`execution_unlocked`。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。
- SQLite 字段是数据模型决策，不代表已经实现迁移。

## 2026-06-02 V5 分享过期语义与 audit 脱敏决策补充

目标：继续只做文档沉淀，收口 `expiresAt` 语义、只读旧快照规则、audit 事件命名和敏感字段处理。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- `execution_unlocked2.` 是笔误，规范事件名为 `execution_unlocked`。
- `expiresAt` 表示当前 share token 可提交反馈的截止时间。
- `SessionId` 有效且 `now <= expiresAt` 时，分享页可查看并提交反馈。
- `SessionId` 失效或 `now > expiresAt` 时，分享页只展示旧快照，不能继续提交反馈。
- 旧快照可看不代表 token 仍有效，只表示分享页进入只读态。
- `payloadJson` 采用事件级 allowlist + 脱敏策略；每类事件只允许安全字段进入 audit，敏感字段必须脱敏或只记录引用 ID。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 UI 严格 schema、引用分工与单步撤销决策补充

目标：继续只做文档沉淀，收口 `cards + entities` 的 schema 严格性、`entityRef` / `targetRef` 分工、状态分层和重排撤销策略。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 后续 `ui-contract.schema.json` 采用全量严格 schema，约束顶层响应、卡片、实体、时间轴、动作、必填字段、枚举和引用格式。
- 不允许依赖未解析自然语言补齐结构，也不允许临时增加未声明字段承载关键状态。
- `entityRef` 表示卡片主要展示的数据对象，例如活动、餐厅、时间轴块、方案分支或协同分享对象。
- `targetRef` 表示按钮、反馈、刷新、同步、采纳等动作要作用的目标。
- 展示实体用 `entityRef`；动作目标必须显式提供 `targetRef`，不要让前端从文案反推动作目标。
- 状态采用 Shared 主状态 + UI 局部状态：主流程状态由 Shared Contract 定义，UI 局部状态只服务展示。
- 主流程状态覆盖 plan、branch、share、execution 等核心对象；卡片展示状态可以独立，但不能覆盖或伪造主流程状态。
- 重排采用单步撤销：每次重排前保存 `lastStablePlanSnapshot`。
- 用户点击“一键撤销”后回到上一个稳定方案。
- 再次重排时，新的重排前状态覆盖旧的 `lastStablePlanSnapshot`。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有新增 `ui-contract.schema.json`。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 SQLite 数据层决策补充

目标：继续只做文档沉淀，收口 Mock 用户画像、多模块 SQLite、迁移机制、JSON 快照和推断来源存储策略。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- `Mock_User_Profile` 支持多用户结构，但首版只保留并启用 `mock_xiaoming`。
- SQLite 范围采用多个数据库文件拆分，而不是把 Mock 用户画像、协同分享、方案分支和执行队列混在一个数据库里。
- 建议模块包括 profile、collaboration、plan、execution、audit。
- 每个模块各自维护一张轻量 `schema_migrations`，至少记录迁移版本、名称、执行时间和结果。
- 方案回放采用事件溯源 + 多版本 JSON 快照，保存关键方案快照和关键事件 JSON payload。
- JSON 快照用于回放和审计解释，不替代用于查询、状态判断和权限判断的结构化字段。
- 用户画像推断来源使用 JSON 字段存储，不拆成独立来源表。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有创建 SQLite 表或迁移。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 SQLite 拆库、迁移与快照归属收口

目标：继续只做文档沉淀，收口 SQLite 拆分方式、迁移表粒度和快照归属。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- SQLite 最终采用多个数据库文件，而不是同库表名前缀或“多库/多模块”模糊表述。
- 每个模块各自维护一张 `schema_migrations`，不使用全局唯一迁移表。
- 方案回放采用事件溯源 + 多版本 JSON 快照。
- 多版本 JSON 快照归属 plan 模块，用于回放当前方案、旧 Main、派生分支和撤销点。

阶段边界：

- 本轮没有实现代码。
- 本轮没有创建 SQLite 文件、表或迁移。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-02 V5 执行队列状态、闸门与重试决策补充

目标：继续只做文档沉淀，收口 execution endpoint 状态枚举、执行前置闸门、失败重试、Mock 结果记录和记忆候选边界。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- Execution 使用独立状态枚举，不完全复用 Runtime 状态枚举。
- Execution 与 Runtime 只共享命名规范、ID 规则和审计字段。
- 一键下单前必须同时满足：发起人已确认、当前 Main Branch 明确、协同状态满足要求、无未解决 L2 / L3 风险、分享 / 反馈没有待处理阻塞意见、执行动作仍在 Mock 边界内。
- 执行动作失败允许分级重试。
- 可恢复失败允许重试，例如 Mock 预约超时、通知失败、排队 token 生成失败。
- 阻塞失败不自动重试，例如用户确认过期、协同状态变化、L3 风险、当前方案版本过期。
- 高影响动作即使是 Mock，也不允许无限重试，必须有重试次数上限。
- 执行队列必须记录每一步 Mock 结果，包括预约、排队、通知、提醒、团购 / 加购等。
- 执行完成后默认只写审计日志。
- 只有在用户显式反馈或系统发现稳定偏好时，才生成记忆候选。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改接口实现。
- 本轮没有新增 execution schema。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-03 V5 UI 表现与假设编辑决策补充

目标：继续只做文档沉淀，收口卡片流、时间轴形态、换一换覆盖范围、Assumption Banner 编辑和编辑后的重排策略。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 卡片流正式替代现有候选方案卡，成为用户主展示界面。
- 旧候选方案卡退为调试 / 兼容视图。
- Timeline / Gantt 首版优先桌面端横向时间轴。
- 移动端纵向时间块可作为后续降级形态，不作为首版主目标。
- “换一换”覆盖活动、餐厅、交通。
- Assumption Banner 中的人数、预算、区域可直接编辑。
- 用户编辑假设后，优先局部重排；如果影响范围过大，再全量重排。

阶段边界：

- 本轮没有实现代码。
- 本轮没有修改 UI 文件。
- 本轮没有新增或修改接口实现。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-03 V5 验证与演示决策补充

目标：继续只做文档沉淀，收口核心接口 schema、分享页测试、静态 Demo 保留、后端不可用回退和优先演示场景。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增决策：

- 每个核心接口都需要补 JSON schema。
- P0 首版 schema 至少覆盖 UI Contract、`/api/generative-plan` 和前端 adapter fallback。
- 分享反馈接口和 execution 接口先冻结 contract 草案，不进入 P0 完整实现。
- 分享页测试、execution API 测试和协同执行闸门测试放到后续阶段。
- 必须保留当前静态 Demo 不依赖后端的运行方式，保证现场稳定。
- 如果后端不可用，Generative UI 必须回退到现有前端本地方案。
- P0 演示优先展示 UI Contract、`/api/generative-plan` mock、前端 adapter、卡片流和局部重排；协同与 execution 放到后续阶段。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增 JSON schema 文件。
- 本轮没有修改测试文件。
- 本轮没有修改 `runtime.schema.json`。

## 2026-06-03 V5 P0 契约冻结决策补充

目标：把下一步实现范围从“完整 V5”收敛为可回滚、可联调的 P0 切片，避免前后端在协同、execution 和 SQLite 尚未稳定时并行发散。

已更新：

- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结决策：

- P0 首版只做 Generative UI、UI Contract 和 fallback。
- 协同、execution、复杂 SQLite 先不做完整实现，只保留 UI 占位、contract 草案和后续阶段设计。
- `POST /api/generative-plan` 是 V5 前端规划入口，优先做 mock 接口。
- UI Contract 必须冻结，前端才能稳定实现卡片流。
- `cards` 只负责展示；`entities`、`timeline`、`actions` 负责业务对象和交互目标。
- 必须保留旧 `agent-core.js` fallback，保证静态 Demo 和旧主链路不被 V5 破坏。
- 保留现有 `POST /api/runtime` 的 V4 alpha 薄聚合语义；V5 另行新增 `GET /api/runtime` 运行摘要契约草案。
- P0 不做完整 `/api/executions` 生命周期实现，执行仍可由前端本地模拟；先冻结 execution contract。
- 协同分享不进入 P0；只保留协同 UI 卡片占位和契约草案。
- SQLite 最终采用多个数据库文件拆分，但 P0 不做复杂 SQLite 迁移或多模块写入落地。
- V5 必须有 feature flag，默认关闭或至少默认可回退。
- 当前优先级固定为：UI Contract -> `/api/generative-plan` mock -> 前端 adapter -> 卡片流 -> 局部重排 -> 协同 -> execution。

阶段边界：

- 本轮没有实现代码。
- 本轮没有新增或修改 JSON schema 文件。
- 本轮没有新增或修改接口实现。
- 本轮没有修改测试文件。
- 本轮没有运行测试；只做 Markdown 决策沉淀。

## 2026-06-03 V5 P0 UI Contract schema 落地

目标：把已冻结的 V5 P0 契约沉淀为机器可读 schema，优先覆盖 Generative UI、`/api/generative-plan`、前端 adapter fallback 和卡片流基础结构。

已更新：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

新增 schema 覆盖：

- `GenerativePlanRequest`
- `GenerativePlanSuccessResponse`
- `GenerativePlanErrorResponse`
- `UICard`
- `UIEntity`
- `UITimelineItem`
- `UIAction`
- `AssumptionBanner`
- `FeatureFlags`
- `FallbackInfo`

关键约束：

- `uiSchemaVersion` 固定为 `v5-p0`。
- `cardSchemaVersion` 固定为 `v5-p0-card`。
- `POST /api/generative-plan` 作为 V5 前端规划入口。
- `cards` 只负责展示；`entities`、`timeline`、`actions` 负责业务对象和交互目标。
- `entityRef` 或 `targetRef` 至少必须出现一个。
- V5 feature flag 必须存在，默认 `v5GenerativeUI=false`，`adapterFallback=true`。
- 保留旧 `agent-core.js` adapter fallback。
- 保留现有 `POST /api/runtime`，V5 的 `GET /api/runtime` 摘要仍是草案。
- 协同、execution、复杂 SQLite 不进入 P0 完整实现。

阶段边界：

- 本轮没有实现 `/api/generative-plan`。
- 本轮没有实现前端 adapter。
- 本轮没有修改业务代码。
- 本轮没有新增分享、execution 或 SQLite 迁移实现。

## 2026-06-03 V5 P0 高阶契约冻结补充

目标：在已落地的 `ui-contract.schema.json` 基础上，继续冻结后端真实规划、独立 adapter、多 feature flag、全局引用和完整 cascade 契约，避免后续前后端分别发明字段。

已更新：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

冻结决策：

- `/api/generative-plan` 的契约目标是后端真实规划、真实状态、严格错误恢复和完整 runtime 摘要，而不是只做前端包装。
- 保留现有 `POST /api/runtime`；V5 新增 `GET /api/runtime` 完整摘要草案。
- 独立 adapter 固定为 `agent-core-plan-to-ui-contract`，输入旧 `agent-core.js` plan，输出必须符合 `ui-contract.schema.json#/$defs/GenerativePlanSuccessResponse`。
- 多 feature flag 固定为：`v5GenerativeUI`、`adapterFallback`、`localReplan`、`collaborationPlaceholder`、`executionContractOnly`。
- 全局引用采用 ULID 或 UUID，并与 `lineageId`、`sessionId`、`version` 组合使用。
- `entityRef` / `targetRef` 必须显式指向业务对象和交互目标，不能从展示文案反推。
- Cascade 契约冻结为完整 engine 草案，覆盖锁定项、撤销栈、多版本快照、冲突解释和 L0 / L1 / L2 / L3 等级。

阶段边界：

- 本轮没有实现后端真实规划。
- 本轮没有实现 `GET /api/runtime`。
- 本轮没有实现 adapter。
- 本轮没有实现 cascade engine。
- 本轮没有修改业务代码、SQLite 或测试。

## 2026-06-03 `/api/generative-plan` HTTP 行为契约冻结

目标：冻结 P0 联调所需的 HTTP 状态码、错误码、fallback 映射、超时策略和用户体验文案，避免前后端在错误恢复上各自实现不同逻辑。

已更新：

- `ui-contract.schema.json`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `DESIGN.md`
- `progress.md`

HTTP 状态码契约：

- 成功生成 V5 UI：HTTP `200`，`error=null`，前端渲染后端 cards。
- 请求字段非法：HTTP `400`，`error=bad_request`，前端不重试，只提示输入异常。
- schema 校验失败：HTTP `422`，`error=schema_validation_failed`，前端走 adapter fallback，不渲染后端脏数据。
- 输入存在安全风险：HTTP `422`，`error=unsafe_input`，前端展示 Soft Prompt，等待用户确认。
- 当前版本冲突：HTTP `409`，`error=version_conflict`，前端保留旧方案，提示刷新或重试。
- cascade 冲突：HTTP `409`，`error=cascade_conflict`，前端保留 `lastStablePlanSnapshot`，展示冲突解释。
- 后端规划不可用：HTTP `503`，`error=planning_unavailable`，前端走 adapter fallback。
- 后端超时：HTTP `504`，`error=backend_timeout`，前端走 adapter fallback。
- 未预期错误：HTTP `500`，`error=internal_error`，前端走 adapter fallback 并记录。

fallback 映射：

- `backend_unavailable` -> fallback `local_agent_core`，静默或轻提示。
- `backend_timeout` -> fallback `local_agent_core`，轻提示。
- `planning_unavailable` -> fallback `adapter`，轻提示。
- `schema_validation_failed` -> fallback `adapter`，不渲染后端脏数据。
- `version_conflict` -> 不 fallback，保留旧方案，提示刷新或重新生成。
- `cascade_conflict` -> 不 fallback，保留 `lastStablePlanSnapshot`，展示冲突解释。
- `unsafe_input` -> 不 fallback，展示 Soft Prompt，等待用户确认。
- `bad_request` -> 不 fallback，提示输入异常。
- `internal_error` -> fallback `local_agent_core`，轻提示并记录。

超时策略：

- 前端请求 `/api/generative-plan`：6 秒，超时后立即 fallback。
- 后端内部规划：5 秒，返回 `504 backend_timeout`。
- adapter fallback：1 秒内本地生成。
- cascade refresh：3 秒，超时保留旧方案。
- schema 校验：500ms 内，失败则 fallback。

用户体验文案：

- 不说“后端失败”。
- fallback 文案：“已切换到稳定生成模式。”
- 安全风险文案：“需要确认一个安全信息后再继续。”
- 冲突文案：“当前修改会影响已锁定内容，已保留原方案。”

阶段边界：

- 本轮没有实现 `/api/generative-plan`。
- 本轮没有实现 HTTP handler。
- 本轮没有实现前端 fallback 逻辑。
- 本轮没有修改业务代码或测试。

## 2026-06-03 歧义台账统一口径收口

目标：只做 Markdown 文档口径对齐，不执行代码层操作，收口首次全量歧义扫描中暴露的产品、V4 Runtime、V5 和演示边界。

已更新：

- `README.md`
- `COMPETITION_BRIEF.md`
- `DESIGN.md`
- `V5_GENERATIVE_UI_COLLABORATION_PLAN.md`
- `specs/001-v4-runtime-state-machine-memory-loop/data-model.md`
- `specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md`
- `specs/001-v4-runtime-state-machine-memory-loop/quickstart.md`

新增统一口径：

- 对外统一名称为“本地生活执行 Agent”。
- 当前定位为产品原型，不直接展开商业化平台叙事；现阶段只讲执行闭环。
- UI 可以继续使用“执行 / 成功”等自然表达；文档、讲解、审计和工程口径统一解释为“模拟执行 / 模拟成功”。
- V5 当成下一阶段方案，不当成当前已实现能力。
- V3 和 V5 的模糊输入口径统一为：普通模糊输入优先用可解释假设生成方案；安全或关键可执行性缺口使用软追问或保守降级。
- 当前 V4 代码实现是无状态薄 Runtime 聚合；V5 目标是轻量状态机，后端持久化 session、校验状态转移，并逐步接管规划。
- V4 轻量补齐方向包括：Runtime 判断低置信度并返回可恢复降级状态；`feedback` 和 `memoryDecision` 不能同时提交，同时出现时返回请求校验错误。
- 当前协同仍是模拟协同；V5 P0 不做完整协同实现，只保留协同 UI 卡片占位和契约草案，后续阶段再做本地真实协同状态，不做外部真实协作者。
- 用户 UI 可以不显眼标 Mock；但文档、讲解、审计和工程边界必须说明外部执行、实时字段和外部协作者未触达真实平台。
- 产品化范围改为轻量里程碑：Demo / Alpha / Beta 三档；30+ 城市、每类 5+ POI、完整 Mock API 配置和接近产品级 UI 保留为 Beta 方向。
- Runtime 状态转移事实源以 `runtime.schema.json` 为准。
- 当前 `MemoryUsageEvent` 明确为“记忆引用记录”，不是完整审计记录；后续小改数据库时给 `memory_usage_events` 增加 `priority_rule` 字段，默认 `current_request_overrides_memory`，并补测试。
- 重排策略统一为单步撤销。
- 后续 API 契约对齐方向为 Pydantic 禁止额外字段并补测试。
- 差异化只讲“从推荐到执行闭环”，不声称已有商业护城河。
- 验证记录改为写命令和最新运行结果，不依赖过时固定测试数量。

阶段边界：

- 本轮不改代码。
- 本轮不改 JSON schema。
- 本轮不新增或修改测试。
- 本轮不运行测试；只做文档口径对齐。

## Done When

- `README.md`、`progress.md`、`COMPETITION_BRIEF.md`、`DESIGN.md` 对当前状态的表述一致。
- 文档不再把当前状态误写成“完全没有后端”。
- 文档也不把当前状态夸大成“完整 V4 已完成”。
- 文档已去掉品牌化名称和过深的内部实现暴露。
- 前端和后端的验证状态分别被清楚记录。
## 2026-06-06 V5 行程详情、保存方案与恢复垂直切片

### 已完成

- 新增 `/plans/:planId`、`/saved-plans`、`/saved-plans/:snapshotId` 前端路由视图。
- 新增 `saved-plans.js`，负责选中方案完整快照、候选轻量摘要、本地持久化、路由解析、局部重排版本、单步撤销、执行锁定和 reopenPolicy。
- 保存快照只包含当前选中方案的 cards、entities、timeline、actions、assumptions、风险、执行摘要和 lockedRefs。
- 其他候选只保存 `planRef/name/score/recommended/rank`，不保存活动、餐厅、交通、时间线或执行队列。
- 行程详情支持活动、餐厅、两段交通和时间块局部调整；提交生成新 version，显示未保存状态、差异和“撤销本次调整”。
- 模拟执行成功区块只读锁定；pending、failed_recoverable、cancelled、skipped 按 Schema reopenPolicy 展示恢复动作。
- Mock 状态刷新必须经过确认，只写入当前编辑副本，不自动覆盖已保存快照。
- 新增静态服务 SPA 路由回退，保留现有 `/api/*` 公共接口不变。

### 验证

- `npm.cmd test`：通过。
- `python -m unittest test_contract_schemas.py`：23 项通过。
- `node --check app.js`、`node --check saved-plans.js`、`python -m py_compile server.py`：通过。
- `python -m unittest test_runtime_api.py`：系统 Python 缺少 `fastapi`，未能执行；仓库内未发现 `.venv`。
- 内置浏览器：环境启动层连续失败，未完成 1440×900、1024×768、390×844 视觉验收，不以静态检查替代。

### 当前状态

- 自动化契约与行为验证通过。
- 视觉与真实交互 QA 阻塞，不能声明本切片已完成浏览器验收。
