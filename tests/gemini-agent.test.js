const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildGeminiRequest, extractGeminiText, callGemini } = require('../api/gemini');
const chatHandler = require('../api/chat');

function mockHttpResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function geminiOptions(overrides = {}) {
  return {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    apiKey: 'test-key',
    model: 'gemini-3.7-flash',
    messages: [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: '分析血压。' }
    ],
    schema: {
      type: 'object',
      required: ['answer'],
      properties: { answer: { type: 'string' } }
    },
    timeoutMs: 50,
    ...overrides
  };
}

function createApiResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    }
  };
}

function geminiInteraction(content) {
  return {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(content) }] }]
  };
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('buildGeminiRequest maps messages and JSON Schema', () => {
  const body = buildGeminiRequest({
    model: 'gemini-3.7-flash',
    messages: [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: '分析血压。' }
    ],
    schema: {
      type: 'object',
      required: ['answer'],
      properties: { answer: { type: 'string' } }
    },
    temperature: 0.1,
    maxOutputTokens: 900,
    thinkingLevel: 'low'
  });

  assert.equal(body.model, 'gemini-3.7-flash');
  assert.equal(body.system_instruction, '只输出 JSON。');
  assert.match(body.input, /分析血压/);
  assert.equal(body.response_format.type, 'text');
  assert.equal(body.response_format.mime_type, 'application/json');
  assert.deepEqual(body.response_format.schema.required, ['answer']);
  assert.equal(body.generation_config.temperature, 0.1);
  assert.equal(body.generation_config.max_output_tokens, 900);
  assert.equal(body.generation_config.thinking_level, 'low');
});

test('extractGeminiText reads completed model output text', () => {
  const text = extractGeminiText({
    status: 'completed',
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'text', text: '{"answer":"ok"}' }]
      }
    ]
  });

  assert.equal(text, '{"answer":"ok"}');
});

test('callGemini sends native Interactions request and returns text', async () => {
  let captured;
  const text = await callGemini(geminiOptions({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return mockHttpResponse(200, {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"answer":"ok"}' }] }]
      });
    }
  }));

  assert.equal(text, '{"answer":"ok"}');
  assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(captured.options.headers['x-goog-api-key'], 'test-key');
  assert.equal(JSON.parse(captured.options.body).model, 'gemini-3.7-flash');
});

for (const [status, expectedCode] of [[401, 'AI_AUTH_FAILED'], [403, 'AI_AUTH_FAILED'], [429, 'AI_RATE_LIMITED'], [500, 'AI_UPSTREAM_FAILED']]) {
  test(`callGemini maps HTTP ${status} to ${expectedCode}`, async () => {
    await assert.rejects(
      callGemini(geminiOptions({ fetchImpl: async () => mockHttpResponse(status, { error: { message: 'upstream error' } }) })),
      (error) => error.code === expectedCode
    );
  });
}

test('callGemini maps Google API key HTTP 400 to AI_AUTH_FAILED', async () => {
  await assert.rejects(
    callGemini(geminiOptions({
      fetchImpl: async () => mockHttpResponse(400, {
        error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' }
      })
    })),
    (error) => error.code === 'AI_AUTH_FAILED'
  );
});

test('callGemini preserves safe Gemini upstream diagnostics', async () => {
  await assert.rejects(
    callGemini(geminiOptions({
      fetchImpl: async () => mockHttpResponse(404, {
        error: { status: 'NOT_FOUND', message: 'Requested model was not found.' }
      })
    })),
    (error) => {
      assert.equal(error.code, 'AI_UPSTREAM_FAILED');
      assert.equal(error.upstreamStatus, 404);
      assert.equal(error.upstreamCode, 'NOT_FOUND');
      assert.equal(error.upstreamMessage, 'Requested model was not found.');
      return true;
    }
  );
});

test('callGemini maps an aborted request to AI_TIMEOUT', async () => {
  const fetchImpl = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    callGemini(geminiOptions({ fetchImpl, timeoutMs: 5 })),
    (error) => error.code === 'AI_TIMEOUT'
  );
});

test('extractGeminiText rejects incomplete and empty output', () => {
  assert.throws(
    () => extractGeminiText({ status: 'in_progress', steps: [] }),
    (error) => error.code === 'AI_RESPONSE_INVALID'
  );
  assert.throws(
    () => extractGeminiText({ status: 'completed', steps: [] }),
    (error) => error.code === 'AI_RESPONSE_INVALID'
  );
});

