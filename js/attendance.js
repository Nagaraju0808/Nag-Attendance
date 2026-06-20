// js/attendance.js
// Attendance tracking: semesters, timetable, marking, analytics, history.
// All queries rely on RLS (sql/schema.sql) to scope data to the owner —
// no manual semester_id===null/owner filtering needed anymore.

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import { showToast, $ } from './ui.js';
import { renderDonut, renderBarChart, renderTrendChart } from './charts.js';

const PERIOD_TIMES = {1:'09:00-09:55',2:'09:55-10:50',3:'10:50-11:45',4:'11:45-12:40',5:'01:30-02:25',6:'02:25-03:20'};
export const WEEK_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const FALLBACK_SUBJECTS = {
  DAA:{name:'Design & Analysis of Algorithms',code:'',faculty:'',color:'#00d4ff',pw:3},
  OS:{name:'Operating Systems',code:'',faculty:'',color:'#f97316',pw:4},
  WT:{name:'Web Technologies',code:'',faculty:'',color:'#22c55e',pw:4},
};

export let state = {
  allSemesters: [], activeSemester: null,
  ACTIVE_SUBJECTS: {}, ACTIVE_TIMETABLE: {},
  initialData: {}, attendanceRecords: [],
  pendingMarks: {}, isHolidayDay: false
};

function sb() { return getSupabaseClient(); }
function uid() { return getCurrentUser()?.id; }

// ════════════════════════════════════════
// LOAD
// ════════════════════════════════════════
export async function loadSemesterData() {
  const { data: sems } = await sb().from('semesters').select('*').order('created_at', { ascending: false });
  state.allSemesters = sems || [];
  state.activeSemester = state.allSemesters.find(s => s.status === 'active') || null;

  if (!state.activeSemester) {
    state.ACTIVE_SUBJECTS = {}; state.ACTIVE_TIMETABLE = {};
    return 'needs-wizard';
  }

  const { data: subs } = await sb().from('semester_subjects').select('*').eq('semester_id', state.activeSemester.id);
  state.ACTIVE_SUBJECTS = {};
  (subs || []).forEach(s => { state.ACTIVE_SUBJECTS[s.key] = { name: s.name, code: s.code, faculty: s.faculty, color: s.color, pw: s.periods_per_week }; });

  const { data: tt } = await sb().from('semester_timetable').select('*').eq('semester_id', state.activeSemester.id);
  state.ACTIVE_TIMETABLE = {};
  (tt || []).forEach(t => {
    (state.ACTIVE_TIMETABLE[t.day] = state.ACTIVE_TIMETABLE[t.day] || []).push({ period: t.period, time: t.time_slot, subject: t.subject_key });
  });
  Object.values(state.ACTIVE_TIMETABLE).forEach(arr => arr.sort((a,b) => a.period - b.period));
  return true;
}

export async function loadAttendanceData() {
  const { data: initRows } = await sb().from('subject_initial').select('*').eq('semester_id', state.activeSemester?.id);
  state.initialData = {};
  (initRows || []).forEach(r => { state.initialData[r.subject] = { present: r.present, total: r.total }; });
  Object.keys(state.ACTIVE_SUBJECTS).forEach(k => { if (!state.initialData[k]) state.initialData[k] = { present: 0, total: 0 }; });

  const { data: records } = await sb().from('attendance_records').select('*').eq('semester_id', state.activeSemester?.id).order('date', { ascending: false });
  state.attendanceRecords = records || [];
}

// ════════════════════════════════════════
// CALCULATIONS
// ════════════════════════════════════════
export function calcSubjectStats() {
  const stats = {};
  Object.keys(state.ACTIVE_SUBJECTS).forEach(key => {
    const init = state.initialData[key] || { present: 0, total: 0 };
    const recs = state.attendanceRecords.filter(r => r.subject === key && !r.is_holiday);
    const present = init.present + recs.filter(r => r.status === 'P').length;
    const total = init.total + recs.length;
    const pct = total > 0 ? (present / total * 100) : 0;
    let needed = 0, canBunk = 0;
    if (pct < 75 && total > 0) needed = Math.ceil((0.75 * total - present) / 0.25);
    if (pct >= 75) canBunk = Math.max(0, Math.floor((present - 0.75 * total) / 0.75));
    stats[key] = { present, total, pct, needed, canBunk };
  });
  return stats;
}

export function calcOverall() {
  const stats = calcSubjectStats();
  let present = 0, total = 0;
  Object.values(stats).forEach(s => { present += s.present; total += s.total; });
  const pct = total > 0 ? (present / total * 100) : 0;
  return { present, total, pct, absent: total - present };
}

// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
export function renderDashboard() {
  const overall = calcOverall();
  const stats = calcSubjectStats();
  const pct = overall.pct.toFixed(2);

  $('dash-date') && ($('dash-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' }));
  $('stat-total-pct') && ($('stat-total-pct').textContent = pct + '%');
  $('stat-present') && ($('stat-present').textContent = overall.present);
  $('stat-absent') && ($('stat-absent').textContent = overall.absent);
  $('stat-total') && ($('stat-total').textContent = overall.total);
  $('donut-pct') && ($('donut-pct').textContent = pct + '%');

  const trendEl = $('stat-trend');
  if (trendEl) {
    if (overall.pct >= 75) { trendEl.className = 'stat-trend trend-up'; trendEl.textContent = '✓ Good Standing'; }
    else if (overall.pct >= 65) { trendEl.className = 'stat-trend trend-warn'; trendEl.textContent = '⚠ Needs Attention'; }
    else { trendEl.className = 'stat-trend trend-down'; trendEl.textContent = '✗ Critical'; }
  }

  const subjEl = $('dash-subjects');
  if (subjEl) {
    subjEl.innerHTML = Object.keys(stats).map(key => {
      const s = stats[key]; const sub = state.ACTIVE_SUBJECTS[key];
      const pctColor = s.pct >= 75 ? 'var(--present)' : s.pct >= 65 ? 'var(--warning)' : 'var(--absent)';
      const fill = s.pct >= 75 ? 'linear-gradient(90deg,#00ff88,#00d4ff)' : s.pct >= 65 ? 'linear-gradient(90deg,#ffbb00,#ff9500)' : 'linear-gradient(90deg,#ff3366,#ff6b6b)';
      return `<div class="progress-wrap">
        <div class="progress-label"><span style="color:${sub?.color}">● ${sub?.name||key}</span><span style="color:${pctColor}">${s.pct.toFixed(1)}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(s.pct,100)}%;background:${fill}"></div></div>
      </div>`;
    }).join('') || '<p style="color:var(--text2);font-size:.85rem">No subjects configured yet.</p>';
  }

  if ($('donutChart')) renderDonut('donutChart', overall);
  renderCNCards(stats);
}

function renderCNCards(stats) {
  const el = $('dash-classes-needed');
  if (!el) return;
  el.innerHTML = Object.entries(stats).map(([key, s]) => {
    const sub = state.ACTIVE_SUBJECTS[key];
    let bc, bt;
    if (s.pct >= 75) { bc = 'cn-safe'; bt = `✅ Can miss ${s.canBunk}`; }
    else if (s.total === 0) { bc = 'cn-warn'; bt = '– No data'; }
    else { bc = s.pct < 65 ? 'cn-danger' : 'cn-warn'; bt = `⚠ Need ${s.needed}`; }
    return `<div class="cn-row"><div class="cn-dot" style="background:${sub?.color}"></div>
      <div class="cn-name">${sub?.name || key}</div>
      <div style="font-size:.75rem;color:var(--text2);width:46px;text-align:right;margin-right:8px">${s.pct.toFixed(1)}%</div>
      <div class="cn-badge ${bc}">${bt}</div></div>`;
  }).join('');
}

// ════════════════════════════════════════
// MARK ATTENDANCE
// ════════════════════════════════════════
export function initMarkPage() {
  state.pendingMarks = {};
  const today = new Date().toISOString().split('T')[0];
  const input = $('att-date');
  if (input && !input.value) input.value = today;
  loadDaySchedule();
}

export function loadDaySchedule() {
  const dateStr = $('att-date')?.value;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = WEEK_DAYS[date.getDay()];
  $('day-name') && ($('day-name').textContent = dayName);
  const periods = state.ACTIVE_TIMETABLE[dayName];
  const scheduleEl = $('day-schedule');
  const saveSection = $('save-section');
  state.pendingMarks = {};

  const alreadyMarked = state.attendanceRecords.filter(r => r.date === dateStr);
  state.isHolidayDay = alreadyMarked.length > 0 && alreadyMarked.every(r => r.is_holiday);

  if (!periods || periods.length === 0) {
    scheduleEl.innerHTML = `<div class="no-class-msg"><span class="icon">🎉</span><h3>No Classes Today!</h3></div>`;
    if (saveSection) saveSection.style.display = 'none';
    return;
  }
  if (state.isHolidayDay) {
    scheduleEl.innerHTML = `<div class="holiday-banner">🏖 Holiday — excluded from attendance</div>`;
    if (saveSection) saveSection.style.display = 'none';
    return;
  }
  alreadyMarked.forEach(r => { state.pendingMarks[r.period + '_' + r.subject] = r.status; });

  scheduleEl.innerHTML = `<div class="card"><div class="section-h" style="margin-bottom:16px">📅 ${dayName} – ${dateStr}</div>
    <div class="period-list">${periods.map(p => buildPeriodRow(p, state.pendingMarks[p.period+'_'+p.subject])).join('')}</div></div>`;
  if (saveSection) saveSection.style.display = 'block';
}

