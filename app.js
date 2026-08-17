import { sampleData } from './data/sample-data.js';
import { buildDoctorBrief, createAgentReply, getBloodPressureCategory } from './agent.js';
import { hasSiliconFlowConfig, requestSiliconFlow } from './siliconflow.js';

const cloneData = (value) => JSON.parse(JSON.stringify(value));
const state = {
  view: 'home',
  range: 7,
  data: cloneData(sampleData),
  brief: null,
  modal: null,
  chat: []
};
const allowedViews = ['home', 'trend', 'doctor', 'profile'];
const requestedView = new URLSearchParams(window.location.search).get('view');
if (allowedViews.includes(requestedView)) state.view = requestedView;
state.brief = buildDoctorBrief(state.data);
state.chat = [{
  role: 'assistant',
  text: `${state.brief.greeting}${state.brief.overview}`
}];

const root = document.querySelector('#view-root');
const toastRoot = document.querySelector('#toast-root');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const pad = (value) => String(value).padStart(2, '0');
const formatShortDate = (value) => {
  const date = new Date(value);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
};
const formatChineseDate = (value) => {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};
const formatTime = (value) => {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatDateTimeInput = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatDuration = (minutes) => `${Math.floor(minutes / 60)}小时${minutes % 60 ? ` ${minutes % 60}分` : ''}`;
const formatBp = (item) => `${item.systolic}/${item.diastolic}`;
const latestMeasurement = () => [...state.data.measurements].sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))[0];
const latestDate = () => latestMeasurement().measuredAt;
const byTimeAscending = (items) => [...items].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));

function showToast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toastRoot.innerHTML = ''; }, 2600);
}

function iconForType(type) {
  const icons = {
    bp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-5 4 10 2-5h4"/><path d="M5 19h14"/></svg>',
    food: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7M9 3v7M6 7h3M7.5 10v11M16 3v18M16 3c2 1 3 3 3 5s-1 4-3 5"/></svg>',
    sleep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14M7 16a5 5 0 0 1 9.7-1.7A3.5 3.5 0 0 1 19 19H5a4 4 0 0 1 2-3Z"/><path d="m16 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/></svg>',
    action: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/></svg>'
  };
  return icons[type] || icons.action;
}

