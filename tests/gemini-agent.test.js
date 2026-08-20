const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildGeminiRequest, extractGeminiText, callGemini } = require('../api/gemini');
const chatHandler = require('../api/chat');

async function loadBrowserModule(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

async function loadEnrichedContext() {
  const [{ sampleData }, { buildDoctorBrief }] = await Promise.all([
    loadBrowserModule('data/sample-data.js'),
    loadBrowserModule('agent.js')
  ]);
  return chatHandler._internal.compactContext(buildDoctorBrief(sampleData));
}
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

test('compactContext preserves only bounded personalization data', () => {
  const context = chatHandler._internal.compactContext({
    profile: { age: 52, sex: '女', medication: '氨氯地平 2.5 mg' },
    summary: {
      latest: { measuredAt: '2026-08-17T08:42:00+08:00', systolic: 128, diastolic: 82, heartRate: 72, context: '晨起' },
      recent: []
    },
    personalization: {
      clinicalProfile: { conditions: [{ code: 'essential_hypertension', status: 'controlled_with_medication' }], source: 'outpatient_record_import' },
      measurements: Array.from({ length: 40 }, (_, index) => ({
        id: `m-${index}`,
        measuredAt: `2026-08-${String((index % 14) + 1).padStart(2, '0')}T08:00:00+08:00`,
        systolic: 128,
        diastolic: 82,
        heartRate: 72,
        context: '晨起',
        arm: 'left',
        posture: 'seated',
        restMinutes: 5,
        repeatCount: 2,
        measurementContext: { stressLevel: 'low' },
        quality: { valid: true },
        symptomIds: [],
        unexpectedSecret: 'drop-me'
      })),
      medications: [{ id: 'medication-001', name: '氨氯地平片', status: 'active' }],
      medicationEvents: [{ id: 'event-001', medicationId: 'medication-001', takenAt: '2026-08-17T08:01:00+08:00', status: 'on_time', delayMinutes: 1 }],
      symptomEvents: [],
      diet: [{ date: '2026-08-17', sodiumMg: 820, recordCompleteness: 0.35 }],
      sleep: [{ date: '2026-08-17', durationMinutes: 452, score: 82 }],
      activity: [{ date: '2026-08-17', steps: 2180, moderateActivityMinutes: 6, recordCompleteness: 0.34 }],
      weightHistory: [{ measuredAt: '2026-08-17T06:37:00+08:00', weightKg: 61 }],
      labResults: [{ id: 'lab-001', code: 'creatinine', value: 68, unit: 'μmol/L', abnormal: false }],
      goals: { homeBloodPressureTarget: { systolic: { min: 110, max: 134 }, diastolic: { min: 70, max: 84 } } }
    }
  });

  assert.equal(context.personalization.measurements.length, 28);
  assert.equal(context.personalization.measurements[0].unexpectedSecret, undefined);
  assert.equal(context.personalization.medications[0].name, '氨氯地平片');
  assert.equal(context.personalization.activity[0].steps, 2180);
  assert.equal(context.personalization.labResults[0].code, 'creatinine');
  assert.equal(context.personalization.clinicalProfile.source, 'outpatient_record_import');
});
test('personal evidence is deterministic and tied to the enriched fixture', async () => {
  const context = await loadEnrichedContext();
  const evidence = chatHandler._internal.buildPersonalEvidence(context);
  const byId = new Map(evidence.map((item) => [item.id, item]));

  assert.match(byId.get('target-7d-average').fact, /131\/83/);
  assert.match(byId.get('target-7d-average').fact, /110–134\/70–84/);
  assert.equal(byId.get('target-7d-average').confidence, 'high');

  assert.match(byId.get('measurement-standardization').fact, /27 次/);
  assert.match(byId.get('measurement-standardization').fact, /坐位/);
  assert.equal(byId.get('measurement-standardization').confidence, 'high');

  assert.match(byId.get('medication-adherence').fact, /14 次/);
  assert.match(byId.get('medication-adherence').fact, /13 次按时/);
  assert.match(byId.get('medication-adherence').fact, /1 次延迟/);

  assert.match(byId.get('lifestyle-overlap').fact, /3 个偏高日/);
  assert.match(byId.get('lifestyle-overlap').fact, /3 天钠摄入超过目标/);
  assert.match(byId.get('lifestyle-overlap').fact, /3 天睡眠不足 7 小时/);
  assert.equal(byId.get('lifestyle-overlap').confidence, 'medium');

  const results = chatHandler._internal.executeTools({
    intent: 'bp_trend',
    tools: ['current_bp', 'bp_trend'],
    safety: { level: 'routine', symptoms: [], requiredAction: 'routine' }
  }, context);
  const resultEvidenceIds = results.flatMap((result) => result.evidence || []).map((item) => item.id);
  assert.ok(resultEvidenceIds.includes('target-7d-average'));
  assert.ok(resultEvidenceIds.includes('measurement-standardization'));
  assert.ok(resultEvidenceIds.includes('medication-adherence'));
  assert.ok(resultEvidenceIds.includes('lifestyle-overlap'));
});
test('normalizeAnswer hydrates only known evidence and enforces concise limits', () => {
  const catalog = [{
    id: 'target-7d-average',
    label: '个人目标',
    fact: '近 7 天平均血压 131/83 mmHg，位于个人目标内。',
    confidence: 'high'
  }];
  const answer = chatHandler._internal.normalizeAnswer({
    title: '近期血压接近个人目标',
    directAnswer: '近 7 天平均血压接近你的医生目标，测量条件也较稳定。继续按当前方式记录即可。'.repeat(8),
    personalization: {
      summary: '这次判断结合了你的医生目标和近期记录。',
      evidence: [
        { evidenceId: 'target-7d-average', interpretation: '当前平均值仍在你的个人目标内。', fact: '模型伪造事实' },
        { evidenceId: 'unknown-evidence', interpretation: '这条不应被保留。' }
      ]
    },
    keyPoints: [
      { kind: 'data', title: '第一点', text: '一' },
      { kind: 'method', title: '第二点', text: '二' },
      { kind: 'action', title: '第三点', text: '三' }
    ],
    actions: ['行动一', '行动二', '行动三'],
    caution: '',
    followUps: ['问题一', '问题二', '问题三'],
    dataBasis: '使用近期血压和个人目标。',
    confidence: 'high'
  }, 'bp_trend', catalog);

  assert.ok(answer.directAnswer.length <= 220);
  assert.equal(answer.personalization.evidence.length, 1);
  assert.deepEqual(answer.personalization.evidence[0], {
    id: 'target-7d-average',
    label: '个人目标',
    fact: catalog[0].fact,
    interpretation: '当前平均值仍在你的个人目标内。',
    confidence: 'high'
  });
  assert.equal(answer.keyPoints.length, 2);
  assert.equal(answer.actions.length, 2);
  assert.equal(answer.followUps.length, 2);
});

test('answer validation requires real personalization for routine evidence-backed answers', () => {
  const catalog = [{ id: 'target-7d-average', label: '个人目标', fact: '事实', confidence: 'high' }];
  const answer = {
    title: '近期血压趋势',
    directAnswer: '近期血压整体较平稳。',
    personalization: { summary: '', evidence: [] },
    keyPoints: [{ kind: 'data', title: '趋势', text: '连续记录有助于判断。' }],
    actions: ['继续规范测量。'],
    caution: '',
    followUps: [],
    dataBasis: '使用近期记录。',
    confidence: 'medium'
  };
  const routinePlan = { intent: 'bp_trend', safety: { level: 'routine' } };
  const urgentPlan = { intent: 'bp_trend', safety: { level: 'urgent' } };

  assert.ok(chatHandler._internal.validateAnswer(answer, routinePlan, catalog).includes('personalization_missing'));
  assert.ok(!chatHandler._internal.validateAnswer(answer, urgentPlan, catalog).includes('personalization_missing'));
});
test('answer validation accepts explicit medical negation while rejecting unsafe advice', () => {
  const plan = { intent: 'bp_trend', safety: { level: 'routine' } };
  const baseAnswer = {
    title: '先规范复测并记录',
    directAnswer: '近期血压偏高需要继续观察，但这不一定是病情恶化，也不能据此诊断为高血压。',
    keyPoints: [{ kind: 'uncertainty', title: '单次读数有限', text: '连续记录更有助于判断趋势。' }],
    actions: ['静坐五分钟后规范复测。'],
    caution: '不建议自行调整用药。',
    followUps: [],
    dataBasis: '使用了近期血压摘要。',
    confidence: 'medium'
  };

  assert.deepEqual(chatHandler._internal.validateAnswer(baseAnswer, plan), []);
  assert.ok(chatHandler._internal.validateAnswer({
    ...baseAnswer,
    directAnswer: '近期血压偏高，可以自行加药。',
    caution: ''
  }, plan).includes('unsafe_medication_advice'));
  assert.ok(chatHandler._internal.validateAnswer({
    ...baseAnswer,
    directAnswer: '近期血压偏高，这一定是高血压。'
  }, plan).includes('unsupported_diagnosis_or_certainty'));
});

test('deterministic planner routes questions without an upstream call', () => {
  const context = {
    profile: {},
    snapshot: { latest: { systolic: 128, diastolic: 82 } },
    personalization: {}
  };
  const cases = [
    ['我今天晚饭后血压偏高，应该怎么办？', 'post_meal_bp', 'post_meal_knowledge'],
    ['最近一周血压趋势怎么样？', 'bp_trend', 'bp_trend'],
    ['降压药晚了两个小时还能吃吗？', 'medication', 'medication_safety'],
    ['袖带应该怎么戴才量得准？', 'measurement', 'measurement_knowledge']
  ];

  for (const [question, intent, tool] of cases) {
    const plan = chatHandler._internal.createDeterministicPlan(question, context);
    assert.equal(plan.intent, intent);
    assert.equal(plan.planningMode, 'deterministic-evidence-router');
    assert.ok(plan.tools.includes(tool));
  }
});

test('Gemini response timeout budget fits the Vercel function window', () => {
  const timeoutBudget = chatHandler._internal.TIMEOUT_BUDGET;
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const maximumDurationMs = vercelConfig.functions['api/chat.js'].maxDuration * 1000;

  assert.ok(timeoutBudget.answerGeneration >= 45000);
  assert.ok(timeoutBudget.answerRevision >= 35000);
  assert.ok(maximumDurationMs >= timeoutBudget.answerGeneration + timeoutBudget.answerRevision + 10000);
});

test('chat handler completes deterministic planning with one Gemini call', async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalPlannerModel = process.env.GEMINI_PLANNER_MODEL;
  const originalSiliconFlowKey = process.env.SILICONFLOW_API_KEY;
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const upstreamPayload = {
    title: '饭后血压偏高先规范复测',
    directAnswer: '饭后血压可能出现短时波动，不能仅凭一次读数判断原因。先静坐五分钟，在相同姿势下复测并记录结果。',
    personalization: { summary: '', evidence: [] },
    keyPoints: [{ kind: 'mechanism', title: '常见影响因素', text: '饭后活动、未充分静坐、情绪和测量姿势都可能影响短时读数。' }],
    actions: ['静坐五分钟后复测两次，每次间隔一分钟。', '记录餐前和饭后一小时的读数用于比较。'],
    caution: '若复测达到 180/120 mmHg，或伴胸痛、气促、单侧无力等症状，请立即就医。',
    followUps: ['这次测量前是否活动或饮用咖啡、酒？'],
    dataBasis: '使用了最新饭后血压记录；缺少同日餐前对照。',
    confidence: 'medium'
  };

  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_PLANNER_MODEL;
    delete process.env.SILICONFLOW_API_KEY;
    global.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return mockHttpResponse(200, geminiInteraction(upstreamPayload));
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
    assert.equal(response.body.meta.planningMode, 'deterministic-evidence-router');
    assert.equal(response.body.meta.model, 'gemini-3.5-flash-lite');
    assert.equal(response.body.meta.fallbackUsed, false);
    assert.equal(response.body.meta.validation.passed, true);
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls.every((call) => call.url.endsWith('/v1beta/interactions')));
    assert.ok(fetchCalls.every((call) => call.options.headers['x-goog-api-key'] === 'test-gemini-key'));
    assert.equal(JSON.parse(fetchCalls[0].options.body).model, 'gemini-3.5-flash-lite');
  } finally {
    restoreEnvironment('GEMINI_API_KEY', originalGeminiKey);
    restoreEnvironment('GEMINI_MODEL', originalGeminiModel);
    restoreEnvironment('GEMINI_PLANNER_MODEL', originalPlannerModel);
    restoreEnvironment('SILICONFLOW_API_KEY', originalSiliconFlowKey);
    global.fetch = originalFetch;
  }
});

