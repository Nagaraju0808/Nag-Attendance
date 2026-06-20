// js/app.js — main entry point (loaded as type="module" from index.html)
import { initAuth, isLoggedIn, getCurrentUser, logout, renderLoginScreen } from './auth.js';
import { loadProfile, profileNeedsSetup, renderSetupWizard, getProfile, profileInitials, saveProfile } from './profile.js';
import { navigate, toggleSidebar, closeSidebar, loadTheme, toggleTheme, setTheme, showToast, $ } from './ui.js';
import * as Attendance from './attendance.js';
import * as Results from './result-tracker.js';
import * as Cal from './calendar.js';
import * as Wizard from './wizard.js';

window.__att = {
  mark: Attendance.markPeriod,
  save: Attendance.saveAttendance,
  holiday: Attendance.toggleHolidayForDate,
  undoPeriod: Attendance.undoPeriod,
  showUndoDayConfirm: Attendance.showUndoDayConfirm,
  hideUndoDayConfirm: Attendance.hideUndoDayConfirm,
  undoDay: async () => { await Attendance.undoDay(); },
  closeHolidayModal: Attendance.closeHolidayModal,
  updateHolidayPreview: Attendance.updateHolidayPreview,
  submitHolidayMark: Attendance.submitHolidayMark,
  removeHoliday: async (date) => { await Attendance.removeHolidayFromMgmt(date); Attendance.renderHolidayManagement(); },
  openAddHoliday: Attendance.openAddHolidayFromMgmt,
  showCalDay: Attendance.showCalendarDayDetail,
  calPrev: Attendance.calendarPrev,
  calNext: Attendance.calendarNext,
  calToday: Attendance.calendarToday,
  toggleArchive: Attendance.toggleArchiveBlock,
  exportCSV: Attendance.exportDataCSV,
  clearHistory: Attendance.clearAllHistory,
  saveInitialData: async () => { await Attendance.saveInitialData(); },
  openEndSemModal: Attendance.openEndSemModal,
  closeEndSemModal: Attendance.closeEndSemModal,
  confirmEndSem: () => Attendance.confirmEndSemester(async () => { await initData(); navigate('settings'); }),
  editSubject: (key) => openSubjectEditor(key),
  deleteSubject: async (key) => { await Attendance.deleteSubject(key); },
  enableBrowserNotif: async () => {
    if (!('Notification' in window)) return showToast('Not supported in this browser', 'error');
    const perm = await Notification.requestPermission();
    showToast(perm === 'granted' ? '🔔 Notifications enabled' : 'Permission ' + perm, perm === 'granted' ? 'success' : 'info');
  },
  saveSubject: async () => {
    await Attendance.addOrUpdateSubject({
      key: $('subj-key').value, name: $('subj-name').value, code: $('subj-code').value,
      faculty: $('subj-faculty').value, color: $('subj-color').value, periods_per_week: parseInt($('subj-pw').value) || 0
    });
    closeSubjectEditor();
  }
};
window.__results = {
  edit: (id) => editResult(id),
  remove: async (id) => { await Results.deleteSemesterResult(id); Results.renderResultsDashboard(); showToast('Deleted', 'info'); },
  removeBacklog: async (id) => { await Results.removeBacklog(id); Results.renderBacklogPanel(); }
};
window.navigate = navigate;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleTheme = toggleTheme;
window.setThemeMode = (m) => setTheme(m);
window.logoutApp = async () => { await logout(); location.reload(); };
window.__wizardOnFinish = async () => { await initData(); navigate('dashboard'); };

async function boot() {
  await initAuth();
  const root = $('app-root');

  if (!isLoggedIn()) {
    renderLoginScreen(root, boot);
    return;
  }

  await loadProfile();
  if (profileNeedsSetup()) {
    renderSetupWizard(root, boot);
    return;
  }

  renderShell(root);
  loadTheme();
  await initData();
  wireEvents();
  navigate(location.hash.replace('#', '') || 'dashboard');
  Cal.loadReminders().then(() => Cal.checkDueReminders());
  Cal.initGoogleAuth(() => { if (location.hash.replace('#','') === 'calendar') renderCalendarPage(); });
  showToast(`👋 Welcome, ${getProfile().full_name.split(' ')[0]}!`, 'info');
}

