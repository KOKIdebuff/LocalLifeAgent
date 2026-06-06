# V5 Generative UI、协同与执行契约决策

## 状态

本文只记录下一阶段产品与契约决策，不代表代码已经实现。

当前项目仍是 V3 Mock 主链路 + V4 alpha 无状态薄 Runtime 聚合。持久 session、状态机、事件和恢复点属于 V4 Product-grade Headless Runtime；V5 方向是在当前本地生活执行 Agent 产品原型基础上，引入产品化 UI Contract、本地真实协同状态和模拟执行生命周期。既有 V3 Mock 主规划链路和 V4 alpha 薄 Runtime 边界继续有效。

V5 P0 首版范围重新冻结为：Generative UI + UI Contract + fallback + 本地真实协同 + 模拟执行生命周期 + 正式但轻量的 Plan Branch 生命周期。真实的是本地 API、SQLite 状态、分享页、反馈回流、execution / step 状态、plan branch 状态和 audit；模拟的是外部执行结果。P0 不触达真实商家、支付、订座、消息平台，不做公网分享、真实登录态、真实外部协作者，也不引入复杂版本树、局部合并、多级冲突解决或长期权限系统。

## 核心边界

V5 拆成三层：

```text
UI Contract
  管卡片、时间轴、按钮、Banner、微调组件和前端渲染数据

Runtime / Execution
  V4 Runtime 管 session、状态机、事件、持久化和恢复点；独立 Execution 服务管执行生命周期，V5 只通过稳定契约消费

Shared Contract
  管共享状态枚举、审计事件类型、ID 和 Mock 边界说明
```

不要把 UI Contract 强行塞进 `runtime.schema.json` 主结构里。否则 Runtime 会变成 UI 协议，后续维护会变困难。Runtime 与 UI 可以共享 ID 和状态枚举，但不能互相吞并。

## 2026-06-06 Execution Boundary Superseding Decision

This section supersedes any older statement in this document that requires a
complete `/api/executions` task/step lifecycle implementation in V5 P0.

- V4 Runtime P0 owns Runtime Session, Runtime state, Runtime Events,
  persistence, Recovery Points, an optional `activeExecutionId`, and
  authoritative Execution summary Events.
- V4 Runtime P0 does not own Execution, Task, Step, Attempt, retry, timeout,
  cancellation, blocking, or Mock result storage.
- V5 P0 may retain `execution_summary`, execution schemas, fixtures, disabled
  actions, mock projections, and `executionImplementationRequired=false`.
- Execution implementation begins in P1-A with an independent domain module and
  repository; P1-B adds Attempt/failure/retry/version gates; P1-C integrates it
  with Runtime through stable adapters and summary Events.
- Execution may initially be an isolated module in the same FastAPI process.
  A separate process, outbox, worker, or distributed transaction is not required.
- UI must not directly mutate Step state, and Runtime Events must not replace
  complete Execution records.

The approved Runtime access architecture is dual-entry with one Core: legacy
`POST /api/runtime` uses a conversion-only CompatibilityAdapter; new
`/api/runtime/sessions/*` operations use RuntimeAdapter; both share Runtime Core
when the new Core is enabled.

## V4 Runtime / V5 UI 访问边界

V4 Runtime Core 是独立的 headless 运行内核，负责：

- session 生命周期。
- 状态机与状态转移校验。
- 运行事件。
- 最小持久化。
- 恢复点。

V4 Runtime Core 不负责卡片、按钮、布局或前端交互。V5 UI Contract 负责这些展示与交互对象，但不能直接读取 Runtime 内部表、内部类或内部状态实现。

V5 UI 访问 Runtime 只允许通过三类稳定契约：

- `RuntimeAdapter`：定义 V5 或其他客户端如何调用 Runtime，例如创建 session、读取 session、提交 Command、查询事件、暂停、恢复、关闭、查询能力、创建恢复点和回滚到恢复点。客户端不能直接提交 Event。
- `RuntimeCapabilityContract`：拆分为 `targetCapabilities` 与 `effectiveCapabilities`。前者的 `status=supported` 只表示契约已冻结，不表示代码已实现；后者用 `availability=available / degraded / unavailable` 表示当前运行实现真实可用性。V5 只能用 `effectiveCapabilities.availability` 决定启用、禁用、mock 或 fallback。
- `RuntimeEventContract`：定义 Runtime 已确认发生的事件。V5 可以渲染事件流，但不能修改或直接提交事件，也不能从展示文案反推 Runtime 内部状态。

核心约束：

- Runtime 不因 UI 草图中的某个按钮而新增底层能力。
- Runtime 不因页面结构而写死流程。
- Runtime 不直接承诺 UI 层体验。
- V5 UI 不直接绑定 V4 Runtime 内部实现；未来 Runtime 从 thin alpha 升级为 product-grade headless core 时，V5 仍通过 adapter / capability / event 合约接入。

V5 Runtime 摘要固定拆成两个字段：

```json
{
  "runtimeState": "researching_tools",
  "displayPhase": "planning_backend"
}
```

- `runtimeState` 来自 `runtime.schema.json#/$defs/RuntimeState`，用于业务状态、合法转移和恢复判断，是权威状态。
- `displayPhase` 由 V5 按 `ui-contract.schema.json#x-runtimeStateDisplayMapping` 从 `runtimeState` 映射得到，只负责展示、加载提示和降级体验。
- V5 不得使用 `displayPhase` 发起状态转移，不得把 `planning_backend` 等展示阶段写回 Runtime session。

## P0 冻结范围

P0 只实现并验证以下内容：

- UI Contract。
- `POST /api/generative-plan` mock 接口。
- 前端 adapter，用于把旧 `agent-core.js` 本地方案转换为 UI Contract fallback。
- 卡片流主展示。
- `/api/executions` 模拟执行生命周期契约：创建执行、查询执行、推进步骤、返回 execution / steps / status。
- 本地分享页和协同反馈：本地 token 访问、展示 plan snapshot、协作者提交反馈、反馈回流到发起人页面。
- 本地 SQLite 协同状态：保存 share、reviewer、feedback、read state、execution gate 和 audit 关键事件。
- 正式但轻量的 Plan Branch 生命周期：Main / Derived Branch、生成、查看、采纳、拒绝和回滚到上一个 Main。
- 后端不可用或 V5 关闭时，回退到现有前端本地方案。

P0 明确不做完整实现：

