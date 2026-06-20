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
  renderAlertBanners();
  renderStreak();
  renderWeeklyGoal();
  renderRecentActivity();
  renderPlanningInsights();
  checkSemesterExpiry();
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
  const markedBanner = $('already-marked-banner');
  state.pendingMarks = {};

  const alreadyMarked = state.attendanceRecords.filter(r => r.date === dateStr);
  state.isHolidayDay = alreadyMarked.length > 0 && alreadyMarked.every(r => r.is_holiday);
  const holidayBtn = $('holiday-toggle-btn');
  if (holidayBtn) holidayBtn.classList.toggle('active', state.isHolidayDay);

  if (!periods || periods.length === 0) {
    scheduleEl.innerHTML = `<div class="no-class-msg"><span class="icon">🎉</span><h3>No Classes Today!</h3></div>`;
    if (saveSection) saveSection.style.display = 'none';
    if (markedBanner) markedBanner.innerHTML = '';
    return;
  }
  if (state.isHolidayDay) {
    const reason = alreadyMarked.find(r => r.holiday_reason)?.holiday_reason || '';
    if (markedBanner) markedBanner.innerHTML = `<div class="holiday-banner">🏖 This day is marked as a <strong>Holiday</strong>${reason?` — <em>${reason}</em>`:''} — excluded from attendance.</div>`;
    scheduleEl.innerHTML = '';
    if (saveSection) saveSection.style.display = 'none';
    return;
  }

  // ── ALREADY-MARKED BANNER ──
  if (alreadyMarked.length > 0 && markedBanner) {
    markedBanner.innerHTML = `<div class="already-marked">ℹ️ Attendance already recorded for this day. You can update it below.</div>`;
  } else if (markedBanner) markedBanner.innerHTML = '';

  alreadyMarked.forEach(r => { state.pendingMarks[r.period + '_' + r.subject] = r.status; });

  scheduleEl.innerHTML = `<div class="card"><div class="section-h" style="margin-bottom:16px">📅 ${dayName} – ${dateStr}</div>
    <div class="period-list">${periods.map(p => buildPeriodRow(p, state.pendingMarks[p.period+'_'+p.subject])).join('')}</div></div>`;
  if (saveSection) saveSection.style.display = 'block';

  // ── UNDO DAY STRIP ──
  if (alreadyMarked.length > 0) showUndoDayUI(); else hideUndoDayUI();
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
      <button class="undo-period-btn" onclick="window.__att.undoPeriod(${p.period},'${p.subject}')" title="Undo this period">↩</button>
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
  if (state.isHolidayDay) {
    if (!confirm('Remove holiday status from this day?')) return;
    await removeHolidayStatus(dateStr);
    return;
  }
  openHolidayModal(dateStr);
}

// ── HOLIDAY MODAL (replaces prompt()) ──
export function openHolidayModal(dateStr) {
  const nameInput = $('holiday-name-input'), dateInput = $('holiday-date-display'), preview = $('holiday-preview');
  if (nameInput) nameInput.value = '';
  if (dateInput) dateInput.value = dateStr;
  if (preview) preview.style.display = 'none';
  document.getElementById('holiday-modal')?.classList.add('show');
  setTimeout(() => nameInput?.focus(), 100);
}
export function closeHolidayModal() { document.getElementById('holiday-modal')?.classList.remove('show'); }
export function updateHolidayPreview() {
  const name = $('holiday-name-input')?.value.trim();
  const date = $('holiday-date-display')?.value;
  const preview = $('holiday-preview'), text = $('holiday-preview-text');
  if (!preview || !text) return;
  if (name) {
    const fmt = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
    text.textContent = `"${name}" on ${fmt} — excluded from attendance`;
    preview.style.display = 'flex';
  } else preview.style.display = 'none';
}
export async function submitHolidayMark() {
  const name = $('holiday-name-input')?.value.trim();
  const dateStr = $('holiday-date-display')?.value;
  if (!name) return showToast('Enter a holiday name/reason', 'error');
  if (!dateStr) return showToast('Date missing', 'error');
  closeHolidayModal();
  await applyHolidayStatus(dateStr, name);
}
async function applyHolidayStatus(dateStr, reason) {
  const dayName = WEEK_DAYS[new Date(dateStr + 'T00:00:00').getDay()];
  const periods = state.ACTIVE_TIMETABLE[dayName] || [];
  if (!periods.length) { showToast(`🏖 Holiday "${reason}" noted (no classes that day)`, 'info'); return; }
  const rows = periods.map(p => ({ owner_id: uid(), date: dateStr, day: dayName, period: p.period, subject: p.subject,
    subject_name: state.ACTIVE_SUBJECTS[p.subject]?.name || p.subject, status: 'A', is_holiday: true,
    holiday_reason: reason, semester_id: state.activeSemester?.id }));
  const { error } = await sb().from('attendance_records').upsert(rows, { onConflict: 'owner_id,date,period,subject' });
  if (error) return showToast('Failed: ' + error.message, 'error');
  await loadAttendanceData();
  showToast(`🏖 Holiday "${reason}" marked & excluded`, 'info');
  loadDaySchedule();
  renderHolidayManagement();
}
async function removeHolidayStatus(dateStr) {
  const source = state.attendanceRecords.filter(r => r.date === dateStr);
  if (!source.length) { state.isHolidayDay = false; loadDaySchedule(); return; }
  const rows = source.map(r => ({ owner_id: uid(), date: r.date, day: r.day, period: r.period, subject: r.subject,
    subject_name: r.subject_name, status: r.status, is_holiday: false, holiday_reason: null, semester_id: r.semester_id }));
  const { error } = await sb().from('attendance_records').upsert(rows, { onConflict: 'owner_id,date,period,subject' });
  if (error) return showToast('Failed: ' + error.message, 'error');
  await loadAttendanceData();
  showToast('✅ Holiday removed', 'success');
  loadDaySchedule();
  renderHolidayManagement();
}