async function initData() {
  const result = await Attendance.loadSemesterData();
  await Attendance.loadAttendanceData();
  await Results.loadResults();
  updateSidebarProfile();
  if (result === 'needs-wizard') {
    showToast('Set up your first semester to start tracking attendance', 'info');
    setTimeout(() => Wizard.openWizard(window.__wizardOnFinish), 500);
  } else {
    Attendance.checkAndNotifyLowAttendance();
  }
}

function updateSidebarProfile() {
  const p = getProfile();
  $('sidebar-avatar') && ($('sidebar-avatar').textContent = profileInitials());
  $('sidebar-name') && ($('sidebar-name').textContent = p.full_name);
  $('sidebar-meta') && ($('sidebar-meta').textContent = [p.branch, p.section, p.semester].filter(Boolean).join(' • '));
}

function renderShell(root) {
  root.innerHTML = SHELL_HTML;
  const sel = document.querySelector('[data-grade-select]');
  if (sel) sel.innerHTML = GRADE_OPTIONS_HTML();
}

function wireEvents() {
  window.addEventListener('app:navigate', (e) => {
    const page = e.detail.page;
    if (page === 'dashboard') Attendance.renderDashboard();
    if (page === 'mark') Attendance.initMarkPage();
    if (page === 'subjects') Attendance.renderSubjectManagement();
    if (page === 'timetable') Attendance.renderTimetable();
    if (page === 'attcal') { Attendance.initCalendarPage(); Attendance.renderCalendar(); }
    if (page === 'analytics') Attendance.renderAnalytics();
    if (page === 'history') Attendance.renderHistory();
    if (page === 'results') Results.renderResultsDashboard();
    if (page === 'backlog') Results.renderBacklogPanel();
    if (page === 'calendar') renderCalendarPage();
    if (page === 'settings') renderSettingsPage();
  });

  document.body.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-page]');
    if (navEl) navigate(navEl.dataset.page);
  });
  document.body.addEventListener('change', (e) => {
    if (e.target.id === 'att-date') Attendance.loadDaySchedule();
  });
  document.body.addEventListener('click', (e) => {
    if (e.target.id === 'save-btn') Attendance.saveAttendance();
    if (e.target.id === 'holiday-toggle-btn') Attendance.toggleHolidayForDate();
  });
}

function renderCalendarPage() {
  const list = Cal.getReminders();
  const statusEl = $('gcal-status');
  if (statusEl) {
    statusEl.innerHTML = Cal.isGoogleConnected()
      ? `<span style="color:var(--present)">🟢 Connected to Google Calendar</span> <button class="btn" style="padding:3px 10px;font-size:.72rem;margin-left:8px" onclick="window.__cal.disconnect()">Disconnect</button>`
      : `<span style="color:var(--text2)">⚪ Not connected</span> <button class="btn btn-primary" style="padding:3px 10px;font-size:.72rem;margin-left:8px" onclick="window.__cal.connect()">🔗 Connect Google Calendar</button>`;
  }
  const el = $('reminders-list');
  if (el) {
    el.innerHTML = list.length ? list.map(r => `
      <div class="history-item">
        <div class="history-date">${r.due_date}</div>
        <div class="history-periods">${r.type === 'exam' ? '📝' : r.type === 'assignment' ? '📋' : '📚'} ${r.title}</div>
        <div style="display:flex;gap:6px">
          <a href="${Cal.googleCalendarLink(r)}" target="_blank" class="btn" style="padding:4px 10px;font-size:.72rem">+ Google Cal</a>
          <button class="btn btn-danger" style="padding:4px 10px;font-size:.72rem" onclick="window.__cal.del('${r.id}')">✕</button>
        </div>
      </div>`).join('') : '<p style="color:var(--text2);text-align:center;padding:30px">No reminders yet.</p>';
  }
}
window.__cal = {
  del: async (id) => { await Cal.deleteReminder(id); renderCalendarPage(); },
  connect: () => Cal.connectGoogleCalendar(),
  disconnect: () => { Cal.disconnectGoogleCalendar(); renderCalendarPage(); },
  syncAll: () => Cal.syncAllRemindersToGoogle(),
  addForm: async () => {
    const title = $('rem-title').value.trim();
    const type = $('rem-type').value;
    const date = $('rem-date').value;
    if (!title || !date) return showToast('Title and date required', 'error');
    await Cal.addReminder({ title, type, due_date: date, due_time: $('rem-time').value, notes: $('rem-notes').value });
    $('rem-title').value = ''; $('rem-notes').value = '';
    renderCalendarPage();
    showToast('Reminder added', 'success');
  },
  exportICS: () => Cal.downloadICS(),
  enableNotif: async () => {
    const perm = await Cal.requestNotifPermission();
    showToast(perm === 'granted' ? '🔔 Notifications enabled' : 'Permission ' + perm, perm === 'granted' ? 'success' : 'info');
  }
};