- 外部真实执行：不触达真实商家、支付、消息平台、订座系统。
- 公网分享、真实登录态、真实外部协作者、真实用户身份系统、复杂权限系统。
- 复杂 Plan Branch：不做复杂版本树、局部合并、多级冲突解决、长期权限系统。
- 完整 cascade engine、复杂 SQLite 多库迁移体系和长期快照管理。

P0 可保留以下设计占位：

- 多 SQLite 文件拆分方向。
- `GET /api/runtime` 运行摘要契约草案。

V5 需要 feature flag。默认关闭 V5 或至少默认可回退，不能破坏当前静态 Demo 和旧主链路。

## UI Contract Reconciliation / 新 UI 对齐结论

当前新版 UI 的事实源固定为仓库内 `index.html` 和 `app.js`，不存在另一份未提交外部设计稿作为本轮契约事实源。

新版 UI 可以作为 V5 P0 的视觉与交互基线，但不是后端范围扩大的理由。V5 P0 采用严格契约驱动：字段、状态、接口和数据模型以 `ui-contract.schema.json`、V5 P0 Markdown 契约和 V4 Runtime 契约为准；UI 中超出 P0 的入口只能 mock、placeholder、disabled 或 fallback。

P0 体验必须闭环到“确认并执行完成”和“发给家人朋友”，但边界是“本地真实协同 + 模拟执行生命周期”：

- `/api/executions` 必须提供模拟执行生命周期：从当前 plan 创建 execution，查询 execution / steps / status，推进模拟预约、通知、提醒、团购等步骤，状态至少包括 `draft`、`ready`、`running`、`completed`、`blocked`、`cancelled`。
- 分享页必须是本地真实协同：本地 token 访问、展示 plan snapshot、支持协作者提交反馈，不要求公网访问，不要求真实用户身份系统。
- 反馈必须保存到 SQLite，并回流到发起人页面；P0 可以只做到“反馈影响提示和执行闸门”，不一定自动生成 Plan B。
- 本地真实状态必须可保存、可查询、可回放，包括 share、reviewer、feedback、read state、execution gate 和 audit 关键事件。
- “换一换”升级为 activity / restaurant / transport 的线性候选项切换器。transport 作为独立可操作卡展示，但绑定两地点之间的 `routeSegmentId + fromRef + toRef`；切换时联动预览后续时间线、时间、预算、拥堵、步行、换乘风险，采用后才更新 Main。

后端 P0 除 `/api/generative-plan` mock、fixture、schema validation 和标准错误恢复 envelope 外，还必须补本地协同和模拟执行生命周期契约。不得因为 UI 出现服务包、执行队列、分享卡、团购、加购、排队 token 或通知文案，就新增外部真实平台集成。

V5 P0 主体验是 UI Contract 卡片流；旧 plan card 只作为 fallback / debug / 兼容视图，不再作为主体验。

## V5 P0 最终冻结决策

本节是 V5 P0 的最终口径，不引入新的版本名称。

| 主题 | 最终决策 |
| --- | --- |
| Cancel | 允许取消单个 step 和整个 execution；必须记录 `reason`、`actor`、`time`、`affectedSteps`，写入 audit；P0 不做真实补偿动作。 |
| Skip | 低影响 step 可 skip；高影响 step 不允许 skip，只能 retry、cancel 或重新生成方案。 |
| Regeneration | “重新生成”优先走 `/api/generative-plan`，携带当前 snapshot 和反馈摘要；生成新的 derived branch；保存 `regeneration event`、`feedbackIds`、`previousSnapshotId`、`lineage`；失败 fallback 到 `agent-core.js` adapter。 |
| Plan Branch | P0 引入正式但轻量的 Plan Branch 生命周期：支持 Main / Derived Branch、生成、查看、采纳、拒绝和上一个 Main 回滚。 |
| Execution 外部动作 | 仍然全部 mock，不接真实平台。 |

Plan Branch 的 P0 边界是“正式但轻量”：只有一个当前 active main；derived branch 根据反馈生成，最多同时 3 个；状态为 `proposed`、`adopted`、`rejected`、`archived`。采纳某个 derived branch 后，该 branch 成为新的 main，旧 main 变成历史 main snapshot，并记录 `previousMainBranchId`。拒绝的 derived branch 仍保留审计，不删除。Rollback 只支持回滚到上一个 main，不做复杂版本树回滚。P0 不支持局部合并，也不支持“只把 Plan B 的餐厅同步到 Plan A”；这类能力放到 V5 P1。

Feature flag 升级为能力协商层，而不是简单布尔开关：

```text
Contract Defaults
  契约默认值，保证旧 demo 不坏

Client Effective Flags
  前端根据 URL / storage / request / safety guard 计算是否尝试某体验

Backend Capability Declaration
  后端声明当前能支持什么，但只能收窄能力，不能强制前端开启 V5

Safety & Recovery Guards
  schema 失败、unsafe_input、timeout、version_conflict 等硬保护覆盖一切
```

核心分工：

- `featureFlags` 控制前端是否尝试某体验。
- `capabilities` 控制后端当前是否具备某能力。
- `errorRecovery` 控制失败后如何保留状态和 fallback。

三者不能混在一起。能力声明不能替代 feature flag，feature flag 不能替代后端能力，二者都不能绕过 `errorRecovery`。

## P0 追加冻结契约

以下内容已冻结为 P0 契约目标，不代表代码已经实现：

1. 后端规划与运行状态
   - `/api/generative-plan` 以“后端真实规划”为目标，而不是只返回前端包装数据。
   - 响应必须包含真实运行状态摘要 `runtimeSummary`。
   - 错误必须走严格可恢复语义 `errorRecovery`，不能只返回自然语言错误。
   - V5 新增 `GET /api/runtime` 完整摘要草案，保留现有 `POST /api/runtime` 不变。