function buildSparkline(measurements) {
  const sorted = byTimeAscending(measurements).slice(-7);
  const values = sorted.map((item) => item.systolic);
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;
  const width = 105;
  const height = 54;
  const points = values.map((value, index) => {
    const x = sorted.length === 1 ? width / 2 : (index / (sorted.length - 1)) * width;
    const y = 5 + ((max - value) / Math.max(1, max - min)) * 33;
    return `${Math.round(x)},${Math.round(y)}`;
  });
  const last = points[points.length - 1].split(',');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近血压变化趋势">
    <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b8cf5" stop-opacity=".3"/><stop offset="1" stop-color="#7b8cf5" stop-opacity="0"/></linearGradient></defs>
    <polygon class="spark-fill" points="${points.join(' ')} ${width},54 0,54" />
    <polyline class="spark-line" points="${points.join(' ')}" />
    <circle cx="${last[0]}" cy="${last[1]}" r="3.2" />
  </svg>`;
}

function buildChartSvg(measurements, days) {
  const sorted = byTimeAscending(measurements);
  const endTime = new Date(sorted[sorted.length - 1].measuredAt).getTime();
  const startTime = endTime - (days - 1) * 24 * 60 * 60 * 1000;
  const filtered = sorted.filter((item) => new Date(item.measuredAt).getTime() >= startTime);
  const daily = new Map();
  filtered.forEach((item) => {
    const key = item.measuredAt.slice(0, 10);
    const existing = daily.get(key) || { date: item.measuredAt, systolic: [], diastolic: [] };
    existing.systolic.push(item.systolic);
    existing.diastolic.push(item.diastolic);
    daily.set(key, existing);
  });
  const points = [...daily.values()].map((item) => ({
    date: item.date,
    systolic: Math.round(item.systolic.reduce((total, value) => total + value, 0) / item.systolic.length),
    diastolic: Math.round(item.diastolic.reduce((total, value) => total + value, 0) / item.diastolic.length)
  }));
  const width = 356;
  const height = 146;
  const left = 29;
  const right = 7;
  const top = 10;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const y = (value) => top + ((160 - Math.max(100, Math.min(160, value))) / 60) * plotHeight;
  const x = (index) => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const makeLine = (field) => points.map((point, index) => `${x(index).toFixed(1)},${y(point[field]).toFixed(1)}`).join(' ');
  const gridValues = [160, 140, 120, 100];
  const grid = gridValues.map((value) => `<line class="grid-line" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text x="0" y="${y(value) + 3}">${value}</text>`).join('');
  const step = Math.max(1, Math.ceil(points.length / 5));
  const labels = points.map((point, index) => index % step === 0 || index === points.length - 1 ? `<text x="${x(index)}" y="${height - 5}" text-anchor="middle">${formatShortDate(point.date)}</text>` : '').join('');
  const sysPoints = points.map((point, index) => `<circle class="sys-point" cx="${x(index)}" cy="${y(point.systolic)}" r="3"/>`).join('');
  const diaPoints = points.map((point, index) => `<circle class="dia-point" cx="${x(index)}" cy="${y(point.diastolic)}" r="3"/>`).join('');
  return `<svg class="bp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="血压趋势图">
    ${grid}
    <polyline class="sys-line" points="${makeLine('systolic')}" />
    <polyline class="dia-line" points="${makeLine('diastolic')}" />
    ${sysPoints}${diaPoints}${labels}
  </svg>`;
}

function setActiveNav() {
  document.querySelectorAll('[data-nav]').forEach((item) => item.classList.toggle('is-active', item.dataset.nav === state.view));
}

function renderHome() {
  const brief = state.brief;
  const latest = brief.summary.latest;
  const category = brief.summary.category;
  const sevenDay = brief.summary.recent;
  return `
    <section class="home-intro">
      <p class="eyebrow">${formatChineseDate(latest.measuredAt)} · 周一</p>
      <h1 class="page-title">早安，${escapeHtml(state.data.profile.name)}</h1>
      <p class="page-subtitle">今天也一起把身体照顾好，先从一次稳定的测量开始。</p>
    </section>

    <section class="hero-card" aria-label="最新血压">
      <div class="hero-meta">
        <p class="eyebrow">最新一次 · ${escapeHtml(latest.context)}</p>
        <span class="soft-tag">${escapeHtml(category.label)}</span>
      </div>
      <div class="hero-readout">
        <strong class="hero-number">${latest.systolic}<em>/</em>${latest.diastolic}</strong>
        <span class="hero-unit"><strong>mmHg</strong>收缩压 / 舒张压</span>
      </div>
      <div class="hero-divider"></div>
      <div class="hero-footer">
        <div class="pulse-readout">
          <span class="heart-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.2-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.6A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.4Z"/></svg></span>
          心率 <b>${latest.heartRate}</b> bpm
        </div>
        <span class="measurement-time">${formatChineseDate(latest.measuredAt)} ${formatTime(latest.measuredAt)}</span>
      </div>
    </section>

    <div class="section-heading">
      <h2 class="section-title">快速记录</h2>
      <span class="connection-pill">设备已连接</span>
    </div>
    <div class="quick-grid">
      <button class="quick-action" data-action="start-measurement"><span class="quick-icon blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-5 4 10 2-5h4"/><path d="M5 19h14"/></svg></span><strong>开始测量</strong><span>模拟硬件测量</span></button>
      <button class="quick-action" data-nav="trend"><span class="quick-icon green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17"/><path d="m7 15 3-4 3 2 5-7"/></svg></span><strong>查看趋势</strong><span>了解近期变化</span></button>
      <button class="quick-action" data-action="record-diet"><span class="quick-icon orange"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7M9 3v7M6 7h3M7.5 10v11M16 3v18M16 3c2 1 3 3 3 5s-1 4-3 5"/></svg></span><strong>记录饮食</strong><span>补充今日数据</span></button>
    </div>

    <div class="section-heading">
      <h2 class="section-title">AI 健康指导</h2>
      <button class="text-button" data-nav="doctor">查看完整建议 <span aria-hidden="true">→</span></button>
    </div>
    <section class="insight-card">
      <div class="insight-top"><span class="ai-label"><span class="ai-orb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M5.6 5.6l2.8 2.8M3 12h4M5.6 18.4l2.8-2.8M18.4 18.4l-2.8-2.8M21 12h-4M18.4 5.6l-2.8 2.8"/><circle cx="12" cy="12" r="4.5"/></svg></span>陈医生 · 今日观察</span><span class="source-tag">${hasSiliconFlowConfig() ? '云端代理' : '本地演示模式'}</span></div>
      <div class="insight-body"><div><h3 class="insight-title">${escapeHtml(brief.headline)}</h3><p class="insight-copy">${escapeHtml(brief.overview)}</p><button class="link-button" data-nav="doctor">打开健康简报 →</button></div><div class="sparkline-wrap">${buildSparkline(sevenDay)}<span class="micro-label">近 7 天收缩压</span></div></div>
    </section>

    <div class="section-heading"><h2 class="section-title">最近 7 天</h2><button class="text-button" data-nav="trend">全部数据 →</button></div>
    <section class="surface-card chart-card">
      <div class="chart-legend"><span class="legend-item"><i class="legend-dot sys"></i>收缩压</span><span class="legend-item"><i class="legend-dot dia"></i>舒张压</span><span class="legend-item" style="margin-left:auto;color:#a4adc0">单位：mmHg</span></div>
      ${buildChartSvg(state.data.measurements, 7)}
    </section>
    <div class="metric-grid">
      <div class="metric-card"><span class="metric-label">7日平均血压</span><div class="metric-value">${brief.summary.averageSystolic}/${brief.summary.averageDiastolic}<small>mmHg</small></div><div class="metric-trend ${brief.summary.averageSystolic >= 130 ? 'warn' : ''}">${brief.summary.averageSystolic >= 130 ? '建议持续观察' : '保持得不错'}</div></div>
      <div class="metric-card"><span class="metric-label">测量完成度</span><div class="metric-value">${brief.summary.measurementDays}<small>/ 7 天</small></div><div class="metric-trend">${brief.summary.measurementDays >= 6 ? '节奏稳定' : '再坚持一下'}</div></div>
      <div class="metric-card"><span class="metric-label">平均睡眠</span><div class="metric-value">${Math.floor(brief.summary.averageSleepMinutes / 60)}<small>小时 ${brief.summary.averageSleepMinutes % 60}分</small></div><div class="metric-trend">评分 ${brief.summary.averageSleepScore} 分</div></div>
      <div class="metric-card"><span class="metric-label">高盐饮食</span><div class="metric-value">${brief.summary.highSodiumDays}<small>/ 7 天</small></div><div class="metric-trend ${brief.summary.highSodiumDays >= 2 ? 'warn' : ''}">${brief.summary.highSodiumDays >= 2 ? '可优先改善' : '控制得不错'}</div></div>
    </div>
  `;
}
function renderTrend() {
  const brief = state.brief;
  const sorted = byTimeAscending(state.data.measurements);
  const visible = sorted.slice(-Math.min(8, state.range * 2)).reverse();
  return `
    <section class="trend-header"><p class="eyebrow">数据回顾</p><h1 class="page-title">血压趋势</h1><p class="page-subtitle">把每一次测量放在时间里看，变化会更清晰。</p></section>
    <div class="range-switcher" aria-label="趋势时间范围">
      <button class="range-button ${state.range === 7 ? 'is-active' : ''}" data-action="set-range" data-range="7">近 7 天</button>
      <button class="range-button ${state.range === 14 ? 'is-active' : ''}" data-action="set-range" data-range="14">近 14 天</button>
      <button class="range-button" data-action="show-toast" data-message="自定义范围将在连接真实数据后开放">自定义</button>
    </div>
    <section class="surface-card trend-chart-card">
      <div class="card-title-row"><h2 class="section-title">血压走势</h2><span class="muted-note">平均值 · mmHg</span></div>
      <div class="chart-legend"><span class="legend-item"><i class="legend-dot sys"></i>收缩压</span><span class="legend-item"><i class="legend-dot dia"></i>舒张压</span></div>
      ${buildChartSvg(state.data.measurements, state.range)}
      <div class="trend-summary"><div class="summary-cell"><span>收缩压均值</span><strong>${brief.summary.averageSystolic}</strong><em>${brief.summary.averageSystolic >= 130 ? '略高于目标' : '目标内'}</em></div><div class="summary-cell"><span>舒张压均值</span><strong>${brief.summary.averageDiastolic}</strong><em>${brief.summary.averageDiastolic >= 80 ? '需要观察' : '目标内'}</em></div><div class="summary-cell"><span>心率均值</span><strong>${brief.summary.averageHeartRate}</strong><em>静息数据</em></div></div>
    </section>
    <div class="section-heading"><h2 class="section-title">测量记录</h2><span class="muted-note">共 ${sorted.length} 条</span></div>
    <div class="history-list">
      ${visible.map((item) => { const category = getBloodPressureCategory(item.systolic, item.diastolic); return `<article class="history-item"><div class="history-time"><span class="history-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-5 4 10 2-5h4"/><path d="M5 19h14"/></svg></span><div><strong>${formatChineseDate(item.measuredAt)} ${formatTime(item.measuredAt)}</strong><span>${escapeHtml(item.context)} · ${escapeHtml(category.label)}</span></div></div><div class="history-reading"><strong>${formatBp(item)}<em>mmHg</em></strong><span>心率 ${item.heartRate} bpm</span></div></article>`; }).join('')}
    </div>
    <p class="disclaimer">提示：趋势图按天对多次测量取平均。一次偏高不等于诊断结果，请结合连续记录与医生意见判断。</p>
  `;
}

function renderDoctor() {
  const brief = state.brief;
  const modeLabel = hasSiliconFlowConfig() ? '云端代理' : '本地演示模式';
  return `
    <section class="doctor-header"><p class="eyebrow">基于你的近期数据</p><h1 class="page-title">AI 医生</h1><p class="page-subtitle">不是冷冰冰的数字，而是一份能执行的健康计划。</p></section>
    <section class="doctor-hero"><span class="agent-mode">${modeLabel}</span><div class="doctor-profile"><span class="doctor-avatar">陈</span><div><strong>陈医生 · AI 健康顾问</strong><span>循证分析 · 生活方式管理</span></div></div><h2>${escapeHtml(brief.headline)}</h2><p>${escapeHtml(brief.greeting)}${escapeHtml(brief.overview)}</p></section>
    <div class="signal-row">${brief.keySignals.map((signal) => `<div class="signal-cell"><span>${escapeHtml(signal.label)}</span><strong>${escapeHtml(signal.value)}<small>${escapeHtml(signal.unit)}</small></strong><em>${escapeHtml(signal.note)}</em></div>`).join('')}</div>
    <div class="section-heading"><h2 class="section-title">给你的重点建议</h2><span class="muted-note">今日更新</span></div>
    <div class="recommendation-list">${brief.recommendations.map((recommendation) => `<article class="recommendation-card"><div class="recommendation-heading"><span class="recommendation-icon ${recommendation.type}">${iconForType(recommendation.type)}</span><strong>${escapeHtml(recommendation.title)}</strong><span class="risk-tag">${escapeHtml(recommendation.tag)}</span></div><p>${escapeHtml(recommendation.body)}</p></article>`).join('')}</div>
    <div class="section-heading"><h2 class="section-title">问问陈医生</h2><span class="muted-note">随时可以聊</span></div>
    <section class="surface-card chat-card"><div class="chat-heading"><strong>健康对话</strong><span>● ${modeLabel}</span></div><div class="chat-messages">${state.chat.map((message) => `<div class="message ${message.role === 'user' ? 'user' : ''}">${escapeHtml(message.text)}</div>`).join('')}</div><div class="prompt-list"><button class="prompt-button" data-action="ask-prompt" data-prompt="今天的血压趋势怎么样？">今天的趋势</button><button class="prompt-button" data-action="ask-prompt" data-prompt="饮食上我应该注意什么？">饮食怎么调</button><button class="prompt-button" data-action="ask-prompt" data-prompt="怎样测量更准确？">如何正确测量</button></div><form class="chat-composer" data-form="chat"><input name="question" autocomplete="off" placeholder="输入你想了解的问题" /><button class="send-button" type="submit" aria-label="发送"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/></svg></button></form></section>
    <p class="disclaimer">${escapeHtml(brief.safety)}本应用不会替代面对面问诊，也不会在未授权时根据 IP 推断你的饮食习惯。</p>
  `;
}

function renderProfile() {
  const profile = state.data.profile;
  const device = state.data.device;
  return `
    <section class="profile-header"><p class="eyebrow">个人健康档案</p><h1 class="page-title">我的</h1><p class="page-subtitle">资料越完整，AI 给出的建议越贴近你的生活。</p></section>
    <section class="profile-card"><div class="profile-row"><span class="large-avatar">林</span><div><strong>${escapeHtml(profile.name)}</strong><span>${profile.age} 岁 · ${escapeHtml(profile.sex)} · ${escapeHtml(profile.dietaryPreference)}</span></div><button class="edit-button" data-action="edit-profile">编辑资料</button></div><div class="profile-details"><div class="detail-cell"><span>身高 / 体重</span><strong>${profile.heightCm} cm / ${profile.weightKg} kg</strong></div><div class="detail-cell"><span>用药记录</span><strong>${escapeHtml(profile.medication)}</strong></div></div></section>
    <div class="section-heading"><h2 class="section-title">我的设备</h2></div>
    <section class="device-card"><div class="device-row"><span class="device-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4M10 18h4M5 10h2M17 10h2"/></svg></span><div><strong>${escapeHtml(device.name)}</strong><span>电量 ${device.battery}% · ${escapeHtml(device.serial)}</span></div><span class="device-state">● 已连接</span></div><div class="data-source-row"><span>最近同步 ${formatTime(device.lastSyncAt)}</span><span class="confidence-tag">数据正常</span></div></section>
    <div class="section-heading"><h2 class="section-title">位置与饮食隐私</h2></div>
    <section class="device-card"><div class="data-source-row no-margin" style="padding-top:0;border-top:0"><span>地区信息</span><strong style="font-size:12px">${escapeHtml(profile.city)}</strong></div><div class="data-source-row"><span>来源</span><span class="confidence-tag">${escapeHtml(profile.locationSource)}</span></div><p class="muted-note spacer-top">${profile.locationInferenceEnabled ? '已授权的位置只用于提供更相关的生活方式参考。' : '当前未启用 IP 饮食推断。地区不能代表真实饮食习惯，建议以你主动记录和确认的信息为准。'}</p><button class="secondary-button spacer-top" style="width:100%" data-action="location-settings">管理位置授权</button></section>
    <div class="section-heading"><h2 class="section-title">更多设置</h2></div>
    <div class="settings-list"><button class="setting-item" data-action="show-toast" data-message="测量提醒设置已准备好"><span class="setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><strong>测量提醒</strong><span>早晚各一次</span><span class="chevron">›</span></button><button class="setting-item" data-action="show-toast" data-message="数据导出将在正式版开放"><span class="setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span><strong>导出健康报告</strong><span>PDF / Excel</span><span class="chevron">›</span></button><button class="setting-item" data-action="show-toast" data-message="隐私说明已更新"><span class="setting-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg></span><strong>隐私与数据安全</strong><span>本地演示数据</span><span class="chevron">›</span></button></div>
    <section class="safety-card spacer-top"><strong>健康提示</strong><p>血压记录适合帮助你发现变化，不用于自行诊断或调整药物。如果连续多日偏高，请携带完整记录咨询专业医生。</p></section>
  `;
}

function renderMeasurementModal() {
  if (state.modal !== 'measurement') return '';
  const latest = latestMeasurement();
  const defaultTime = new Date(new Date(latest.measuredAt).getTime() + 5 * 60 * 1000);
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="measurement-title" data-modal-content><div class="modal-heading"><h2 id="measurement-title">记录一次测量</h2><button class="close-button" type="button" data-action="close-modal" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><p class="muted-note">演示模式：模拟从脉安 P1 设备接收数据。提交后会立刻刷新趋势和 AI 建议。</p><form class="form-grid" data-form="measurement"><div class="form-field full"><label for="measuredAt">测量时间</label><input id="measuredAt" name="measuredAt" type="datetime-local" value="${formatDateTimeInput(defaultTime)}" required /></div><div class="form-field"><label for="systolic">收缩压（mmHg）</label><input id="systolic" name="systolic" type="number" min="80" max="260" value="128" required /></div><div class="form-field"><label for="diastolic">舒张压（mmHg）</label><input id="diastolic" name="diastolic" type="number" min="40" max="160" value="82" required /></div><div class="form-field"><label for="heartRate">心率（bpm）</label><input id="heartRate" name="heartRate" type="number" min="35" max="220" value="72" required /></div><div class="form-field"><label for="context">测量场景</label><select id="context" name="context"><option>晨起</option><option>睡前</option><option>日间</option></select></div><div class="form-actions full"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="submit" class="primary-button">保存到演示数据</button></div></form></section></div>`;
}