function renderSettingsPage() {
  const p = getProfile();
  const el = $('settings-profile-form');
  if (el) {
    el.innerHTML = `
      <div class="wizard-field"><label class="wizard-label">Full Name</label><input id="s-name" class="cute-input" value="${p.full_name||''}"></div>
      <div class="wizard-field"><label class="wizard-label">Roll Number</label><input id="s-roll" class="cute-input" value="${p.roll_number||''}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="wizard-field"><label class="wizard-label">Branch</label><input id="s-branch" class="cute-input" value="${p.branch||''}"></div>
        <div class="wizard-field"><label class="wizard-label">Section</label><input id="s-section" class="cute-input" value="${p.section||''}"></div>
      </div>
      <button class="btn btn-primary" onclick="window.__settings.save()">💾 Save Profile</button>`;
  }
  const userEl = $('settings-user-email');
  if (userEl) userEl.textContent = getCurrentUser()?.email || '—';
  Attendance.renderSemesterManagement();
  Attendance.renderInitialDataForm();
  Attendance.renderHolidayManagement();
  const savedTheme = localStorage.getItem('dashboard_theme') || 'system';
  document.querySelectorAll('[data-theme-option]').forEach(b => b.classList.toggle('active', b.dataset.themeOption === savedTheme));
  const notifToggle = $('notif-low-toggle');
  if (notifToggle) notifToggle.checked = localStorage.getItem('dash_notif_low') !== 'false';
}

function openSubjectEditor(key) {
  const card = $('subject-editor-card');
  if (!card) return;
  card.style.display = 'block';
  if (key) {
    const sub = Attendance.state.ACTIVE_SUBJECTS[key] || {};
    $('subject-editor-title').textContent = 'Edit Subject: ' + key;
    $('subj-original-key').value = key;
    $('subj-key').value = key; $('subj-key').disabled = true;
    $('subj-name').value = sub.name || ''; $('subj-code').value = sub.code || '';
    $('subj-faculty').value = sub.faculty || ''; $('subj-color').value = sub.color || '#00d4ff';
    $('subj-pw').value = sub.pw || 4;
  } else {
    $('subject-editor-title').textContent = 'Add Subject';
    $('subj-original-key').value = '';
    ['subj-key','subj-name','subj-code','subj-faculty'].forEach(id => $(id).value = '');
    $('subj-key').disabled = false; $('subj-color').value = '#00d4ff'; $('subj-pw').value = 4;
  }
}
function closeSubjectEditor() {
  const card = $('subject-editor-card');
  if (card) card.style.display = 'none';
  Attendance.renderSubjectManagement();
}

window.__att.switchHistTab = (tab, btn) => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  $('hist-tab-' + tab)?.classList.add('active');
  if (tab === 'archive') Attendance.renderArchive();
};
window.__settings = {
  save: async () => {
    await saveProfile({
      full_name: $('s-name').value.trim(), roll_number: $('s-roll').value.trim(),
      branch: $('s-branch').value.trim(), section: $('s-section').value.trim()
    });
    updateSidebarProfile();
    showToast('✅ Profile updated', 'success');
  }
};

async function editResult(id) {
  navigate('results');
  showToast('Edit the form below using the same semester label, then Save to overwrite', 'info');
}

