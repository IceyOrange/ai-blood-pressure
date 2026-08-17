const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (items, key) => {
  if (!items.length) return 0;
  return round(items.reduce((total, item) => total + Number(item[key] || 0), 0) / items.length);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const latestTime = (data) => Math.max(...data.measurements.map((item) => new Date(item.measuredAt).getTime()));

const dateKey = (value) => new Date(value).toISOString().slice(0, 10);

const recentItems = (items, endTime, days) => {
  const startTime = endTime - (days - 1) * DAY_MS;
  return items.filter((item) => {
    const time = new Date(item.measuredAt || `${item.date}T23:59:00+08:00`).getTime();
    return time >= startTime && time <= endTime;
  });
};

export function getBloodPressureCategory(systolic, diastolic) {
  if (systolic >= 180 || diastolic >= 120) return { key: 'urgent', label: '需要立即关注', tone: 'red' };
  if (systolic >= 140 || diastolic >= 90) return { key: 'high', label: '偏高', tone: 'orange' };
  if (systolic >= 130 || diastolic >= 80) return { key: 'elevated', label: '正常偏高', tone: 'orange' };
  return { key: 'normal', label: '正常范围', tone: 'green' };
}

export function summarizeVitals(data, days = 7) {
  const endTime = latestTime(data);
  const measurements = [...data.measurements].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  const recent = recentItems(measurements, endTime, days);
  const latest = measurements[measurements.length - 1];
  const recentDiet = data.diet.filter((item) => {
    const time = new Date(`${item.date}T23:59:00+08:00`).getTime();
    return time >= endTime - (days - 1) * DAY_MS && time <= endTime;
  });
  const recentSleep = data.sleep.filter((item) => {
    const time = new Date(`${item.date}T23:59:00+08:00`).getTime();
    return time >= endTime - (days - 1) * DAY_MS && time <= endTime;
  });
  const mornings = recent.filter((item) => item.context === '晨起');
  const evenings = recent.filter((item) => item.context === '睡前');
  const averageSystolic = average(recent, 'systolic');
  const averageDiastolic = average(recent, 'diastolic');
  const morningSystolic = average(mornings, 'systolic');
  const eveningSystolic = average(evenings, 'systolic');
  const highSodiumDays = recentDiet.filter((item) => item.sodiumMg > (data.goals?.sodiumTargetMg || 2000)).length;
  const lateMealDays = recentDiet.filter((item) => item.lateMeal).length;
  const lowSleepDays = recentSleep.filter((item) => item.durationMinutes < (data.goals?.sleepTargetMinutes || 420)).length;
  const category = getBloodPressureCategory(latest.systolic, latest.diastolic);

  return {
    latest,
    category,
    recent,
    recentDiet,
    recentSleep,
    averageSystolic,
    averageDiastolic,
    averageHeartRate: average(recent, 'heartRate'),
    morningSystolic,
    eveningSystolic,
    morningRise: round(morningSystolic - eveningSystolic),
    averageSodium: average(recentDiet, 'sodiumMg'),
    highSodiumDays,
    lateMealDays,
    averageSleepMinutes: average(recentSleep, 'durationMinutes'),
    averageSleepScore: average(recentSleep, 'score'),
    lowSleepDays,
    measurementDays: new Set(recent.map((item) => dateKey(item.measuredAt))).size,
    date: dateKey(latest.measuredAt)
  };
}

function buildHealthScore(summary) {
  const pressurePenalty = Math.max(0, summary.averageSystolic - 125) * 0.55 + Math.max(0, summary.averageDiastolic - 78) * 0.65;
  const sodiumPenalty = Math.max(0, summary.averageSodium - 1900) / 70;
  const sleepPenalty = Math.max(0, 82 - summary.averageSleepScore) * 0.45;
  return clamp(Math.round(94 - pressurePenalty - sodiumPenalty - sleepPenalty), 58, 96);
}

export function buildDoctorBrief(data) {
  const summary = summarizeVitals(data, 7);
  const profile = data.profile;
  const score = buildHealthScore(summary);
  const partialDiet = summary.recentDiet.some((item) => item.date === summary.date && item.saltLevel === '待补充');
  const highReadings = summary.recent.filter((item) => item.systolic >= 140 || item.diastolic >= 90).length;
  const attentionReadings = summary.recent.filter((item) => item.systolic >= 130 || item.diastolic >= 80).length;
  const acute = summary.category.key === 'urgent';
  const stable = summary.averageSystolic < 130 && summary.averageDiastolic < 80;
  const pressureCopy = stable
    ? '近 7 天平均血压在目标范围内，继续保持固定时段测量。'
    : `近 7 天平均 ${summary.averageSystolic}/${summary.averageDiastolic} mmHg，${summary.morningRise >= 8 ? '晨起读数略高于睡前，' : ''}值得连续观察。`;
  const foodCopy = summary.highSodiumDays >= 2
    ? `近 7 天有 ${summary.highSodiumDays} 天钠摄入超过 ${data.goals?.sodiumTargetMg || 2000} mg，优先减少汤汁、腌制品和外卖酱料。`
    : '最近的咸味摄入控制得不错，继续把调味汁分开、优先选择新鲜食材。';
  const sleepCopy = summary.lowSleepDays >= 2 || summary.averageSleepScore < 76
    ? `近 7 天平均睡眠 ${Math.floor(summary.averageSleepMinutes / 60)} 小时 ${summary.averageSleepMinutes % 60} 分，${summary.lowSleepDays} 天低于目标；睡眠不足可能放大晨起波动。`
    : `近 7 天平均睡眠 ${Math.floor(summary.averageSleepMinutes / 60)} 小时 ${summary.averageSleepMinutes % 60} 分，恢复情况整体不错。`;

  let headline = stable ? '这周的基础做得很好' : '先把这周的节奏稳下来';
  if (acute) headline = '这次读数需要优先处理';
  else if (highReadings >= 2) headline = '有几次偏高，建议继续追踪';

  const recommendations = [
    {
      type: 'bp',
      title: '把测量做成固定节奏',
      tag: summary.measurementDays >= 6 ? '保持' : '优先',
      body: acute
        ? '请先坐下安静休息 5 分钟后复测；若仍达到 180/120 mmHg 或伴有胸痛、呼吸困难、视物异常等症状，请立即就医。'
        : `${pressureCopy}建议早起排空后、晚间睡前各测 1 次，每次间隔 1 分钟取平均，不要在运动、咖啡或洗澡后立即测量。`
    },
    {
      type: 'food',
      title: '给今天的餐盘减一点盐',
      tag: summary.highSodiumDays >= 2 ? '重点' : '继续',
      body: `${foodCopy}${partialDiet ? ' 今天午餐和晚餐还未完整记录，补充后建议会更准确。' : ''}`
    },
    {
      type: 'sleep',
      title: '把入睡时间往前挪',
      tag: summary.lowSleepDays >= 2 ? '重点' : '不错',
      body: sleepCopy
    },
    {
      type: 'action',
      title: '今天可以这样做',
      tag: '行动',
      body: `安排 ${summary.morningRise >= 8 ? '晨起测量后先喝水、再开始工作' : '10 分钟舒缓散步'}，并在晚上 ${summary.lateMealDays >= 2 ? '避免 21:00 后进食' : '记录最后一餐时间'}。`
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    profile,
    summary,
    score,
    headline,
    greeting: `${profile.name}，这是我根据你最近 7 天数据整理的观察。`,
    overview: acute ? '当前读数达到需要立即复核的范围，请先确保安全，不要只依赖 App 判断。' : pressureCopy,
    keySignals: [
      { label: '平均血压', value: `${summary.averageSystolic}/${summary.averageDiastolic}`, unit: 'mmHg', note: stable ? '目标内' : '需要观察', tone: stable ? 'green' : 'orange' },
      { label: '平均心率', value: summary.averageHeartRate, unit: 'bpm', note: '静息测量', tone: 'blue' },
      { label: '睡眠评分', value: summary.averageSleepScore, unit: '分', note: summary.averageSleepScore >= 80 ? '恢复不错' : '可优化', tone: summary.averageSleepScore >= 80 ? 'green' : 'orange' }
    ],
    recommendations,
    stats: {
      attentionReadings,
      highReadings,
      highSodiumDays: summary.highSodiumDays,
      locationNote: data.profile.locationInferenceEnabled
        ? `${data.profile.city}（已授权，仅作饮食建议参考）`
        : '未启用 IP 饮食推断，建议以主动记录为准'
    },
    safety: acute
      ? '如读数持续达到 180/120 mmHg，或出现胸痛、气促、神经功能异常，请立即拨打急救电话。'
      : '以上内容是基于记录数据的健康管理建议，不替代医生诊断、处方或急症处理。'
  };
}

export function createAgentReply(question, data) {
  const brief = buildDoctorBrief(data);
  const normalized = question.trim().toLowerCase();
  const { summary } = brief;
  if (!normalized) return '你可以问我：今天的血压怎么样、饮食要怎么调整、睡眠是否影响血压，或者如何正确测量。';
  if (normalized.includes('饮食') || normalized.includes('吃') || normalized.includes('盐') || normalized.includes('外卖')) {
    return `从最近 7 天记录看，你有 ${summary.highSodiumDays} 天钠摄入偏高，平均约 ${summary.averageSodium} mg。今天优先选择清蒸、白灼，汤汁和蘸料分开；如果点外卖，可以备注“少盐少油、酱料分装”。${summary.lateMealDays >= 2 ? '另外有几次晚餐偏晚，尽量把最后一餐提前到睡前 3 小时。' : ''}`;
  }
  if (normalized.includes('睡') || normalized.includes('休息') || normalized.includes('熬夜')) {
    return `你近 7 天平均睡眠 ${Math.floor(summary.averageSleepMinutes / 60)} 小时 ${summary.averageSleepMinutes % 60} 分，评分 ${summary.averageSleepScore} 分。睡眠较短的几天，晨起血压也更容易波动。今晚先把上床时间提前 20 分钟，睡前 1 小时减少手机和咖啡因。`;
  }
  if (normalized.includes('测量') || normalized.includes('怎么测') || normalized.includes('正确')) {
    return '测量前静坐 5 分钟，背部有支撑、双脚平放、袖带与心脏同高；不要说话。连续测 2 次，间隔约 1 分钟，记录平均值，并标注晨起或睡前。';
  }
  if (normalized.includes('危险') || normalized.includes('急') || normalized.includes('怎么办')) {
    return brief.safety;
  }
  if (normalized.includes('趋势') || normalized.includes('平均') || normalized.includes('血压')) {
    return `最近 7 天平均血压 ${summary.averageSystolic}/${summary.averageDiastolic} mmHg，最新一次 ${summary.latest.systolic}/${summary.latest.diastolic} mmHg，心率 ${summary.latest.heartRate} bpm。${brief.overview}`;
  }
  return `${brief.greeting}${brief.overview}我建议先完成今天的晚间测量，并补充午晚餐记录，这样下一次分析会更贴近你的实际情况。`;
}
