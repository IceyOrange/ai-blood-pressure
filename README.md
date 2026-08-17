# 脉安 · AI 血压管家

这是一个面向手机演示的零构建依赖 PWA 原型，围绕“硬件测量 → 数据趋势 → AI 健康指导”设计。当前不接入真实硬件，页面使用 `data/blood-pressure-sample.xlsx` 与同源 JavaScript 样例数据驱动。

## 已完成

- **移动端 PWA**：首页、趋势、AI 医生、我的四个主路径，支持响应式手机布局、底部导航、离线缓存和模拟测量录入。
- **数据展示**：血压、心率、7/14 天趋势、测量完成度、饮食钠摄入和睡眠评分。
- **Agent**：`agent.js` 先做结构化统计，再生成带证据、优先级和行动步骤的个性化简报；对急性高值提供单独安全分支。
- **AI 对话**：无 API Key 时使用本地安全规则演示；配置硅基流动后可切换云端模型，并在失败时自动回退到本地回答。
- **Excel 样例**：`data/blood-pressure-sample.xlsx` 含 `血压记录`、`饮食记录`、`睡眠记录`、`用户档案`、`使用说明` 5 个工作表。

## 本地运行

当前电脑没有 Node/npm，因此项目刻意不依赖构建工具。用 Python 启动静态服务器即可：

```powershell
python -m http.server 4173
```

然后在手机或电脑浏览器打开：

```text
http://localhost:4173
```

手机演示时，让手机与电脑处于同一局域网，把 `localhost` 换成电脑局域网 IP；PWA 的 Service Worker 需要通过 HTTP/HTTPS 访问，不能直接双击 `index.html`。

## 配置硅基流动

当前前端不会读取或保存 API Key，AI 请求统一发送到同源 `/api/chat`，由 `api/chat.js` 读取 Vercel Serverless 环境变量并转发到硅基流动。

在 Vercel 项目中打开 `Settings → Environment Variables`，添加：

- `SILICONFLOW_API_KEY`：硅基流动 API Key，设置为 Secret。
- `SILICONFLOW_MODEL`：可选，默认 `deepseek-ai/DeepSeek-V3`。
- `SILICONFLOW_ENDPOINT`：可选，默认硅基流动 Chat Completions 地址。

保存后重新 Deploy 或执行 Redeploy，AI 医生对话就会通过服务端调用硅基流动。API Key 不会下发到浏览器。若环境变量未配置或云端请求失败，前端会自动回退到本地安全规则。

如果旧版本曾经把 Key 写入 `config.js` 并提交过 GitHub，请先在硅基流动后台撤销旧 Key，再生成新的 Key 写入 Vercel。
## Agent 设计要点

- **先算后说**：先计算最近 7 天平均血压、晨晚差、心率、钠摄入、晚餐时间和睡眠，再生成自然语言，不让模型直接从散乱原始数据猜结论。
- **证据绑定**：每条建议引用具体时间范围和数据，例如“近 7 天有 3 天钠摄入超过目标”。
- **个性化**：结合用户主动填写的年龄、性别、饮食偏好、作息与测量场景；建议限制为少量、可执行动作。
- **安全优先**：`180/120 mmHg` 或胸痛、气促、意识/神经异常等情况触发急症提示，不用生活方式建议替代就医。
- **隐私边界**：位置只能作为用户授权后的粗略辅助信息，不能直接用 IP 推断饮食习惯；页面已明确展示来源和授权状态。

## 后续接入建议

- 将 `data/sample-data.js` 的 `measurements`、`diet`、`sleep` 替换为真实 API 响应，保持当前字段名，前端即可继续运行。
- 设备数据建议保留 `measuredAt`、`context`、`device`、`source`，并在服务端做单位、范围、重复上报和异常值校验。
- 生产 Agent 建议加入人工医生审核通道、模型输出 JSON Schema、事实引用、拒答策略、用户反馈和版本化提示词。
- 地理信息以“用户确认的城市/饮食偏好”为主，IP 只做低精度地区辅助，默认关闭更稳妥。

## 部署到 Vercel

这是零构建依赖的静态 PWA：

1. 将 GitHub 仓库导入 Vercel。
2. Framework Preset 选择 `Other`，Build Command 留空，Output Directory 使用 `.`。
3. 点击 Deploy，Vercel 会直接托管根目录的 `index.html`。
4. 部署完成后用手机访问 Vercel 域名；HTTPS 会自动满足 PWA Service Worker 要求。

部署后如果没有配置 `SILICONFLOW_API_KEY` 会使用本地 Agent 演示模式；配置后，前端通过 `api/chat.js` 调用硅基流动。

