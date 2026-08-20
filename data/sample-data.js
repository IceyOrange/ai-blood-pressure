const measurementOverrides = {
  'm-001': { minutesAfterWaking: 71, minutesUntilMedication: 18 },
  'm-002': { minutesAfterMeal: 151, minutesSinceMedication: 794, minutesSinceCaffeine: 721, minutesSinceExercise: 158 },
  'm-003': { minutesAfterWaking: 67, minutesUntilMedication: 25 },
  'm-004': { minutesAfterMeal: 144, minutesSinceMedication: 791, minutesSinceCaffeine: 714, minutesSinceExercise: 134 },
  'm-005': { stressLevel: 'medium', minutesAfterWaking: 89, minutesUntilMedication: 9 },
  'm-006': { stressLevel: 'medium', minutesAfterMeal: 14, minutesSinceMedication: 798, minutesSinceCaffeine: 729, minutesSinceExercise: null },
  'm-007': { minutesAfterWaking: 63, minutesUntilMedication: 22 },
  'm-008': { minutesAfterMeal: 153, minutesSinceMedication: 797, minutesSinceCaffeine: 723, minutesSinceExercise: 143 },
  'm-009': { stressLevel: 'medium', minutesAfterWaking: 82, minutesUntilMedication: 14 },
  'm-010': { minutesAfterMeal: 76, minutesSinceMedication: 807, minutesSinceCaffeine: 736, minutesSinceAlcohol: 91, minutesSinceExercise: null },
  'm-011': { stressLevel: 'high', painLevel: 2, symptomIds: ['symptom-001'], minutesAfterWaking: 105, minutesUntilMedication: 9 },
  'm-012': { minutesAfterMeal: 172, minutesSinceMedication: 805, minutesSinceCaffeine: 742, minutesSinceExercise: null },
  'm-013': { minutesAfterWaking: 71, minutesUntilMedication: 16 },
  'm-014': { minutesAfterMeal: 146, minutesSinceMedication: 788, minutesSinceCaffeine: 716, minutesSinceExercise: 165 },
  'm-015': { minutesAfterWaking: 62, minutesUntilMedication: 28 },
  'm-016': { minutesAfterMeal: 140, minutesSinceMedication: 788, minutesSinceCaffeine: 710, minutesSinceExercise: 145 },
  'm-017': { minutesAfterWaking: 86, minutesUntilMedication: 9 },
  'm-018': { minutesAfterMeal: 158, minutesSinceMedication: 798, minutesSinceCaffeine: 728, minutesSinceExercise: 150 },
  'm-019': { stressLevel: 'high', symptomIds: ['symptom-002'], minutesAfterWaking: 81, minutesUntilMedication: 43 },
  'm-020': { stressLevel: 'medium', minutesAfterMeal: 82, minutesSinceMedication: 785, minutesSinceCaffeine: 734, minutesSinceExercise: null },
  'm-021': { minutesAfterWaking: 57, minutesUntilMedication: 27 },
  'm-022': { minutesAfterMeal: 137, minutesSinceMedication: 782, minutesSinceCaffeine: 707, minutesSinceExercise: 133 },
  'm-023': { minutesAfterWaking: 77, minutesUntilMedication: 12 },
  'm-024': { minutesAfterMeal: 152, minutesSinceMedication: 795, minutesSinceCaffeine: 722, minutesSinceExercise: 151 },
  'm-025': { stressLevel: 'medium', minutesAfterWaking: 74, minutesUntilMedication: 21 },
  'm-026': { minutesAfterMeal: 150, minutesSinceMedication: 788, minutesSinceCaffeine: 720, minutesSinceExercise: 193 },
  'm-027': { medicationTiming: 'after_morning_dose', minutesSinceMedication: 41, minutesSinceCaffeine: 47, minutesAfterWaking: 128 }
};

