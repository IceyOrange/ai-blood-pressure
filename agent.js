const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (items, key) => {
  if (!items.length) return 0;
  return round(items.reduce((total, item) => total + Number(item[key] || 0), 0) / items.length);
};

const dateKey = (value) => new Date(value).toISOString().slice(0, 10);

const recentItems = (items, endTime, days) => {
  const startTime = endTime - (days - 1) * DAY_MS;
  return items.filter((item) => {
    const time = new Date(item.measuredAt || `${item.date}T23:59:00+08:00`).getTime();
    return time >= startTime && time <= endTime;
  });
};

const memoryFor = (data, topic) => (data.profile.memories || []).find((memory) => memory.topic === topic);

const preferenceCopy = {
  diet: { light: '口味偏淡', balanced: '口味适中', salty: '口味偏咸', variable: '饮食口味近期不固定' },
  sleep: { good: '主观睡眠较好', average: '主观睡眠一般', poor: '主观睡眠较差', variable: '睡眠状态近期不固定' }
};

export function getBloodPressureCategory(systolic, diastolic) {
  if (systolic >= 180 || diastolic >= 120) return { key: 'urgent', label: '需要立即关注', shortLabel: '立即关注', tone: 'red' };
  if (systolic >= 140 || diastolic >= 90) return { key: 'high', label: '血压偏高', shortLabel: '偏高', tone: 'orange' };
  if (systolic >= 130 || diastolic >= 80) return { key: 'elevated', label: '正常偏高', shortLabel: '需留意', tone: 'orange' };
  return { key: 'normal', label: '正常范围', shortLabel: '整体平稳', tone: 'green' };
}

export function summarizeVitals(data, days = 7) {
  const measurements = [...data.measurements].sort((first, second) => new Date(first.measuredAt) - new Date(second.measuredAt));
  const latest = measurements[measurements.length - 1];
  const endTime = new Date(latest.measuredAt).getTime();
  const recent = recentItems(measurements, endTime, days);
  const recentDiet = recentItems(data.diet, endTime, days);
  const recentSleep = recentItems(data.sleep, endTime, days);
  const mornings = recent.filter((item) => item.context === '晨起');
  const evenings = recent.filter((item) => item.context === '睡前');
  const morningSystolic = average(mornings, 'systolic');
  const eveningSystolic = average(evenings, 'systolic');
  const sodiumTarget = data.goals?.sodiumTargetMg || 2000;
  const sleepTarget = data.goals?.sleepTargetMinutes || 420;

  return {
    latest,
    category: getBloodPressureCategory(latest.systolic, latest.diastolic),
    recent,
    recentDiet,
    recentSleep,
    averageSystolic: average(recent, 'systolic'),
    averageDiastolic: average(recent, 'diastolic'),
    averageHeartRate: average(recent, 'heartRate'),
    morningSystolic,
    eveningSystolic,
    morningRise: round(morningSystolic - eveningSystolic),
    averageSodium: average(recentDiet, 'sodiumMg'),
    highSodiumDays: recentDiet.filter((item) => item.sodiumMg > sodiumTarget).length,
    lateMealDays: recentDiet.filter((item) => item.lateMeal).length,
    averageSleepMinutes: average(recentSleep, 'durationMinutes'),
    averageSleepScore: average(recentSleep, 'score'),
    lowSleepDays: recentSleep.filter((item) => item.durationMinutes < sleepTarget).length,
    measurementDays: new Set(recent.map((item) => dateKey(item.measuredAt))).size,
    date: dateKey(latest.measuredAt)
  };
}

