// js/profile.js
// Replaces hardcoded name/roll/branch/section with a real profile
// stored in Supabase (RLS-protected) with localStorage as an
// offline-read fallback.

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

const LS_KEY = 'dashboard_profile_cache';
let profile = null;

export function getProfile() { return profile; }

export async function loadProfile() {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!user) return null;

  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!error && data) {
    profile = data;
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return profile;
  }
  // Fallback to local cache if offline
  const cached = localStorage.getItem(LS_KEY);
  if (cached) { profile = JSON.parse(cached); return profile; }
  return null;
}

export async function saveProfile(fields) {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const payload = { id: user.id, ...fields, updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('profiles').upsert(payload).select().single();
  if (error) throw error;
  profile = data;
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  return data;
}

export function profileNeedsSetup() {
  return !profile || !profile.full_name;
}

export function renderSetupWizard(targetEl, onDone) {
  targetEl.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card" style="max-width:480px">
        <div class="auth-logo">👋 WELCOME</div>
        <p class="auth-sub">Let's set up your profile. This replaces hardcoded details — edit anytime in Settings.</p>
        <div class="wizard-field"><label class="wizard-label">Full Name *</label><input id="p-name" class="cute-input" required></div>
        <div class="wizard-field"><label class="wizard-label">Roll Number</label><input id="p-roll" class="cute-input"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="wizard-field"><label class="wizard-label">Branch</label><input id="p-branch" class="cute-input" placeholder="e.g. CSE-DS"></div>
          <div class="wizard-field"><label class="wizard-label">Section</label><input id="p-section" class="cute-input" placeholder="e.g. B"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="wizard-field"><label class="wizard-label">Semester</label><input id="p-sem" class="cute-input" placeholder="e.g. III-I"></div>
          <div class="wizard-field"><label class="wizard-label">Academic Year</label><input id="p-year" class="cute-input" placeholder="e.g. 2025-26"></div>
        </div>
        <div class="wizard-field"><label class="wizard-label">College Name</label><input id="p-college" class="cute-input"></div>
        <button class="save-btn" style="width:100%;max-width:none" id="p-save-btn">✅ Save & Continue</button>
      </div>
    </div>`;

  document.getElementById('p-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('p-name').value.trim();
    if (!name) { document.getElementById('p-name').focus(); return; }
    const btn = document.getElementById('p-save-btn');
    btn.disabled = true; btn.textContent = '⏳ Saving...';
    try {
      await saveProfile({
        full_name: name,
        roll_number: document.getElementById('p-roll').value.trim(),
        branch: document.getElementById('p-branch').value.trim(),
        section: document.getElementById('p-section').value.trim(),
        semester: document.getElementById('p-sem').value.trim(),
        academic_year: document.getElementById('p-year').value.trim(),
        college_name: document.getElementById('p-college').value.trim()
      });
      onDone();
    } catch (e) {
      alert('Failed to save profile: ' + e.message);
      btn.disabled = false; btn.textContent = '✅ Save & Continue';
    }
  });
}

export function profileInitials() {
  if (!profile?.full_name) return '?';
  return profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
