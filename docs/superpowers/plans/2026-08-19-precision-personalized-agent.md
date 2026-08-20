# Precision Personalized Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise, evidence-bound personalization layer to health Agent responses.

**Architecture:** Propagate a whitelisted personalization payload through `buildDoctorBrief`, compute deterministic evidence in the server tool layer, let Gemini select evidence IDs and write short interpretations, hydrate immutable facts server-side, and render at most three evidence rows in a dedicated UI module.

**Tech Stack:** Browser ES modules, Vercel Node handler, Gemini structured JSON, Node.js test runner, HTML/CSS.

---

### Task 1: Propagate personalization context

**Files:**
- Modify: `agent.js`
- Modify: `api/chat.js`
- Modify: `tests/sample-data.test.js`
- Modify: `tests/gemini-agent.test.js`

- [ ] Add failing tests that require `buildDoctorBrief(sampleData).personalization` and sanitized server context collections.
- [ ] Run focused tests with Node `--test --test-isolation=none` and confirm failure.
- [ ] Add the backward-compatible personalization payload and server whitelist.
- [ ] Re-run focused tests and confirm pass.

### Task 2: Build deterministic evidence

**Files:**
- Modify: `api/chat.js`
- Modify: `tests/gemini-agent.test.js`

- [ ] Add failing tests for personal target, standardized measurement, medication adherence, and lifestyle overlap evidence.
- [ ] Implement an evidence catalog with stable IDs, immutable facts, relevance categories, and confidence.
- [ ] Attach relevant evidence to existing tool results without expanding planner complexity.
- [ ] Re-run evidence tests and confirm pass.

### Task 3: Extend the AI response contract

**Files:**
- Modify: `api/chat.js`
- Modify: `tests/gemini-agent.test.js`

- [ ] Add failing tests for evidence hydration, unknown ID rejection, concise limits, and urgent exemptions.
- [ ] Extend Gemini prompt and JSON Schema with `personalization`.
- [ ] Hydrate selected evidence from the deterministic catalog and tighten item limits.
- [ ] Extend validation and repair guidance, then update mocked Gemini responses.
- [ ] Run Agent tests and confirm pass.

### Task 4: Render concise personalization

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/gemini-agent.test.js`

- [ ] Add a failing source-level rendering contract test for the dedicated personalization module.
- [ ] Render the summary and up to three hydrated evidence rows after the direct answer.
- [ ] Add compact responsive styling consistent with the current health UI.
- [ ] Run focused tests and inspect the rendered source contract.

### Task 5: Verify the complete change

**Files:**
- Test: `tests/gemini-agent.test.js`
- Test: `tests/sample-data.test.js`

- [ ] Run `git diff --check`.
- [ ] Run the complete Node test suite with `--test-isolation=none`.
- [ ] Confirm existing blood-pressure statistics remain unchanged.
- [ ] Review changed files and verify no unrelated edits.