const SHELL_HTML = `
<div id="overlay" class="overlay" onclick="closeSidebar()"></div>
<div id="app" style="display:flex">
  <nav id="sidebar">
    <div class="sidebar-logo">
      <h1>ACADEMIC<br>DASHBOARD</h1>
      <button class="theme-toggle-btn" id="theme-toggle-btn" onclick="toggleTheme()">🌙 Dark Mode</button>
    </div>
    <div class="nav-section">
      <label>ATTENDANCE</label>
      <div class="nav-item active" data-page="dashboard">🏠 Dashboard</div>
      <div class="nav-item" data-page="mark">✅ Mark Attendance</div>
      <div class="nav-item" data-page="subjects">📚 Subjects</div>
      <div class="nav-item" data-page="timetable">📋 Timetable</div>
      <div class="nav-item" data-page="attcal">🗓️ Attendance Calendar</div>
      <div class="nav-item" data-page="analytics">📊 Analytics</div>
      <div class="nav-item" data-page="history">🕐 History</div>
      <label style="margin-top:16px">ACADEMICS</label>
      <div class="nav-item" data-page="results">🎓 Result Tracker</div>
      <div class="nav-item" data-page="backlog">📌 Backlog Tracker</div>
      <label style="margin-top:16px">PLANNING</label>
      <div class="nav-item" data-page="calendar">📅 Calendar &amp; Reminders</div>
      <label style="margin-top:16px">SYSTEM</label>
      <div class="nav-item" data-page="settings">⚙️ Settings</div>
    </div>
    <div class="sidebar-bottom">
      <div class="student-info">
        <div class="student-avatar" id="sidebar-avatar">--</div>
        <div><div class="student-name" id="sidebar-name">—</div><div class="student-roll" id="sidebar-meta">—</div></div>
      </div>
      <button class="btn btn-danger" style="width:100%;margin-top:8px" onclick="logoutApp()">🔒 Sign Out</button>
    </div>
  </nav>

  <main id="main">
    <div id="section-dashboard" class="section active">
      <div class="page-header"><button class="btn" onclick="toggleSidebar()" id="menu-btn" style="display:none">☰</button>
        <h2 class="page-title">Welcome back!</h2><p class="page-sub" id="dash-date"></p></div>
      <div id="sem-expiry-banner"></div>
      <div id="dash-alerts"></div>
      <div id="streak-content"></div>
      <div class="grid-4">
        <div class="card stat-card"><span class="stat-value" id="stat-total-pct">–%</span><span class="stat-label">Overall %</span><div class="stat-trend" id="stat-trend"></div></div>
        <div class="card stat-card"><span class="stat-value" id="stat-present">–</span><span class="stat-label">Present</span></div>
        <div class="card stat-card"><span class="stat-value" id="stat-absent">–</span><span class="stat-label">Absent</span></div>
        <div class="card stat-card"><span class="stat-value" id="stat-total">–</span><span class="stat-label">Total</span></div>
      </div>
      <div class="card" style="margin-bottom:24px" id="weekly-goal-content"></div>
      <div class="grid-2">
        <div class="card"><div class="section-h">📈 Overview</div><div class="donut-wrapper"><div class="chart-container"><canvas id="donutChart"></canvas></div>
          <div class="donut-center"><div class="donut-pct" id="donut-pct">–%</div></div></div></div>
        <div class="card"><div class="section-h">📚 Subjects</div><div id="dash-subjects"></div></div>
      </div>
      <div class="card"><div class="section-h">🎯 Classes Needed to Reach 75%</div><div id="dash-classes-needed"></div></div>
      <div class="card">
        <div class="section-actions"><span class="section-h">💡 Attendance Planning Insights</span><span id="planning-mode-badge"></span></div>
        <div id="planning-insights-content"></div>
      </div>
      <div class="card"><div class="section-h">🕐 Recent Activity</div><div id="recent-activity"></div></div>
    </div>

    <div id="section-subjects" class="section">
      <div class="page-header"><h2 class="page-title">📚 Subject Management</h2></div>
      <div class="card">
        <div class="section-actions"><span class="section-h">Your Subjects</span>
          <button class="btn btn-primary" onclick="window.__att.editSubject(null)">+ Add Subject</button></div>
        <div id="subject-mgmt-list"></div>
      </div>
      <div class="card" id="subject-editor-card" style="display:none">
        <div class="section-h" id="subject-editor-title">Add Subject</div>
        <input type="hidden" id="subj-original-key">
        <div class="wizard-field"><label class="wizard-label">Key (short code)</label><input id="subj-key" class="cute-input" placeholder="e.g. DAA"></div>
        <div class="wizard-field"><label class="wizard-label">Full Name</label><input id="subj-name" class="cute-input"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="wizard-field"><label class="wizard-label">Code</label><input id="subj-code" class="cute-input"></div>
          <div class="wizard-field"><label class="wizard-label">Faculty</label><input id="subj-faculty" class="cute-input"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="wizard-field"><label class="wizard-label">Color</label><input id="subj-color" class="cute-input" type="color" value="#00d4ff"></div>
          <div class="wizard-field"><label class="wizard-label">Periods/Week</label><input id="subj-pw" class="cute-input" type="number" value="4"></div>
        </div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="window.__att.saveSubject()">💾 Save Subject</button>
          <button class="btn" onclick="document.getElementById('subject-editor-card').style.display='none'">Cancel</button></div>
      </div>
    </div>

    <div id="section-mark" class="section">
      <div class="page-header"><h2 class="page-title">✅ Mark Attendance</h2></div>
      <div class="card"><div class="date-picker-wrap">
        <input type="date" id="att-date" class="date-input"><div class="day-label" id="day-name">—</div>
        <button class="holiday-toggle-btn" id="holiday-toggle-btn">🏖 Mark Holiday</button>
      </div></div>
      <div id="already-marked-banner"></div>
      <div id="day-schedule"></div>
      <div id="save-section" style="display:none;text-align:center">
        <button class="save-btn" id="save-btn">💾 Save Attendance</button>
        <div id="undo-day-strip"><span class="undo-day-link" onclick="window.__att.showUndoDayConfirm()">↩ Undo today's attendance</span></div>
        <div id="undo-day-confirm">
          <span class="undo-confirm-label">Reset all entries for this day?</span>
          <button class="undo-confirm-yes" onclick="window.__att.undoDay()">Yes, reset</button>
          <button class="undo-confirm-no" onclick="window.__att.hideUndoDayConfirm()">Cancel</button>
        </div>
      </div>
    </div>

    <div id="section-timetable" class="section">
      <div class="page-header"><h2 class="page-title">📋 Timetable</h2></div>
      <div class="card"><div class="timetable-wrap"><table class="timetable-table">
        <thead><tr><th>DAY</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>LUNCH</th><th>P5</th><th>P6</th></tr></thead>
        <tbody id="timetable-body"></tbody></table></div></div>
    </div>

    <div id="section-analytics" class="section">
      <div class="page-header"><h2 class="page-title">📊 Analytics</h2></div>
      <div class="card"><div class="chart-container" style="height:280px"><canvas id="barChart"></canvas></div></div>
      <div class="grid-3" id="subject-analytics-grid"></div>
      <div class="card"><div class="chart-container" style="height:280px"><canvas id="trendChart"></canvas></div></div>
    </div>

    <div id="section-history" class="section">
      <div class="page-header"><h2 class="page-title">🕐 History</h2><span id="history-count"></span></div>
      <div class="card">
        <div class="tab-bar">
          <button class="tab-btn active" onclick="window.__att.switchHistTab('current',this)">📅 Current</button>
          <button class="tab-btn" onclick="window.__att.switchHistTab('archive',this)">🗃 Archive</button>
        </div>
        <div id="hist-tab-current" class="tab-content active"><div id="history-list" class="history-list"></div></div>
        <div id="hist-tab-archive" class="tab-content"><div id="archive-list"></div></div>
      </div>
    </div>

    <div id="section-attcal" class="section">
      <div class="page-header"><h2 class="page-title">📅 Attendance Calendar</h2></div>
      <div class="card">
        <div class="calendar-nav">
          <button class="calendar-nav-btn" onclick="window.__att.calPrev()">← Prev</button>
          <div class="calendar-month-title" id="calendar-month-title">—</div>
          <div style="display:flex;gap:8px">
            <button class="calendar-nav-btn" onclick="window.__att.calToday()" style="font-size:.78rem">Today</button>
            <button class="calendar-nav-btn" onclick="window.__att.calNext()">Next →</button>
          </div>
        </div>
        <div class="calendar-grid" id="calendar-grid"></div>
        <div class="calendar-legend">
          <div class="calendar-legend-item"><div class="calendar-legend-dot" style="background:rgba(0,255,136,.5)"></div>Present</div>
          <div class="calendar-legend-item"><div class="calendar-legend-dot" style="background:rgba(255,187,0,.5)"></div>Partial</div>
          <div class="calendar-legend-item"><div class="calendar-legend-dot" style="background:rgba(255,51,102,.5)"></div>Low/Absent</div>
          <div class="calendar-legend-item"><div class="calendar-legend-dot" style="background:rgba(168,85,247,.5)"></div>Holiday</div>
        </div>
      </div>
      <div id="calendar-day-detail"></div>
    </div>

    <div id="section-results" class="section">
      <div class="page-header"><h2 class="page-title">🎓 Result Tracker</h2></div>
      <div class="grid-2">
        <div class="card stat-card"><span class="stat-value" id="result-cgpa">–</span><span class="stat-label">CGPA</span></div>
        <div class="card stat-card"><span class="stat-value" id="result-sem-count">0</span><span class="stat-label">Semesters Recorded</span></div>
      </div>
      <div class="card"><div class="chart-container" style="height:240px"><canvas id="sgpaTrendChart"></canvas></div></div>
      <div class="grid-3" id="result-sem-cards"></div>
      <div class="card" id="result-add-card">
        <div class="section-h">+ Add / Update Semester Result</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <input id="r-label" class="cute-input" placeholder="e.g. Sem 4">
          <input id="r-year" class="cute-input" placeholder="e.g. 2026-27">
        </div>
        <textarea id="r-paste" class="cute-input" rows="4" placeholder="Optional: paste copied text from your marks memo PDF — subject, credits, grade per line"></textarea>
        <button class="btn" style="margin:8px 0" onclick="window.__resultsForm.parsePaste()">🔍 Parse Pasted Text</button>
        <div id="r-subj-rows"></div>
        <button class="btn" onclick="window.__resultsForm.addRow()">+ Add Subject Row</button>
        <div style="margin-top:10px"><strong>SGPA Preview: <span id="r-preview">—</span></strong></div>
        <button class="save-btn" onclick="window.__resultsForm.save()">💾 Save Semester</button>
      </div>
    </div>

    <div id="section-backlog" class="section">
      <div class="page-header"><h2 class="page-title">📌 Backlog Tracker</h2></div>
      <div class="card">
        <div id="backlog-list"></div>
        <div style="display:grid;grid-template-columns:1fr 100px 120px auto;gap:8px;margin-top:12px">
          <input id="bl-subj" class="cute-input" placeholder="Subject">
          <input id="bl-credits" class="cute-input" type="number" placeholder="Credits">
          <select id="bl-grade" class="cute-input" data-grade-select></select>
          <button class="btn btn-primary" onclick="window.__backlogForm.add()">+ Add</button>
        </div>
      </div>
      <div class="card" id="backlog-impact"></div>
    </div>

    <div id="section-calendar" class="section">
      <div class="page-header"><h2 class="page-title">📅 Calendar &amp; Reminders</h2></div>
      <div class="card">
        <div class="section-h">☁️ Google Calendar</div>
        <div id="gcal-status" style="margin:8px 0;font-size:.85rem"></div>
        <button class="btn" onclick="window.__cal.syncAll()">⬆️ Sync All Reminders to Google Calendar</button>
        <p style="font-size:.7rem;color:var(--text2);margin-top:8px">First time connecting: your Google account must be added as a "test user" in the Google Cloud OAuth consent screen, or Google will block the popup.</p>
      </div>
      <div class="card">
        <div class="section-h">+ Add Reminder</div>
        <div style="display:grid;grid-template-columns:1fr 130px;gap:8px;margin-bottom:8px">
          <input id="rem-title" class="cute-input" placeholder="Title (e.g. DBMS Assignment 2)">
          <select id="rem-type" class="cute-input"><option value="class">Class</option><option value="assignment">Assignment</option><option value="exam">Exam</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 130px;gap:8px;margin-bottom:8px">
          <input id="rem-date" class="cute-input" type="date"><input id="rem-time" class="cute-input" type="time" value="09:00">
        </div>
        <textarea id="rem-notes" class="cute-input" rows="2" placeholder="Notes (optional)"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="window.__cal.addForm()">+ Add Reminder</button>
          <button class="btn" onclick="window.__cal.exportICS()">📤 Export .ics</button>
          <button class="btn" onclick="window.__cal.enableNotif()">🔔 Enable Notifications</button>
        </div>
      </div>
      <div class="card"><div class="section-h">Upcoming</div><div id="reminders-list"></div></div>
    </div>

    <div id="section-settings" class="section">
      <div class="page-header"><h2 class="page-title">⚙️ Settings</h2></div>
      <div class="card"><div class="section-h">🎓 Semester Management</div><div id="sem-management-content"></div></div>
      <div class="card"><div class="section-h">👤 Profile</div><div id="settings-profile-form"></div></div>
      <div class="card">
        <div class="section-actions"><span class="section-h">📊 Initial Attendance (mid-semester onboarding)</span></div>
        <p style="font-size:.78rem;color:var(--text2);margin-bottom:10px">If you're starting mid-semester, set your already-attended counts here so percentages are correct from day one.</p>
        <div id="initial-data-form"></div>
        <button class="btn btn-primary" style="margin-top:10px" onclick="window.__att.saveInitialData()">💾 Save Initial Data</button>
      </div>
      <div class="card">
        <div class="section-actions"><span class="section-h">🏖️ Holiday Management</span>
          <button class="btn btn-purple" onclick="window.__att.openAddHoliday()" style="font-size:.78rem;padding:6px 14px">+ Add Holiday</button></div>
        <div id="holiday-mgmt-list"></div>
      </div>
      <div class="card">
        <div class="section-h">🔔 Notification Controls</div>
        <div class="notif-option">
          <div><div class="notif-label">Low Attendance Alerts</div><div class="notif-desc">Notify when any subject drops below 75%</div></div>
          <label class="toggle-switch"><input type="checkbox" id="notif-low-toggle" onchange="localStorage.setItem('dash_notif_low', this.checked)"><span class="toggle-slider"></span></label>
        </div>
        <button class="btn" style="margin-top:10px" onclick="window.__att.enableBrowserNotif()">🔔 Enable Browser Notifications</button>
      </div>
      <div class="card">
        <div class="section-h">🎨 Appearance</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" data-theme-option="dark" onclick="setThemeMode('dark')">🌙 Dark</button>
          <button class="btn" data-theme-option="light" onclick="setThemeMode('light')">☀️ Light</button>
          <button class="btn" data-theme-option="system" onclick="setThemeMode('system')">💻 System</button>
        </div>
      </div>
      <div class="card"><div class="section-h">🔐 Security</div>
        <p style="font-size:.82rem;color:var(--text2)">Signed in as <strong id="settings-user-email">—</strong>. This app has no public sign-up — only one account can ever exist (see README).</p>
        <button class="btn btn-danger" onclick="logoutApp()">Sign Out</button>
      </div>
      <div class="card">
        <div class="section-h">🗑️ Danger Zone</div>
        <p style="font-size:.82rem;color:var(--text2);margin-bottom:14px">These actions are irreversible. Use with caution.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-danger" onclick="window.__att.clearHistory()">Clear All History</button>
          <button class="btn" onclick="window.__att.exportCSV()">📤 Export Data (CSV)</button>
        </div>
      </div>
    </div>
  </main>
</div>

<div id="wizard-overlay">
  <div class="wizard-modal">
    <div class="wizard-header">
      <div class="wizard-title">🎓 Semester Setup</div>
      <div class="wizard-subtitle" id="wizard-subtitle">Step 1 of 4</div>
      <div class="wizard-steps" id="wizard-steps-indicator"></div>
    </div>
    <div class="wizard-body" id="wizard-content"></div>
    <div class="wizard-footer" id="wizard-footer"></div>
  </div>
</div>

<div id="holiday-modal">
  <div class="holiday-modal-box">
    <div class="holiday-modal-header"><h3>🏖 Mark Holiday</h3>
      <button class="holiday-modal-close" onclick="window.__att.closeHolidayModal()">✕</button></div>
    <div class="holiday-modal-body">
      <div class="wizard-field"><label class="wizard-label">Holiday Name / Reason *</label>
        <input id="holiday-name-input" class="cute-input" type="text" placeholder="e.g. Diwali, College Event..." oninput="window.__att.updateHolidayPreview()"></div>
      <div class="wizard-field"><label class="wizard-label">Date</label>
        <input id="holiday-date-display" class="cute-input" type="date" readonly style="opacity:.7"></div>
      <div class="holiday-preview" id="holiday-preview" style="display:none">
        <span>🏖</span><span id="holiday-preview-text">—</span></div>
    </div>
    <div class="holiday-modal-footer">
      <button class="btn" onclick="window.__att.closeHolidayModal()">Cancel</button>
      <button class="btn btn-purple" onclick="window.__att.submitHolidayMark()">🏖 Mark as Holiday</button>
    </div>
  </div>
</div>

<div id="end-sem-modal">
  <div class="end-sem-box">
    <h2>⚠️ End Current Semester?</h2>
    <p id="end-sem-msg">This will archive the current semester's records.</p>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn" onclick="window.__att.closeEndSemModal()">Cancel</button>
      <button class="btn btn-danger" onclick="window.__att.confirmEndSem()">Archive & Start New</button>
    </div>
  </div>
</div>
<nav id="bottom-nav">
  <div class="bnav-item active" data-page="dashboard">🏠<span>Home</span></div>
  <div class="bnav-item" data-page="mark">✅<span>Mark</span></div>
  <div class="bnav-item" data-page="results">🎓<span>Results</span></div>
  <div class="bnav-item" data-page="calendar">📅<span>Cal</span></div>
  <div class="bnav-item" data-page="settings">⚙️<span>Settings</span></div>
</nav>`;