const enrichMeasurement = (record) => {
  const details = measurementOverrides[record.id] || {};
  const isMorning = record.context === '晨起';
  return {
    ...record,
    arm: 'left',
    posture: 'seated',
    restMinutes: details.restMinutes ?? 5,
    cuffSize: 'adult-medium',
    measurementSetId: `set-${record.id}`,
    repeatCount: 2,
    aggregationMethod: 'mean_rounded',
    rawReadings: [
      { readingIndex: 1, offsetSeconds: -90, systolic: record.systolic + 1, diastolic: record.diastolic + 1, heartRate: record.heartRate + 1, signalQuality: 'good' },
      { readingIndex: 2, offsetSeconds: 0, systolic: record.systolic - 1, diastolic: record.diastolic - 1, heartRate: record.heartRate - 1, signalQuality: 'good' }
    ],
    measurementContext: {
      minutesAfterWaking: isMorning ? details.minutesAfterWaking ?? 45 : null,
      minutesAfterMeal: isMorning ? null : details.minutesAfterMeal ?? 150,
      mealType: isMorning ? null : 'dinner',
      medicationTiming: details.medicationTiming || (isMorning ? 'before_morning_dose' : 'after_morning_dose'),
      minutesSinceMedication: details.minutesSinceMedication ?? (isMorning ? null : 780),
      minutesUntilMedication: details.minutesUntilMedication ?? null,
      minutesSinceCaffeine: details.minutesSinceCaffeine ?? (isMorning ? null : 720),
      minutesSinceAlcohol: details.minutesSinceAlcohol ?? null,
      minutesSinceExercise: details.minutesSinceExercise ?? (isMorning ? null : 180),
      minutesSinceBath: details.minutesSinceBath ?? null,
      stressLevel: details.stressLevel || 'low',
      painLevel: details.painLevel ?? 0
    },
    quality: {
      valid: true,
      movementDetected: false,
      cuffFit: 'good',
      irregularPulseDetected: false,
      signalQuality: 'good',
      warnings: []
    },
    symptomIds: details.symptomIds || [],
    deviceId: 'device-bp-p1',
    source: 'bluetooth_sync',
    timezone: 'Asia/Shanghai'
  };
};

const dietOverrides = {
  '2026-08-04': { waterMl: 1650, caffeineMg: 95 },
  '2026-08-06': { waterMl: 1450, caffeineMg: 130 },
  '2026-08-08': { waterMl: 1500, caffeineMg: 80, alcoholLastAt: '2026-08-08T20:00:00+08:00', mealTimes: { breakfast: '08:05', lunch: '12:50', dinner: '20:15' } },
  '2026-08-09': { waterMl: 1420, caffeineMg: 110 },
  '2026-08-13': { waterMl: 1550, caffeineMg: 120, mealTimes: { breakfast: '07:55', lunch: '12:35', dinner: '20:07' } },
  '2026-08-14': { waterMl: 2100, caffeineMg: 60 },
  '2026-08-17': { waterMl: 650, caffeineMg: 45, caffeineLastAt: '2026-08-17T07:55:00+08:00', recordCompleteness: 0.35, mealTimes: { breakfast: '07:38', lunch: null, dinner: null } }
};

const enrichDiet = (record) => {
  const details = dietOverrides[record.date] || {};
  const caffeineMg = details.caffeineMg ?? 80;
  return {
    ...record,
    nutritionEstimateSource: 'meal_photo_and_food_database',
    caffeineMg,
    caffeineLastAt: caffeineMg ? `${record.date}T09:15:00+08:00` : null,
    alcoholStandardDrinks: record.alcohol ? 1 : 0,
    alcoholLastAt: details.alcoholLastAt || null,
    waterMl: details.waterMl ?? 1800,
    mealTimes: details.mealTimes || { breakfast: '07:50', lunch: '12:25', dinner: record.lateMeal ? '21:10' : '18:45' },
    recordCompleteness: details.recordCompleteness ?? 1,
    source: 'user_log_with_meal_photo'
  };
};

const sleepOverrides = {
  '2026-08-06': { snoringDetected: true, averageSleepingHeartRate: 66, averageSpO2: 95, lowestSpO2: 92 },
  '2026-08-08': { snoringDetected: true, averageSleepingHeartRate: 65, averageSpO2: 95, lowestSpO2: 93 },
  '2026-08-09': { snoringDetected: true, averageSleepingHeartRate: 67, averageSpO2: 95, lowestSpO2: 92 },
  '2026-08-13': { snoringDetected: true, averageSleepingHeartRate: 66, averageSpO2: 95, lowestSpO2: 92 },
  '2026-08-16': { snoringDetected: false, averageSleepingHeartRate: 64, averageSpO2: 96, lowestSpO2: 94 }
};