// ── HOLIDAY MANAGEMENT LIST (Settings page) ──
export function renderHolidayManagement() {
  const el = $('holiday-mgmt-list');
  if (!el) return;
  const seen = new Set(); const holidays = [];
  state.attendanceRecords.filter(r => r.is_holiday).forEach(r => {
    if (!seen.has(r.date)) { seen.add(r.date); holidays.push({ date: r.date, reason: r.holiday_reason || 'Holiday', day: WEEK_DAYS[new Date(r.date+'T00:00:00').getDay()] }); }
  });
  holidays.sort((a,b) => a.date.localeCompare(b.date));
  if (!holidays.length) { el.innerHTML = '<p style="color:var(--text2);font-size:.85rem;text-align:center;padding:20px">No holidays marked yet.</p>'; return; }
  el.innerHTML = `<div class="holiday-mgmt-list">${holidays.map(h => `
    <div class="holiday-mgmt-item">
      <div class="holiday-mgmt-date">${h.date}</div><div class="holiday-mgmt-day">${h.day.slice(0,3)}</div>
      <div class="holiday-mgmt-name">🏖 ${h.reason}</div>
      <button class="holiday-mgmt-remove" onclick="window.__att.removeHoliday('${h.date}')">Remove</button>
    </div>`).join('')}</div>
  <p style="font-size:.72rem;color:var(--text2);margin-top:8px">${holidays.length} holiday(s) this semester</p>`;
}
export async function removeHolidayFromMgmt(dateStr) {
  if (!confirm(`Remove holiday on ${dateStr}?`)) return;
  await removeHolidayStatus(dateStr);
}
export function openAddHolidayFromMgmt() {
  const dateStr = prompt('Enter date (YYYY-MM-DD) for the holiday:');
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return showToast('Invalid date format', 'error');
  openHolidayModal(dateStr);
}

// ── UNDO ATTENDANCE SYSTEM ──
export async function undoPeriod(period, subject) {
  const dateStr = $('att-date')?.value;
  const item = $(`period-item-${period}-${subject}`);
  if (!item || !dateStr) return;
  const existsInDB = state.attendanceRecords.some(r => r.date === dateStr && r.period === period && r.subject === subject);
  if (existsInDB) {
    const { error } = await sb().from('attendance_records').delete().eq('date', dateStr).eq('period', period).eq('subject', subject);
    if (error) return showToast('Could not undo: ' + error.message, 'error');
    state.attendanceRecords = state.attendanceRecords.filter(r => !(r.date === dateStr && r.period === period && r.subject === subject));
  }
  delete state.pendingMarks[period + '_' + subject];
  item.className = 'period-item';
  item.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
  showToast(`↩ Period ${period} mark removed`, 'info');
  if (!state.attendanceRecords.some(r => r.date === dateStr)) hideUndoDayUI();
}
export async function undoDay() {
  const dateStr = $('att-date')?.value;
  if (!dateStr) return;
  const { error } = await sb().from('attendance_records').delete().eq('date', dateStr);
  if (error) return showToast('Failed: ' + error.message, 'error');
  state.attendanceRecords = state.attendanceRecords.filter(r => r.date !== dateStr);
  state.pendingMarks = {};
  showToast('↩ Day attendance fully reset', 'info');
  loadDaySchedule();
}
export function showUndoDayConfirm() {
  const strip = $('undo-day-strip'), confirmEl = $('undo-day-confirm');
  if (strip) strip.style.display = 'none';
  if (confirmEl) confirmEl.style.display = 'flex';
}
export function hideUndoDayConfirm() {
  const strip = $('undo-day-strip'), confirmEl = $('undo-day-confirm');
  if (strip) strip.style.display = 'flex';
  if (confirmEl) confirmEl.style.display = 'none';
}
function showUndoDayUI() { const s = $('undo-day-strip'); if (s) s.style.display = 'flex'; }
function hideUndoDayUI() { const s = $('undo-day-strip'), c = $('undo-day-confirm'); if (s) s.style.display = 'none'; if (c) c.style.display = 'none'; }