2. 独立 adapter
   - adapter 名称固定为 `agent-core-plan-to-ui-contract`。
   - P0 adapter 实现在前端，但接口、输入输出和映射规则必须由 `ui-contract.schema.json` 与 `V5_ADAPTER_FIELD_MAPPING.md` 约束。
   - 输入是旧 `agent-core.js` plan。
   - 输出必须符合 `ui-contract.schema.json#/$defs/GenerativePlanSuccessResponse`。
   - 缺字段按 `safe_placeholder`、`drop_noncritical_card` 或 `recoverable_error` 降级。
   - V5 不直接绑定 V4 Runtime 内部实现；未来完整 Runtime 收束后，应通过 adapter / contract 层替换底层来源，而不是大改 V5 UI Contract。
   - 字段映射表已经冻结，详见 `V5_ADAPTER_FIELD_MAPPING.md`；机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.AdapterMappingSet` 和 `x-adapterFieldMapping`。

3. P0 mock fixture
   - fixture 契约详见 `V5_MOCK_FIXTURE_CONTRACT.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.MockFixtureManifest`、`$defs.MockFixtureContract` 和 `x-mockFixtureContract`。
   - P0 fixture 从现有 `agent-core.js` 本地规划输出启动生成：当前本地 plan 经 `agent-core-plan-to-ui-contract` adapter 转成 V5 JSON，作为 `success.adapter-fallback.v5-p0.json` 和 backend mock 样例的共同事实基础。
   - `/api/generative-plan` P0 先用 fixture 驱动，不做自由生成。
   - P0 允许少量确定性轻量分支：普通成功、`unsafe_input`、`schema_validation_failed`、`version_conflict`。
   - 所有核心响应必须走 golden fixtures 和 contract tests。
   - 推荐目录固定为 `fixtures/v5/generative-plan/`。
   - 核心必备 fixture 固定为 `success.backend-planned.v5-p0.json`、`success.adapter-fallback.v5-p0.json` 和 `error.schema-validation-failed.v5-p0.json`。
   - adapter fallback 必须配套保留 `input.agent-core-plan.v5-p0.json`。
   - error fixture 必须在 fixture body 内显式包含 `httpStatus`，不能只依赖 `manifest.json`。
   - `source` 明确允许 `agent_core_adapter`，用于区分后端 `mock/planned` 返回和旧 `agent-core.js` 经 adapter 转换后的 fallback 返回。

4. P0 card type whitelist
   - 卡片类型白名单详见 `V5_CARD_TYPE_WHITELIST.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.UICardType`、`$defs.KnownUICardType`、`$defs.CardTypeWhitelistContract` 和 `x-cardTypeWhitelist`。
   - P0 主渲染链实现 10 类卡片：`plan_summary`、`assumption_banner`、`activity`、`restaurant`、`transport`、`timeline`、`soft_prompt`、`share_summary`、`feedback_summary`、`execution_summary`。
   - `transport` 是绑定 `routeSegmentId + fromRef + toRef` 的独立可操作行程段卡，不是全局交通偏好卡。
   - `risk_notice`、`collaboration_placeholder` 保留为已知类型定义或兼容类型，但不进入首版主渲染链。
   - `risk_notice` 先由 `plan_summary.riskText` 或 `soft_prompt` 承接。
   - `share_summary`、`feedback_summary` 和 `execution_summary` 进入 P0 主渲染链，用于展示本地分享状态、反馈回流和模拟执行生命周期摘要。
5. Schema acceptance
   - Schema 验收契约详见 `V5_SCHEMA_ACCEPTANCE_CONTRACT.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.SchemaAcceptanceContract`、`$defs.SchemaGeneratedTypeTarget`、`$defs.SchemaAcceptanceTestSuite` 和 `x-schemaAcceptanceContract`。
   - `ui-contract.schema.json` 是 V5 P0 UI Contract 的事实源。
   - P0 先做 schema 校验测试。
   - TypeScript 类型必须生成或至少通过 schema 对齐校验。
   - Python 端 P0 先用 JSON Schema 校验，不急着建立完整 Pydantic 模型体系。
   - 后端契约测试、adapter 契约测试和 fixture golden tests 都必须从该 schema 校验。
   - P0 golden fixtures 固定为：`success.backend-planned.v5-p0.json`、`success.adapter-fallback.v5-p0.json`、`error.schema-validation-failed.v5-p0.json`、`error.unsafe-input.v5-p0.json`、`error.version-conflict.v5-p0.json`。
   - P0 最小质量门固定为 4 层：schema baseline、fixture golden、backend contract、adapter contract。
   - `schema / fixture / adapter` 契约测试缺失不应阻塞全部开发，但 V5 P0 真正接入前必须先补最小质量门。
6. Version compatibility
   - 版本兼容契约详见 `V5_VERSION_COMPATIBILITY_CONTRACT.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.UiSchemaVersion`、`$defs.CardSchemaVersion`、`$defs.VersionCompatibilityContract`、`$defs.VersionCompatibilityRules` 和 `x-versionCompatibilityContract`。
   - 前端不再只比较完整版本号，而是识别 `v5` 版本族。
   - 如果响应属于 `v5` 家族，且最低 UI Contract 字段仍通过 schema 校验，前端允许按 P0 能力降级渲染。
   - `requiredCapabilities` 必须全部被前端支持；任何必需能力不支持时，前端必须 fallback，不猜测渲染。
   - `optionalCapabilities` 不支持时可以忽略、合并降级或隐藏对应 UI，不阻断 P0 主卡片流。
   - 未知 card type 不进入主链渲染；未知 action type 隐藏按钮且不执行。
   - 未知字段可以保留在原始 payload、`meta` 或后续扩展区，但前端渲染和业务逻辑不得依赖未知字段。
   - schema 校验失败时不能用版本兼容绕过，必须 fallback。
   - 为支持前向兼容，`UICard.type` 和 `UIAction.type` 的线格式允许字符串；P0 渲染仍以 `KnownUICardType`、`KnownUIActionType` 和白名单策略为准。
7. 能力协商与 feature flag
   - `v5GenerativeUI`
   - `adapterFallback`
   - `localReplan`
   - `collaborationPlaceholder`
   - `executionImplementationRequired`
   - `localCollaborationState`
   - `simulatedExecutionLifecycle`
   - 读取与优先级契约详见 `V5_FEATURE_FLAG_CONTRACT.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.FeatureFlagContract`、`$defs.FeatureFlagResolution`、`$defs.BackendCapabilityDeclaration`、`$defs.CapabilityNegotiationContract`、`x-featureFlagContract` 和 `x-capabilityNegotiationContract`。
   - P0 默认值固定为：`v5GenerativeUI=false`、`adapterFallback=true`、`localReplan=true`、`collaborationPlaceholder=false`、`executionImplementationRequired=false`、`localCollaborationState=true`、`simulatedExecutionLifecycle=true`。
   - effective flags 合成顺序固定为：schema/defaults -> runtime/build config -> localStorage/sessionStorage -> URL query override -> per-request override -> safety hard guards。
   - 业务 flag 优先级为：per-request override > URL query override > session/localStorage > runtime/build config > schema defaults。
   - safety hard guards 优先级最高，不允许被任何 flag 覆盖。
   - 后端只能收窄能力，不能强制前端开启 V5。
   - `featureFlags`、`capabilities` 和 `errorRecovery` 分工独立，不得互相替代。
   - V5 开关支持 URL 与 localStorage/sessionStorage。
   - P0 保留一个开发期调试入口，但不作为正式用户功能。

8. 全局引用规则
   - 全局 ID 使用 ULID 或 UUID。
   - 所有业务引用必须携带 `lineageId`、`sessionId` 和 `version`。
   - `entityRef` / `targetRef` 不允许只靠展示文案或局部字符串反推目标。

9. P0 candidate switcher subset
   - P0 局部重排子集详见 `V5_P0_LOCAL_REPLAN_CONTRACT.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.P0LocalReplanContract`、`$defs.P0LocalReplanRequest`、`$defs.P0LocalReplanResponse`、`$defs.P0CandidateSwitcherState`、`$defs.P0CandidatePreview` 和 `x-p0LocalReplanContract`。
   - P0 不做随机替换或完整 cascade engine，只做稳定候选列表、线性前后切换、差异预览、显式采用、恢复原方案和采用后一次撤销。
   - 正式动作包括 `preview_previous_candidate`、`preview_next_candidate`、`adopt_preview_candidate`、`restore_original_candidate`、`undo_candidate_adoption`。
   - `refresh_block` 仅作为旧 fixture / adapter 的兼容入口，可初始化切换器或预览下一个候选，但不得直接修改 Main；在用户亲自体验审查新功能并明确批准前不得删除。
   - P0 支持 `activity`、`restaurant`、`transport` 三类目标；`transport` 独立成卡，并按行程段绑定。
   - 每段交通维护 `routeSegmentId`、`fromRef`、`toRef`、候选交通列表、当前预览候选、原始候选、已采用候选、时间与预算差异、拥堵/步行/换乘风险和受影响的后续时间线。
   - 每个可替换区块维护候选列表、当前位置、原始候选、已采用候选和受影响时间线；候选历史只在当前编辑会话内保留，首版每块最多 3-5 个候选。
   - 未采用前不得修改 Main、已保存快照、协同状态、执行状态或持久化 plan；采用前后必须明确显示“预览中”和“已采用”。
   - 采用或恢复原方案前必须重新校验时间、预算、风险和 schema；失败时保留当前候选、当前预览和 Main。
   - 完整 cascade engine、锁定项复杂求解、通用撤销栈、多版本预览快照和复杂分支树都放到后续阶段。

10. `/api/generative-plan` HTTP 行为
   - 成功生成 V5 UI：HTTP `200`，`error=null`，前端渲染后端 cards。
   - 请求字段非法：HTTP `400`，`error=bad_request`，前端不重试，只提示输入异常。
   - schema 校验失败：HTTP `422`，`error=schema_validation_failed`，前端走 adapter fallback，不渲染后端脏数据。
   - 输入存在安全风险：HTTP `422`，`error=unsafe_input`，前端展示 Soft Prompt，等待用户确认。
   - 当前版本冲突：HTTP `409`，`error=version_conflict`，前端保留旧方案，提示刷新或重试。
   - 候选加载失败：HTTP `503`，`error=candidate_load_failed`，前端保留当前候选、当前位置、预览、Main 和已保存快照，可重试加载更多。

11. 方案生命周期
   - 详细契约见 `V5_PLAN_LIFECYCLE_CONTRACT.md`。
   - 保存方案只完整保存当前选中方案；其他候选只保存名称、评分、推荐状态、排序和 `planRef` 等轻量摘要。
   - 其他候选不得保存完整活动、餐厅、交通、时间线、执行队列或 cards/entities。
   - 行程详情允许对活动、餐厅和时间块继续局部重排；每次提交生成新 `version`，未修改引用保持稳定，保存前必须显示未保存状态。
   - 重新打开已保存方案时按区块执行状态处理：成功区块只读锁定，未执行区块刷新 Mock 状态，部分成功时只允许调整未执行部分。
   - 协作者只提交带目标引用的建议，不能直接修改共享快照、Main 或执行状态；只有发起人可以采纳、拒绝、生成新 Main 和执行。
   - Plan Branch 首版保持一个当前 Main、最多 3 个 active Derived、显式采纳/拒绝和上一个 Main 回滚，不实现任意分支合并。
   - 候选采用校验失败：HTTP `409`，`error=candidate_adoption_validation_failed`，前端保留当前候选预览和 Main，展示时间、预算、风险或 schema 校验原因。
   - cascade 冲突：HTTP `409`，`error=cascade_conflict`，前端保留 `lastStablePlanSnapshot`，展示冲突解释。
   - 后端规划不可用：HTTP `503`，`error=planning_unavailable`，前端走 adapter fallback。
   - 后端超时：HTTP `504`，`error=backend_timeout`，前端走 adapter fallback。
   - 未预期错误：HTTP `500`，`error=internal_error`，前端走 adapter fallback 并记录。
   - P0 错误恢复矩阵详见 `V5_ERROR_RECOVERY_MATRIX.md`。
   - 机器可读版本同步在 `ui-contract.schema.json` 的 `$defs.ErrorRecoveryMatrix`、`$defs.ErrorRecovery` 和 `x-errorRecoveryMatrix`。
   - `ErrorRecovery` 必须扩展包含 `httpStatus`、`blocking`、`fallback`、`userMessageKey`、`preserve` 和 `telemetry`，不能只保留 `recommendedAction`。
   - `runtime_state_conflict` 和 `snapshot_missing` 也进入 P0 恢复矩阵，但不代表 P0 已完整实现 runtime 刷新或快照恢复。

11. 超时与体验文案
   - 前端请求 `/api/generative-plan` 超时：6 秒，超时后立即 fallback。
   - 后端内部规划超时：5 秒，返回 `504 backend_timeout`。
   - adapter fallback：1 秒内本地生成。
   - cascade refresh：3 秒，超时保留旧方案。
   - schema 校验：500ms 内，失败则 fallback。
   - 用户体验文案不说“后端失败”；fallback 文案为“已切换到稳定生成模式。”
   - 安全风险文案为“需要确认一个安全信息后再继续。”
   - 冲突文案为“当前修改会影响已锁定内容，已保留原方案。”

## 已确认决策

### 1. Generative UI 输出

后端返回 JSON，不返回 HTML。前端负责把 JSON 渲染成卡片流。

Generative UI 使用独立接口：

```text
POST /api/generative-plan
```

该接口专门返回卡片、时间轴、按钮和 Banner，并成为 V5 前端规划入口。不要把 UI cards 嵌入 `/api/runtime`；现有 `POST /api/runtime` 保留旧 V4 alpha 薄聚合语义，V5 另行新增 `GET /api/runtime` 摘要契约，避免改旧接口。

UI Contract 使用双层版本：

- `uiSchemaVersion`：全局 UI 响应契约版本。
- `cardSchemaVersion`：单张卡片契约版本。

`ui-contract.schema.json` 采用全量严格 schema。也就是说：

- 顶层响应、卡片、实体、时间轴和动作都必须有明确字段定义。
- 必填字段、枚举、字段类型和引用格式都必须被 schema 约束。
- 不允许依赖未解析的自然语言补齐结构。
- 不允许实现方临时增加未声明字段来承载关键状态。

默认 UI 展示卡片短句。长解释保留在“查看原因”“风险详情”等展开区域里。

响应采用 `cards + entities` 双层结构：

- `cards` 只负责展示，包括渲染顺序、卡片类型、展示短句和按钮入口。
- `entities`、`timeline`、`actions` 负责业务对象、交互目标和后续局部刷新、执行、协同反馈引用。

后端可以返回展示短句和解释文本，例如 `summaryText`、`reasonText`、`riskText`。前端负责布局、按钮和展开/收起交互。后端不能只返回一段不可解析自然语言。

每张卡最低统一字段：

```text
id
type
status
title
summaryText
actions
entityRef 或 targetRef
meta
```

`entityRef` 与 `targetRef` 分工：

- `entityRef`：这张卡主要展示的数据对象，例如某个活动、餐厅、时间轴块、方案分支或协同分享对象。
- `targetRef`：按钮、反馈、刷新、同步、采纳等动作要作用的目标。

如果卡片只是展示某个实体，必须使用 `entityRef`。如果卡片上的动作作用于不同目标，动作必须显式提供 `targetRef`。不要让前端从展示文案中反推动作目标。

状态采用 Shared 主状态 + UI 局部状态的分层策略：

- 主流程状态由 Shared Contract 定义，覆盖 plan、branch、share、execution 等核心对象。
- UI 局部状态只服务展示，例如 selected、expanded、disabled、warning、loading。
- 主流程对象必须与 Shared Contract 对齐；卡片展示状态可以独立，但不能覆盖或伪造主流程状态。

可选解释字段：

```text
reasonText
riskText
evidenceItems
cardSchemaVersion
```

### 2. UI Contract 范围

UI Contract 负责：

- Assumption Banner
- 卡片流
- 时间轴 / Gantt 时间块
- 按钮与可用动作
- 微调组件
- Soft Prompting 组件
- 协同分享卡片数据
- 执行状态的视觉摘要

UI Contract 独立于 Runtime，但引用共享 ID 与共享状态枚举。

### 2.1 UI 表现决策

卡片流正式替代现有候选方案卡，成为主展示界面。旧候选方案卡退为调试 / 兼容视图，不再作为用户主体验。

Timeline / Gantt 首版以桌面端横向时间轴为优先形态。移动端可以后续降级为纵向时间块，但不作为首版主目标。

“换一换”升级为候选项切换器，覆盖三类块：

- 活动。
- 餐厅。
- 交通。

交通作为独立可操作卡展示，但每张卡必须归属于两地点之间的行程段，不能脱离
`routeSegmentId + fromRef + toRef` 独立存在。

推荐交互：

```text
[ ← 上一个 ]  2 / 5  [ 下一个 → ]
[ 采用这个 ]  [ 恢复原方案 ]
```

候选按当前编辑会话内的稳定顺序线性切换。上一个必须读取本地历史，不重新生成；下一个到达末尾时可加载更多，但首版每个区块最多保留 3-5 个候选。加载失败时保留当前候选。

切换只更新预览，必须同步展示受影响的时间线、时间差、预算差和风险变化。用户点击“采用这个”并通过时间、预算、风险和 schema 校验后，才允许修改 Main。预览阶段不得修改 Main 或已保存快照。

Assumption Banner 中的人数、预算、区域允许直接编辑。

用户编辑假设后，优先触发局部重排；如果影响范围过大，再进入全量重排。

### 2.2 SQLite 数据层决策

V5 SQLite 范围采用多个 SQLite 文件拆分，而不是把 Mock 用户画像、协同分享、方案分支和执行队列全部混在一个数据库里。

建议数据库文件按模块拆分：

```text
profile
  Mock_User_Profile 与推断来源 JSON

