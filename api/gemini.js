function createAgentError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sanitizeUpstreamMessage(value) {
  return String(value || '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function buildGeminiRequest({ model, messages, schema, temperature = 0.15, maxOutputTokens = 1200, thinkingLevel = 'low' }) {
  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? '上一轮 AI 输出' : '用户输入'}：\n${String(message.content || '').trim()}`)
    .join('\n\n');

  return {
    model,
    system_instruction: systemInstruction,
    input,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema
    },
    generation_config: {
      temperature,
      max_output_tokens: maxOutputTokens,
      thinking_level: thinkingLevel
    }
  };
}

function extractGeminiText(payload) {
  if (payload?.status !== 'completed') {
    throw createAgentError('Gemini interaction did not complete', 'AI_RESPONSE_INVALID');
  }
  const text = (payload.steps || [])
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((content) => content?.type === 'text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('')
    .trim();
  if (!text) throw createAgentError('Gemini returned an empty response', 'AI_RESPONSE_INVALID');
  return text;
}

async function callGemini({
  endpoint,
  apiKey,
  model,
  messages,
  schema,
  temperature = 0.15,
  maxOutputTokens = 1200,
  thinkingLevel = 'low',
  timeoutMs = 30000,
  fetchImpl = globalThis.fetch
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: controller.signal,
      body: JSON.stringify(buildGeminiRequest({
        model,
        messages,
        schema,
        temperature,
        maxOutputTokens,
        thinkingLevel
      }))
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamMessage = `${payload?.error?.status || ''} ${payload?.error?.message || ''}`;
      const invalidApiKey = upstream.status === 400 && /API[_ ]?key|key not valid/i.test(upstreamMessage);
      const code = [401, 403].includes(upstream.status) || invalidApiKey
        ? 'AI_AUTH_FAILED'
        : upstream.status === 429
          ? 'AI_RATE_LIMITED'
          : 'AI_UPSTREAM_FAILED';
      const upstreamError = createAgentError(`Gemini request failed with status ${upstream.status}`, code);
      upstreamError.upstreamStatus = upstream.status;
      upstreamError.upstreamCode = String(payload?.error?.status || '').slice(0, 80);
      upstreamError.upstreamMessage = sanitizeUpstreamMessage(payload?.error?.message);
      throw upstreamError;
    }
    return extractGeminiText(payload);
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw createAgentError(`Gemini request timed out after ${timeoutMs} ms`, 'AI_TIMEOUT');
    }
    if (error?.code) throw error;
    throw createAgentError('Gemini request failed', 'AI_UPSTREAM_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildGeminiRequest,
  extractGeminiText,
  callGemini
};