// ════════════════════════════════════════
// SUBJECT MANAGEMENT MODULE (CRITICAL)
// ════════════════════════════════════════
export function renderSubjectManagement() {
  const el = $('subject-mgmt-list');
  if (!el) return;
  const stats = calcSubjectStats();
  el.innerHTML = Object.entries(state.ACTIVE_SUBJECTS).map(([key, sub]) => {
    const s = stats[key] || { present: 0, total: 0 };
    return `<div class="cn-row">
      <div class="cn-dot" style="background:${sub.color}"></div>
      <div class="cn-name">${sub.name} <span style="color:var(--text2);font-size:.7rem">(${key}, ${sub.pw} p/w)</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn" style="padding:4px 10px;font-size:.72rem" onclick="window.__att.editSubject('${key}')">✎</button>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:.72rem" onclick="window.__att.deleteSubject('${key}')">✕</button>
      </div></div>`;
  }).join('') || '<p style="color:var(--text2);text-align:center;padding:20px">No subjects yet — use the wizard in Settings.</p>';
}
export async function addOrUpdateSubject({ key, name, code, faculty, color, periods_per_week }) {
  if (!state.activeSemester) return showToast('Set up a semester first', 'error');
  const upperKey = key.toUpperCase().trim().replace(/\s+/g, '_');
  const { error } = await sb().from('semester_subjects').upsert({
    owner_id: uid(), semester_id: state.activeSemester.id, key: upperKey, name, code: code||'', faculty: faculty||'', color, periods_per_week
  }, { onConflict: 'owner_id,semester_id,key' }).select();
  if (error) {
    // Fallback for DBs without that exact unique constraint name — try insert if it's new, else update
    const exists = !!state.ACTIVE_SUBJECTS[upperKey];
    if (exists) {
      const { error: updErr } = await sb().from('semester_subjects').update({ name, code: code||'', faculty: faculty||'', color, periods_per_week }).eq('semester_id', state.activeSemester.id).eq('key', upperKey);
      if (updErr) return showToast('Failed: ' + updErr.message, 'error');
    } else {
      const { error: insErr } = await sb().from('semester_subjects').insert({ owner_id: uid(), semester_id: state.activeSemester.id, key: upperKey, name, code: code||'', faculty: faculty||'', color, periods_per_week });
      if (insErr) return showToast('Failed: ' + insErr.message, 'error');
      await sb().from('subject_initial').upsert({ owner_id: uid(), semester_id: state.activeSemester.id, subject: upperKey, present: 0, total: 0 });
    }
  }
  await loadSemesterData(); await loadAttendanceData();
  showToast('✅ Subject saved', 'success');
  renderSubjectManagement();
}
export async function deleteSubject(key) {
  if (!confirm(`Delete subject "${key}"? This also removes its attendance records for this semester.`)) return;
  await sb().from('attendance_records').delete().eq('semester_id', state.activeSemester?.id).eq('subject', key);
  await sb().from('subject_initial').delete().eq('semester_id', state.activeSemester?.id).eq('subject', key);
  await sb().from('semester_timetable').delete().eq('semester_id', state.activeSemester?.id).eq('subject_key', key);
  await sb().from('semester_subjects').delete().eq('semester_id', state.activeSemester?.id).eq('key', key);
  await loadSemesterData(); await loadAttendanceData();
  showToast('Subject deleted', 'info');
  renderSubjectManagement();
}