const enrichSleep = (record) => {
  const details = sleepOverrides[record.date] || {};
  return {
    ...record,
    subjectiveQuality: record.score >= 85 ? 'good' : record.score >= 75 ? 'fair' : 'poor',
    snoringDetected: details.snoringDetected ?? false,
    averageSleepingHeartRate: details.averageSleepingHeartRate ?? 62,
    averageSpO2: details.averageSpO2 ?? 97,
    lowestSpO2: details.lowestSpO2 ?? 94,
    napMinutes: record.score < 72 ? 25 : 0,
    source: 'wrist_wearable',
    recordCompleteness: 1
  };
};

export const sampleData = {
  profile: {
    name: '林女士',
    age: 52,
    sex: '女',
    heightCm: 162,
    weightKg: 61,
    city: '北京市',
    locationSource: '网络位置估计',
    locationConfidence: '低',
    locationInferenceEnabled: true,
    dietaryPreference: '未记录',
    memories: [],
    medication: '氨氯地平片 2.5 mg，每日 08:00',
    menopauseStatus: 'perimenopause',
    smokingStatus: 'never',
    familyHistory: [
      { condition: 'hypertension', relation: 'mother', onsetAge: 58, source: 'self_report' },
      { condition: 'stroke', relation: 'maternal_grandfather', onsetAge: 72, source: 'self_report' }
    ],
    diagnoses: [
      { code: 'essential_hypertension', name: '原发性高血压', status: 'confirmed', diagnosedAt: '2025-11-18', source: 'outpatient_record' }
    ],
    clinicianTargets: {
      homeSystolic: { min: 110, max: 134 },
      homeDiastolic: { min: 70, max: 84 },
      setAt: '2026-07-20T10:30:00+08:00',
      source: 'clinician'
    },
    allergies: []
  },
  clinicalProfile: {
    conditions: [
      { code: 'essential_hypertension', status: 'controlled_with_medication', diagnosedAt: '2025-11-18' }
    ],
    riskFactors: ['perimenopause', 'family_history_of_hypertension'],
    negativeHistory: ['diabetes', 'chronic_kidney_disease', 'coronary_heart_disease', 'stroke'],
    lastOutpatientVisitAt: '2026-07-20T10:30:00+08:00',
    nextFollowUpAt: '2026-10-20T10:00:00+08:00',
    source: 'outpatient_record_import',
    updatedAt: '2026-07-20T11:05:00+08:00'
  },
  device: {
    id: 'device-bp-p1',
    name: '脉安 P1 上臂式',
    manufacturer: '脉安健康',
    model: 'P1',
    serial: 'PA1-DEMO-0826',
    connected: true,
    battery: 86,
    cuffRangeCm: { min: 22, max: 42 },
    validationStandard: 'ISO 81060-2',
    firmwareVersion: '1.8.3',
    lastSelfCheckAt: '2026-08-17T08:40:00+08:00',
    selfCheckStatus: 'passed',
    supportedArms: ['left', 'right'],
    source: 'paired_device',
    lastSyncAt: '2026-08-17T08:43:00+08:00'
  },
  measurements: [
    enrichMeasurement({ id: 'm-001', measuredAt: '2026-08-04T07:42:00+08:00', systolic: 134, diastolic: 86, heartRate: 78, context: '晨起' }),
    enrichMeasurement({ id: 'm-002', measuredAt: '2026-08-04T21:16:00+08:00', systolic: 132, diastolic: 84, heartRate: 75, context: '睡前' }),
    enrichMeasurement({ id: 'm-003', measuredAt: '2026-08-05T07:35:00+08:00', systolic: 130, diastolic: 83, heartRate: 76, context: '晨起' }),
    enrichMeasurement({ id: 'm-004', measuredAt: '2026-08-05T21:09:00+08:00', systolic: 128, diastolic: 81, heartRate: 72, context: '睡前' }),
    enrichMeasurement({ id: 'm-005', measuredAt: '2026-08-06T07:51:00+08:00', systolic: 136, diastolic: 88, heartRate: 80, context: '晨起' }),
    enrichMeasurement({ id: 'm-006', measuredAt: '2026-08-06T21:24:00+08:00', systolic: 133, diastolic: 85, heartRate: 78, context: '睡前' }),
    enrichMeasurement({ id: 'm-007', measuredAt: '2026-08-07T07:38:00+08:00', systolic: 129, diastolic: 82, heartRate: 74, context: '晨起' }),
    enrichMeasurement({ id: 'm-008', measuredAt: '2026-08-07T21:18:00+08:00', systolic: 127, diastolic: 80, heartRate: 70, context: '睡前' }),
    enrichMeasurement({ id: 'm-009', measuredAt: '2026-08-08T07:46:00+08:00', systolic: 138, diastolic: 90, heartRate: 82, context: '晨起' }),
    enrichMeasurement({ id: 'm-010', measuredAt: '2026-08-08T21:31:00+08:00', systolic: 135, diastolic: 87, heartRate: 80, context: '睡前' }),
    enrichMeasurement({ id: 'm-011', measuredAt: '2026-08-09T08:03:00+08:00', systolic: 142, diastolic: 92, heartRate: 85, context: '晨起' }),
    enrichMeasurement({ id: 'm-012', measuredAt: '2026-08-09T21:37:00+08:00', systolic: 137, diastolic: 88, heartRate: 82, context: '睡前' }),
    enrichMeasurement({ id: 'm-013', measuredAt: '2026-08-10T07:44:00+08:00', systolic: 131, diastolic: 84, heartRate: 76, context: '晨起' }),
    enrichMeasurement({ id: 'm-014', measuredAt: '2026-08-10T21:11:00+08:00', systolic: 129, diastolic: 82, heartRate: 73, context: '睡前' }),
    enrichMeasurement({ id: 'm-015', measuredAt: '2026-08-11T07:29:00+08:00', systolic: 127, diastolic: 80, heartRate: 72, context: '晨起' }),
    enrichMeasurement({ id: 'm-016', measuredAt: '2026-08-11T21:05:00+08:00', systolic: 126, diastolic: 79, heartRate: 70, context: '睡前' }),
    enrichMeasurement({ id: 'm-017', measuredAt: '2026-08-12T07:56:00+08:00', systolic: 133, diastolic: 85, heartRate: 77, context: '晨起' }),
    enrichMeasurement({ id: 'm-018', measuredAt: '2026-08-12T21:23:00+08:00', systolic: 130, diastolic: 83, heartRate: 75, context: '睡前' }),
    enrichMeasurement({ id: 'm-019', measuredAt: '2026-08-13T07:41:00+08:00', systolic: 140, diastolic: 89, heartRate: 81, context: '晨起' }),
    enrichMeasurement({ id: 'm-020', measuredAt: '2026-08-13T21:29:00+08:00', systolic: 136, diastolic: 86, heartRate: 78, context: '睡前' }),
    enrichMeasurement({ id: 'm-021', measuredAt: '2026-08-14T07:33:00+08:00', systolic: 128, diastolic: 81, heartRate: 72, context: '晨起' }),
    enrichMeasurement({ id: 'm-022', measuredAt: '2026-08-14T21:02:00+08:00', systolic: 126, diastolic: 79, heartRate: 70, context: '睡前' }),
    enrichMeasurement({ id: 'm-023', measuredAt: '2026-08-15T07:48:00+08:00', systolic: 131, diastolic: 83, heartRate: 74, context: '晨起' }),
    enrichMeasurement({ id: 'm-024', measuredAt: '2026-08-15T21:17:00+08:00', systolic: 129, diastolic: 81, heartRate: 71, context: '睡前' }),
    enrichMeasurement({ id: 'm-025', measuredAt: '2026-08-16T07:39:00+08:00', systolic: 135, diastolic: 86, heartRate: 79, context: '晨起' }),
    enrichMeasurement({ id: 'm-026', measuredAt: '2026-08-16T21:15:00+08:00', systolic: 132, diastolic: 84, heartRate: 75, context: '睡前' }),
    enrichMeasurement({ id: 'm-027', measuredAt: '2026-08-17T08:42:00+08:00', systolic: 128, diastolic: 82, heartRate: 72, context: '晨起' })
  ],
  medications: [
    {
      id: 'medication-001',
      name: '氨氯地平片',
      genericName: 'amlodipine',
      category: 'antihypertensive',
      dose: { value: 2.5, unit: 'mg' },
      route: 'oral',
      frequency: 'once_daily',
      scheduledTimes: ['08:00'],
      startedAt: '2025-11-18',
      prescribedBy: 'cardiology_clinic',
      status: 'active',
      source: 'prescription_import'
    }
  ],
  medicationEvents: [
    { id: 'med-event-001', medicationId: 'medication-001', scheduledAt: '2026-08-04T08:00:00+08:00', takenAt: '2026-08-04T08:02:00+08:00', status: 'on_time', delayMinutes: 2, source: 'smart_pillbox' },
    { id: 'med-event-002', medicationId: 'medication-001', scheduledAt: '2026-08-05T08:00:00+08:00', takenAt: '2026-08-05T07:58:00+08:00', status: 'on_time', delayMinutes: -2, source: 'smart_pillbox' },
    { id: 'med-event-003', medicationId: 'medication-001', scheduledAt: '2026-08-06T08:00:00+08:00', takenAt: '2026-08-06T08:06:00+08:00', status: 'on_time', delayMinutes: 6, source: 'smart_pillbox' },
    { id: 'med-event-004', medicationId: 'medication-001', scheduledAt: '2026-08-07T08:00:00+08:00', takenAt: '2026-08-07T08:01:00+08:00', status: 'on_time', delayMinutes: 1, source: 'smart_pillbox' },
    { id: 'med-event-005', medicationId: 'medication-001', scheduledAt: '2026-08-08T08:00:00+08:00', takenAt: '2026-08-08T08:04:00+08:00', status: 'on_time', delayMinutes: 4, source: 'smart_pillbox' },
    { id: 'med-event-006', medicationId: 'medication-001', scheduledAt: '2026-08-09T08:00:00+08:00', takenAt: '2026-08-09T08:12:00+08:00', status: 'on_time', delayMinutes: 12, source: 'smart_pillbox' },
    { id: 'med-event-007', medicationId: 'medication-001', scheduledAt: '2026-08-10T08:00:00+08:00', takenAt: '2026-08-10T08:03:00+08:00', status: 'on_time', delayMinutes: 3, source: 'smart_pillbox' },
    { id: 'med-event-008', medicationId: 'medication-001', scheduledAt: '2026-08-11T08:00:00+08:00', takenAt: '2026-08-11T07:57:00+08:00', status: 'on_time', delayMinutes: -3, source: 'smart_pillbox' },
    { id: 'med-event-009', medicationId: 'medication-001', scheduledAt: '2026-08-12T08:00:00+08:00', takenAt: '2026-08-12T08:05:00+08:00', status: 'on_time', delayMinutes: 5, source: 'smart_pillbox' },
    { id: 'med-event-010', medicationId: 'medication-001', scheduledAt: '2026-08-13T08:00:00+08:00', takenAt: '2026-08-13T08:24:00+08:00', status: 'delayed', delayMinutes: 24, source: 'smart_pillbox' },
    { id: 'med-event-011', medicationId: 'medication-001', scheduledAt: '2026-08-14T08:00:00+08:00', takenAt: '2026-08-14T08:00:00+08:00', status: 'on_time', delayMinutes: 0, source: 'smart_pillbox' },
    { id: 'med-event-012', medicationId: 'medication-001', scheduledAt: '2026-08-15T08:00:00+08:00', takenAt: '2026-08-15T08:02:00+08:00', status: 'on_time', delayMinutes: 2, source: 'smart_pillbox' },
    { id: 'med-event-013', medicationId: 'medication-001', scheduledAt: '2026-08-16T08:00:00+08:00', takenAt: '2026-08-16T08:07:00+08:00', status: 'on_time', delayMinutes: 7, source: 'smart_pillbox' },
    { id: 'med-event-014', medicationId: 'medication-001', scheduledAt: '2026-08-17T08:00:00+08:00', takenAt: '2026-08-17T08:01:00+08:00', status: 'on_time', delayMinutes: 1, source: 'smart_pillbox' }
  ],
  symptomEvents: [
    {
      id: 'symptom-001',
      type: 'mild_headache',
      startedAt: '2026-08-09T07:50:00+08:00',
      endedAt: '2026-08-09T09:30:00+08:00',
      severity: 2,
      measurementIds: ['m-011'],
      redFlags: { chestPain: false, dyspnea: false, fainting: false, unilateralWeakness: false, speechDifficulty: false, visualChange: false },
      outcome: 'resolved_after_rest_and_hydration',
      source: 'self_report'
    },
    {
      id: 'symptom-002',
      type: 'fatigue',
      startedAt: '2026-08-13T07:20:00+08:00',
      endedAt: '2026-08-13T11:00:00+08:00',
      severity: 2,
      measurementIds: ['m-019'],
      redFlags: { chestPain: false, dyspnea: false, fainting: false, unilateralWeakness: false, speechDifficulty: false, visualChange: false },
      outcome: 'resolved_without_intervention',
      source: 'self_report'
    }
  ],
  diet: [
    enrichDiet({ date: '2026-08-04', sodiumMg: 2380, saltLevel: '偏高', alcohol: false, lateMeal: false, vegetableServings: 2, notes: '午餐外卖，汤汁较多' }),
    enrichDiet({ date: '2026-08-05', sodiumMg: 1880, saltLevel: '适中', alcohol: false, lateMeal: false, vegetableServings: 3, notes: '晚餐有绿叶菜' }),
    enrichDiet({ date: '2026-08-06', sodiumMg: 2520, saltLevel: '偏高', alcohol: false, lateMeal: true, vegetableServings: 1, notes: '加班后吃了咸口面食' }),
    enrichDiet({ date: '2026-08-07', sodiumMg: 1760, saltLevel: '适中', alcohol: false, lateMeal: false, vegetableServings: 4, notes: '三餐规律' }),
    enrichDiet({ date: '2026-08-08', sodiumMg: 2310, saltLevel: '偏高', alcohol: true, lateMeal: true, vegetableServings: 2, notes: '朋友聚餐，饮酒一杯' }),
    enrichDiet({ date: '2026-08-09', sodiumMg: 2670, saltLevel: '偏高', alcohol: false, lateMeal: false, vegetableServings: 1, notes: '早餐腌制小菜，外卖烧烤' }),
    enrichDiet({ date: '2026-08-10', sodiumMg: 1820, saltLevel: '适中', alcohol: false, lateMeal: false, vegetableServings: 3, notes: '开始主动少放盐' }),
    enrichDiet({ date: '2026-08-11', sodiumMg: 1640, saltLevel: '较低', alcohol: false, lateMeal: false, vegetableServings: 4, notes: '自制午餐' }),
    enrichDiet({ date: '2026-08-12', sodiumMg: 1930, saltLevel: '适中', alcohol: false, lateMeal: false, vegetableServings: 3, notes: '清淡，饮水充足' }),
    enrichDiet({ date: '2026-08-13', sodiumMg: 2440, saltLevel: '偏高', alcohol: false, lateMeal: true, vegetableServings: 2, notes: '晚餐偏晚，口味偏重' }),
    enrichDiet({ date: '2026-08-14', sodiumMg: 1580, saltLevel: '较低', alcohol: false, lateMeal: false, vegetableServings: 4, notes: '鱼肉和蔬菜为主' }),
    enrichDiet({ date: '2026-08-15', sodiumMg: 1870, saltLevel: '适中', alcohol: false, lateMeal: false, vegetableServings: 3, notes: '三餐稳定' }),
    enrichDiet({ date: '2026-08-16', sodiumMg: 2260, saltLevel: '偏高', alcohol: false, lateMeal: false, vegetableServings: 2, notes: '外卖，酱料未分开' }),
    enrichDiet({ date: '2026-08-17', sodiumMg: 820, saltLevel: '待补充', alcohol: false, lateMeal: false, vegetableServings: 1, notes: '早餐已记录，午晚餐待补充' })
  ],
  sleep: [
    enrichSleep({ date: '2026-08-04', bedtime: '23:08', wakeTime: '06:31', durationMinutes: 443, score: 78, deepSleepMinutes: 92, awakenings: 1 }),
    enrichSleep({ date: '2026-08-05', bedtime: '22:56', wakeTime: '06:28', durationMinutes: 452, score: 82, deepSleepMinutes: 101, awakenings: 1 }),
    enrichSleep({ date: '2026-08-06', bedtime: '23:42', wakeTime: '06:22', durationMinutes: 400, score: 68, deepSleepMinutes: 71, awakenings: 3 }),
    enrichSleep({ date: '2026-08-07', bedtime: '22:51', wakeTime: '06:35', durationMinutes: 464, score: 86, deepSleepMinutes: 115, awakenings: 0 }),
    enrichSleep({ date: '2026-08-08', bedtime: '23:36', wakeTime: '06:24', durationMinutes: 408, score: 70, deepSleepMinutes: 76, awakenings: 2 }),
    enrichSleep({ date: '2026-08-09', bedtime: '23:48', wakeTime: '06:18', durationMinutes: 390, score: 65, deepSleepMinutes: 64, awakenings: 3 }),
    enrichSleep({ date: '2026-08-10', bedtime: '22:58', wakeTime: '06:33', durationMinutes: 455, score: 84, deepSleepMinutes: 108, awakenings: 1 }),
    enrichSleep({ date: '2026-08-11', bedtime: '22:44', wakeTime: '06:27', durationMinutes: 463, score: 88, deepSleepMinutes: 119, awakenings: 0 }),
    enrichSleep({ date: '2026-08-12', bedtime: '23:05', wakeTime: '06:30', durationMinutes: 445, score: 80, deepSleepMinutes: 98, awakenings: 1 }),
    enrichSleep({ date: '2026-08-13', bedtime: '23:39', wakeTime: '06:20', durationMinutes: 401, score: 67, deepSleepMinutes: 70, awakenings: 2 }),
    enrichSleep({ date: '2026-08-14', bedtime: '22:48', wakeTime: '06:36', durationMinutes: 468, score: 90, deepSleepMinutes: 124, awakenings: 0 }),
    enrichSleep({ date: '2026-08-15', bedtime: '22:55', wakeTime: '06:31', durationMinutes: 456, score: 85, deepSleepMinutes: 110, awakenings: 1 }),
    enrichSleep({ date: '2026-08-16', bedtime: '23:22', wakeTime: '06:25', durationMinutes: 423, score: 75, deepSleepMinutes: 85, awakenings: 2 }),
    enrichSleep({ date: '2026-08-17', bedtime: '23:02', wakeTime: '06:34', durationMinutes: 452, score: 82, deepSleepMinutes: 99, awakenings: 1 })
  ],
  activity: [
    { date: '2026-08-04', steps: 7240, moderateActivityMinutes: 28, vigorousActivityMinutes: 0, sedentaryMinutes: 522, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-04T18:10:00+08:00', exerciseEndedAt: '2026-08-04T18:38:00+08:00', wearMinutes: 910, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-05', steps: 8160, moderateActivityMinutes: 35, vigorousActivityMinutes: 0, sedentaryMinutes: 488, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-05T18:20:00+08:00', exerciseEndedAt: '2026-08-05T18:55:00+08:00', wearMinutes: 925, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-06', steps: 4380, moderateActivityMinutes: 12, vigorousActivityMinutes: 0, sedentaryMinutes: 628, exerciseType: null, exerciseStartedAt: null, exerciseEndedAt: null, wearMinutes: 898, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-07', steps: 9320, moderateActivityMinutes: 42, vigorousActivityMinutes: 8, sedentaryMinutes: 446, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-07T18:05:00+08:00', exerciseEndedAt: '2026-08-07T18:55:00+08:00', wearMinutes: 938, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-08', steps: 5680, moderateActivityMinutes: 18, vigorousActivityMinutes: 0, sedentaryMinutes: 574, exerciseType: null, exerciseStartedAt: null, exerciseEndedAt: null, wearMinutes: 902, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-09', steps: 3920, moderateActivityMinutes: 8, vigorousActivityMinutes: 0, sedentaryMinutes: 642, exerciseType: null, exerciseStartedAt: null, exerciseEndedAt: null, wearMinutes: 885, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-10', steps: 8460, moderateActivityMinutes: 36, vigorousActivityMinutes: 0, sedentaryMinutes: 482, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-10T17:50:00+08:00', exerciseEndedAt: '2026-08-10T18:26:00+08:00', wearMinutes: 930, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-11', steps: 9010, moderateActivityMinutes: 40, vigorousActivityMinutes: 0, sedentaryMinutes: 458, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-11T18:00:00+08:00', exerciseEndedAt: '2026-08-11T18:40:00+08:00', wearMinutes: 936, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-12', steps: 7720, moderateActivityMinutes: 31, vigorousActivityMinutes: 0, sedentaryMinutes: 506, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-12T18:22:00+08:00', exerciseEndedAt: '2026-08-12T18:53:00+08:00', wearMinutes: 918, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-13', steps: 4210, moderateActivityMinutes: 10, vigorousActivityMinutes: 0, sedentaryMinutes: 636, exerciseType: null, exerciseStartedAt: null, exerciseEndedAt: null, wearMinutes: 892, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-14', steps: 9880, moderateActivityMinutes: 48, vigorousActivityMinutes: 6, sedentaryMinutes: 430, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-14T17:55:00+08:00', exerciseEndedAt: '2026-08-14T18:49:00+08:00', wearMinutes: 945, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-15', steps: 8340, moderateActivityMinutes: 34, vigorousActivityMinutes: 0, sedentaryMinutes: 476, exerciseType: 'brisk_walk', exerciseStartedAt: '2026-08-15T18:12:00+08:00', exerciseEndedAt: '2026-08-15T18:46:00+08:00', wearMinutes: 929, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-16', steps: 6120, moderateActivityMinutes: 22, vigorousActivityMinutes: 0, sedentaryMinutes: 550, exerciseType: 'leisure_walk', exerciseStartedAt: '2026-08-16T17:40:00+08:00', exerciseEndedAt: '2026-08-16T18:02:00+08:00', wearMinutes: 908, recordCompleteness: 1, source: 'wrist_wearable' },
    { date: '2026-08-17', steps: 2180, moderateActivityMinutes: 6, vigorousActivityMinutes: 0, sedentaryMinutes: 178, exerciseType: null, exerciseStartedAt: null, exerciseEndedAt: null, wearMinutes: 310, recordCompleteness: 0.34, source: 'wrist_wearable' }
  ],
  weightHistory: [
    { measuredAt: '2026-08-04T06:38:00+08:00', weightKg: 61.4, waistCm: 82.3, source: 'smart_scale', timezone: 'Asia/Shanghai' },
    { measuredAt: '2026-08-08T06:35:00+08:00', weightKg: 61.3, waistCm: 82.2, source: 'smart_scale', timezone: 'Asia/Shanghai' },
    { measuredAt: '2026-08-12T06:36:00+08:00', weightKg: 61.1, waistCm: 82.0, source: 'smart_scale', timezone: 'Asia/Shanghai' },
    { measuredAt: '2026-08-17T06:37:00+08:00', weightKg: 61.0, waistCm: 81.8, source: 'smart_scale', timezone: 'Asia/Shanghai' }
  ],
  labResults: [
    { id: 'lab-001', code: 'creatinine', name: '血肌酐', value: 68, unit: 'μmol/L', referenceRange: { min: 41, max: 81 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-002', code: 'egfr', name: '估算肾小球滤过率', value: 96, unit: 'mL/min/1.73m²', referenceRange: { min: 90, max: null }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-003', code: 'potassium', name: '血钾', value: 4.2, unit: 'mmol/L', referenceRange: { min: 3.5, max: 5.3 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-004', code: 'fasting_glucose', name: '空腹血糖', value: 5.3, unit: 'mmol/L', referenceRange: { min: 3.9, max: 6.1 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-005', code: 'hba1c', name: '糖化血红蛋白', value: 5.5, unit: '%', referenceRange: { min: 4, max: 6 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-006', code: 'total_cholesterol', name: '总胆固醇', value: 4.8, unit: 'mmol/L', referenceRange: { min: 0, max: 5.2 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-007', code: 'ldl_c', name: '低密度脂蛋白胆固醇', value: 2.7, unit: 'mmol/L', referenceRange: { min: 0, max: 3.4 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' },
    { id: 'lab-008', code: 'triglycerides', name: '甘油三酯', value: 1.2, unit: 'mmol/L', referenceRange: { min: 0, max: 1.7 }, collectedAt: '2026-07-20T08:16:00+08:00', abnormal: false, source: 'hospital_lab_import' }
  ],
  goals: {
    dailyMeasurements: 2,
    sodiumTargetMg: 2000,
    sleepTargetMinutes: 420,
    homeBloodPressureTarget: {
      systolic: { min: 110, max: 134 },
      diastolic: { min: 70, max: 84 }
    },
    weeklyModerateActivityMinutes: 150,
    weightTargetKg: { min: 58, max: 61 },
    homeMeasurementProtocol: {
      morningReadings: 2,
      eveningReadings: 2,
      intervalMinutes: 1,
      daysPerWeek: 7
    },
    source: 'clinician_care_plan',
    updatedAt: '2026-07-20T10:30:00+08:00'
  }
};
