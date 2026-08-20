const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadSampleData() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'data', 'sample-data.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return (await import(moduleUrl)).sampleData;
}

async function loadAgentModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agent.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}
const average = (items, key) => Math.round(items.reduce((total, item) => total + Number(item[key] || 0), 0) / items.length);

function summarizeCurrentWindow(data) {
  const measurements = [...data.measurements].sort((first, second) => new Date(first.measuredAt) - new Date(second.measuredAt));
  const latest = measurements.at(-1);
  const endTime = new Date(latest.measuredAt).getTime();
  const startTime = endTime - 6 * 24 * 60 * 60 * 1000;
  const recent = measurements.filter((item) => {
    const time = new Date(item.measuredAt).getTime();
    return time >= startTime && time <= endTime;
  });
  const mornings = recent.filter((item) => item.context === '晨起');
  const evenings = recent.filter((item) => item.context === '睡前');
  return {
    latest,
    recent,
    averageSystolic: average(recent, 'systolic'),
    averageDiastolic: average(recent, 'diastolic'),
    morningSystolic: average(mornings, 'systolic'),
    eveningSystolic: average(evenings, 'systolic')
  };
}

test('doctor brief carries the enriched personalization payload', async () => {
  const data = await loadSampleData();
  const { buildDoctorBrief } = await loadAgentModule();
  const brief = buildDoctorBrief(data);

  assert.equal(typeof brief.personalization, 'object');
  assert.equal(brief.personalization.measurements.length, 27);
  assert.equal(brief.personalization.medicationEvents.length, 14);
  assert.equal(brief.personalization.activity.length, 14);
  assert.equal(brief.personalization.labResults.length, 8);
  assert.equal(brief.personalization.clinicalProfile.source, 'outpatient_record_import');
  assert.deepEqual(brief.personalization.goals.homeBloodPressureTarget, data.goals.homeBloodPressureTarget);
});
test('sample fixture exposes enriched longitudinal health data', async () => {
  const data = await loadSampleData();

  assert.equal(typeof data.clinicalProfile, 'object');
  for (const collection of ['medications', 'medicationEvents', 'symptomEvents', 'activity', 'weightHistory', 'labResults']) {
    assert.ok(Array.isArray(data[collection]), `${collection} must be an array`);
    assert.ok(data[collection].length > 0, `${collection} must include sample records`);
  }
  assert.equal(data.measurements.length, 27);
  assert.equal(data.diet.length, 14);
  assert.equal(data.sleep.length, 14);
  assert.equal(data.activity.length, 14);

  for (const measurement of data.measurements) {
    assert.ok(['left', 'right'].includes(measurement.arm));
    assert.ok(['seated', 'supine', 'standing'].includes(measurement.posture));
    assert.ok(Number.isFinite(measurement.restMinutes));
    assert.ok(measurement.measurementSetId);
    assert.equal(measurement.repeatCount, measurement.rawReadings.length);
    assert.equal(Math.round(average(measurement.rawReadings, 'systolic')), measurement.systolic);
    assert.equal(Math.round(average(measurement.rawReadings, 'diastolic')), measurement.diastolic);
    assert.equal(Math.round(average(measurement.rawReadings, 'heartRate')), measurement.heartRate);
    assert.equal(typeof measurement.measurementContext, 'object');
    assert.equal(typeof measurement.quality, 'object');
    assert.equal(typeof measurement.quality.valid, 'boolean');
    assert.ok(Array.isArray(measurement.symptomIds));
    assert.ok(measurement.deviceId);
    assert.ok(measurement.source);
    assert.equal(measurement.timezone, 'Asia/Shanghai');
  }

  for (const dietRecord of data.diet) {
    assert.ok(dietRecord.nutritionEstimateSource);
    assert.equal(typeof dietRecord.caffeineMg, 'number');
    assert.equal(typeof dietRecord.alcoholStandardDrinks, 'number');
    assert.equal(typeof dietRecord.waterMl, 'number');
    assert.equal(typeof dietRecord.mealTimes, 'object');
    assert.ok(dietRecord.recordCompleteness >= 0 && dietRecord.recordCompleteness <= 1);
  }

  for (const sleepRecord of data.sleep) {
    assert.ok(sleepRecord.subjectiveQuality);
    assert.equal(typeof sleepRecord.snoringDetected, 'boolean');
    assert.equal(typeof sleepRecord.averageSleepingHeartRate, 'number');
    assert.equal(typeof sleepRecord.averageSpO2, 'number');
    assert.equal(typeof sleepRecord.lowestSpO2, 'number');
    assert.ok(sleepRecord.source);
  }
});

test('enriched event references remain internally consistent', async () => {
  const data = await loadSampleData();
  const measurementIds = new Set(data.measurements.map((item) => item.id));
  const medicationIds = new Set(data.medications.map((item) => item.id));
  const symptomIds = new Set(data.symptomEvents.map((item) => item.id));

  for (const event of data.medicationEvents) {
    assert.ok(medicationIds.has(event.medicationId), `unknown medication ${event.medicationId}`);
    assert.ok(Number.isFinite(new Date(event.takenAt).getTime()));
  }
  for (const event of data.symptomEvents) {
    assert.ok(event.measurementIds.every((id) => measurementIds.has(id)), `unknown measurement in ${event.id}`);
    assert.equal(typeof event.redFlags, 'object');
  }
  for (const measurement of data.measurements) {
    assert.ok(measurement.symptomIds.every((id) => symptomIds.has(id)), `unknown symptom in ${measurement.id}`);
  }
});

test('enrichment preserves the existing blood pressure results', async () => {
  const data = await loadSampleData();
  const summary = summarizeCurrentWindow(data);

  assert.equal(summary.recent.length, 12);
  assert.equal(summary.averageSystolic, 131);
  assert.equal(summary.averageDiastolic, 83);
  assert.equal(summary.morningSystolic, 133);
  assert.equal(summary.eveningSystolic, 130);
  assert.deepEqual(
    [summary.latest.systolic, summary.latest.diastolic, summary.latest.heartRate],
    [128, 82, 72]
  );
});
