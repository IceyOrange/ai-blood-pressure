# Gemini-only Health Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every SiliconFlow production path with Google AI Studio Gemini while preserving planning, health tools, safety validation, AI revision, and mobile response rendering.

**Architecture:** Add a zero-dependency Gemini Interactions adapter in `api/gemini.js`. Keep domain prompts and validation in `api/chat.js`, rename the browser proxy to `ai-service.js`, and verify the flow with Node `node:test` and mocked HTTP responses.

**Tech Stack:** Node.js CommonJS, native `fetch`, Gemini Interactions API, JSON Schema, browser ES modules, Service Worker, Node `node:test`.

---

## File Map

- Create `api/gemini.js` for Gemini request, response, timeout, and error handling.
- Create `tests/gemini-agent.test.js` for adapter, handler, and strict-provider tests.
- Modify `api/chat.js` for Gemini Schemas, calls, metadata, and errors.
- Create `ai-service.js`; delete `siliconflow.js`; update `app.js` and `sw.js`.
- Modify `dev-server.mjs`, `.env.local.example`, and `README.md`.

### Task 1: Gemini Adapter Contract

**Files:**
- Create: `tests/gemini-agent.test.js`
- Create: `api/gemini.js`

- [ ] **Step 1: Write failing adapter tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeminiRequest, extractGeminiText, callGemini } = require('../api/gemini');

test('buildGeminiRequest maps messages and JSON Schema', () => {
  const body = buildGeminiRequest({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: '分析血压。' }
    ],
    schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } },
    temperature: 0.1,
    maxOutputTokens: 900,
    thinkingLevel: 'low'
  });
  assert.equal(body.model, 'gemini-2.5-flash');
  assert.equal(body.system_instruction, '只输出 JSON。');
  assert.match(body.input, /分析血压/);
  assert.equal(body.response_format.mime_type, 'application/json');
  assert.deepEqual(body.response_format.schema.required, ['answer']);
  assert.equal(body.generation_config.max_output_tokens, 900);
});

