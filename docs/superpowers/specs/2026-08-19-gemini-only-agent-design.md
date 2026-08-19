# Gemini-only 健康 Agent 迁移设计

日期：2026-08-19

## 背景

当前健康 Agent 使用硅基流动完成任务规划和医学回答。Vercel 生产环境已确认 API Key 有效，但主模型在回答生成阶段多次超时，影响移动端演示。用户已从 Google AI Studio 获取 Gemini API Key，并明确要求新版本严格只使用 Gemini，不保留硅基流动回退。

## 目标

- 所有任务规划、医学回答和质量修正均由 Gemini 生成。
- 保留现有“规划、工具分析、安全分诊、结构化回答、质量校验、AI 修正”Agent 链路。
- API Key 仅存在于本地服务端环境变量和 Vercel 环境变量中，不下发浏览器。
- 提高 Vercel 生产环境的响应稳定性，并保持适老化的逐字展示体验。
- AI 不可用时明确报错和重试，不使用规则生成健康回答。

## 非目标

- 不改变硬件数据接入方式。
- 不引入处方、诊断或自动调整药物能力。
- 不在本次迁移中加入语音朗读、数据库或用户登录。
- 不保留任何自动切换到硅基流动的逻辑。

## 方案选择

采用 Gemini 原生 Interactions API：

- 地址：`https://generativelanguage.googleapis.com/v1beta/interactions`
- 鉴权：请求头 `x-goog-api-key: GEMINI_API_KEY`
- 结构化输出：`response_format.type=text`、`mime_type=application/json` 并提供 JSON Schema
- 不安装 Google SDK，继续保持当前零依赖部署方式。

不采用 OpenAI 兼容接口，因为原生接口能直接使用 Gemini 最新模型和 JSON Schema，减少兼容层差异。不采用 SDK，因为当前项目没有 npm 构建流程，引入依赖会增加部署复杂度。

## 模型分工

- 默认规划模型：`gemini-3.5-flash-lite`
- 默认回答模型：`gemini-3.6-flash`
- 可选环境变量：`GEMINI_PLANNER_MODEL`、`GEMINI_MODEL`

规划模型只负责识别问题意图、选择工具和列出信息缺口。回答模型根据执行计划和受控工具结果完成医学沟通。若回答未通过本地质量校验，仍由回答模型重新生成一次。

## Agent 数据流

1. 前端把用户问题、近期对话和健康摘要发送到同源 `/api/chat`。
2. 服务端执行确定性的急症安全分诊，但不生成健康回答。
3. Gemini 规划模型输出符合规划 Schema 的 JSON。
4. 服务端根据规划调用本地数据工具和医学知识工具。
5. Gemini 回答模型输出符合回答 Schema 的 JSON。
6. 服务端执行结构、安全和答题相关性校验。
7. 校验失败时，将违规项和原回答交给 Gemini 修正一次。
8. 校验通过后返回前端；前端逐字展示直接结论，再展示依据、行动和提醒卡片。
9. Gemini 失败、限流、超时或修正失败时返回明确错误，不生成规则回答。

## Gemini 请求适配

服务端增加单一 Gemini 适配器，负责：

- 把当前 system prompt 映射为 `system_instruction`。
- 把当前用户输入和必要的历史消息映射为 `input`。
- 写入模型名、温度、最大输出长度和结构化输出 Schema。
- 从 Interactions API 响应的文本输出块中提取 JSON 文本。
- 识别未完成、被截断、无文本或不可解析的响应。
- 把 Google HTTP 状态映射为应用错误码。

规划和回答使用不同 JSON Schema。Schema 只约束结构；现有服务端校验继续负责医学边界、答非所问和行动数量等语义规则。

## 错误处理

- 缺少 `GEMINI_API_KEY`：`AI_NOT_CONFIGURED`，HTTP 503。
- Gemini 鉴权失败：`AI_AUTH_FAILED`，HTTP 502。
- Gemini 限流：`AI_RATE_LIMITED`，HTTP 429。
- Gemini 超时：`AI_TIMEOUT`，HTTP 504，并返回失败阶段。
- 输出不可解析或未通过二次校验：`AI_RESPONSE_INVALID`，HTTP 502。
- 其他上游错误：`AI_UPSTREAM_FAILED`，HTTP 502。

前端所有提示改为 Gemini，不再显示硅基流动或要求检查硅基流动环境变量。

## 配置与密钥

本地 `.env.local` 和 Vercel 使用：

- `GEMINI_API_KEY`：必填，来自 Google AI Studio。
- `GEMINI_MODEL`：可选，默认 `gemini-3.6-flash`。
- `GEMINI_PLANNER_MODEL`：可选，默认 `gemini-3.5-flash-lite`。
- `GEMINI_ENDPOINT`：可选，默认 Gemini Interactions API 地址。

旧的 `SILICONFLOW_*` 变量不再读取。`.env.local` 继续由 Git 忽略，仓库只提交示例变量名，不提交真实 Key。

## 测试策略

项目新增基于 Node 内置 `node:test` 的零依赖测试：

- Gemini 请求体正确包含鉴权方式、模型、系统指令和 JSON Schema。
- 规划响应和回答响应能从 Gemini 输出中正确解析。
- 鉴权、限流、超时、截断和空响应映射到正确错误码。
- 缺少 `GEMINI_API_KEY` 时不会调用上游。
- 正常请求完整经过规划、工具、回答和校验链路。
- 源码和配置不再依赖 `SILICONFLOW_*`。

测试使用可注入的 `fetch` 替身，不发送真实健康数据，也不消耗真实 API 额度。完成后再使用用户自行配置的 Vercel Key 做一次匿名样例线上验收。

## 发布流程

1. 先完成自动测试和本地静态检查。
2. 推送代码触发 Vercel 部署。
3. 用户在 Vercel 的 Production、Preview、Development 环境配置 `GEMINI_API_KEY`。
4. 重新部署生产环境。
5. 使用匿名样例问题调用线上 `/api/chat`，确认状态 200、模型为 Gemini、质量校验通过。
6. 更新 PWA 缓存版本，提示移动端重新打开一次页面。

## 验收标准

- 生产代码没有任何硅基流动请求或自动回退。
- 未配置 Gemini Key 时提示准确，不误导用户检查其他平台。
- 线上匿名样例请求返回 `mode=gemini-agent` 或 `gemini-agent-revised`。
- 返回元数据包含实际规划模型、回答模型、所用工具和校验结果。
- 回答先解决用户问题，再展示相关数据，不给出诊断或自行调整药物建议。
- PWA 手机端能够显示逐字结论和结构化建议卡片。