test('chat handler completes the Gemini planner and answer flow', async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalSiliconFlowKey = process.env.SILICONFLOW_API_KEY;
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const upstreamPayloads = [
    {
      intent: 'post_meal_bp',
      questionFocus: '晚饭后血压偏高应该如何处理',
      tools: ['safety_triage', 'post_meal_knowledge', 'current_bp', 'meal_data_gap'],
      missingInformation: ['是否在相同条件下静坐复测']
    },
    {
      title: '饭后血压偏高先规范复测',
      directAnswer: '饭后血压可能出现短时波动，不能仅凭一次读数判断原因。先静坐五分钟，在相同姿势下复测并记录结果。',
      keyPoints: [{ kind: 'mechanism', title: '常见影响因素', text: '饭后活动、未充分静坐、情绪和测量姿势都可能影响短时读数。' }],
      actions: ['静坐五分钟后复测两次，每次间隔一分钟。', '记录餐前和饭后一小时的读数用于比较。'],
      caution: '若复测达到 180/120 mmHg，或伴胸痛、气促、单侧无力等症状，请立即就医。',
      followUps: ['这次测量前是否活动或饮用咖啡、酒？'],
      dataBasis: '使用了最新饭后血压记录；缺少同日餐前对照。',
      confidence: 'medium'
    }
  ];

  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.SILICONFLOW_API_KEY;
    global.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return mockHttpResponse(200, geminiInteraction(upstreamPayloads.shift()));
    };
    const response = createApiResponse();
    await chatHandler({
      method: 'POST',
      body: {
        question: '我今天晚饭后血压偏高，应该怎么办？',
        brief: {
          profile: { age: 68, sex: '男', city: '北京市' },
          summary: {
            latest: { systolic: 148, diastolic: 88, heartRate: 72, context: '晚饭后1小时' },
            averageSystolic: 142,
            averageDiastolic: 85
          }
        },
        history: []
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.mode, 'gemini-agent');
    assert.equal(response.body.meta.plannerModel, 'gemini-3.5-flash-lite');
    assert.equal(response.body.meta.model, 'gemini-3.7-flash');
    assert.equal(response.body.meta.validation.passed, true);
    assert.equal(fetchCalls.length, 2);
    assert.ok(fetchCalls.every((call) => call.url.endsWith('/v1beta/interactions')));
    assert.ok(fetchCalls.every((call) => call.options.headers['x-goog-api-key'] === 'test-gemini-key'));
  } finally {
    restoreEnvironment('GEMINI_API_KEY', originalGeminiKey);
    restoreEnvironment('SILICONFLOW_API_KEY', originalSiliconFlowKey);
    global.fetch = originalFetch;
  }
});

test('chat handler reports Gemini configuration without calling upstream', async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalSiliconFlowKey = process.env.SILICONFLOW_API_KEY;
  const originalFetch = global.fetch;
  let fetchCalled = false;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error('unexpected upstream call');
    };
    const response = createApiResponse();
    await chatHandler({ method: 'POST', body: { question: '最近血压怎么样？' } }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'AI_NOT_CONFIGURED');
    assert.match(response.body.error, /Gemini/);
    assert.equal(fetchCalled, false);
  } finally {
    restoreEnvironment('GEMINI_API_KEY', originalGeminiKey);
    restoreEnvironment('SILICONFLOW_API_KEY', originalSiliconFlowKey);
    global.fetch = originalFetch;
  }
});

test('chat handler returns safe Gemini diagnostics for upstream failures', async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;
  let callCount = 0;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return mockHttpResponse(200, geminiInteraction({
          intent: 'general',
          questionFocus: '了解近期血压情况',
          tools: ['safety_triage', 'current_bp'],
          missingInformation: []
        }));
      }
      return mockHttpResponse(404, {
        error: { status: 'NOT_FOUND', message: 'Requested model was not found.' }
      });
    };
    const response = createApiResponse();
    await chatHandler({ method: 'POST', body: { question: '最近血压怎么样？' } }, response);

    assert.equal(response.statusCode, 502);
    assert.equal(response.body.code, 'AI_UPSTREAM_FAILED');
    assert.equal(response.body.stage, 'answer_generation');
    assert.deepEqual(response.body.diagnostic, {
      upstreamStatus: 404,
      upstreamCode: 'NOT_FOUND',
      upstreamMessage: 'Requested model was not found.'
    });
  } finally {
    restoreEnvironment('GEMINI_API_KEY', originalGeminiKey);
    global.fetch = originalFetch;
  }
});

test('production and configuration files are strictly Gemini-only', () => {
  const root = path.resolve(__dirname, '..');
  const productionFiles = [
    'api/chat.js',
    'api/gemini.js',
    'app.js',
    'ai-service.js',
    'dev-server.mjs',
    '.env.local.example',
    'README.md',
    'sw.js'
  ];

  for (const file of productionFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /SILICONFLOW|SiliconFlow|硅基流动/, `${file} still references the previous provider`);
  }
  assert.equal(fs.existsSync(path.join(root, 'siliconflow.js')), false);
});