function buildPeriodRow(p, existing) {
  const sub = state.ACTIVE_SUBJECTS[p.subject] || { name: p.subject, color: '#8899bb' };
  const itemClass = existing === 'P' ? 'marked-present' : existing === 'A' ? 'marked-absent' : '';
  return `<div class="period-item ${itemClass}" id="period-item-${p.period}-${p.subject}">
    <div class="period-num">P${p.period}</div>
    <div class="period-info"><div class="period-subject" style="color:${sub.color}">${sub.name}</div><div class="period-time">🕐 ${p.time}</div></div>
    <div class="att-toggle">
      <button class="att-btn present-btn ${existing==='P'?'active':''}" onclick="window.__att.mark(${p.period},'${p.subject}','P')">✓ P</button>
      <button class="att-btn absent-btn ${existing==='A'?'active':''}" onclick="window.__att.mark(${p.period},'${p.subject}','A')">✗ A</button>
    </div></div>`;
}

export function markPeriod(period, subject, status) {
  state.pendingMarks[period + '_' + subject] = status;
  const item = $(`period-item-${period}-${subject}`);
  if (!item) return;
  item.className = `period-item marked-${status === 'P' ? 'present' : 'absent'}`;
  const btns = item.querySelectorAll('.att-btn');
  btns[0].classList.toggle('active', status === 'P');
  btns[1].classList.toggle('active', status === 'A');
}

export async function saveAttendance() {
  const dateStr = $('att-date')?.value;
  if (!dateStr) return showToast('Select a date', 'error');
  const dayName = WEEK_DAYS[new Date(dateStr + 'T00:00:00').getDay()];
  const periods = state.ACTIVE_TIMETABLE[dayName] || [];
  periods.filter(p => !state.pendingMarks[p.period + '_' + p.subject])
    .forEach(p => { state.pendingMarks[p.period + '_' + p.subject] = 'A'; });

  const records = Object.entries(state.pendingMarks).map(([key, status]) => {
    const [period, ...rest] = key.split('_');
    const subject = rest.join('_');
    return { owner_id: uid(), date: dateStr, day: dayName, period: parseInt(period), subject,
      subject_name: state.ACTIVE_SUBJECTS[subject]?.name || subject, status, is_holiday: false,
      semester_id: state.activeSemester?.id };
  });
  const { error } = await sb().from('attendance_records').upsert(records, { onConflict: 'owner_id,date,period,subject' });
  if (error) return showToast('Failed: ' + error.message, 'error');
  await loadAttendanceData();
  showToast('✅ Attendance saved!', 'success');
  loadDaySchedule();
}

export async function toggleHolidayForDate() {
  const dateStr = $('att-date')?.value;
  if (!dateStr) return;
  const dayName = WEEK_DAYS[new Date(dateStr + 'T00:00:00').getDay()];
  const periods = state.ACTIVE_TIMETABLE[dayName] || [];
  if (!periods.length) return showToast('No classes scheduled this day', 'info');
  const reason = prompt('Holiday name / reason:');
  if (!reason) return;
  const rows = periods.map(p => ({ owner_id: uid(), date: dateStr, day: dayName, period: p.period, subject: p.subject,
    subject_name: state.ACTIVE_SUBJECTS[p.subject]?.name || p.subject, status: 'A', is_holiday: true,
    holiday_reason: reason, semester_id: state.activeSemester?.id }));
  const { error } = await sb().from('attendance_records').upsert(rows, { onConflict: 'owner_id,date,period,subject' });
  if (error) return showToast('Failed: ' + error.message, 'error');
  await loadAttendanceData();
  showToast('🏖 Holiday marked', 'info');
  loadDaySchedule();
}