test('extractGeminiText reads completed output', () => {
  const text = extractGeminiText({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"answer":"ok"}' }] }]
  });
  assert.equal(text, '{"answer":"ok"}');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run the project Node binary with `--test tests/gemini-agent.test.js`.

Expected: FAIL with `Cannot find module '../api/gemini'`.

- [ ] **Step 3: Implement the minimal adapter**

```js
function buildGeminiRequest({ model, messages, schema, temperature, maxOutputTokens, thinkingLevel })
function extractGeminiText(payload)
async function callGemini({ endpoint, apiKey, model, messages, schema, temperature, maxOutputTokens, thinkingLevel, timeoutMs, fetchImpl })
```

Send `x-goog-api-key`; use `AbortController`; map 401/403 to `AI_AUTH_FAILED`, 429 to `AI_RATE_LIMITED`, timeout to `AI_TIMEOUT`, invalid output to `AI_RESPONSE_INVALID`, and other failures to `AI_UPSTREAM_FAILED`.

- [ ] **Step 4: Add error tests and verify GREEN**

Test authentication, rate limiting, timeout, incomplete status, and empty output with mocked `fetchImpl`. Run the test file and require all adapter tests to PASS.

### Task 2: Gemini-only Agent Handler

**Files:**
- Modify: `tests/gemini-agent.test.js`
- Modify: `api/chat.js`

- [ ] **Step 1: Write failing handler integration tests**

Use a two-call Gemini mock. The planner returns `post_meal_bp`; the answer returns a valid structured response. Assert:

```js
assert.equal(response.statusCode, 200);
assert.equal(response.body.mode, 'gemini-agent');
assert.equal(response.body.meta.plannerModel, 'gemini-3.5-flash-lite');
assert.equal(response.body.meta.model, 'gemini-2.5-flash');
assert.equal(response.body.meta.validation.passed, true);
assert.equal(fetchCalls.length, 2);
assert.ok(fetchCalls.every((call) => call.url.endsWith('/v1beta/interactions')));
assert.ok(fetchCalls.every((call) => call.options.headers['x-goog-api-key'] === 'test-gemini-key'));
```

Add a missing-key test that unsets `GEMINI_API_KEY`, expects HTTP 503 and `AI_NOT_CONFIGURED`, and confirms no upstream call.

- [ ] **Step 2: Run handler tests and verify RED**

Expected: FAIL because the handler still requires `SILICONFLOW_API_KEY` and returns SiliconFlow metadata.

- [ ] **Step 3: Add domain JSON Schemas**

Add a planning Schema requiring `intent`, `questionFocus`, `tools`, and `missingInformation`, with enums matching existing allowed values. Add an answer Schema requiring `title`, `directAnswer`, `keyPoints`, `actions`, `caution`, `followUps`, `dataBasis`, and `confidence`.

- [ ] **Step 4: Replace server calls with Gemini**

```js
const { callGemini } = require('./gemini');
const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_PLANNER_MODEL = 'gemini-3.5-flash-lite';
```

Read only `GEMINI_API_KEY`, `GEMINI_ENDPOINT`, `GEMINI_MODEL`, and `GEMINI_PLANNER_MODEL`. Use the planning and answer Schemas for their calls, remove `callSiliconFlow`, and return `gemini-agent` or `gemini-agent-revised`.

- [ ] **Step 5: Update server errors and verify GREEN**

Replace provider-specific diagnostics with Gemini text. Run the test file and require all adapter and handler tests to PASS.

### Task 3: Browser Client and Configuration Cleanup

**Files:**
- Modify: `tests/gemini-agent.test.js`
- Create: `ai-service.js`
- Delete: `siliconflow.js`
- Modify: `app.js`
- Modify: `dev-server.mjs`
- Modify: `.env.local.example`
- Modify: `README.md`
- Modify: `sw.js`

- [ ] **Step 1: Write a failing strict-provider test**

```js
const productionFiles = [
  'api/chat.js', 'api/gemini.js', 'app.js', 'ai-service.js',
  'dev-server.mjs', '.env.local.example', 'README.md', 'sw.js'
];
for (const file of productionFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /SILICONFLOW|硅基流动/);
}
assert.equal(fs.existsSync(path.join(root, 'siliconflow.js')), false);
```

- [ ] **Step 2: Run the source test and verify RED**

Expected: FAIL because provider-specific source and configuration still exist.

- [ ] **Step 3: Rename the browser API module**

Create `ai-service.js` with:

```js
export function getHealthAgentConfig()
export function hasHealthAgentConfig()
export async function requestHealthAgent({ question, brief, history = [] })
```

Keep the same `/api/chat` contract. Delete `siliconflow.js` and update `app.js` imports and calls.

- [ ] **Step 4: Update diagnostics and configuration**

Make `app.js` recognize `gemini-agent` and use Gemini-specific auth, rate, upstream, and local setup text. Update `dev-server.mjs` and `.env.local.example` to use `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_PLANNER_MODEL`, and optional `GEMINI_ENDPOINT`.

- [ ] **Step 5: Update docs and PWA cache**

Rewrite README setup/deployment sections for Google AI Studio and Vercel. Change the cache name to `maian-pwa-v10` and replace `./siliconflow.js` with `./ai-service.js` in the app shell.

- [ ] **Step 6: Run the full test file and verify GREEN**

Expected: all tests PASS and no production/configuration file contains a SiliconFlow reference.

### Task 4: Verification and Delivery

**Files:**
- Verify: `api/gemini.js`, `api/chat.js`, `app.js`, `ai-service.js`
- Verify: `dev-server.mjs`, `sw.js`, `tests/gemini-agent.test.js`

- [ ] **Step 1: Run syntax checks**

Run `node --check` for every changed JavaScript file.

Expected: every command exits 0 with no syntax error.

- [ ] **Step 2: Run all automated tests**

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/*.test.js
```

Expected: zero failed tests.

- [ ] **Step 3: Inspect the final diff**

Run `git diff --check`, inspect `git diff --stat`, and search production files for `SILICONFLOW`, `硅基流动`, and `siliconflow.js`.

Expected: no whitespace errors and no provider-specific production reference.

- [ ] **Step 4: Commit and push**

Commit the migration with message `Migrate health agent to Gemini`, then push `main` to GitHub to trigger Vercel.

- [ ] **Step 5: Verify deployment readiness**

Confirm the Vercel site serves `maian-pwa-v10`. Live `/api/chat` verification waits only for `GEMINI_API_KEY` in Vercel; after configuration, send an anonymous sample and require HTTP 200 with `mode=gemini-agent` or `gemini-agent-revised`.
