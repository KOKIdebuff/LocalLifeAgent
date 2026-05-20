# LangGraph 轻量编排接入说明

## 1. 定位

LangGraph 在本项目中的定位是 V4 alpha 后端的轻量编排层，而不是新的业务规则引擎。后续会落代码接入 LangGraph，但不在当前文档更新会话中实现。

它未来只负责：

- 组织后端增强链路的节点顺序。
- 在节点之间传递结构化状态。
- 根据置信度、校验结果和失败原因做分支判断。
- 汇总后端 trace 元信息，并只写入后端日志或审计记录，便于后续排查。
- 在后端异常、低置信度或契约不满足时触发明确兜底。

当前仓库尚未安装或启用 LangGraph。本文件记录的是后续确定要接入的边界和实现约束，不表示 LangGraph 已经进入运行链路。

## 2. 不接管的能力

LangGraph 不应接管项目的核心业务逻辑，也不应替代现有可演示主链路。

明确不做：

- 不重写 `agent-core.js`。
- 不替代本地 Mock Tools。
- 不接管活动、餐厅、路线、票务和订座规则。
- 不接管方案评分、候选排序和动态重排规则。
- 不改变执行队列和高影响动作确认机制。
- 不绕过记忆候选确认、敏感信息分级和审计日志。
- 不把当前项目宣称为真实多 Agent 并发或完整线上 Runtime。

核心规划、评分、重排和执行模拟仍由项目自研逻辑负责。

## 3. 推荐接入位置

LangGraph 后续只接入 Python 后端增强链路，作为 V4 alpha 适配层。

推荐方向：

```text
User Input
  -> /api/intent 或 /api/feedback
  -> LangGraph backend orchestration
  -> 自研 intent 校验 / 反馈复盘 / 候选记忆逻辑
  -> 后端日志或审计 trace
  -> 前端继续使用既有接口结果
```

未来落代码时，可以新增 `graph_runtime.py` 作为后端编排适配层，但不在本轮文档更新中实现。

## 4. 建议节点草案

后续图编排覆盖完整后端增强链路，包括意图、校验、反馈复盘和候选记忆：

```text
intent_extract
  -> validate_intent
  -> planning_adapter
  -> feedback_reflect
  -> memory_candidate
  -> memory_decision
  -> backend_trace_log
```

节点职责建议：

- `intent_extract`：调用 LLM 或其他后端能力生成结构化意图候选。
- `validate_intent`：复用现有校验逻辑，归一化字段并判断是否需要回退。
- `planning_adapter`：把后端意图结果转换为前端 `planRequest()` 可理解的 overrides。
- `feedback_reflect`：编排用户纠错、低置信度、工具失败等反馈复盘入口。
- `memory_candidate`：复用现有候选记忆生成、确认和敏感信息处理规则。
- `memory_decision`：编排用户 adopt / ignore / correct 的候选记忆决策。
- `backend_trace_log`：只在后端记录 LangGraph 运行 trace，不映射到前端 `agentLoopTrace`。

这些节点是后续代码接入方向，但不要求当前文档更新会话立即实现。

## 5. 兼容原则

接入 LangGraph 时必须保持以下约束：

- 静态 Web Demo 仍可独立运行。
- `/api/intent`、`/api/feedback` 和 `/api/memory-candidates/.../decision` 的输入输出默认不变。
- 未配置密钥、后端不可用、LangGraph 运行失败或置信度不足时，前端继续回退本地规则。
- `agentLoopTrace` 现有结构不因后端编排变化而破坏。
- LangGraph trace 只进入后端日志或审计记录，不映射到前端 `agentLoopTrace`。
- `requirements.txt` 只有在真正实现代码接入时才新增 `langgraph` 依赖。

## 6. 文档口径

对外描述时应使用保守表述：

> 项目当前仍是 Mock 主链路稳定、后端增强能力已落地但仍属 alpha 的执行型 Agent Demo。LangGraph 后续会作为 V4 alpha 后端轻量编排层接入，但不接管核心业务逻辑，trace 只保留在后端日志或审计记录中，也不代表项目已经完成真实多 Agent Runtime。

不要把 LangGraph 接入计划表述为：

- 已经接入真实生活服务平台。
- 已经完成真实多 Agent 并发。
- 已经替代自研规划、评分、重排和确认逻辑。
- 已经具备成熟线上 Runtime 能力。
