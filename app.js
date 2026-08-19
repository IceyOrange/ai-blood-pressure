import { sampleData } from './data/sample-data.js';
import { buildDoctorBrief, getBloodPressureCategory, summarizeVitals } from './agent.js';
import { hasHealthAgentConfig, requestHealthAgent } from './ai-service.js';

const MEMORY_STORAGE_KEY = 'maian-health-memories-v1';
const cloneData = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const pad = (value) => String(value).padStart(2, '0');

function loadMemories() {
  try {
    const memories = JSON.parse(window.localStorage.getItem(MEMORY_STORAGE_KEY) || '[]');
    return Array.isArray(memories) ? memories : [];
  } catch (error) {
    return [];
  }
}

function saveMemories(memories) {
  try {
    window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
  } catch (error) {
    showToast('反馈已应用，本次浏览期间会继续使用');
  }
}

const data = cloneData(sampleData);
const savedMemories = loadMemories();
if (savedMemories.length) {
  data.profile.memories = savedMemories;
  const savedLocation = savedMemories.find((memory) => memory.topic === 'location');
  if (savedLocation?.value === 'beijing') {
    data.profile.city = '北京市';
    data.profile.locationSource = '本人反馈';
    data.profile.locationConfidence = '高';
  } else if (savedLocation?.value === 'other') {
    data.profile.city = '其他地区';
    data.profile.locationSource = '本人反馈';
    data.profile.locationConfidence = '高';
    data.profile.locationInferenceEnabled = false;
  } else if (savedLocation?.value === 'disabled') {
    data.profile.locationInferenceEnabled = false;
  }
}

const requestedView = new URLSearchParams(window.location.search).get('view');
const initialView = requestedView === 'doctor' ? 'insight' : requestedView;
const allowedViews = ['home', 'trend', 'profile', 'insight'];
const state = {
  view: allowedViews.includes(initialView) ? initialView : 'home',
  previousView: 'home',
  range: 7,
  data,
  brief: null,
  sheet: null,
  feedback: { step: 'topic', topics: [], selectedTopic: null },
  chat: [],
  chatBusy: false,
  syncing: false
};
state.brief = buildDoctorBrief(state.data);
let chatMessageSequence = 0;

const root = document.querySelector('#view-root');
const toastRoot = document.querySelector('#toast-root');

const iconPaths = {
  home: '<path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/>',
  records: '<path d="M4 19V5M4 19h17"/><path d="m7 15 3-4 3 2 5-7"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.4 3-5 7-5s6.2 1.6 7 5"/>',
  heart: '<path d="M20.8 8.6c0 5.2-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.6A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.4Z"/>',
  pulse: '<path d="M3 12h4l2-5 5 10 2-5h5"/>',
  ai: '<path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M18.4 18.4l-2.1-2.1M21 12h-3M18.4 5.6l-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
  food: '<path d="M6 3v7M9 3v7M6 7h3M7.5 10v11M16 3v18M16 3c2 1 3 3 3 5s-1 4-3 5"/>',
  sleep: '<path d="M20 15.5A7.5 7.5 0 0 1 8.5 5 7.5 7.5 0 1 0 20 15.5Z"/>',
  device: '<rect x="6" y="4" width="12" height="16" rx="3"/><path d="M9 8h6M9 16h6"/>',
  sync: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18 12a6 6 0 0 0-10-4L5 12M6 12a6 6 0 0 0 10 4l3-4"/>',
  message: '<path d="M5 5h14v11H9l-4 4V5Z"/><path d="M8 9h8M8 12h5"/>',
  speaker: '<path d="M5 10v4h3l4 4V6l-4 4H5Z"/><path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  report: '<path d="M7 3h7l4 4v14H7V3Z"/><path d="M14 3v5h5M10 12h5M10 16h5"/>',
  family: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 10a2.5 2.5 0 1 0 0-5"/><path d="M2.5 20c.6-4 2.4-6 5.5-6s5 2 5.5 6M14 14c3.8 0 5.8 2 6.5 6"/>',
  location: '<path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
  send: '<path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/>'
};

const icon = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.check}</svg>`;

const formatChineseDate = (value) => {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatLongDate = (value) => {
  const date = new Date(value);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
};

const formatTime = (value) => {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatBp = (item) => `${item.systolic}/${item.diastolic}`;
const formatDuration = (minutes) => `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
const latestMeasurement = () => [...state.data.measurements].sort((first, second) => new Date(second.measuredAt) - new Date(first.measuredAt))[0];

function showToast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toastRoot.innerHTML = ''; }, 2600);
}

