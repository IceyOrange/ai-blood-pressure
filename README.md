# 脉安 · AI 血压管家

这是一个面向手机演示的零构建依赖 PWA 原型，围绕“硬件测量 → 自动同步 → 数据趋势 → AI 健康提示”设计。当前不接入真实硬件，页面由 `data/sample-data.js` 驱动，`data/blood-pressure-sample.xlsx` 用于展示未来可接入的数据结构。

## 已完成

- **移动端 PWA**：首页、血压记录、我的三个主路径；测量发生在硬件端，App 只负责同步状态、结果解释与长期管理。
- **数据展示**：最新血压、心率、7/30/90 天趋势、晨晚对比、饮食钠摄入和睡眠情况。
- **专业 Agent 链路**：对话采用“Gemini 问题规划 → 安全分诊 → 数据/知识工具 → Gemini 医学沟通 → 相关性与安全校验”，不是把全部数据拼进一个 Prompt 后直接输出。
- **AI-only 对话**：首页和记录页展示可核对的数据总结，真实 AI 对话只在总结页按需出现。AI 请求失败时只显示重试入口，不再使用规则生成健康回答。
- **低摩擦反馈**：“不太准确”会先识别用户想纠正的是饮食、睡眠还是地区信息，再提供不超过四个单选项，反馈会作为本人记忆保存。
- **Excel 样例**：`data/blood-pressure-sample.xlsx` 含 `血压记录`、`饮食记录`、`睡眠记录`、`用户档案`、`使用说明` 5 个工作表。

## 本地运行

本地验证 AI 时不能使用 `python -m http.server`，因为它只托管静态页面，不会运行 `/api/chat`。先创建本地环境变量文件：

```powershell
Copy-Item .env.local.example .env.local
```

打开 `.env.local`，填写从 Google AI Studio 获取的 `GEMINI_API_KEY`，然后运行零依赖本地服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

浏览器打开：

```text
http://localhost:4317
```

`start-local.ps1` 会优先使用系统 Node.js；在当前 Codex 环境下也会自动寻找内置 Node.js。控制台显示“已读取 GEMINI_API_KEY”后，本地健康助手才会真实调用 Gemini。手机正式演示建议使用 Vercel HTTPS 地址。

## 配置 Gemini

当前前端不会读取或保存 API Key，AI 请求统一发送到同源 `/api/chat`，由 `api/chat.js` 读取 Vercel Serverless 环境变量并调用 Gemini Interactions API。

在 Vercel 项目中打开 `Settings → Environment Variables`，添加：

- `GEMINI_API_KEY`：Google AI Studio API Key，设置为 Secret。
- `GEMINI_MODEL`：可选，默认 `gemini-2.5-flash`，负责医学沟通和回答修正；该稳定模型更适合免费额度下的移动演示。
- `GEMINI_PLANNER_MODEL`：可选，默认 `gemini-3.5-flash-lite`，只负责理解问题和选择工具。
- `GEMINI_ENDPOINT`：可选，默认 Gemini Interactions API 地址。

保存后重新 Deploy 或执行 Redeploy，健康助手对话就会通过服务端调用 Gemini。API Key 不会下发到浏览器。若环境变量未配置或云端请求失败，页面会明确提示 AI 未生成回答并提供重试，不会使用规则代答。

不要把 AI Studio Key 写入 `config.js`、前端代码或 GitHub；如果曾误提交，请立即在 Google AI Studio 撤销并重新生成。
## Agent 设计要点

- **先规划再回答**：第一次模型调用由轻量 AI 识别用户真正的问题、选择所需工具和列出信息缺口；确定性逻辑只保留急症拦截，不生成健康回答。第二次调用由主模型完成医学沟通。
- **先算后说**：工具层先计算最近 7 天平均血压、晨晚差、心率、钠摄入、晚餐时间和睡眠，再把受控结果交给回答生成器，不让模型直接从散乱原始数据猜结论。
- **结构化生成**：第二次模型调用只生成规定 JSON，包括直接回答、解释卡、行动建议、安全提醒、数据依据和后续追问。
- **AI 自动修正**：服务端检查答非所问、危险用药建议、急症处理遗漏、虚假确定性和结构异常；不通过时要求 AI 根据失败原因重新生成，第二次仍不合格就报错，不使用固定模板。
- **安全逐字呈现**：医疗回复先完成结构和安全校验，再在页面逐字展示结论，随后展开依据与行动卡片，避免把未经校验的模型片段直接暴露给用户。
- **证据绑定**：每条建议引用具体时间范围和数据，例如“近 7 天有 3 天钠摄入超过目标”。
- **个性化**：结合用户主动填写的年龄、性别、饮食偏好、作息与测量场景；建议限制为少量、可执行动作。
- **记忆优先级**：对饮食口味、主观睡眠等个人属性，本人反馈高于生活记录，生活记录高于长期观察，长期观察高于城市级地区推测；血压、心率等硬件测量值不会被主观反馈覆盖。
- **安全优先**：`180/120 mmHg` 或胸痛、气促、意识/神经异常等情况触发急症提示，不用生活方式建议替代就医。
- **隐私边界**：城市级网络位置只作为低置信度辅助信息，页面明确展示来源并允许一键纠正或关闭；不能把地区平均情况断言为个人习惯。

## 后续接入建议

- 将 `data/sample-data.js` 的 `measurements`、`diet`、`sleep` 替换为真实 API 响应，保持当前字段名，前端即可继续运行。
- 设备数据建议保留 `measuredAt`、`context`、`device`、`source`，并在服务端做单位、范围、重复上报和异常值校验。
- 生产环境仍建议加入人工医生审核通道、医学知识库版本管理、模型评测集、事实引用、拒答策略、用户反馈闭环和可审计日志。
- 地理信息只使用城市级粗粒度结果，并提供清晰的来源说明、关闭入口和本人反馈覆盖机制；正式上线前需结合适用地区隐私要求完成告知与授权设计。

## 部署到 Vercel

这是零构建依赖的静态 PWA：

1. 将 GitHub 仓库导入 Vercel。
2. Framework Preset 选择 `Other`，Build Command 留空，Output Directory 使用 `.`。
3. 点击 Deploy，Vercel 会直接托管根目录的 `index.html`。
4. 部署完成后用手机访问 Vercel 域名；HTTPS 会自动满足 PWA Service Worker 要求。

部署后如果没有配置 `GEMINI_API_KEY`，页面不会生成健康回答；配置后，前端通过 `api/chat.js` 调用 Gemini-only Agent 链路。

