// js/wizard.js — CRITICAL feature: Semester Setup Wizard.
// 4 steps: Semester Info → Subjects → Timetable Builder → Confirm.
// Calls the existing Attendance.createSemester() backend function —
// no duplicate logic, reuses what's already there.

import { showToast, $ } from './ui.js';
import * as Attendance from './attendance.js';

const STEPS = ['Semester Info', 'Subjects', 'Timetable', 'Confirm'];
const PRESET_COLORS = ['#00d4ff','#a855f7','#f97316','#22c55e','#eab308','#ec4899','#06b6d4','#10b981','#f43f5e','#8b5cf6'];
const PERIODS = [1,2,3,4,5,6];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

let step = 1;
let draft = { name: '', start_date: '', end_date: '', subjects: [], timetable: {} };
let onFinishCb = null;

export function openWizard(onFinish) {
  onFinishCb = onFinish;
  step = 1;
  draft = { name: '', start_date: '', end_date: '', subjects: [], timetable: {} };
  document.getElementById('wizard-overlay')?.classList.add('show');
  renderStep();
}

export function closeWizard(force = false) {
  if (force || Attendance.state.activeSemester) {
    document.getElementById('wizard-overlay')?.classList.remove('show');
  }
}

function renderStep() {
  const ind = $('wizard-steps-indicator');
  if (ind) {
    ind.innerHTML = STEPS.map((s, i) => {
      const n = i + 1;
      const cls = n < step ? 'done' : n === step ? 'active' : '';
      const lineClass = n < step ? 'done' : '';
      return (i > 0 ? `<div class="wizard-step-line ${lineClass}"></div>` : '') +
        `<div class="wizard-step-dot ${cls}" title="${s}">${n < step ? '✓' : n}</div>`;
    }).join('');
  }
  $('wizard-subtitle') && ($('wizard-subtitle').textContent = `Step ${step} of ${STEPS.length}: ${STEPS[step-1]}`);

  const content = $('wizard-content');
  const footer = $('wizard-footer');
  if (!content || !footer) return;

  if (step === 1) {
    content.innerHTML = step1HTML();
    footer.innerHTML = `${Attendance.state.activeSemester ? '<button class="btn" onclick="window.__wizard.close()">Cancel</button>' : ''}
      <button class="btn btn-primary" onclick="window.__wizard.next1()">Next: Subjects →</button>`;
  } else if (step === 2) {
    content.innerHTML = step2HTML();
    footer.innerHTML = `<button class="btn" onclick="window.__wizard.back()">← Back</button>
      <button class="btn btn-primary" onclick="window.__wizard.next2()">Next: Timetable →</button>`;
  } else if (step === 3) {
    content.innerHTML = step3HTML();
    footer.innerHTML = `<button class="btn" onclick="window.__wizard.back()">← Back</button>
      <button class="btn btn-primary" onclick="window.__wizard.next3()">Next: Confirm →</button>`;
  } else if (step === 4) {
    content.innerHTML = step4HTML();
    footer.innerHTML = `<button class="btn" onclick="window.__wizard.back()">← Back</button>
      <button class="save-btn" style="max-width:none;flex:0 0 auto;padding:12px 28px" onclick="window.__wizard.finish()">🚀 Create Semester</button>`;
  }
}

// ── Step 1: Semester Info ──
function step1HTML() {
  return `
  <div class="wizard-field"><label class="wizard-label">Semester Name</label>
    <input id="w-name" class="cute-input" placeholder="e.g. III B.Tech Sem 1 (2026-27)" value="${draft.name}"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="wizard-field"><label class="wizard-label">Start Date</label><input id="w-start" class="cute-input" type="date" value="${draft.start_date}"></div>
    <div class="wizard-field"><label class="wizard-label">End Date</label><input id="w-end" class="cute-input" type="date" value="${draft.end_date}"></div>
  </div>`;
}
function next1() {
  const name = $('w-name').value.trim(), sd = $('w-start').value, ed = $('w-end').value;
  if (!name) return showToast('Enter a semester name', 'error');
  if (!sd || !ed) return showToast('Enter both dates', 'error');
  if (sd >= ed) return showToast('End date must be after start date', 'error');
  draft.name = name; draft.start_date = sd; draft.end_date = ed;
  step++; renderStep();
}

