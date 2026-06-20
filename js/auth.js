// js/auth.js
// Single-user authentication gate.
// - No signup UI anywhere in this app.
// - Disable "Allow new signups" in Supabase Dashboard (see README) so
//   even a direct API call cannot create a second account.
// - This module additionally checks the logged-in email against
//   APP_CONFIG.AUTHORIZED_EMAIL as a defense-in-depth UI-level check.
//   The real boundary is RLS (sql/schema.sql) + signups-disabled.

import { getSupabaseClient, AUTHORIZED_EMAIL } from './supabase-client.js';

let currentSession = null;
let currentUser = null;

export function getCurrentUser() { return currentUser; }
export function getCurrentSession() { return currentSession; }

export async function initAuth() {
  const sb = getSupabaseClient();
  const { data } = await sb.auth.getSession();
  currentSession = data.session;
  currentUser = data.session ? data.session.user : null;

  sb.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    currentUser = session ? session.user : null;
  });

  return currentUser;
}

export async function login(email, password) {
  const sb = getSupabaseClient();
  if (AUTHORIZED_EMAIL && email.trim().toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
    return { error: { message: 'This dashboard is restricted to a single account.' } };
  }
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) {
    currentSession = data.session;
    currentUser = data.user;
  }
  return { data, error };
}

export async function logout() {
  const sb = getSupabaseClient();
  await sb.auth.signOut();
  currentSession = null;
  currentUser = null;
}

export function isLoggedIn() {
  return !!currentUser;
}

// Renders the login screen into a target element. Calls onSuccess() once authenticated.
export function renderLoginScreen(targetEl, onSuccess) {
  targetEl.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">NAGARAJU<br>ACADEMIC DASHBOARD</div>
        <p class="auth-sub">Private single-user access. Owner sign-in only.</p>
        <form id="login-form">
          <div class="wizard-field">
            <label class="wizard-label">Email</label>
            <input id="auth-email" class="cute-input" type="email" autocomplete="username" required>
          </div>
          <div class="wizard-field">
            <label class="wizard-label">Password</label>
            <input id="auth-password" class="cute-input" type="password" autocomplete="current-password" required>
          </div>
          <div id="auth-error" class="auth-error"></div>
          <button type="submit" class="save-btn" style="width:100%;max-width:none;margin-top:10px">🔐 Sign In</button>
        </form>
        <p class="auth-footnote">No public sign-up exists for this app — by design.</p>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = '';
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = '⏳ Signing in...';
    const { error } = await login(email, password);
    if (error) {
      errEl.textContent = error.message || 'Login failed';
      btn.disabled = false; btn.innerHTML = '🔐 Sign In';
      return;
    }
    onSuccess();
  });
}
