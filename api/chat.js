const DOCTOR_SYSTEM_PROMPT = `你是一名严谨、温和、循证的家庭健康管理助手。你不是执业医生，不做诊断、不擅自建议开始或停止处方药。你只能基于用户明确提供的血压、心率、饮食、睡眠和个人资料进行解释：先复述数据与时间范围，再指出趋势和不确定性，最后给出不超过三条可执行建议。若收缩压达到180或舒张压达到120，或用户描述胸痛、呼吸困难、意识异常、单侧无力、视物异常等情况，必须优先建议立即复测并寻求急救，不要用生活方式建议替代急症处理。对饮食地域偏好只能使用用户主动填写或确认的信息，不能根据 IP 地址武断推断饮食习惯；如位置数据未经用户授权，要明确说明未使用。回答使用简洁、尊重、非恐吓性的中文。`;
const DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3';

function readBody(request) {
  if (!request.body) return {};
  if (typeof request.body === 'object') return request.body;
  try {
    return JSON.parse(request.body);
  } catch (error) {
    return {};
  }
}

function compactContext(brief) {
  const profile = brief.profile || {};
  return {
    profile: {
      name: typeof profile.name === 'string' ? profile.name.slice(0, 40) : '',
      age: profile.age,
      sex: profile.sex,
      city: profile.city,
      locationSource: profile.locationSource,
      locationInferenceEnabled: Boolean(profile.locationInferenceEnabled)
    },
    sevenDaySummary: brief.summary || {},
    safety: typeof brief.safety === 'string' ? brief.safety : ''
  };
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return response.status(503).json({ error: 'SILICONFLOW_API_KEY is not configured' });
  }

  const body = readBody(request);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  if (!question) return response.status(400).json({ error: 'Question is required' });

  const context = compactContext(body.brief || {});
  const endpoint = process.env.SILICONFLOW_ENDPOINT || DEFAULT_ENDPOINT;
  const model = process.env.SILICONFLOW_MODEL || DEFAULT_MODEL;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: DOCTOR_SYSTEM_PROMPT },
          { role: 'user', content: `数据上下文：${JSON.stringify(context)}\n\n用户问题：${question}` }
        ]
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      return response.status(502).json({ error: 'SiliconFlow upstream request failed' });
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return response.status(502).json({ error: 'SiliconFlow returned an empty response' });
    return response.status(200).json({ mode: 'siliconflow', content });
  } catch (error) {
    return response.status(502).json({ error: 'AI proxy request failed' });
  }
};