function renderApp() {
  const views = { home: renderHome, trend: renderTrend, doctor: renderDoctor, profile: renderProfile };
  root.innerHTML = `${views[state.view]()}${renderMeasurementModal()}`;
  setActiveNav();

}
async function submitQuestion(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  state.chat.push({ role: 'user', text: trimmed });
  state.chat.push({ role: 'assistant', text: '我正在结合你的近期记录整理建议……', pending: true });
  renderApp();
  const replyIndex = state.chat.length - 1;
  const localReply = createAgentReply(trimmed, state.data);
  try {
    if (hasSiliconFlowConfig()) {
      const response = await requestSiliconFlow({ question: trimmed, brief: state.brief });
      state.chat[replyIndex] = { role: 'assistant', text: response.content };
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 360));
      state.chat[replyIndex] = { role: 'assistant', text: localReply };
    }
  } catch (error) {
    state.chat[replyIndex] = { role: 'assistant', text: `${localReply}\n\n（云端模型暂时不可用，已使用本地安全规则完成回答。）` };
  }
  renderApp();
}

function saveMeasurement(form) {
  const formData = new FormData(form);
  const systolic = Number(formData.get('systolic'));
  const diastolic = Number(formData.get('diastolic'));
  const heartRate = Number(formData.get('heartRate'));
  const measuredAt = new Date(formData.get('measuredAt'));
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || !Number.isFinite(heartRate) || Number.isNaN(measuredAt.getTime())) {
    showToast('请完整填写有效数据');
    return;
  }
  if (systolic < 80 || systolic > 260 || diastolic < 40 || diastolic > 160 || heartRate < 35 || heartRate > 220) {
    showToast('数据超出演示录入范围，请检查后再试');
    return;
  }
  state.data.measurements.push({
    id: `m-demo-${Date.now()}`,
    measuredAt: measuredAt.toISOString(),
    systolic,
    diastolic,
    heartRate,
    context: formData.get('context')
  });
  state.data.measurements.sort((first, second) => new Date(first.measuredAt) - new Date(second.measuredAt));
  const allowedViews = ['home', 'trend', 'doctor', 'profile'];