function buildSparkline(measurements) {
  const sorted = [...measurements].sort((first, second) => new Date(first.measuredAt) - new Date(second.measuredAt)).slice(-7);
  const values = sorted.map((item) => item.systolic);
  const minimum = Math.min(...values) - 5;
  const maximum = Math.max(...values) + 5;
  const width = 128;
  const height = 54;
  const points = values.map((value, index) => {
    const horizontal = sorted.length === 1 ? width / 2 : 4 + (index / (sorted.length - 1)) * (width - 8);
    const vertical = 7 + ((maximum - value) / Math.max(1, maximum - minimum)) * 30;
    return `${Math.round(horizontal)},${Math.round(vertical)}`;
  });
  const lastPoint = points[points.length - 1].split(',');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近七次收缩压变化">
    <path d="M4 42H124" class="sparkline-base" />
    <polyline points="${points.join(' ')}" class="sparkline-line" />
    <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4" class="sparkline-dot" />
  </svg>`;
}

function measurementsForDays(days) {
  const sorted = [...state.data.measurements].sort((first, second) => new Date(first.measuredAt) - new Date(second.measuredAt));
  const endTime = new Date(sorted[sorted.length - 1].measuredAt).getTime();
  const startTime = endTime - (days - 1) * 24 * 60 * 60 * 1000;
  return sorted.filter((item) => new Date(item.measuredAt).getTime() >= startTime);
}

function buildChartSvg(measurements) {
  const groups = new Map();
  measurements.forEach((item) => {
    const key = item.measuredAt.slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const days = [...groups.entries()].map(([date, items]) => ({
    date,
    systolic: Math.round(items.reduce((total, item) => total + item.systolic, 0) / items.length),
    diastolic: Math.round(items.reduce((total, item) => total + item.diastolic, 0) / items.length)
  }));
  const width = 360;
  const height = 220;
  const left = 38;
  const right = 12;
  const top = 18;
  const bottom = 40;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const minimum = 60;
  const maximum = 180;
  const horizontal = (index) => left + (days.length === 1 ? chartWidth / 2 : (index / (days.length - 1)) * chartWidth);
  const vertical = (value) => top + ((maximum - value) / (maximum - minimum)) * chartHeight;
  const systolicPoints = days.map((item, index) => `${horizontal(index)},${vertical(item.systolic)}`).join(' ');
  const diastolicPoints = days.map((item, index) => `${horizontal(index)},${vertical(item.diastolic)}`).join(' ');
  const grid = [60, 100, 140, 180].map((value) => `<g><line x1="${left}" y1="${vertical(value)}" x2="${width - right}" y2="${vertical(value)}"/><text x="4" y="${vertical(value) + 4}">${value}</text></g>`).join('');
  const labelIndexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  const labels = labelIndexes.map((index) => `<text class="chart-date" x="${horizontal(index)}" y="${height - 9}" text-anchor="middle">${formatChineseDate(days[index].date)}</text>`).join('');
  const dots = days.map((item, index) => `<circle class="chart-dot systolic" cx="${horizontal(index)}" cy="${vertical(item.systolic)}" r="3.5"/><circle class="chart-dot diastolic" cx="${horizontal(index)}" cy="${vertical(item.diastolic)}" r="3.5"/>`).join('');
  return `<svg class="bp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="血压趋势图">
    <rect class="attention-band" x="${left}" y="${vertical(140)}" width="${chartWidth}" height="${vertical(130) - vertical(140)}" rx="4" />
    <g class="chart-grid">${grid}</g>
    <polyline class="chart-line systolic" points="${systolicPoints}" />
    <polyline class="chart-line diastolic" points="${diastolicPoints}" />
    ${dots}${labels}
  </svg>`;
}

const feedbackTopics = {
  diet: {
    label: '饮食情况',
    title: '你的实际饮食更接近哪种？',
    options: [
      { value: 'light', label: '口味偏淡' },
      { value: 'balanced', label: '口味适中' },
      { value: 'salty', label: '口味偏咸' },
      { value: 'variable', label: '近期不固定' }
    ]
  },
  sleep: {
    label: '睡眠情况',
    title: '你最近的实际睡眠感受是？',
    options: [
      { value: 'good', label: '睡得比较好' },
      { value: 'average', label: '睡眠一般' },
      { value: 'poor', label: '睡得比较差' },
      { value: 'variable', label: '近期不固定' }
    ]
  },
  location: {
    label: '地区信息',
    title: '地区辅助信息哪里不准确？',
    options: [
      { value: 'beijing', label: '我在北京地区' },
      { value: 'other', label: '我不在北京地区' },
      { value: 'disabled', label: '不使用地区推测' }
    ]
  },
  other: {
    label: '其他判断',
    title: '更接近下面哪种情况？',
    options: [
      { value: 'unclear', label: '内容不够清楚' },
      { value: 'hard', label: '建议不容易做到' },
      { value: 'unsure', label: '暂时不确定' }
    ]
  }
};

const feedbackButton = (topics, label = '不太准确') => `<button class="feedback-button" data-action="open-feedback" data-topics="${topics.join(',')}">${escapeHtml(label)}</button>`;

function renderHome() {
  const brief = state.brief;
  const latest = brief.summary.latest;
  const category = brief.summary.category;
  const insight = brief.homeInsight;
  const syncText = state.syncing ? '正在检查新数据…' : `${formatChineseDate(state.data.device.lastSyncAt)} ${formatTime(state.data.device.lastSyncAt)} 已同步`;
  return `
    <section class="page-intro home-intro">
      <p class="page-kicker">${formatLongDate(latest.measuredAt)}</p>
      <h1>${escapeHtml(state.data.profile.name)}，最近状态一眼看清</h1>
    </section>

    <section class="sync-strip ${state.syncing ? 'is-syncing' : ''}" aria-label="设备同步状态">
      <span class="sync-icon">${icon('device')}</span>
      <div><strong>${state.data.device.connected ? '血压计已连接' : '血压计未连接'}</strong><span>${syncText}</span></div>
      <button data-action="refresh-sync" ${state.syncing ? 'disabled' : ''}>${icon('sync')}<span>刷新</span></button>
    </section>

    <section class="latest-card tone-${category.tone}" aria-label="最新血压">
      <div class="card-heading">
        <div><span class="card-eyebrow">最新血压</span><strong>${escapeHtml(latest.context)}测量</strong></div>
        <span class="status-pill tone-${category.tone}">${escapeHtml(category.shortLabel)}</span>
      </div>
      <div class="latest-reading"><strong>${latest.systolic}<i>/</i>${latest.diastolic}</strong><span>mmHg<br/>收缩压 / 舒张压</span></div>
      <p class="result-explanation">${escapeHtml(category.label)}，建议结合连续记录判断变化。</p>
      <div class="latest-meta">
        <span>${icon('heart')}心率 <strong>${latest.heartRate}</strong> 次/分</span>
        <span>${formatChineseDate(latest.measuredAt)} ${formatTime(latest.measuredAt)}</span>
      </div>
    </section>

    <section class="summary-card">
      <div class="section-heading compact"><div><span>近 7 天</span><h2>变化概览</h2></div><button class="text-link" data-nav="trend">查看记录</button></div>
      <div class="summary-main">
        <div><span>平均血压</span><strong>${brief.summary.averageSystolic}/${brief.summary.averageDiastolic}</strong><em>mmHg</em></div>
        ${buildSparkline(brief.summary.recent)}
      </div>
      <div class="summary-facts">
        <div><span>晨间平均</span><strong>${brief.summary.morningSystolic}</strong></div>
        <div><span>晚间平均</span><strong>${brief.summary.eveningSystolic}</strong></div>
        <div><span>记录天数</span><strong>${brief.summary.measurementDays} 天</strong></div>
      </div>
    </section>

    <section class="ai-insight-card tone-${brief.status.tone}">
      <div class="ai-card-heading">
        <span class="ai-symbol">${icon('ai')}</span>
        <div><span>健康数据提示</span><strong>${escapeHtml(brief.status.label)}</strong></div>
        <span class="ai-tag">近 7 天</span>
      </div>
      <h2>${escapeHtml(insight.headline)}</h2>
      <p>${escapeHtml(insight.summary)}</p>
      <div class="next-step"><span>${icon('check')}</span><div><small>今天可以先做</small><strong>${escapeHtml(insight.action)}</strong></div></div>
      <p class="evidence-line">${escapeHtml(insight.evidence)}</p>
      <div class="ai-card-actions">
        <button class="soft-primary-button" data-action="open-insight">查看健康总结</button>
        ${feedbackButton(insight.feedbackTopics)}
      </div>
      <button class="ask-teaser" data-action="ask-ai">
        <span>${icon('message')}</span>
        <div><strong>有健康问题？可以问健康助手</strong><small>进入总结后继续提问</small></div>
        <b>›</b>
      </button>
    </section>
  `;
}

function renderTrend() {
  const measurements = measurementsForDays(state.range);
  const summary = summarizeVitals(state.data, state.range);
  const visible = [...measurements].reverse().slice(0, 12);
  const difference = summary.morningSystolic - summary.eveningSystolic;
  return `
    <section class="page-intro">
      <p class="page-kicker">血压记录</p>
      <h1>看懂一段时间的变化</h1>
      <p>平均值和变化趋势，比单次数字更有参考意义。</p>
    </section>

    <div class="range-switcher" aria-label="选择时间范围">
      <button class="${state.range === 7 ? 'is-active' : ''}" data-action="set-range" data-range="7">7 天</button>
      <button class="${state.range === 30 ? 'is-active' : ''}" data-action="set-range" data-range="30">30 天</button>
      <button class="${state.range === 90 ? 'is-active' : ''}" data-action="set-range" data-range="90">3 个月</button>
    </div>

    <section class="trend-card">
      <div class="trend-summary-row">
        <div><span>平均血压</span><strong>${summary.averageSystolic}/${summary.averageDiastolic}</strong><em>mmHg</em></div>
        <span class="status-pill tone-${state.brief.status.tone}">${escapeHtml(state.brief.status.label)}</span>
      </div>
      <div class="chart-legend"><span><i class="legend-dot systolic"></i>收缩压</span><span><i class="legend-dot diastolic"></i>舒张压</span><em>单位：mmHg</em></div>
      ${buildChartSvg(measurements)}
      <p class="chart-caption">图表按每天的多次测量取平均，淡黄色区域用于提示需要留意的范围。</p>
    </section>

    <section class="daypart-card">
      <div class="section-heading compact"><div><span>对比</span><h2>晨间与晚间</h2></div></div>
      <div class="daypart-values">
        <div><span>晨间平均</span><strong>${summary.morningSystolic}<small>mmHg</small></strong></div>
        <span class="comparison-arrow">${difference >= 0 ? '高' : '低'} ${Math.abs(difference)}<small>mmHg</small></span>
        <div><span>晚间平均</span><strong>${summary.eveningSystolic}<small>mmHg</small></strong></div>
      </div>
      <p>${difference >= 8 ? '晨间读数明显高于晚间，建议继续留意后续变化。' : '晨间和晚间差异不大，整体节奏较稳定。'}</p>
    </section>

    <section class="inline-insight">
      <span class="ai-symbol small">${icon('ai')}</span>
      <div><small>数据观察</small><strong>${escapeHtml(state.brief.homeInsight.headline)}</strong><p>${escapeHtml(state.brief.homeInsight.action)}</p></div>
      <button data-action="open-insight" aria-label="查看健康总结">›</button>
      <div class="inline-feedback">${feedbackButton(state.brief.homeInsight.feedbackTopics)}</div>
    </section>

    <div class="section-heading"><div><span>明细</span><h2>最近的测量记录</h2></div><em>共 ${measurements.length} 条</em></div>
    <div class="history-list">
      ${visible.map((item) => {
        const category = getBloodPressureCategory(item.systolic, item.diastolic);
        return `<article class="history-item">
          <div class="history-date"><strong>${formatChineseDate(item.measuredAt)}</strong><span>${formatTime(item.measuredAt)} · ${escapeHtml(item.context)}</span></div>
          <div class="history-value"><strong>${formatBp(item)}</strong><span>mmHg</span></div>
          <div class="history-side"><span class="mini-status tone-${category.tone}">${escapeHtml(category.shortLabel)}</span><em>心率 ${item.heartRate}</em></div>
        </article>`;
      }).join('')}
    </div>
    <button class="wide-secondary-button" data-action="export-report">${icon('report')}导出医生报告</button>
    <p class="page-disclaimer">单次读数不能替代诊断。若连续多日偏高，请携带记录咨询专业医生。</p>
  `;
}

function renderAgentText(text) {
  const sentences = String(text).match(/[^。！？]+[。！？]?/g) || [String(text)];
  if (sentences.length === 1) return `<p class="answer-lead">${escapeHtml(sentences[0])}</p>`;
  return `<p class="answer-lead">${escapeHtml(sentences[0])}</p><ul>${sentences.slice(1, 4).map((sentence) => `<li>${escapeHtml(sentence)}</li>`).join('')}</ul>`;
}

const answerKindMeta = {
  mechanism: { label: '常见原因', icon: 'pulse' },
  data: { label: '你的记录', icon: 'records' },
  uncertainty: { label: '还不能确定', icon: 'shield' },
  method: { label: '判断方法', icon: 'device' },
  safety: { label: '安全提醒', icon: 'shield' },
  action: { label: '下一步', icon: 'check' }
};

function renderAgentResponse(message) {
  if (message.pending) {
    return `<article class="assistant-answer is-pending source-pending">
      <div class="answer-heading"><span class="ai-symbol small">${icon('ai')}</span><div><strong>健康 Agent 正在分析</strong><small>正在理解问题并核对近期记录</small></div><button data-action="voice-placeholder" aria-label="朗读这条回复" disabled>${icon('speaker')}</button></div>
      <div class="answer-content"><div class="agent-thinking"><i></i><span>问题识别</span><i></i><span>数据核对</span><i></i><span>安全检查</span></div>${renderAgentText(message.text)}</div>
    </article>`;
  }

  const answer = message.response;
  if (!answer || typeof answer !== 'object') {
    return `<article class="assistant-answer source-error">
      <div class="answer-heading"><span class="ai-symbol small">${icon('ai')}</span><div><strong>AI 本次未生成回答</strong><small>未使用规则代答</small></div></div>
      <div class="answer-content">${renderAgentText('请重新请求 AI。')}</div>
    </article>`;
  }

  const sourceCopy = message.source === 'cloud'
    ? { className: 'source-cloud', title: '专业 Agent 分析', detail: message.meta?.validation?.revisionAttempted ? 'AI 已完成规划、取数并自动复核修正' : 'AI 已完成问题规划、数据核对与安全校验' }
    : { className: 'source-error', title: 'AI 本次未生成回答', detail: '未使用规则代答，可以直接重试' };
  const keyPoints = Array.isArray(answer.keyPoints) ? answer.keyPoints : [];
  const actions = Array.isArray(answer.actions) ? answer.actions : [];
  const followUps = Array.isArray(answer.followUps) ? answer.followUps : [];
  const showProcess = message.source === 'cloud' && Array.isArray(message.meta?.stages);
  const isStreaming = Boolean(message.streaming);
  const displayedDirectAnswer = isStreaming ? message.streamedText || '' : answer.directAnswer || '';

  return `<article class="assistant-answer ${sourceCopy.className} ${isStreaming ? 'is-streaming' : ''}" data-message-id="${escapeHtml(message.id || '')}">
    <div class="answer-heading"><span class="ai-symbol small">${icon('ai')}</span><div><strong>${sourceCopy.title}</strong><small>${sourceCopy.detail}</small></div><button data-action="voice-placeholder" aria-label="朗读这条回复" ${isStreaming ? 'disabled' : ''}>${icon('speaker')}</button></div>
    <div class="answer-content">
      ${showProcess ? '<div class="agent-process"><span>理解问题</span><b>→</b><span>核对数据</span><b>→</b><span>安全校验</span></div>' : ''}
      <div class="answer-summary"><small>先说结论</small><h3>${escapeHtml(answer.title || '健康提示')}</h3><p class="${isStreaming ? 'streaming-answer-text' : ''}" data-stream-text ${isStreaming ? 'aria-hidden="true"' : ''}>${escapeHtml(displayedDirectAnswer)}</p>${isStreaming ? `<span class="visually-hidden">${escapeHtml(answer.directAnswer || '')}</span>` : ''}</div>
      ${message.source === 'error' ? `<button class="answer-retry" data-action="retry-ai" data-question="${escapeHtml(message.question || '')}">${icon('sync')}重新请求 AI</button>` : ''}
      ${isStreaming ? '<div class="answer-stream-wait"><i></i><span>结论呈现完成后，将展开分析依据和行动建议</span></div>' : ''}
      ${!isStreaming && keyPoints.length ? `<div class="answer-evidence">${keyPoints.map((item) => {
        const kind = answerKindMeta[item?.kind] ? item.kind : 'data';
        const kindMeta = answerKindMeta[kind];
        return `<section class="answer-point kind-${kind}"><span>${icon(kindMeta.icon)}</span><div><small>${kindMeta.label}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></div></section>`;
      }).join('')}</div>` : ''}
      ${!isStreaming && actions.length ? `<section class="answer-actions"><div class="answer-section-title"><span>${icon('check')}</span><strong>接下来可以这样做</strong></div><ol>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol></section>` : ''}
      ${!isStreaming && answer.caution ? `<section class="answer-caution"><span>${icon('shield')}</span><div><strong>需要及时处理的情况</strong><p>${escapeHtml(answer.caution)}</p></div></section>` : ''}
      ${!isStreaming && answer.dataBasis ? `<details class="answer-basis"><summary>查看本次分析依据</summary><p>${escapeHtml(answer.dataBasis)}</p></details>` : ''}
      ${!isStreaming && followUps.length ? `<section class="answer-followups"><small>如果愿意，可以继续问</small><div>${followUps.map((question) => `<button data-action="ask-prompt" data-prompt="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}</div></section>` : ''}
    </div>
  </article>`;
}

function renderChatMessages() {
  if (!state.chat.length) return '';
  return `<div class="chat-messages">${state.chat.slice(-6).map((message) => {
    if (message.role === 'user') return `<div class="user-question">${escapeHtml(message.text)}</div>`;
    return renderAgentResponse(message);
  }).join('')}</div>`;
}

function renderInsight() {
  const brief = state.brief;
  return `
    <section class="subpage-header">
      <button class="back-button" data-action="back-from-insight">${icon('back')}<span>返回</span></button>
      <strong>健康总结</strong>
      <button class="voice-placeholder" data-action="voice-placeholder">${icon('speaker')}<span>朗读</span><small>即将上线</small></button>
    </section>

    <section class="insight-hero tone-${brief.status.tone}">
      <div class="insight-hero-top"><span class="ai-symbol">${icon('pulse')}</span><span>健康数据总结 · 近 7 天</span><b>${escapeHtml(brief.status.label)}</b></div>
      <h1>${escapeHtml(brief.headline)}</h1>
      <p>${escapeHtml(brief.overview)}</p>
      <div class="hero-visual">
        ${buildSparkline(brief.summary.recent)}
        <div><span>7 天平均</span><strong>${brief.summary.averageSystolic}/${brief.summary.averageDiastolic}</strong><small>mmHg</small></div>
      </div>
    </section>

    <div class="section-heading"><div><span>分析依据</span><h2>为什么这样判断</h2></div><em>可查看和纠正</em></div>
    <div class="evidence-grid">
      ${brief.evidence.map((item) => `<article class="evidence-card type-${item.type}">
        <div class="evidence-heading"><span>${icon(item.type === 'bp' ? 'pulse' : item.type)}</span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}${item.unit ? `<em>${escapeHtml(item.unit)}</em>` : ''}</strong></div></div>
        <div class="evidence-bar"><i style="width:${item.progress}%"></i></div>
        <div class="evidence-footer"><span>${escapeHtml(item.note)}</span>${item.feedbackTopics ? feedbackButton(item.feedbackTopics) : ''}</div>
      </article>`).join('')}
    </div>

    ${brief.assumptions.map((item) => `<section class="assumption-card">
      <span class="assumption-icon">${icon('location')}</span>
      <div><small>${escapeHtml(item.source)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><div>${feedbackButton(item.feedbackTopics)}</div></div>
    </section>`).join('')}

    <div class="section-heading"><div><span>行动建议</span><h2>今天先做这三件事</h2></div></div>
    <div class="action-plan">
      ${brief.recommendations.map((item, index) => `<article class="action-card type-${item.type}">
        <span class="action-number">${index + 1}</span>
        <div><div class="action-title"><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.tag)}</em></div><h3>${escapeHtml(item.action)}</h3><p>${escapeHtml(item.body)}</p></div>
      </article>`).join('')}
    </div>

    <section class="ask-ai-card" id="ask-ai">
      <div class="ask-heading"><span class="ai-symbol">${icon('message')}</span><div><small>还有疑问？</small><h2>可以继续问健康助手</h2></div></div>
      <p>不用组织很长的问题，点一个常见问题，或者说一句你最担心的事。</p>
      <div class="prompt-list">${brief.questionPrompts.map((prompt) => `<button data-action="ask-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}</div>
      ${renderChatMessages()}
      <form class="chat-composer" data-form="chat">
        <input name="question" maxlength="120" autocomplete="off" aria-label="输入健康问题" placeholder="例如：最近早晨为什么偏高？" ${state.chatBusy ? 'disabled' : ''} />
        <button type="submit" aria-label="发送问题" ${state.chatBusy ? 'disabled' : ''}>${icon('send')}</button>
      </form>
      <div class="ask-footer"><span>${icon('shield')}回答仅作健康管理参考</span><button data-action="voice-placeholder">${icon('speaker')}语音提问 · 即将上线</button></div>
    </section>
    <p class="page-disclaimer">${escapeHtml(brief.safety)}</p>
  `;
}

function renderProfile() {
  const profile = state.data.profile;
  const device = state.data.device;
  const memories = profile.memories || [];
  return `
    <section class="page-intro">
      <p class="page-kicker">个人健康档案</p>
      <h1>我的</h1>
      <p>你亲自反馈的信息，会优先于地区推测用于后续分析。</p>
    </section>

    <section class="profile-card">
      <div class="profile-main"><span class="large-avatar">林</span><div><strong>${escapeHtml(profile.name)}</strong><span>${profile.age} 岁 · ${escapeHtml(profile.sex)}</span></div><button data-action="show-toast" data-message="个人资料编辑将在正式版开放">编辑</button></div>
      <div class="profile-facts"><div><span>身高 / 体重</span><strong>${profile.heightCm} cm / ${profile.weightKg} kg</strong></div><div><span>用药记录</span><strong>${escapeHtml(profile.medication)}</strong></div></div>
    </section>

    <div class="section-heading"><div><span>AI 记忆</span><h2>我的实际情况</h2></div><em>可随时修改</em></div>
    <section class="memory-card">
      ${memories.length ? memories.map((memory) => `<div class="memory-row">
        <span class="memory-icon">${icon(memory.topic === 'diet' ? 'food' : memory.topic === 'sleep' ? 'sleep' : 'location')}</span>
        <div><small>${escapeHtml(feedbackTopics[memory.topic]?.label || '个人反馈')}</small><strong>${escapeHtml(memory.label)}</strong><em>本人反馈 · 优先使用</em></div>
        <button data-action="edit-memory" data-topic="${escapeHtml(memory.topic)}">修改</button>
      </div>`).join('') : `<div class="empty-memory"><span>${icon('ai')}</span><div><strong>还没有本人反馈</strong><p>如果某条提示不准确，点击“不太准确”即可用一两次选择完成纠正。</p></div></div>`}
      <div class="memory-row regional-memory">
        <span class="memory-icon">${icon('location')}</span>
        <div><small>地区辅助信息</small><strong>${escapeHtml(profile.city)}</strong><em>${escapeHtml(profile.locationSource)} · ${escapeHtml(profile.locationConfidence)}置信度</em></div>
        ${feedbackButton(['location'], '修改')}
      </div>
    </section>

    <div class="section-heading"><div><span>连接</span><h2>我的血压计</h2></div></div>
    <section class="device-card">
      <span class="device-large-icon">${icon('device')}</span>
      <div><strong>${escapeHtml(device.name)}</strong><span>${device.connected ? '已连接' : '未连接'} · 电量 ${device.battery}%</span><small>最近同步 ${formatChineseDate(device.lastSyncAt)} ${formatTime(device.lastSyncAt)}</small></div>
      <span class="connected-dot">正常</span>
    </section>

    <div class="section-heading"><div><span>设置</span><h2>提醒与隐私</h2></div></div>
    <div class="settings-list">
      <button class="setting-item" data-action="show-toast" data-message="同步通知已开启"><span>${icon('sync')}</span><div><strong>新数据同步通知</strong><small>测量完成后提醒查看结果</small></div><b>已开启</b></button>
      <button class="setting-item" data-action="export-report"><span>${icon('report')}</span><div><strong>导出健康报告</strong><small>提供给医生查看</small></div><b>›</b></button>
      <button class="setting-item" data-action="toggle-location"><span>${icon('location')}</span><div><strong>地区辅助分析</strong><small>仅使用城市级信息</small></div><b>${profile.locationInferenceEnabled ? '已开启' : '已关闭'}</b></button>
      <button class="setting-item coming-soon" data-action="show-toast" data-message="家属关怀正在规划中"><span>${icon('family')}</span><div><strong>家属关怀</strong><small>后续可共享异常提醒</small></div><b>即将上线</b></button>
      <button class="setting-item" data-action="show-toast" data-message="隐私说明将在正式版中完整展示"><span>${icon('shield')}</span><div><strong>隐私与数据安全</strong><small>管理数据使用方式</small></div><b>›</b></button>
    </div>
    <p class="page-disclaimer">血压记录和 AI 提示用于帮助发现变化，不用于自行诊断或调整药物。</p>
  `;
}

function openFeedback(topics) {
  const validTopics = [...new Set(topics)].filter((topic) => feedbackTopics[topic]).slice(0, 3);
  state.feedback = {
    step: validTopics.length === 1 ? 'options' : 'topic',
    topics: validTopics.length ? validTopics : ['other'],
    selectedTopic: validTopics.length === 1 ? validTopics[0] : null
  };
  state.sheet = 'feedback';
  renderApp();
}

function renderFeedbackSheet() {
  if (state.sheet !== 'feedback') return '';
  const selected = state.feedback.selectedTopic ? feedbackTopics[state.feedback.selectedTopic] : null;
  const isTopicStep = state.feedback.step === 'topic';
  return `<div class="sheet-backdrop" data-action="close-sheet">
    <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-title" data-sheet-content>
      <div class="sheet-handle"></div>
      <div class="sheet-heading">
        <div><small>帮助我们更懂你</small><h2 id="feedback-title">${isTopicStep ? '哪一部分不太准确？' : escapeHtml(selected.title)}</h2></div>
        <button data-action="close-sheet" aria-label="关闭">${icon('close')}</button>
      </div>
      <p>${isTopicStep ? '只需点选一项，不需要输入文字。' : '选择最接近的一项，之后仍然可以修改。'}</p>
      <div class="feedback-options">
        ${isTopicStep
          ? state.feedback.topics.map((topic) => `<button data-action="choose-feedback-topic" data-topic="${topic}"><span>${icon(topic === 'diet' ? 'food' : topic === 'sleep' ? 'sleep' : topic === 'location' ? 'location' : 'message')}</span><strong>${escapeHtml(feedbackTopics[topic].label)}</strong><b>›</b></button>`).join('')
          : selected.options.map((option) => `<button data-action="save-feedback" data-topic="${state.feedback.selectedTopic}" data-value="${option.value}" data-label="${escapeHtml(option.label)}"><span class="option-dot"></span><strong>${escapeHtml(option.label)}</strong></button>`).join('')}
      </div>
      ${!isTopicStep && state.feedback.topics.length > 1 ? '<button class="sheet-back-button" data-action="feedback-back">返回选择其他内容</button>' : ''}
    </section>
  </div>`;
}

function renderApp() {
  const views = { home: renderHome, trend: renderTrend, insight: renderInsight, profile: renderProfile };
  root.innerHTML = `${views[state.view]()}${renderFeedbackSheet()}`;
  document.body.dataset.view = state.view;
  document.querySelectorAll('.nav-item').forEach((item) => {
    const activeView = state.view === 'insight' ? 'home' : state.view;
    item.classList.toggle('is-active', item.dataset.nav === activeView);
  });
}

function navigate(view) {
  if (!allowedViews.includes(view)) return;
  state.view = view;
  state.sheet = null;
  const url = new URL(window.location.href);
  if (view === 'home') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  window.history.replaceState({}, '', url);
  renderApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openInsight(focusQuestion = false) {
  if (state.view !== 'insight') state.previousView = state.view;
  navigate('insight');
  if (focusQuestion) {
    window.requestAnimationFrame(() => document.querySelector('#ask-ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

function saveFeedback(topic, value, label) {
  const memory = { topic, value, label, source: 'user_feedback', confidence: 'high', updatedAt: new Date().toISOString() };
  const memories = (state.data.profile.memories || []).filter((item) => item.topic !== topic);
  memories.push(memory);
  state.data.profile.memories = memories;
  if (topic === 'diet') state.data.profile.dietaryPreference = label;
  if (topic === 'location') {
    state.data.profile.locationSource = '本人反馈';
    state.data.profile.locationConfidence = '高';
    if (value === 'beijing') {
      state.data.profile.city = '北京市';
      state.data.profile.locationInferenceEnabled = true;
    } else if (value === 'other') {
      state.data.profile.city = '其他地区';
      state.data.profile.locationInferenceEnabled = false;
    } else {
      state.data.profile.locationInferenceEnabled = false;
    }
  }
  saveMemories(memories);
  state.brief = buildDoctorBrief(state.data);
  state.sheet = null;
  renderApp();
  showToast(`已记住：${label}`);
}

function buildConversationHistory() {
  return state.chat.filter((message) => !message.pending).slice(-6).map((message) => {
    if (message.role === 'user') return { role: 'user', content: message.text };
    const answer = message.response;
    if (!answer || typeof answer !== 'object') return { role: 'assistant', content: message.text || '' };
    const explanation = (answer.keyPoints || []).map((item) => `${item.title}：${item.text}`).join('；');
    return {
      role: 'assistant',
      content: [answer.title, answer.directAnswer, explanation].filter(Boolean).join('。').slice(0, 800)
    };
  }).filter((message) => message.content);
}

async function animateValidatedAnswer(replyIndex) {
  const message = state.chat[replyIndex];
  const fullText = String(message?.response?.directAnswer || '');
  if (!message || !fullText) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    message.streamedText = fullText;
    return;
  }

  const characters = Array.from(fullText);
  const baseDelay = Math.max(10, Math.min(28, Math.round(2400 / characters.length)));
  for (const character of characters) {
    if (state.chat[replyIndex]?.id !== message.id) return;
    message.streamedText += character;
    const textElement = document.querySelector(`[data-message-id="${message.id}"] [data-stream-text]`);
    if (!textElement || document.hidden) {
      message.streamedText = fullText;
      return;
    }
    textElement.textContent = message.streamedText;
    const punctuationPause = /[。！？；]/.test(character) ? 70 : /[，、：]/.test(character) ? 32 : 0;
    await new Promise((resolve) => window.setTimeout(resolve, baseDelay + punctuationPause));
  }
}

async function submitQuestion(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  if (state.chatBusy) {
    showToast('健康 Agent 正在整理上一条回答');
    return;
  }
  const history = buildConversationHistory();
  const messageId = ++chatMessageSequence;
  state.chatBusy = true;
  state.chat.push({ role: 'user', text: trimmed });
  state.chat.push({ id: messageId, role: 'assistant', text: '正在结合你的近期记录整理回答。', pending: true });
  renderApp();
  const replyIndex = state.chat.length - 1;
  let completedMessage;
  try {
    if (!hasHealthAgentConfig()) throw new Error('AI service requires an HTTP deployment');
    const response = await requestHealthAgent({ question: trimmed, brief: state.brief, history });
    completedMessage = {
      id: messageId,
      role: 'assistant',
      response: response.answer,
      meta: response.meta,
      source: response.mode.startsWith('gemini-agent') ? 'cloud' : 'error'
    };
  } catch (error) {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const unavailableMessage = error.code === 'AI_TIMEOUT'
      ? 'AI 已收到问题，但本次生成超时。请点击下方按钮重新请求，这不代表 API Key 未配置。'
      : error.code === 'AI_RATE_LIMITED'
        ? 'Gemini 当前请求较多或免费额度已达到限制，请稍等片刻后重新请求。'
        : error.code === 'AI_RESPONSE_INVALID'
          ? 'AI 本次回答未通过质量校验，因此没有展示。请重新请求一次。'
          : error.code === 'AI_AUTH_FAILED'
            ? 'Gemini 拒绝了当前凭证，请检查 Google AI Studio API Key 是否有效。'
            : isLocalhost
              ? '本地页面已打开，但 AI 接口没有运行或未读取到 GEMINI_API_KEY。请创建 .env.local，并使用 start-local.ps1 启动项目；不要使用纯静态服务器启动 AI 演示。'
              : error.code === 'AI_NOT_CONFIGURED'
                ? 'Vercel 当前部署没有读取到 GEMINI_API_KEY。请在项目环境变量中添加后重新部署。'
                : 'Gemini 暂时未完成请求，请点击下方按钮重试。';
    state.chat[replyIndex] = {
      id: messageId,
      role: 'assistant',
      source: 'error',
      question: trimmed,
      response: {
        title: '这次没有生成 AI 回答',
        directAnswer: unavailableMessage,
        keyPoints: [],
        actions: [],
        caution: '',
        followUps: [],
        dataBasis: '',
        confidence: 'low'
      }
    };
    state.chatBusy = false;
    renderApp();
    window.requestAnimationFrame(() => document.querySelector('#ask-ai')?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    return;
  }

  state.chat[replyIndex] = { ...completedMessage, streaming: true, streamedText: '' };
  renderApp();
  window.requestAnimationFrame(() => document.querySelector('#ask-ai')?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  try {
    await animateValidatedAnswer(replyIndex);
  } finally {
    if (state.chat[replyIndex]?.id === messageId) {
      state.chat[replyIndex].streaming = false;
      state.chat[replyIndex].streamedText = state.chat[replyIndex].response?.directAnswer || '';
    }
    state.chatBusy = false;
  }
  renderApp();
  window.requestAnimationFrame(() => document.querySelector('#ask-ai')?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
}

document.addEventListener('click', (event) => {
  const navTarget = event.target.closest('[data-nav]');
  if (navTarget) {
    navigate(navTarget.dataset.nav);
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  if (action === 'close-sheet' && event.target.closest('[data-sheet-content]') && !event.target.closest('button[data-action="close-sheet"]')) return;

  if (action === 'open-insight') openInsight(false);
  else if (action === 'ask-ai') openInsight(true);
  else if (action === 'back-from-insight') navigate(state.previousView || 'home');
  else if (action === 'set-range') {
    state.range = Number(actionTarget.dataset.range);
    renderApp();
  } else if (action === 'open-feedback') {
    openFeedback((actionTarget.dataset.topics || 'other').split(','));
  } else if (action === 'choose-feedback-topic') {
    state.feedback.selectedTopic = actionTarget.dataset.topic;
    state.feedback.step = 'options';
    renderApp();
  } else if (action === 'feedback-back') {
    state.feedback.selectedTopic = null;
    state.feedback.step = 'topic';
    renderApp();
  } else if (action === 'save-feedback') {
    saveFeedback(actionTarget.dataset.topic, actionTarget.dataset.value, actionTarget.dataset.label);
  } else if (action === 'edit-memory') {
    openFeedback([actionTarget.dataset.topic]);
  } else if (action === 'close-sheet') {
    state.sheet = null;
    renderApp();
  } else if (action === 'ask-prompt') {
    submitQuestion(actionTarget.dataset.prompt || '');
  } else if (action === 'retry-ai') {
    const retryQuestion = actionTarget.dataset.question || '';
    const lastMessage = state.chat[state.chat.length - 1];
    if (lastMessage?.source === 'error') state.chat.splice(Math.max(0, state.chat.length - 2), 2);
    submitQuestion(retryQuestion);
  } else if (action === 'refresh-sync') {
    state.syncing = true;
    renderApp();
    window.setTimeout(() => {
      state.syncing = false;
      state.data.device.lastSyncAt = new Date().toISOString();
      renderApp();
      showToast('同步完成，暂无更新的数据');
    }, 700);
  } else if (action === 'toggle-location') {
    state.data.profile.locationInferenceEnabled = !state.data.profile.locationInferenceEnabled;
    if (!state.data.profile.locationInferenceEnabled) {
      saveFeedback('location', 'disabled', '不使用地区推测');
    } else {
      state.data.profile.memories = (state.data.profile.memories || []).filter((memory) => memory.topic !== 'location');
      state.data.profile.locationSource = '网络位置估计';
      state.data.profile.locationConfidence = '低';
      state.data.profile.city = '北京市';
      saveMemories(state.data.profile.memories);
      state.brief = buildDoctorBrief(state.data);
      renderApp();
      showToast('已开启城市级地区辅助分析');
    }
  } else if (action === 'voice-placeholder') {
    showToast('语音朗读将在后续版本推出');
  } else if (action === 'export-report') {
    showToast('医生报告导出将在后续版本开放');
  } else if (action === 'open-notifications') {
    showToast('暂无新的健康提醒');
  } else if (action === 'show-toast') {
    showToast(actionTarget.dataset.message || '功能准备中');
  }
});

document.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-form="chat"]')) return;
  event.preventDefault();
  const formData = new FormData(event.target);
  submitQuestion(String(formData.get('question') || ''));
});

renderApp();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {});
}
