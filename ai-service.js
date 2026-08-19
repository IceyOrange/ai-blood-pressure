const DEFAULT_ENDPOINT = '/api/chat';

export function getHealthAgentConfig() {
  return { endpoint: DEFAULT_ENDPOINT };
}

export function hasHealthAgentConfig() {
  return typeof window !== 'undefined' && window.location.protocol !== 'file:';
}

export async function requestHealthAgent({ question, brief, history = [] }) {
  const config = getHealthAgentConfig();
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
    const requestError = new Error(payload.error || `AI proxy request failed: ${response.status}`);
    requestError.code = payload.code || 'AI_PROXY_FAILED';
    requestError.stage = payload.stage || '';
    requestError.status = response.status;
    throw requestError;
  }
  if (!payload.answer || typeof payload.answer !== 'object') throw new Error('AI proxy returned an invalid response');
  return {
    mode: payload.mode || 'gemini-agent',
    answer: payload.answer,
    meta: payload.meta || {}
  };
}