// ════════════════════════════════════════
// INITIAL ATTENDANCE EDITOR (mid-semester onboarding)
// ════════════════════════════════════════
export function renderInitialDataForm() {
  const el = $('initial-data-form');
  if (!el) return;
  el.innerHTML = Object.keys(state.ACTIVE_SUBJECTS).map(key => {
    const d = state.initialData[key] || { present: 0, total: 0 };
    const sub = state.ACTIVE_SUBJECTS[key];
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="color:${sub.color};font-size:.78rem;font-weight:700;flex:1">${sub.name}</span>
      <input id="init-p-${key}" type="number" min="0" value="${d.present}" style="width:60px;padding:6px;background:var(--glass);border:1px solid var(--border);border-radius:6px;color:var(--text);text-align:center">
      <span style="color:var(--text2)">/</span>
      <input id="init-t-${key}" type="number" min="0" value="${d.total}" style="width:60px;padding:6px;background:var(--glass);border:1px solid var(--border);border-radius:6px;color:var(--text);text-align:center">
    </div>`;
  }).join('') || '<p style="color:var(--text2);font-size:.85rem">No subjects to configure yet.</p>';
}
export async function saveInitialData() {
  const updates = Object.keys(state.ACTIVE_SUBJECTS).map(key => ({
    owner_id: uid(), subject: key, semester_id: state.activeSemester?.id,
    present: parseInt($('init-p-'+key)?.value || 0), total: parseInt($('init-t-'+key)?.value || 0),
    updated_at: new Date().toISOString()
  }));
  const { error } = await sb().from('subject_initial').upsert(updates, { onConflict: 'owner_id,subject,semester_id' });
  if (error) return showToast('Failed: ' + error.message, 'error');
  await loadAttendanceData();
  showToast('✅ Initial attendance saved — useful for mid-semester onboarding', 'success');
}

// ════════════════════════════════════════
// PLANNING INSIGHTS (HIGH PRIORITY)
// safe bunk calc, 75% prediction, required dates, projection
// ════════════════════════════════════════
export function renderPlanningInsights() {
  const overall = calcOverall();
  const stats = calcSubjectStats();
  const el = $('planning-insights-content');
  const badgeEl = $('planning-mode-badge');
  if (!el) return;

  if (overall.total === 0) {
    el.innerHTML = '<p style="color:var(--text2);font-size:.85rem;text-align:center;padding:24px">No attendance data yet.</p>';
    if (badgeEl) badgeEl.innerHTML = '';
    return;
  }

  const holidayDates = new Set(state.attendanceRecords.filter(r => r.is_holiday).map(r => r.date));
  const workingDays = [];
  const temp = new Date(); temp.setDate(temp.getDate() + 1);
  for (let i = 0; i < 120 && workingDays.length < 90; i++) {
    const dow = temp.getDay(), dStr = temp.toISOString().split('T')[0];
    if (dow !== 0 && !holidayDates.has(dStr)) {
      const periods = (state.ACTIVE_TIMETABLE[WEEK_DAYS[dow]] || []).length;
      if (periods > 0) workingDays.push({ date: dStr, day: WEEK_DAYS[dow], periods });
    }
    temp.setDate(temp.getDate() + 1);
  }
  const avgPerDay = workingDays.length ? workingDays.slice(0, Math.min(20, workingDays.length)).reduce((s,d) => s+d.periods, 0) / Math.min(20, workingDays.length) : 4;

  if (overall.pct >= 75) {
    const canBunk = Math.max(0, Math.floor((overall.present - 0.75 * overall.total) / 0.75));
    const bunkDays = Math.floor(canBunk / avgPerDay);
    const margin = (overall.pct - 75).toFixed(1);
    if (badgeEl) badgeEl.innerHTML = '<span style="background:rgba(0,255,136,.15);color:var(--present);padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:700">✅ Safe Zone</span>';
    const subjectRows = Object.entries(stats).filter(([,s]) => s.total > 0).map(([key,s]) => {
      const sub = state.ACTIVE_SUBJECTS[key];
      const cls = s.pct >= 75 ? 'safe' : s.pct >= 65 ? 'warn' : 'danger';
      const label = s.pct >= 75 ? `Can miss ${s.canBunk}` : `Need ${s.needed} more`;
      return `<div class="insight-subject-row"><div class="insight-dot" style="background:${sub?.color}"></div>
        <span class="insight-subname">${(sub?.name||key).split(' ').slice(0,3).join(' ')}</span>
        <span style="font-size:.7rem;color:var(--text2);margin-right:6px">${s.pct.toFixed(1)}%</span>
        <span class="insight-val ${cls}">${label}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="insights-grid">
        <div class="insight-box safe-box"><div class="insight-icon">🎉</div><div class="insight-num">${canBunk}</div><div class="insight-label">Classes You Can Skip</div></div>
        <div class="insight-box safe-box"><div class="insight-icon">📅</div><div class="insight-num">${bunkDays}</div><div class="insight-label">Safe Bunk Days</div></div>
        <div class="insight-box safe-box"><div class="insight-icon">📊</div><div class="insight-num">+${margin}%</div><div class="insight-label">Above Minimum</div></div>
      </div>
      <div class="insight-warning safe-warning">💡 You're in the <strong>safe zone</strong> — about <strong>${bunkDays} full day(s)</strong> (${canBunk} classes) of margin above 75%.</div>
      <div class="insight-subjects-list" style="margin-top:14px">${subjectRows}</div>`;
  } else {
    const needed = Math.ceil((0.75 * overall.total - overall.present) / 0.25);
    const isCrit = overall.pct < 65;
    if (badgeEl) badgeEl.innerHTML = `<span style="background:rgba(${isCrit?'255,51,102':'255,187,0'},.15);color:${isCrit?'var(--absent)':'var(--warning)'};padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:700">${isCrit?'🚨 Critical':'⚠️ Attention'}</span>`;
    let accumulated = 0, daysNeeded = 0, targetDate = null; const requiredDates = [];
    for (const d of workingDays) {
      accumulated += d.periods; daysNeeded++; requiredDates.push(d);
      if (accumulated >= needed) { targetDate = d.date; break; }
    }
    if (!targetDate) targetDate = workingDays[workingDays.length-1]?.date || null;
    const fmtTarget = targetDate ? new Date(targetDate+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Beyond 90 days';
    const pillDates = requiredDates.slice(0,6);
    const boxClass = isCrit ? 'danger-box' : 'warn-box';
    const warnClass = isCrit ? 'danger-warning' : 'warn-warning';
    el.innerHTML = `<div class="insights-grid">
        <div class="insight-box ${boxClass}"><div class="insight-icon">📚</div><div class="insight-num">${needed}</div><div class="insight-label">Classes to Attend</div></div>
        <div class="insight-box ${boxClass}"><div class="insight-icon">📅</div><div class="insight-num">${daysNeeded}</div><div class="insight-label">Consecutive Days</div></div>
        <div class="insight-box ${boxClass}"><div class="insight-icon">🎯</div><div class="insight-num" style="font-size:${fmtTarget.length>10?'.9rem':'1.4rem'}">${fmtTarget}</div><div class="insight-label">Target Date</div></div>
      </div>
      <div class="insight-warning ${warnClass}">⚠️ Attend the next <strong>${daysNeeded} school day(s)</strong> without missing a class to reach 75% by <strong>${fmtTarget}</strong>.</div>
      ${pillDates.length ? `<div class="insight-dates-list"><div style="font-size:.73rem;color:var(--text2);margin-bottom:10px;font-weight:700">📅 Must-Attend Days</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">${pillDates.map(d=>`<span class="date-pill">${new Date(d.date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})} (${d.day.slice(0,3)}) — ${d.periods}p</span>`).join('')}</div></div>` : ''}`;
  }
}

// ════════════════════════════════════════
// ATTENDANCE ALERT SYSTEM (HIGH PRIORITY)
// ════════════════════════════════════════
export function renderAlertBanners() {
  const el = $('dash-alerts');
  if (!el) return;
  const stats = calcSubjectStats();
  const low = Object.keys(stats).filter(k => stats[k].pct < 75 && stats[k].total > 0);
  const crit = low.filter(k => stats[k].pct < 65);
  el.innerHTML = (low.length ? `<div class="alert-warn">⚠️ <strong>${low.length} subject(s)</strong> below 75%: ${low.map(k=>state.ACTIVE_SUBJECTS[k]?.name?.split(' ')[0]).join(', ')}</div>` : '') +
    (crit.length ? `<div class="alert-danger">🚨 Critical attendance: ${crit.map(k=>state.ACTIVE_SUBJECTS[k]?.name?.split(' ')[0]).join(', ')}</div>` : '');
}
export function checkAndNotifyLowAttendance() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (localStorage.getItem('dash_notif_low') === 'false') return;
  const stats = calcSubjectStats();
  const low = Object.keys(stats).filter(k => stats[k].pct < 75 && stats[k].total > 0);
  if (!low.length) return;
  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('dash_last_notif_date') === today) return;
  new Notification('⚠️ Attendance Alert', { body: `${low.length} subject(s) below 75%: ${low.map(k=>state.ACTIVE_SUBJECTS[k]?.name?.split(' ')[0]).join(', ')}`, icon: 'assets/icon.svg' });
  localStorage.setItem('dash_last_notif_date', today);
}

// ════════════════════════════════════════
// ATTENDANCE CALENDAR VIEW (HIGH PRIORITY)
// ════════════════════════════════════════
let calYear, calMonth;
export function initCalendarPage() { const n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); }
export function calendarPrev() { calMonth--; if (calMonth<0){calMonth=11;calYear--;} renderCalendar(); }
export function calendarNext() { calMonth++; if (calMonth>11){calMonth=0;calYear++;} renderCalendar(); }
export function calendarToday() { const n = new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); renderCalendar(); }

export function renderCalendar() {
  const grid = $('calendar-grid'), title = $('calendar-month-title');
  if (!grid || !title) return;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent = `${months[calMonth]} ${calYear}`;
  const firstDay = new Date(calYear, calMonth, 1), lastDay = new Date(calYear, calMonth+1, 0);
  const startDow = firstDay.getDay(), daysInMonth = lastDay.getDate();
  const today = new Date().toISOString().split('T')[0];
  let html = ['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => `<div class="calendar-header-cell">${d}</div>`).join('');
  for (let i=0;i<startDow;i++) html += '<div class="calendar-cell empty"></div>';
  for (let day=1; day<=daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayRecs = state.attendanceRecords.filter(r => r.date === dateStr);
    const isToday = dateStr === today;
    const dow = new Date(dateStr+'T00:00:00').getDay();
    const dayName = WEEK_DAYS[dow];
    const hasTT = (state.ACTIVE_TIMETABLE[dayName]||[]).length > 0;
    const isHol = dayRecs.length > 0 && dayRecs.every(r => r.is_holiday);
    let cls = 'calendar-cell', pctText = '', icon = '';
    if (isToday) cls += ' today';
    if (isHol) { cls += ' cal-holiday'; icon = '🏖'; }
    else if (dow === 0 || !hasTT) cls += ' cal-noclass';
    else if (dayRecs.length > 0) {
      const p = dayRecs.filter(r=>r.status==='P'&&!r.is_holiday).length, t = dayRecs.filter(r=>!r.is_holiday).length;
      const pct = t>0 ? (p/t*100) : 0; pctText = `${pct.toFixed(0)}%`;
      if (pct >= 100) { cls += ' cal-present'; icon = '✓'; }
      else if (pct >= 75) cls += ' cal-present';
      else if (pct >= 50) cls += ' cal-partial';
      else cls += ' cal-absent';
    }
    html += `<div class="${cls}" onclick="window.__att.showCalDay('${dateStr}')"><span class="cal-day-num">${day}</span>
      ${pctText?`<span class="cal-day-pct">${pctText}</span>`:''}${icon?`<span class="cal-day-icon">${icon}</span>`:''}</div>`;
  }
  grid.innerHTML = html;
  $('calendar-day-detail') && ($('calendar-day-detail').innerHTML = '');
}
export function showCalendarDayDetail(dateStr) {
  const el = $('calendar-day-detail');
  if (!el) return;
  const dayRecs = state.attendanceRecords.filter(r => r.date === dateStr);
  const date = new Date(dateStr+'T00:00:00');
  const dayName = WEEK_DAYS[date.getDay()];
  const isHol = dayRecs.length > 0 && dayRecs.every(r => r.is_holiday);
  const fmtDate = date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'});
  if (!dayRecs.length) {
    const hasTT = (state.ACTIVE_TIMETABLE[dayName]||[]).length > 0;
    el.innerHTML = `<div class="card calendar-day-detail-card"><div class="section-h">📅 ${fmtDate}</div><p style="color:var(--text2)">${hasTT?'No attendance recorded.':'No classes scheduled.'}</p></div>`;
    return;
  }
  if (isHol) {
    const reason = dayRecs.find(r=>r.holiday_reason)?.holiday_reason || '';
    el.innerHTML = `<div class="card calendar-day-detail-card"><div class="section-h">📅 ${fmtDate}</div><div class="holiday-banner">🏖 Holiday${reason?': '+reason:''}</div></div>`;
    return;
  }
  const p = dayRecs.filter(r=>r.status==='P').length, t = dayRecs.length, pct = t>0?(p/t*100):0;
  el.innerHTML = `<div class="card calendar-day-detail-card"><div class="section-h">📅 ${fmtDate}
      <span style="color:${pct>=75?'var(--present)':pct>=50?'var(--warning)':'var(--absent)'};margin-left:10px">${pct.toFixed(0)}%</span></div>
    <div class="history-periods" style="margin-bottom:8px">${dayRecs.sort((a,b)=>a.period-b.period).map(r=>`<span class="hist-badge hist-${r.status.toLowerCase()}">P${r.period} ${r.subject} ${r.status}</span>`).join('')}</div>
    <p style="font-size:.78rem;color:var(--text2)">${p} present, ${t-p} absent of ${t}</p></div>`;
}

// ════════════════════════════════════════
// STREAK TRACKER (MEDIUM PRIORITY)
// ════════════════════════════════════════
export function calcStreak() {
  const dates = [...new Set(state.attendanceRecords.filter(r=>!r.is_holiday).map(r=>r.date))].sort().reverse();
  let current = 0, best = 0, temp = 0;
  for (const date of dates) {
    const recs = state.attendanceRecords.filter(r=>r.date===date&&!r.is_holiday);
    const p = recs.filter(r=>r.status==='P').length;
    if (recs.length && p === recs.length) current++; else break;
  }
  [...dates].reverse().forEach(date => {
    const recs = state.attendanceRecords.filter(r=>r.date===date&&!r.is_holiday);
    const p = recs.filter(r=>r.status==='P').length;
    if (recs.length && p === recs.length) { temp++; best = Math.max(best, temp); } else temp = 0;
  });
  return { current, best };
}
export function renderStreak() {
  const el = $('streak-content');
  if (!el) return;
  const s = calcStreak();
  const fire = s.current >= 10 ? '🔥🔥🔥' : s.current >= 5 ? '🔥🔥' : s.current >= 1 ? '🔥' : '❄️';
  el.innerHTML = `<div class="streak-banner"><div class="streak-fire">${fire}</div>
    <div class="streak-info"><div class="streak-count">${s.current} day${s.current!==1?'s':''}</div>
      <div class="streak-label">${s.current>0?'Perfect attendance streak!':'No active streak — attend 100% to start one!'}</div></div>
    <div class="streak-best">🏆 Best: ${s.best}</div></div>`;
}

// ════════════════════════════════════════
// WEEKLY GOAL RING (MEDIUM PRIORITY)
// ════════════════════════════════════════
export function renderWeeklyGoal() {
  const el = $('weekly-goal-content');
  if (!el) return;
  const now = new Date(); const dow = now.getDay();
  const monday = new Date(now); monday.setDate(now.getDate() - (dow===0?6:dow-1));
  const todayStr = now.toISOString().split('T')[0];
  const weekDays = [];
  for (let i=0;i<6;i++) {
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    const dStr = d.toISOString().split('T')[0];
    const dayRecs = state.attendanceRecords.filter(r=>r.date===dStr&&!r.is_holiday);
    const isHol = state.attendanceRecords.some(r=>r.date===dStr&&r.is_holiday);
    const p = dayRecs.filter(r=>r.status==='P').length, t = dayRecs.length;
    let status = 'future';
    if (isHol) status = 'holiday';
    else if (dStr < todayStr && t>0) status = p===t ? 'attended' : 'missed';
    else if (dStr === todayStr) status = t>0 ? (p===t?'attended':'missed') : 'today';
    weekDays.push({ date: dStr, day: ['M','T','W','T','F','S'][i], present: p, total: t, status });
  }
  const wP = weekDays.reduce((s,d)=>s+d.present,0), wT = weekDays.reduce((s,d)=>s+d.total,0);
  const wPct = wT>0 ? (wP/wT*100) : 0;
  const circ = 2*Math.PI*34, offset = circ - (wPct/100)*circ;
  const ringColor = wPct>=75?'var(--present)':wPct>=50?'var(--warning)':wT>0?'var(--absent)':'var(--text2)';
  el.innerHTML = `<div class="weekly-goal-card">
    <div class="goal-ring-wrap"><svg viewBox="0 0 80 80" width="80" height="80">
      <circle class="goal-ring-track" cx="40" cy="40" r="34"/>
      <circle class="goal-ring-fill" cx="40" cy="40" r="34" stroke="${ringColor}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg>
      <div class="goal-ring-center" style="color:${ringColor}">${wT>0?wPct.toFixed(0)+'%':'—'}</div></div>
    <div class="goal-details"><div class="goal-title">📅 This Week</div>
      <div class="goal-stats">${wP} / ${wT} classes attended</div>
      <div class="goal-days">${weekDays.map(d => {
        let c='goal-day-dot'; if(d.status==='attended')c+=' g-attended'; else if(d.status==='missed')c+=' g-missed'; else if(d.status==='today')c+=' g-today'; else if(d.status==='holiday')c+=' g-holiday';
        return `<div class="${c}" title="${d.date}">${d.day}</div>`;
      }).join('')}</div></div></div>`;
}

// ════════════════════════════════════════
// RECENT ACTIVITY FEED (MEDIUM PRIORITY)
// ════════════════════════════════════════
export function renderRecentActivity() {
  const el = $('recent-activity');
  if (!el) return;
  const recentDays = [...new Set(state.attendanceRecords.map(r=>r.date))].sort().reverse().slice(0,7);
  if (!recentDays.length) { el.innerHTML = '<p style="color:var(--text2);text-align:center;padding:24px">No attendance yet.</p>'; return; }
  el.innerHTML = '<div class="history-list">' + recentDays.map(date => {
    const dayRecs = state.attendanceRecords.filter(r=>r.date===date);
    const p = dayRecs.filter(r=>r.status==='P').length, t = dayRecs.length;
    const dow = WEEK_DAYS[new Date(date+'T00:00:00').getDay()];
    return `<div class="history-item"><div class="history-date">${date.split('-').slice(1).join('/')}</div><div class="history-day">${dow}</div>
      <div class="history-periods">${dayRecs.map(r=>`<span class="hist-badge hist-${r.status.toLowerCase()}">${r.subject} ${r.status}</span>`).join('')}</div>
      <div class="history-pct" style="color:${p/t>=.75?'var(--present)':p/t>=.5?'var(--warning)':'var(--absent)'}">${(p/t*100).toFixed(0)}%</div></div>`;
  }).join('') + '</div>';
}

// ════════════════════════════════════════
// SEMESTER ARCHIVE HISTORY (MEDIUM PRIORITY)
// ════════════════════════════════════════
export async function renderArchive() {
  const el = $('archive-list');
  if (!el) return;
  const completed = state.allSemesters.filter(s => s.status === 'completed');
  if (!completed.length) { el.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px">No archived semesters yet.</p>'; return; }
  const html = await Promise.all(completed.map(async sem => {
    const { data: recs } = await sb().from('attendance_records').select('*').eq('semester_id', sem.id);
    const semRecs = recs || [];
    const present = semRecs.filter(r=>r.status==='P'&&!r.is_holiday).length;
    const total = semRecs.filter(r=>!r.is_holiday).length;
    const pct = total>0 ? (present/total*100) : 0;
    const days = [...new Set(semRecs.map(r=>r.date))].length;
    const color = pct>=75?'var(--present)':pct>=65?'var(--warning)':'var(--absent)';
    return `<div class="archive-sem-block">
      <div class="archive-sem-header" onclick="window.__att.toggleArchive('arch-${sem.id}')">
        <div><div class="archive-sem-name">${sem.name}</div><div class="archive-sem-meta">${sem.start_date} → ${sem.end_date} • ${days} days</div></div>
        <div style="display:flex;align-items:center;gap:12px"><div style="font-weight:700;color:${color}">${pct.toFixed(1)}%</div><span>▾</span></div></div>
      <div class="archive-sem-body" id="arch-${sem.id}">
        <div class="archive-stats-row">
          <div class="archive-stat"><div class="val" style="color:var(--present)">${present}</div><div class="lbl">Present</div></div>
          <div class="archive-stat"><div class="val" style="color:var(--absent)">${total-present}</div><div class="lbl">Absent</div></div>
          <div class="archive-stat"><div class="val">${total}</div><div class="lbl">Total</div></div>
          <div class="archive-stat"><div class="val" style="color:${color}">${pct.toFixed(1)}%</div><div class="lbl">Attendance</div></div>
        </div></div></div>`;
  }));
  el.innerHTML = html.join('');
}
export function toggleArchiveBlock(id) { $(id)?.classList.toggle('open'); }

// ════════════════════════════════════════
// DANGER ZONE — Export / Clear (MEDIUM PRIORITY)
// ════════════════════════════════════════
export function exportDataCSV() {
  const stats = calcSubjectStats(); const overall = calcOverall();
  const csv = ['Subject,Present,Total,Percentage',
    ...Object.entries(stats).map(([k,s]) => `${state.ACTIVE_SUBJECTS[k]?.name||k},${s.present},${s.total},${s.pct.toFixed(2)}%`),
    `OVERALL,${overall.present},${overall.total},${overall.pct.toFixed(2)}%`].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'attendance_export_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  showToast('📤 Exported!', 'success');
}
export async function clearAllHistory() {
  if (!confirm('⚠️ Delete ALL attendance records for the active semester? This cannot be undone!')) return;
  if (!confirm('Are you absolutely sure? Type-confirm by clicking OK again.')) return;
  const { error } = await sb().from('attendance_records').delete().eq('semester_id', state.activeSemester?.id);
  if (error) return showToast('Failed: ' + error.message, 'error');
  state.attendanceRecords = [];
  showToast('History cleared', 'info');
}

export { PERIOD_TIMES };

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

// ════════════════════════════════════════
// SEMESTER MANAGEMENT (CRITICAL) — active dashboard, days remaining,
// status, end-semester workflow, expiry detection
// ════════════════════════════════════════
export function checkSemesterExpiry() {
  const bannerEl = $('sem-expiry-banner');
  if (!bannerEl) return;
  if (!state.activeSemester) { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; return; }
  const today = new Date().toISOString().split('T')[0];
  if (state.activeSemester.end_date < today && state.activeSemester.status === 'active') {
    bannerEl.style.display = 'block';
    bannerEl.innerHTML = `<div class="expiry-banner">⏰ Your semester <strong>${state.activeSemester.name}</strong> ended on ${state.activeSemester.end_date}. Archive it to start a new one.
      <button onclick="window.__att.openEndSemModal()">Archive & Start New →</button></div>`;
  } else { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; }
}

export function renderSemesterManagement() {
  const el = $('sem-management-content');
  if (!el) return;
  if (!state.activeSemester) {
    el.innerHTML = `<div class="alert-warn" style="margin-bottom:16px">⚠️ No active semester. Set one up to start tracking.</div>
      <button class="btn btn-primary" onclick="window.__wizard.openFresh()">🚀 Launch Semester Wizard</button>`;
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = Math.max(0, Math.round((new Date(state.activeSemester.end_date) - new Date(today)) / 86400000));
  const expired = state.activeSemester.end_date < today;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <div>
        <div style="font-weight:700;color:#c084fc">${state.activeSemester.name}</div>
        <div style="font-size:.8rem;color:var(--text2)">${state.activeSemester.start_date} → ${state.activeSemester.end_date}</div>
        <div style="font-size:.78rem;margin-top:4px;color:${expired?'var(--absent)':daysLeft<30?'var(--warning)':'var(--present)'}">${expired?'⚠️ Semester ended':daysLeft+' days remaining'}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-purple" onclick="window.__wizard.openFresh()">+ New Semester</button>
        <button class="btn btn-danger" onclick="window.__att.openEndSemModal()">🗃 Archive This Semester</button>
      </div>
    </div>
    <div style="font-size:.8rem;color:var(--text2)">Total semesters: <strong style="color:var(--text)">${state.allSemesters.length}</strong> • Completed: <strong style="color:var(--text)">${state.allSemesters.filter(s=>s.status==='completed').length}</strong></div>`;
}
export function openEndSemModal() {
  if (!state.activeSemester) return;
  $('end-sem-msg') && ($('end-sem-msg').innerHTML = `This will mark <strong style="color:#c084fc">${state.activeSemester.name}</strong> as <strong>Completed</strong> and archive its records. View it later in History → Archive.`);
  document.getElementById('end-sem-modal')?.classList.add('show');
}
export function closeEndSemModal() { document.getElementById('end-sem-modal')?.classList.remove('show'); }
export async function confirmEndSemester(onDone) {
  closeEndSemModal();
  await archiveActiveSemester();
  showToast('✅ Semester archived!', 'success');
  state.ACTIVE_SUBJECTS = {}; state.ACTIVE_TIMETABLE = {}; state.attendanceRecords = []; state.initialData = {};
  if (onDone) await onDone();
}

export { PERIOD_TIMES };