collaboration
  shares / share_reviewers / share_feedback

plan
  plan branches / snapshots / lineage

execution
  execution queue / execution steps

audit
  audit_events
```

首版需要轻量迁移机制：

```text
schema_migrations
```

每个模块各自维护一张 `schema_migrations`，至少记录迁移版本、名称、执行时间和结果。后续实现阶段可以用简单 Python 初始化迁移，不需要引入重型迁移框架。

方案回放采用事件溯源 + 多版本快照：

- 在 plan 模块保存多版本 JSON 快照，方便回放当前方案、旧 Main、派生分支和撤销点。
- 关键事件保留 JSON payload，便于解释“方案为什么变成现在这样”。
- JSON 快照不替代结构化字段；结构化字段用于查询、状态判断和权限判断，JSON 快照用于回放和审计解释。

### 3. 模糊输入策略

产品规则不是“先追问再规划”。Agent 应尽量避免传统 Chatbot 式阻塞追问。

修订后的策略：

1. 普通模糊输入：
   - 例子：“周末去哪玩”。
   - 直接生成完整路线。
   - 使用 `Mock_User_Profile` 填默认值。
   - 用 Assumption Banner 说明系统推断的人数、预算和区域。

2. 极限模糊输入：
   - 例子：“好无聊啊，安排一下”。
   - 30 秒内生成可展开的路线意图卡。
   - 不承诺已经生成完整时间轴。
   - 用户点击某张盲盒卡后，再展开成完整时间轴方案。

3. 安全敏感信息缺失：
   - 例子：徒步、夜间、儿童、老人、过敏、驾驶、饮酒、长距离步行。
   - 用 UI 内 Soft Prompting，不回到聊天追问。
   - 必要时先把高风险路线降级为安全路线，直到用户明确确认。

### 4. Assumption Banner 与默认值

`Mock_User_Profile` 直接存 SQLite，并通过 Mock API 暴露。

Mock 用户画像采用多用户结构，但首版只保留并启用 `mock_xiaoming`。

默认推断示例：

- 历史订单均价 -> 人均预算，例如 150 元。
- 常驻地址 -> 默认区域，例如朝阳区周边 5 公里。
- 周末常买双人电影票 -> 默认 2 人出行。

用户画像推断来源使用 JSON 字段存储，不拆成独立来源表。这样首版更容易维护和回放，同时保留后续拆表空间。

Assumption Banner 应允许用户修改这些假设：

```text
双人 · 人均约 150 元 · 朝阳区周边 5 公里
```

用户修改人数、预算或区域后，应触发受控重排，而不是静默改变无关方案细节。

Assumption Banner 的编辑策略：

- 人数、预算、区域可直接编辑。
- 编辑后优先局部重排。
- 当局部重排无法保持时间、预算、协同或执行约束时，再全量重排。

### 5. 候选切换与采用

“换一换”定义为线性候选项切换器，不是随机替换。覆盖活动、餐厅和交通。

每个可替换区块维护：

```text
候选列表
当前候选位置
原始候选
已采用候选
受影响的时间线
```

交通区块额外维护：

```text
routeSegmentId
fromRef / toRef
候选交通列表
当前预览候选
原始候选
已采用候选
时间与预算差异
拥堵、步行、换乘风险
受影响的后续时间线
```

例子：用户在餐厅块切换到下一个候选时：

- 预览新的餐厅 POI。
- 预览去餐厅交通变化。
- 预览到达餐厅时间和用餐结束时间变化。
- 预览总预算变化。
- 预览风险变化。
- 不修改 Main，不修改已保存快照，不修改执行队列。

用户点击“采用这个”后，系统重新校验时间、预算、风险和 schema；全部通过后才提交到 Main，并保存一次采用前快照供单步撤销。用户可点击“恢复原方案”回到首次生成内容。

候选切换采用当前编辑会话内的本地稳定历史。第一个候选时禁用“上一个”；最后一个候选时“下一个”可以触发有限加载更多；加载失败时保留当前候选。首版不无限循环、不做复杂分支树，每个区块最多 3-5 个候选。

默认锁定项：

- 出发时间。
- 用户已选活动块。
- 用户明确给出的预算上限。
- 已确认的高影响动作。
- 发起人已采纳的核心块，除非用户主动解锁。

以下 L0-L3 仅保留为 P1+ 完整 Cascade 的后续设计，不属于 P0 候选切换器。P0 不自动放宽约束；候选采用校验失败时，保留候选预览和 Main，等待用户选择其他候选或恢复原方案。

- L0：候选预览无明显影响，可供用户直接采用；但系统不自动采用。
- L1：候选预览存在轻微时间、预算或交通变化，必须展示差异后等待用户采用。
- L2：需要放宽约束时，系统预选“最小放宽项”，但不自动执行，必须由用户确认。
- L3：无法生成可执行替代方案时，保留原方案；原方案仍可查看和执行，并提供人工确认或重新输入入口。

P1+ 的 L2 最小放宽项示例：

- 半径小幅扩大。
- 预算档小幅上调。
- 时间窗口小幅移动。
- 替换为相邻类型的餐厅或活动。

L3 不清空当前方案，也不应让用户误以为方案已被替换失败结果覆盖。

### 6. Soft Prompting

当缺失信息影响安全或可执行性时，使用 Soft Prompting。

Soft Prompting 不应退回 Chatbot 提问，而应以 UI 组件出现。

例子：

```text
智能诊断：该路线涉及 2 公里徒步。
是否有老人/小孩同行？
[有：自动替换为平缓路线并增加休息点]
[没有：保持原样]
```

用户不回答时，路线应保持保守。

### 7. 协同边界

当前 Mock 的是“朋友/家人真实参与”。

真实的是：

- 本地分享状态会保存。
- 本地反馈事件会保存。
- 反馈可以生成分支方案。
- 协同状态会影响一键执行是否可用。
- 审计记录能解释发生了什么。

用户界面可以展示高保真协同文案，例如“朋友A已点赞”，也可以不显眼标 Mock。但内部数据、审计日志、工程文档和演示讲解必须保留“本地模拟协同”的边界。UI 可继续使用“执行 / 成功”等自然表达，文档和审计口径统一解释为“模拟执行 / 模拟成功”，不得声称真实商家、真实支付、真实消息或真实外部协作者已被触达。

### 8. 非对称协同

协同采用非对称模式。

发起人视角：

- 完整 Agent 输入。
- 完整方案修改权限。
- 最终决策权。
- 执行权限。

协作者视角：

- 轻量本地网页卡片。
- 当前推荐方案。
- 折叠展示备选方案。
- 点赞、反对、餐厅 OK、评论等反馈。
- 不直接修改原始方案。

协作者只能提交反馈事件，不能直接篡改主方案。

反馈粒度分两层：

- 推荐方案支持逐项反馈：活动、餐厅、交通、预算都可以点赞、踩或评论。
- 备选方案只支持轻量反馈：例如“更喜欢这个”“这个餐厅不错”“这个活动不喜欢”。

协作者反馈只产生反馈事件和建议，不直接改主方案，也不能直接让一键执行按钮变为可用。最终是否采纳、是否执行，仍由发起人确认。

### 9. 轻量 Plan Branch 生命周期

V5 P0 引入正式但轻量的 Plan Branch 生命周期。

```text
Plan A / Main Branch
  发起人初始需求生成的主方案