const requestedView = new URLSearchParams(window.location.search).get('view');
if (allowedViews.includes(requestedView)) state.view = requestedView;
state.brief = buildDoctorBrief(state.data);
  state.modal = null;
  renderApp();
  showToast('测量已保存，AI 建议已更新');
}

function handleClick(event) {
  const navTarget = event.target.closest('[data-nav]');
  if (navTarget) {
    state.view = navTarget.dataset.nav;
    state.modal = null;
    renderApp();
    return;
  }
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  if (actionTarget.classList.contains('modal-backdrop') && event.target.closest('[data-modal-content]')) return;
  const action = actionTarget.dataset.action;
  if (action === 'start-measurement') {
    state.modal = 'measurement';
    renderApp();
    root.querySelector('#systolic')?.focus();
  } else if (action === 'close-modal') {
    state.modal = null;
    renderApp();
  } else if (action === 'set-range') {
    state.range = Number(actionTarget.dataset.range) || 7;
    renderApp();
  } else if (action === 'show-toast') {
    showToast(actionTarget.dataset.message || '演示功能已准备好');
  } else if (action === 'open-notifications') {
    showToast('今天的晚间测量提醒将在 21:00 发送');
  } else if (action === 'record-diet') {
    showToast('请在正式版中接入饮食记录表单；今日午晚餐仍待补充');
  } else if (action === 'edit-profile') {
    showToast('个人资料编辑将在下一版开放');
  } else if (action === 'location-settings') {
    state.data.profile.locationInferenceEnabled = !state.data.profile.locationInferenceEnabled;
    state.data.profile.locationSource = state.data.profile.locationInferenceEnabled ? '用户授权' : '用户手动确认';
    const allowedViews = ['home', 'trend', 'doctor', 'profile'];
const requestedView = new URLSearchParams(window.location.search).get('view');
if (allowedViews.includes(requestedView)) state.view = requestedView;
state.brief = buildDoctorBrief(state.data);
    renderApp();
    showToast(state.data.profile.locationInferenceEnabled ? '已授权位置作为辅助参考' : '已关闭位置辅助参考');
  } else if (action === 'ask-prompt') {
    submitQuestion(actionTarget.dataset.prompt || '');
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', (event) => {
  if (event.target.matches('[data-form="measurement"]')) {
    event.preventDefault();
    saveMeasurement(event.target);
  }
  if (event.target.matches('[data-form="chat"]')) {
    event.preventDefault();
    const input = event.target.querySelector('input[name="question"]');
    const question = input?.value || '';
    if (question.trim()) {
      input.value = '';
      submitQuestion(question);
    }
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) {
    state.modal = null;
    renderApp();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

renderApp();