export function buildDoctorBrief(data) {
  const summary = summarizeVitals(data, 7);
  const profile = data.profile;
  const dietMemory = memoryFor(data, 'diet');
  const sleepMemory = memoryFor(data, 'sleep');
  const locationMemory = memoryFor(data, 'location');
  const locationInferenceEnabled = profile.locationInferenceEnabled && locationMemory?.value !== 'disabled';
  const locationAssumptionUsed = locationInferenceEnabled && !dietMemory;
  const highReadings = summary.recent.filter((item) => item.systolic >= 140 || item.diastolic >= 90).length;
  const attentionReadings = summary.recent.filter((item) => item.systolic >= 130 || item.diastolic >= 80).length;
  const acute = summary.category.key === 'urgent';
  const stable = summary.averageSystolic < 130 && summary.averageDiastolic < 80;
  const status = acute
    ? { key: 'urgent', label: '需要立即关注', tone: 'red' }
    : highReadings >= 2 || !stable
      ? { key: 'attention', label: '需要继续观察', tone: 'orange' }
      : { key: 'stable', label: '整体平稳', tone: 'green' };
  const pressureCopy = stable
    ? '近 7 天平均血压保持在目标范围内，整体波动不大。'
    : `近 7 天平均血压为 ${summary.averageSystolic}/${summary.averageDiastolic} mmHg，${summary.morningRise >= 8 ? '晨间读数高于晚间，' : ''}建议继续观察变化。`;
  const dietMemoryLead = dietMemory ? `你反馈自己${preferenceCopy.diet[dietMemory.value] || dietMemory.label}。` : '';
  const regionalLead = locationAssumptionUsed
    ? `结合${profile.city}常见饮食特征，本次暂按钠摄入风险偏高补充提醒。`
    : '';
  const foodCopy = summary.highSodiumDays >= 2
    ? `${dietMemoryLead}${regionalLead}近期记录中有 ${summary.highSodiumDays} 天钠摄入超过 ${data.goals?.sodiumTargetMg || 2000} mg，可以先减少汤汁、腌制品和外卖酱料。`
    : `${dietMemoryLead}${regionalLead}近期饮食记录中的钠摄入整体较稳，继续保持即可。`;
  const sleepMemoryLead = sleepMemory ? `你反馈自己的${preferenceCopy.sleep[sleepMemory.value] || sleepMemory.label}。` : '';
  const sleepCopy = summary.lowSleepDays >= 2 || summary.averageSleepScore < 76
    ? `${sleepMemoryLead}记录显示近 7 天有 ${summary.lowSleepDays} 天睡眠低于目标，睡眠不足可能与晨间波动同时出现，但不能仅凭此判断因果。`
    : `${sleepMemoryLead}记录显示近 7 天平均睡眠 ${Math.floor(summary.averageSleepMinutes / 60)} 小时 ${summary.averageSleepMinutes % 60} 分，整体恢复情况较好。`;
  const headline = acute
    ? '这次读数需要优先处理'
    : highReadings >= 2
      ? '有几次偏高，先继续观察'
      : stable
        ? '最近一周整体比较平稳'
        : '晨间血压值得多留意';
  const homeAction = acute
    ? '请先安静休息，并按照血压计说明重新测量。'
    : summary.highSodiumDays >= 2
      ? '今天先从少喝汤、少蘸酱开始，今晚尽量保证充足睡眠。'
      : '继续保持规律作息，并留意接下来几天的晨间变化。';

  const recommendations = [
    {
      type: 'food',
      title: summary.highSodiumDays >= 2 ? '今天少一点盐' : '保持清淡饮食',
      tag: summary.highSodiumDays >= 2 ? '优先' : '保持',
      body: foodCopy,
      action: summary.highSodiumDays >= 2 ? '汤汁少喝，酱料分开' : '保持当前饮食节奏'
    },
    {
      type: 'sleep',
      title: summary.lowSleepDays >= 2 ? '今晚早点休息' : '睡眠节奏不错',
      tag: summary.lowSleepDays >= 2 ? '建议' : '保持',
      body: sleepCopy,
      action: summary.lowSleepDays >= 2 ? '上床时间提前 20 分钟' : '保持固定入睡时间'
    },
    {
      type: 'bp',
      title: acute ? '按设备说明复测' : '继续观察趋势',
      tag: acute ? '重要' : '观察',
      body: acute
        ? '请先坐下安静休息 5 分钟后使用血压计复测；若仍达到 180/120 mmHg，或伴有胸痛、呼吸困难、视物异常等症状，请立即就医。'
        : `${pressureCopy}后续分析会自动结合新同步的数据更新。`,
      action: acute ? '休息后使用血压计复测' : '有新数据后查看趋势'
    }
  ];

  const evidence = [
    {
      type: 'bp',
      label: '近 7 天血压',
      value: `${summary.averageSystolic}/${summary.averageDiastolic}`,
      unit: 'mmHg',
      note: stable ? '平均值较平稳' : `${attentionReadings} 次需要留意`,
      progress: Math.min(100, Math.max(18, Math.round((summary.averageSystolic / 160) * 100)))
    },
    {
      type: 'food',
      label: '饮食记录',
      value: `${summary.highSodiumDays} 天`,
      unit: '',
      note: summary.highSodiumDays >= 2 ? '钠摄入偏高' : '整体较稳定',
      progress: Math.min(100, Math.round((summary.highSodiumDays / 7) * 100)),
      feedbackTopics: ['diet']
    },
    {
      type: 'sleep',
      label: '平均睡眠',
      value: `${Math.floor(summary.averageSleepMinutes / 60)}小时${summary.averageSleepMinutes % 60}分`,
      unit: '',
      note: summary.lowSleepDays ? `${summary.lowSleepDays} 天低于目标` : '达到目标',
      progress: Math.min(100, Math.round((summary.averageSleepMinutes / 480) * 100)),
      feedbackTopics: ['sleep']
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    profile,
    summary,
    status,
    headline,
    greeting: `${profile.name}，这是根据你最近 7 天数据整理的健康提示。`,
    overview: acute ? '当前读数达到需要立即复核的范围，请先确保安全，不要只依赖 App 判断。' : pressureCopy,
    homeInsight: {
      headline,
      summary: acute ? '当前读数明显偏高，需要先确认安全。' : pressureCopy,
      action: homeAction,
      evidence: `依据：近 7 天 ${summary.recent.length} 次血压，以及饮食和睡眠记录`,
      feedbackTopics: acute ? ['other'] : ['diet', 'sleep']
    },
    evidence,
    assumptions: locationAssumptionUsed
      ? [{
          type: 'location',
          title: '地区饮食参考',
          body: `结合${profile.city}常见饮食特征，本次暂按“钠摄入风险偏高”进行辅助分析。`,
          source: '网络位置估计 · 低置信度',
          feedbackTopics: ['diet', 'location']
        }]
      : [],
    recommendations,
    questionPrompts: ['最近的血压趋势怎么样？', '饮食上我最该注意什么？', '睡眠会影响血压吗？'],
    stats: {
      attentionReadings,
      highReadings,
      highSodiumDays: summary.highSodiumDays,
      locationNote: locationInferenceEnabled
        ? `${profile.city}（网络位置估计，仅作低置信度参考）`
        : '未使用地区信息进行辅助分析'
    },
    safety: acute
      ? '如读数持续达到 180/120 mmHg，或出现胸痛、气促、意识异常、单侧无力、视物异常，请立即拨打急救电话。'
      : '以上内容用于健康管理参考，不替代医生诊断、处方或急症处理。'
  };
}