Feedback Event
  协作者对整份方案或单个块提出反馈

Plan B / Derived Branch
  Agent 基于 Plan A 和反馈生成的派生方案

Adoption
  发起人显式采纳或拒绝 Derived；采纳后原子生成新 Main
```

V5 P0 做法：

- 初始方案生成后就是 `main`。
- 同一 lineage 下只有一个当前 active main。
- 协作者反馈先沉淀为反馈事件，不自动生成派生方案。
- 发起人点击“重新生成”后，优先调用 `/api/generative-plan`，携带当前 snapshot 和反馈摘要，生成 derived branch。
- Derived branch 最多同时 3 个。
- Derived branch 状态为 `proposed`、`adopted`、`rejected`、`archived`。
- 重新生成必须保存 `regeneration event`、`feedbackIds`、`previousSnapshotId` 和 `lineage`。
- 重新生成失败时 fallback 到 `agent-core.js` adapter。
- 发起人可以查看、采纳或拒绝 derived branch。
- 采纳某个 derived branch 后，该 branch 成为新的 main。
- 旧 main 变成历史 main snapshot，并记录 `previousMainBranchId`。
- 拒绝的 derived branch 仍保留 audit，不删除。
- P0 只支持回滚到上一个 main，不做复杂版本树回滚。
- P0 不做局部合并，不支持“只把 Plan B 的餐厅同步到 Plan A”；这类能力放到 V5 P1。

多人反馈冲突时，不应每条反馈都生成一个方案。P0 最多保留 3 个 derived branch，超过时必须归档或拒绝旧 derived branch 后再生成新分支。

聚类时必须保留反馈目标和协作者来源，方便发起人理解每个派生方案为什么出现：

- 偏好方向：例如清淡饮食、少走路、保留刺激活动、控制预算。
- 反馈目标：例如活动、餐厅、交通、预算或整份方案。
- 协作者来源：例如伴侣、朋友A、家人等。

偏好方向聚类需要显式规则词典和优先级，而不是只按自然语言相似度临场猜测。

P0 derived branch 生成方向建议：

| 方向 | 典型词 / 信号 | 示例反馈 | 说明 |
| --- | --- | --- | --- |
| 清淡饮食 | 清淡、低脂、减脂、不油腻、少辣 | 想吃点清淡的 | 优先影响餐厅与套餐 |
| 少走路 | 少走、别太累、近一点、老人、小孩、休息 | 不想走太多路 | 优先影响交通、活动强度和缓冲 |
| 刺激活动 | 密室、运动、冲浪、刺激、好玩、别无聊 | 想保留密室逃脱 | 优先影响活动类型 |
| 低预算 | 便宜、人均低、预算高、性价比 | 这个太贵了 | 优先影响预算、餐厅和活动票价 |

优先级建议：

1. 安全与健康相关方向优先，例如老人、小孩、过敏、夜间、驾驶、长距离徒步。
2. 已明确表达反对的方向优先于普通点赞。
3. 多人共同指向的偏好优先于单人反馈。
4. 发起人明确锁定的块不被协作者反馈直接覆盖。

P0 示例：

- Plan B：偏向伴侣反馈，例如清淡餐、少走路。
- Plan C：偏向朋友反馈，例如保留密室、只换餐厅。
- Plan D：折中方案，仅在确实需要时生成。

P0 采纳新 Main Branch 后，旧分享页保留旧 Main 快照，不自动跳转。页面顶部提示“已有新版本”，并提供“查看新版本”按钮。

“查看新版本”按钮复用原 token，但只能访问同一 `planLineageId` 下的新 Main。token 不得跨 lineage 访问其他方案链路。

V5 P1 可选，不属于当前冻结范围：

- 块级局部同步，例如把 Plan B 的新餐厅同步到 Plan A。
- 如果未来实现，优先使用显式按钮，不使用拖拽作为首要交互。

### 10. 协同分享链接

首版分享链接只要求本机可访问，不要求局域网手机访问。

分享页使用 `shareId + token` 做最小访问控制，避免只靠可枚举 ID 打开。

token 即使在 Demo 中也应有有效期。首版明确为“本次会话有效”，不采用固定 24 小时有效期。

“本次会话有效”定义为 `SessionId` 有效期。`SessionId` 失效后，旧分享 token 也失效。后续实现阶段需要明确 `SessionId` 的生成、续期和清理机制。

只要 `SessionId` 仍有效，刷新分享页后仍可访问并提交反馈。`SessionId` 失效后，分享页可以展示旧快照，但不能继续提交反馈。

`expiresAt` 表示当前 share token 可提交反馈的截止时间。

访问规则：

- `SessionId` 有效且 `now <= expiresAt`：可查看，也可提交反馈。
- `SessionId` 失效或 `now > expiresAt`：可查看旧快照，但不能提交反馈。

旧快照可看不代表 token 仍然有效，只表示分享页进入只读态。

分享页允许手动协同动作：

- 点赞。
- 踩 / 担心。
- 餐厅 OK。
- 评论，例如“想吃点清淡的”。

反馈应持久化，并回流到发起人视角。

手动反馈允许多次修改。UI 展示最新反馈；SQLite 保留旧反馈为历史或通过 audit 记录，避免状态说不清。修改反馈不直接改主方案，只影响建议和“根据反馈生成新方案”。

分享页需要模拟“已读但未反馈”状态，例如“朋友A已查看，暂未反馈”，以提升协同卡真实感。

### 10.1 协同分享 SQLite 建议字段

以下字段是数据模型决策，不代表已经实现迁移。

`shares`：

```text
shareId
tokenHash
sessionId
planId
planLineageId
mainBranchId
status
createdAt
expiresAt
latestMainBranchId
```

`share_reviewers`：

```text
reviewerId
shareId
displayName
role
preferenceTags
status
viewedAt
lastFeedbackAt
```

`share_feedback`：

```text
feedbackId
shareId
reviewerId
planId
branchId
targetType
targetId
reaction
comment
preferenceDirection
version
isLatest
createdAt
updatedAt
```

`audit_events`：

```text
eventId
eventType
actorType
actorId
shareId
planId
payloadJson
createdAt
```

`payloadJson` 采用事件级 allowlist + 脱敏策略。每类事件只允许安全字段进入 audit；敏感字段必须脱敏或只记录引用 ID。

### 11. 动态协作者模型

数据层保持抽象，Demo 文案可以具体。

数据层示例：

```text
role: partner | friend | family | child | elder
preferenceTags: light_food | fear_escape_room | low_walk | kid_friendly
displayName: 老婆 | 朋友A
```

契约字段不能硬编码“老婆”。

### 12. 独立执行端点

`/api/executions` 进入重新冻结后的 V5 P0。P0 做的是本地状态 + 模拟外部结果的执行生命周期，不做真实外部平台执行。

执行写入和生命周期推进由 `/api/executions` 负责：

```text
/api/executions
  写入并推进执行状态

