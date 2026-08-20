# Enriched Sample Health Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the static fixture with backward-compatible measurement context, clinical, medication, symptom, lifestyle, weight, and laboratory data without changing current blood-pressure results.

**Architecture:** Keep `sampleData` as the single browser-imported fixture. Preserve every consumed property and add nested machine-readable fields plus new top-level event collections; tests load the ES module through a data URL so the repository remains package-free.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, JavaScript.

---

### Task 1: Add sample schema tests

**Files:**
- Create: `tests/sample-data.test.js`
- Test: `tests/sample-data.test.js`

- [ ] **Step 1: Write the failing structure test**

+ Add a Node test that imports `data/sample-data.js` through a base64 data URL and asserts that `clinicalProfile`, `medications`, `medicationEvents`, `symptomEvents`, `activity`, `weightHistory`, and `labResults` exist. Assert every measurement includes measurement quality, context, source, device, timezone, and repeat readings.

- [ ] **Step 2: Write the invariant test**

+ Assert 27 blood-pressure, 14 diet, and 14 sleep records remain; recompute the active window and require 12 records, average `131/83`, morning systolic `133`, evening systolic `130`, and latest `128/82` with heart rate `72`.

- [ ] **Step 3: Run tests and confirm failure**

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test .\tests\sample-data.test.js
```

Expected: FAIL because the new collections and measurement fields do not exist.

### Task 2: Enrich the fixture

**Files:**
- Modify: `data/sample-data.js`
- Test: `tests/sample-data.test.js`

- [ ] **Step 1: Extend profile and device fields**
- [ ] **Step 2: Enrich all 27 measurement records**
- [ ] **Step 3: Add medication and symptom events**
- [ ] **Step 4: Extend diet and sleep records**
- [ ] **Step 5: Add activity, weight, labs, goals**
- [ ] **Step 6: Run focused tests and confirm PASS**

### Task 3: Verify compatibility

**Files:**
- Test: `tests/gemini-agent.test.js`
- Test: `tests/sample-data.test.js`

- [ ] **Step 1: Run the complete test set**

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test .\tests\gemini-agent.test.js .\tests\sample-data.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Review the final diff**

Confirm only the fixture, focused tests, and approved design/plan documents changed; no Agent or UI source file changes.