// ── Result form helpers (subject rows for Add/Edit Result card) ──
let rFormRows = [];
const GRADE_OPTIONS_HTML = () => `<option value="">Grade</option>` + Results.GRADES.map(g => `<option value="${g.grade}">${g.grade} (${g.gp})</option>`).join('');

window.__resultsForm = {
  addRow: (name = '', credits = 3, grade = '') => { rFormRows.push({ name, credits, grade }); renderRFormRows(); },
  removeRow: (i) => { rFormRows.splice(i, 1); renderRFormRows(); },
  parsePaste: () => {
    const parsed = Results.parsePastedResultText($('r-paste').value);
    if (!parsed.length) return showToast('Could not detect subject rows — check formatting', 'error');
    rFormRows = parsed;
    renderRFormRows();
    showToast(`Parsed ${parsed.length} subject(s)`, 'success');
  },
  save: async () => {
    syncRFormRows();
    const label = $('r-label').value.trim();
    if (!label) return showToast('Enter a semester label', 'error');
    try {
      await Results.saveSemesterResult(label, $('r-year').value.trim(), rFormRows);
      showToast('✅ Semester saved', 'success');
      rFormRows = []; renderRFormRows();
      $('r-label').value = ''; $('r-year').value = '';
      Results.renderResultsDashboard();
    } catch (e) { showToast(e.message, 'error'); }
  }
};
function renderRFormRows() {
  const el = $('r-subj-rows');
  if (!el) return;
  el.innerHTML = rFormRows.map((s, i) => `
    <div style="display:grid;grid-template-columns:1fr 80px 90px 28px;gap:8px;margin-bottom:6px">
      <input class="cute-input" value="${s.name}" data-i="${i}" data-f="name">
      <input class="cute-input" type="number" value="${s.credits}" data-i="${i}" data-f="credits">
      <select class="cute-input" data-i="${i}" data-f="grade">${gradeOptionsSelected(s.grade)}</select>
      <button class="del-btn" onclick="window.__resultsForm.removeRow(${i})">✕</button>
    </div>`).join('');
  updateSGPAPreview();
}
function gradeOptionsSelected(selected) {
  return `<option value="">Grade</option>` + Results.GRADES.map(g => `<option value="${g.grade}" ${g.grade===selected?'selected':''}>${g.grade} (${g.gp})</option>`).join('');
}
function syncRFormRows() {
  document.querySelectorAll('#r-subj-rows [data-f]').forEach(inp => {
    const i = +inp.dataset.i, f = inp.dataset.f;
    if (rFormRows[i]) rFormRows[i][f] = f === 'credits' ? parseFloat(inp.value) || 0 : inp.value;
  });
}
function updateSGPAPreview() {
  syncRFormRows();
  const r = Results.calcSGPA(rFormRows);
  $('r-preview') && ($('r-preview').textContent = r ? r.sgpa.toFixed(2) : '—');
}
document.addEventListener('input', (e) => { if (e.target.closest('#r-subj-rows')) updateSGPAPreview(); });

window.__backlogForm = {
  add: async () => {
    const subj = $('bl-subj').value.trim(), credits = parseFloat($('bl-credits').value), grade = $('bl-grade').value;
    if (!subj || !credits || !grade) return showToast('Fill all backlog fields', 'error');
    await Results.addBacklog(subj, credits, grade);
    $('bl-subj').value = ''; $('bl-credits').value = '';
    Results.renderBacklogPanel();
  }
};

boot();