// ── Step 2: Subjects ──
function step2HTML() {
  if (!draft.subjects.length) draft.subjects = [{ key:'', name:'', code:'', faculty:'', color: PRESET_COLORS[0], periods_per_week: 4 }];
  return `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:.82rem;color:var(--text2)">Define subjects for this semester</span>
    <button class="btn btn-primary" onclick="window.__wizard.addSubjRow()" style="font-size:.78rem;padding:6px 12px">+ Add Subject</button>
  </div>
  <div style="overflow-x:auto"><table class="sub-table">
    <thead><tr><th>KEY</th><th>NAME</th><th>FACULTY</th><th>COLOR</th><th>P/W</th><th></th></tr></thead>
    <tbody id="wizard-sub-tbody">${draft.subjects.map((s,i) => subjRowHTML(s,i)).join('')}</tbody>
  </table></div>
  <p style="font-size:.7rem;color:var(--text2);margin-top:10px">KEY = short unique code (e.g. DAA, OS, WT_LAB). P/W = periods per week.</p>`;
}
function subjRowHTML(s, i) {
  const colorOpts = PRESET_COLORS.map(c => `<option value="${c}" ${s.color===c?'selected':''} style="background:${c};color:#000">${c}</option>`).join('');
  return `<tr id="sub-row-${i}">
    <td><input value="${s.key}" onchange="window.__wizard.upd(${i},'key',this.value.toUpperCase().trim().replace(/\\s+/g,'_'))" style="width:80px"></td>
    <td><input value="${s.name}" onchange="window.__wizard.upd(${i},'name',this.value)" style="width:160px"></td>
    <td><input value="${s.faculty}" onchange="window.__wizard.upd(${i},'faculty',this.value)" style="width:120px"></td>
    <td><select onchange="window.__wizard.upd(${i},'color',this.value)" style="background:${s.color};color:#000">${colorOpts}</select></td>
    <td><input type="number" min="1" max="10" value="${s.periods_per_week}" onchange="window.__wizard.upd(${i},'periods_per_week',parseInt(this.value)||0)" style="width:50px"></td>
    <td><button class="del-btn" onclick="window.__wizard.delSubjRow(${i})">✕</button></td>
  </tr>`;
}
function addSubjRow() {
  draft.subjects.push({ key:'', name:'', code:'', faculty:'', color: PRESET_COLORS[draft.subjects.length % PRESET_COLORS.length], periods_per_week: 4 });
  $('wizard-sub-tbody').innerHTML = draft.subjects.map((s,i) => subjRowHTML(s,i)).join('');
}
function delSubjRow(i) { draft.subjects.splice(i,1); $('wizard-sub-tbody').innerHTML = draft.subjects.map((s,idx) => subjRowHTML(s,idx)).join(''); }
function updSubj(i, field, val) { if (draft.subjects[i]) draft.subjects[i][field] = val; }
function next2() {
  const valid = draft.subjects.filter(s => s.key && s.name);
  if (!valid.length) return showToast('Add at least one subject with KEY and NAME', 'error');
  const keys = valid.map(s => s.key);
  if (new Set(keys).size !== keys.length) return showToast('Subject KEYs must be unique', 'error');
  draft.subjects = valid;
  step++; renderStep();
}

