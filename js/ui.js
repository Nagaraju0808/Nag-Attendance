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
  const saved = localStorage.getItem('dashboard_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
}
export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('dashboard_theme', next);
  updateThemeBtn(next);
}
function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

export function $(id) { return document.getElementById(id); }