// ════════════════════════════════════════
// TIMETABLE / ANALYTICS / HISTORY
// ════════════════════════════════════════
export function renderTimetable() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const tbody = $('timetable-body');
  if (!tbody) return;
  tbody.innerHTML = days.map(day => {
    const ps = {}; (state.ACTIVE_TIMETABLE[day] || []).forEach(p => { ps[p.period] = p.subject; });
    const cells = [1,2,3,4,5,6].map(p => {
      const sub = ps[p];
      if (!sub) return `<td><span class="sub-empty">—</span></td>`;
      const s = state.ACTIVE_SUBJECTS[sub];
      return `<td><span class="sub-cell" style="background:${s?.color||'#8899bb'}22;color:${s?.color||'#8899bb'}">${sub}</span></td>`;
    });
    cells.splice(4, 0, `<td><span class="lunch-cell">🍱 Lunch</span></td>`);
    return `<tr><td class="day-cell">${day.toUpperCase()}</td>${cells.join('')}</tr>`;
  }).join('');
}

export function renderAnalytics() {
  const stats = calcSubjectStats();
  if ($('barChart')) renderBarChart('barChart', stats, state.ACTIVE_SUBJECTS);
  if ($('trendChart')) renderTrendChart('trendChart', state.attendanceRecords, state.ACTIVE_SUBJECTS, state.initialData);
  const grid = $('subject-analytics-grid');
  if (grid) {
    grid.innerHTML = Object.entries(stats).map(([key, s]) => {
      const sub = state.ACTIVE_SUBJECTS[key];
      const pctClass = s.pct >= 75 ? 'pct-green' : s.pct >= 65 ? 'pct-yellow' : 'pct-red';
      return `<div class="card subject-card">
        <div class="subject-header"><div class="subject-dot" style="background:${sub?.color}"></div>
        <div class="subject-name">${sub?.name||key}</div><div class="pct-badge ${pctClass}">${s.pct.toFixed(1)}%</div></div>
        <div style="display:flex;gap:20px"><div>P: ${s.present}</div><div>A: ${s.total-s.present}</div><div>T: ${s.total}</div></div>
      </div>`;
    }).join('');
  }
}

export function renderHistory() {
  const listEl = $('history-list');
  if (!listEl) return;
  const dates = [...new Set(state.attendanceRecords.map(r => r.date))].sort().reverse();
  $('history-count') && ($('history-count').textContent = `${dates.length} day(s) recorded`);
  listEl.innerHTML = dates.map(date => {
    const recs = state.attendanceRecords.filter(r => r.date === date);
    const isHol = recs.every(r => r.is_holiday);
    const p = recs.filter(r => r.status === 'P' && !r.is_holiday).length;
    const t = recs.filter(r => !r.is_holiday).length;
    const pct = t > 0 ? (p/t*100) : 0;
    return `<div class="history-item"><div class="history-date">${date}</div>
      <div class="history-periods">${isHol ? '<span class="hist-badge hist-holiday">🏖 Holiday</span>' :
        recs.map(r => `<span class="hist-badge hist-${r.status.toLowerCase()}">${r.subject} ${r.status}</span>`).join('')}</div>
      <div class="history-pct">${isHol ? '—' : pct.toFixed(0)+'%'}</div></div>`;
  }).join('') || '<p style="color:var(--text2);text-align:center;padding:40px">No records yet.</p>';
}

// ════════════════════════════════════════
// SEMESTER WIZARD (simplified, same data model)
// ════════════════════════════════════════
export async function createSemester(name, start_date, end_date, subjects, timetable) {
  const { data: sem, error } = await sb().from('semesters').insert({ owner_id: uid(), name, start_date, end_date, status: 'active' }).select().single();
  if (error) throw error;
  if (subjects.length) {
    await sb().from('semester_subjects').insert(subjects.map(s => ({ owner_id: uid(), semester_id: sem.id, ...s })));
    await sb().from('subject_initial').upsert(subjects.map(s => ({ owner_id: uid(), semester_id: sem.id, subject: s.key, present: 0, total: 0 })));
  }
  const ttRows = [];
  Object.entries(timetable).forEach(([day, periods]) => periods.forEach(p => {
    if (p.subject) ttRows.push({ owner_id: uid(), semester_id: sem.id, day, period: p.period, time_slot: p.time || PERIOD_TIMES[p.period], subject_key: p.subject });
  }));
  if (ttRows.length) await sb().from('semester_timetable').insert(ttRows);
  return sem;
}

export async function archiveActiveSemester() {
  if (!state.activeSemester) return;
  await sb().from('semesters').update({ status: 'completed' }).eq('id', state.activeSemester.id);
  state.activeSemester = null;
}

export { PERIOD_TIMES };