test('chat handler falls back to the secondary Gemini model after a primary 429', async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalFallbackModel = process.env.GEMINI_FALLBACK_MODEL;
  const originalPlannerModel = process.env.GEMINI_PLANNER_MODEL;
  const originalFetch = global.fetch;
  const requestedModels = [];
  const answer = {
    title: '近期血压总体接近目标',
    directAnswer: '近七天平均血压接近个人目标，建议继续保持规范测量并观察趋势。',
    personalization: { summary: '', evidence: [] },
    keyPoints: [{ kind: 'data', title: '看连续趋势', text: '连续记录比单次读数更适合判断变化。' }],
    actions: ['继续按固定时间规范测量。'],
    caution: '若达到 180/120 mmHg 或伴明显不适，请立即就医。',
    followUps: [],
    dataBasis: '使用近期血压摘要。',
    confidence: 'medium'
  };

  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODEL;
    delete process.env.GEMINI_PLANNER_MODEL;
    global.fetch = async (_url, options) => {
      const model = JSON.parse(options.body).model;
      requestedModels.push(model);
      if (requestedModels.length === 1) {
        return mockHttpResponse(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Primary model quota exceeded.' } });
      }
      return mockHttpResponse(200, geminiInteraction(answer));
    };
    const response = createApiResponse();
    await chatHandler({
      method: 'POST',
      body: { question: '最近血压趋势怎么样？', brief: { summary: { latest: { systolic: 128, diastolic: 82 } } } }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(requestedModels, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
    assert.equal(response.body.meta.model, 'gemini-3.1-flash-lite');
    assert.equal(response.body.meta.fallbackUsed, true);
  } finally {
    restoreEnvironment('GEMINI_API_KEY', originalGeminiKey);
    restoreEnvironment('GEMINI_MODEL', originalGeminiModel);
    restoreEnvironment('GEMINI_FALLBACK_MODEL', originalFallbackModel);
    restoreEnvironment('GEMINI_PLANNER_MODEL', originalPlannerModel);
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
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalFetch = global.fetch;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GEMINI_MODEL;
    global.fetch = async () => mockHttpResponse(404, {
        error: { status: 'NOT_FOUND', message: 'Requested model was not found.' }
      });
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
    restoreEnvironment('GEMINI_MODEL', originalGeminiModel);
    global.fetch = originalFetch;
  }
});

test('frontend exposes a concise personalized evidence module', () => {
  const root = path.resolve(__dirname, '..');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  assert.match(appSource, /结合你的情况/);
  assert.match(appSource, /answer-personalization/);
  assert.match(appSource, /item\.fact/);
  assert.match(appSource, /item\.interpretation/);
  assert.match(styleSource, /\.answer-personalization/);
  assert.match(styleSource, /\.personal-evidence-item/);
});

test('frontend renders Gemini failures as service status instead of a conclusion', () => {
  const root = path.resolve(__dirname, '..');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(root, 'ai-service.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  assert.match(appSource, /message\.source === 'error'/);
  assert.match(appSource, /answer-service-error/);
  assert.match(appSource, /服务状态/);
  assert.match(serviceSource, /requestError\.diagnostic = payload\.diagnostic/);
  assert.match(styleSource, /\.answer-service-error/);
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