// ── Step 3: Timetable Builder ──
function step3HTML() {
  if (!Object.keys(draft.timetable).length) DAYS.forEach(d => draft.timetable[d] = []);
  return `
  <p style="font-size:.82rem;color:var(--text2);margin-bottom:12px">Assign subjects to each period slot, day by day.</p>
  ${DAYS.map(day => `
    <div class="wizard-tt-day">
      <div class="wizard-tt-day-hd"><span class="wizard-tt-day-name">${day.toUpperCase()}</span>
        <button class="tt-add-btn" onclick="window.__wizard.addPeriod('${day}')">+ Add Period</button></div>
      <div class="wizard-tt-periods" id="tt-${day}">${(draft.timetable[day]||[]).map((p,i) => periodRowHTML(day,i,p)).join('')}</div>
    </div>`).join('')}`;
}
function subjOptions(selected) {
  return `<option value="">— None —</option>` + draft.subjects.map(s => `<option value="${s.key}" ${s.key===selected?'selected':''}>${s.key} – ${s.name.split(' ').slice(0,3).join(' ')}</option>`).join('');
}
function periodRowHTML(day, i, p) {
  const periodOpts = PERIODS.map(n => `<option value="${n}" ${p.period===n?'selected':''}>${n}</option>`).join('');
  return `<div class="wizard-tt-period-row" id="tt-row-${day}-${i}">
    <span style="font-size:.78rem;color:var(--text2);width:20px">P</span>
    <select onchange="window.__wizard.updPeriod('${day}',${i},'period',parseInt(this.value))" style="width:60px">${periodOpts}</select>
    <select onchange="window.__wizard.updPeriod('${day}',${i},'subject',this.value)" style="flex:1">${subjOptions(p.subject)}</select>
    <button class="tt-rem-btn" onclick="window.__wizard.delPeriod('${day}',${i})">✕</button>
  </div>`;
}
function addPeriod(day) {
  const used = (draft.timetable[day]||[]).map(p => p.period);
  const next = PERIODS.find(n => !used.includes(n)) || 1;
  draft.timetable[day] = draft.timetable[day] || [];
  draft.timetable[day].push({ period: next, subject: '' });
  renderDayPeriods(day);
}
function delPeriod(day, i) { draft.timetable[day].splice(i,1); renderDayPeriods(day); }
function updPeriod(day, i, field, val) { if (draft.timetable[day][i]) draft.timetable[day][i][field] = val; }
function renderDayPeriods(day) {
  const el = $('tt-' + day);
  if (el) el.innerHTML = (draft.timetable[day]||[]).map((p,i) => periodRowHTML(day,i,p)).join('');
}
function next3() {
  const hasAny = Object.values(draft.timetable).some(periods => periods.some(p => p.subject));
  if (!hasAny && !confirm('No timetable entries set. Continue without a timetable?')) return;
  step++; renderStep();
}

// ── Step 4: Confirm ──
function step4HTML() {
  const subList = draft.subjects.map(s => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <div style="width:10px;height:10px;border-radius:50%;background:${s.color}"></div>
      <span style="font-weight:700;color:${s.color}">${s.key}</span><span>${s.name}</span>
      <span style="margin-left:auto;color:var(--text2);font-size:.72rem">${s.periods_per_week} p/w</span>
    </div>`).join('');
  const ttSummary = Object.entries(draft.timetable).filter(([,ps]) => ps.some(p=>p.subject)).map(([day,ps]) =>
    `<div style="font-size:.8rem;margin-bottom:4px"><strong style="color:var(--primary)">${day.slice(0,3).toUpperCase()}</strong>: ${ps.filter(p=>p.subject).map(p=>`P${p.period}:${p.subject}`).join(', ')}</div>`).join('');
  return `
  <div class="confirm-section"><h4>🎓 Semester</h4>
    <div style="font-weight:700">${draft.name}</div><div style="color:var(--text2);font-size:.8rem">${draft.start_date} → ${draft.end_date}</div></div>
  <div class="confirm-section"><h4>📚 Subjects (${draft.subjects.length})</h4>${subList}</div>
  <div class="confirm-section"><h4>📋 Timetable</h4>${ttSummary || '<span style="color:var(--text2)">No entries</span>'}</div>
  <div style="padding:12px;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.2);border-radius:10px;font-size:.8rem;color:var(--present)">
    ✅ This creates the semester in Supabase. All future attendance tracks under it.</div>`;
}

async function finish() {
  try {
    const subjects = draft.subjects.map(s => ({ key: s.key, name: s.name, code: s.code||'', faculty: s.faculty||'', color: s.color, periods_per_week: s.periods_per_week }));
    await Attendance.createSemester(draft.name, draft.start_date, draft.end_date, subjects, draft.timetable);
    showToast('🎉 Semester created!', 'success');
    closeWizard(true);
    if (onFinishCb) await onFinishCb();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}
function back() { step--; renderStep(); }

window.__wizard = {
  next1, next2, next3, finish, back, close: () => closeWizard(),
  addSubjRow, delSubjRow, upd: updSubj,
  addPeriod, delPeriod, updPeriod,
  openFresh: () => { if (window.__wizardOnFinish) openWizard(window.__wizardOnFinish); }
};
