const DEFAULT_ENDPOINT = '/api/chat';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3';

export function getSiliconFlowConfig() {
  return {
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL
  };
}

export function hasSiliconFlowConfig() {
  return typeof window !== 'undefined' && window.location.protocol !== 'file:';
}

export async function requestSiliconFlow({ question, brief }) {
  const config = getSiliconFlowConfig();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, brief })
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `AI proxy request failed: ${response.status}`);
  }
  if (!payload.content) throw new Error('AI proxy returned an empty response');
  return { mode: 'siliconflow', content: payload.content };
}
