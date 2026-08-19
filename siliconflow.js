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

export async function requestSiliconFlow({ question, brief, history = [] }) {
  const config = getSiliconFlowConfig();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, brief, history })
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
  if (!payload.answer || typeof payload.answer !== 'object') throw new Error('AI proxy returned an invalid response');
  return {
    mode: payload.mode || 'siliconflow-agent',
    answer: payload.answer,
    meta: payload.meta || {}
  };
}
