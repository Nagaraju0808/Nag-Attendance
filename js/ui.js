// js/ui.js
// Shared UI helpers used across every page module.

export function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.textContent = msg;
  toast.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function navigate(page) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('section-' + page);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.querySelectorAll('.bnav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  closeSidebar();
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page } }));
  history.replaceState(null, '', '#' + page);
}

export function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('overlay')?.classList.toggle('show');
}
export function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
}

export function loadTheme() {
  const saved = localStorage.getItem('dashboard_theme') || 'system';
  applyTheme(saved);
}
export function setTheme(mode) {
  localStorage.setItem('dashboard_theme', mode);
  applyTheme(mode);
}
export function toggleTheme() {
  const cur = localStorage.getItem('dashboard_theme') || 'system';
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark';
  setTheme(next);
}
function applyTheme(mode) {
  const resolved = mode === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  updateThemeBtn(mode, resolved);
}
function updateThemeBtn(mode, resolved) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = mode === 'system' ? `💻 System (${resolved})` : resolved === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
  document.querySelectorAll('[data-theme-option]').forEach(b => b.classList.toggle('active', b.dataset.themeOption === mode));
}
// React to OS theme changes live when in "system" mode
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if ((localStorage.getItem('dashboard_theme') || 'system') === 'system') applyTheme('system');
  });
}

export function $(id) { return document.getElementById(id); }
