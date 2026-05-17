# 进度记录

## 当前阶段

当前项目处于“V3 比赛主链路稳定化 + V4 alpha 增强能力已部分落地”的阶段。

更具体地说：

- 比赛主链路仍然是本地 Mock 驱动的执行型 Web Demo。
- 与旧文档不同，仓库里已经实际落地了可选后端、LLM 意图识别入口、反馈复盘接口和 SQLite 记忆闭环。
- 因此当前状态不能再表述为“只有纯静态前端、V4 仍完全未实现”。

## 歧义点梳理

在本次核对前，项目状态存在这些歧义：

1. `README.md` 和 `progress.md` 把当前项目写成“纯静态 V3，V4 仅为路线图”。
2. 代码中实际上已经存在 `server.py`、`backend_core.py`、`/api/intent`、`/api/feedback`、`/api/memory-candidates/{id}/decision`。
3. 前端 `app.js` 已经真实调用 `/api/intent`，并提供反馈写入与候选记忆决策 UI。
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

- 能体现后端、LLM 和记忆闭环已经开始落地。

缺点：

- 会夸大成熟度。
- 当前仍缺少完整契约文件、完整后端测试环境和更稳定的状态机实现。

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

- `FastAPI` 服务入口 `server.py`。
- `/api/health` 健康检查。
- `/api/intent` LLM 意图识别入口。
- `/api/feedback` 反馈写入入口。
- `/api/memory-candidates/{id}/decision` 候选记忆采用/忽略/更正入口。
- `backend_core.py` 中的 SQLite 结构化记忆存储。
- JSONL 审计日志写入。
- 前端反馈面板和 `Reflect` 阶段展示。
- 后端不可用时自动回退本地规则解析。

## 当前未完成

- 还没有 `intent.schema.json` 这类明确契约文件。
- 还没有把前端当前的增强式接入完全收敛成清晰的状态机式 Runtime。
- 还没有完整跑通后端自动化单测环境。
- 还没有做浏览器侧完整人工回归记录。

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

更新目标：

- 统一“比赛主链路”和“增强能力”的口径。
- 修正“V4 尚未实现任何代码”的过时说法。
- 明确哪些验证已做，哪些尚未做。

## 剩余风险

- 对外讲解时如果只说“有 FastAPI/LLM/记忆闭环”，容易让人误解为已经接入真实生活服务平台。
- 对外讲解时如果继续说“完全没有后端”，又会和仓库代码事实冲突。
- 后端测试目前只做了语法检查，功能级验证还不完整。
- 当前实现仍然以 Mock 业务闭环为主，不应夸大为成熟的线上可用 Agent Runtime。

## 下一步建议

1. 如果目标是比赛交付，继续把讲解口径固定为“Mock 主链路 + 可选增强后端”，避免叙事漂移。
2. 如果目标是继续做 V4，优先补 `intent.schema.json`、后端契约说明和 `pytest` 环境。
3. 如果目标是提升可信度，补一次浏览器人工回归，并把结果记录到文档里。

## Done When

- `README.md`、`progress.md`、`COMPETITION_BRIEF.md`、`DESIGN.md` 对当前状态的表述一致。
- 文档不再把当前状态误写成“完全没有后端”。
- 文档也不把当前状态夸大成“完整 V4 已完成”。
- 前端和后端的验证状态分别被清楚记录。