/api/runtime
  读取当前运行摘要

shared schema
  定义共享状态枚举、审计事件类型、ID 和 Mock 边界说明
```

`/api/runtime` 不直接承载 execution 生命周期，只读取和展示执行摘要。

Execution 使用独立状态枚举，不完全复用 Runtime 状态枚举。Execution 与 Runtime 只共享命名规范、ID 规则和审计字段。

一键下单必须进入执行队列状态机，不能只是前端按钮动画。P0 最小 API 行为：

- `POST /api/executions`：从当前 plan 创建 execution。
- `GET /api/executions/{executionId}`：查询 execution、steps 和 status。
- `POST /api/executions/{executionId}/steps/{stepId}/advance`：推进一个模拟步骤，写入 Mock 结果。

Execution 状态至少包括：

```text
draft
ready
running
completed
blocked
cancelled
```

进入执行前应满足：

- 发起人已确认。
- 当前 Main Branch 明确。
- 协同状态满足要求。
- 没有未解决的 L2 / L3 风险。
- 分享 / 反馈没有待处理的阻塞意见。
- 执行动作仍在 Mock 边界内。
- 协作者反馈不能直接解锁执行；发起人必须显式确认当前 Main Branch 或采纳某个派生分支。

执行动作失败允许分级重试：

- 可恢复失败允许重试，例如 Mock 预约超时、通知失败、排队 token 生成失败。
- 阻塞失败不自动重试，例如用户确认过期、协同状态变化、L3 风险、当前方案版本过期。
- 高影响动作即使是 Mock，也不允许无限重试，必须有重试次数上限。

执行队列必须记录每一步 Mock 结果，包括但不限于：

- 预约。
- 排队。
- 通知。
- 提醒。
- 团购 / 加购。

执行完成后默认只写审计日志。只有在用户显式反馈或系统发现稳定偏好时，才生成记忆候选。

### 13. 共享状态与审计契约

Execution 与 Runtime 使用共享命名规范和审计字段，但各自保留领域状态枚举。P0 审计必须覆盖保存方案、局部重排、协作者建议、branch 创建、采纳、拒绝和回滚，确保所有 Main 变更都可追溯。

建议共享事件：

```text
plan_created
saved_plan_created
saved_plan_reopened
plan_replan_committed
plan_replan_undone
collaboration_shared
feedback_received
collaborator_suggestion_created
execution_requested
execution_step_advanced
execution_step_skipped
execution_step_cancelled
execution_blocked
mock_ordering
mock_reserved
mock_notified
execution_completed
execution_cancelled
regeneration_requested
regeneration_completed
regeneration_failed
plan_branch_created
plan_branch_adopted
plan_branch_rejected
main_branch_rolled_back
```

协同分享必须进入 audit，但只记录关键事件：

```text
share_created
share_viewed
feedback_created
feedback_updated
branch_suggested
branch_adopted
branch_rejected
main_branch_rolled_back
execution_unlocked
```

共享契约也必须明确 Mock 边界：

- 不做真实商家预订。
- 不做真实支付。
- 不真实发送消息。
- 不真实联系外部协作者。
- 本地状态和本地审计是真实发生的。

## 建议接口形态

以下只是规划目标，不代表已实现。

P0 接口：

```text
GET  /api/mock-user-profile
POST /api/generative-plan
POST /api/plans/{planId}/blocks/{blockId}/refresh
POST /api/plans/{planId}/share
GET  /share/{shareId}
GET  /api/shares/{shareId}
POST /api/shares/{shareId}/feedback
POST /api/executions
GET  /api/executions/{executionId}
POST /api/executions/{executionId}/steps/{stepId}/advance
POST /api/executions/{executionId}/steps/{stepId}/skip
POST /api/executions/{executionId}/steps/{stepId}/cancel
POST /api/executions/{executionId}/cancel
GET  /api/plans/{planId}/branches
POST /api/plans/{planId}/branches
GET  /api/plans/{planId}/branches/{branchId}
POST /api/plans/{planId}/branches/{branchId}/adopt
POST /api/plans/{planId}/branches/{branchId}/reject
POST /api/plans/{planId}/branches/rollback-previous-main
GET  /api/runtime
```

其中 `POST /api/generative-plan` 是 V5 前端规划入口；`GET /api/runtime` 是新增运行摘要契约草案，不替代现有 `POST /api/runtime`。

后续阶段接口：

```text
POST /api/plans/{planId}/branches/{branchId}/sync-blocks
```

## 验证与演示决策

每个核心接口都需要补 JSON schema。P0 首版已先落地 `ui-contract.schema.json`，至少覆盖：

- `/api/generative-plan`
- `/api/executions`
- 本地 share / feedback 接口
- 轻量 Plan Branch 接口
- UI Contract
- 前端 adapter fallback 的输入输出样例

分享反馈接口、execution API 测试、Plan Branch 测试和协同执行闸门测试进入 P0 最小质量门。块级同步和局部合并仍放到后续阶段或单独冻结范围。

必须保留当前静态 Demo 不依赖后端的运行方式，以保证现场稳定。

如果后端不可用，Generative UI 必须回退到现有前端本地方案，而不是阻断用户生成方案。

P0 演示优先展示 Generative UI 卡片流、Assumption Banner、adapter fallback、局部重排、本地协同反馈和模拟执行生命周期。“减脂餐厅协同”场景可以作为 P0 协同执行主演示，因为它能同时体现：

- Assumption Banner。
- 协同反馈。
- 反馈影响提示和执行闸门。
- 执行闸门。

## 推荐交付顺序

1. 冻结 UI Contract。
2. 增加 `POST /api/generative-plan` mock 接口。
3. 增加前端 adapter，保留旧 `agent-core.js` fallback。
4. 前端渲染 JSON 卡片流。
5. 增加块级刷新与局部重排。
6. 实现本地 share token / snapshot / feedback 回流契约与最小 SQLite 读写。
7. 实现 `/api/executions` 模拟执行生命周期：create / query / advance / status。
8. 补齐 share / feedback、execution lifecycle、本地状态读回和 audit 的最小契约测试。

## 必须持续暴露的风险

- UI 不显眼标 Mock，不能演变成工程上宣称真实朋友、商家或支付系统已被联系。
- Cascade Reschedule 容易膨胀成完整规划器重写，必须保持块边界清楚。
- 分支方案必须有版本 ID，否则发起人可能执行过期方案。
- 协同反馈不能直接修改主方案。
- 派生方案数量必须受控；首版最多展示 3 个。
- 采纳新 Main Branch 时必须保留历史链路，不得覆盖旧主方案。
- Runtime 应保持状态摘要层，不要变成卡片渲染 API。
