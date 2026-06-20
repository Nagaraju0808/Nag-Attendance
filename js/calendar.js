// js/calendar.js
// Calendar reminders for classes, assignments and exams.
//
// GOOGLE CALENDAR OAUTH — now wired up for real, using Google Identity
// Services' client-side token flow (google.accounts.oauth2). This needs
// ONLY a Client ID (already set in js/config.js) — no client secret,
// because the token never touches a server; it lives in the browser tab
// only, for the duration of the session.
//
// One-time setup still required on your end (Google Cloud Console):
//   1. APIs & Services → Library → enable "Google Calendar API"
//   2. APIs & Services → OAuth consent screen → Audience → add your
//      Google account email as a "Test user" (apps in Testing mode can
//      only be used by accounts explicitly added here)
//   3. APIs & Services → Credentials → your OAuth Client → Authorized
//      JavaScript origins → add http://localhost:PORT (for local testing)
//      and your real Vercel URL (e.g. https://your-app.vercel.app)
// Without step 2, Google will block the consent screen with
// "Access blocked: this app's request is invalid" for any account that
// isn't added as a test user — including your own.

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './ui.js';

let reminders = [];
let gAccessToken = null;
let gTokenClient = null;

export function getReminders() { return reminders; }
export function isGoogleConnected() { return !!gAccessToken; }

export async function loadReminders() {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!user) return [];
  const { data, error } = await sb.from('reminders').select('*').order('due_date', { ascending: true });
  if (!error && data) reminders = data;
  return reminders;
}

export async function addReminder({ title, type, due_date, due_time, notes }) {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  const { data, error } = await sb.from('reminders').insert({
    owner_id: user.id, title, type, due_date, due_time: due_time || '09:00', notes: notes || ''
  }).select().single();
  if (error) throw error;
  reminders.push(data);
  return data;
}

export async function deleteReminder(id) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) throw error;
  reminders = reminders.filter(r => r.id !== id);
}

function typeIcon(type) {
  return type === 'exam' ? '📝' : type === 'assignment' ? '📋' : '📚';
}

// ── Google Calendar "quick add" link — no OAuth required, always works ──
export function googleCalendarLink(reminder) {
  const start = `${reminder.due_date.replace(/-/g, '')}T${(reminder.due_time || '09:00').replace(':', '')}00`;
  const endDate = new Date(`${reminder.due_date}T${reminder.due_time || '09:00'}`);
  endDate.setHours(endDate.getHours() + 1);
  const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0];
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${typeIcon(reminder.type)} ${reminder.title}`,
    dates: `${start}/${end}`,
    details: reminder.notes || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── .ics file export (works with Google Calendar import, Apple, Outlook) ──
export function downloadICS(reminderList = reminders) {
  if (!reminderList.length) { showToast('No reminders to export', 'info'); return; }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Academic Dashboard//EN'];
  reminderList.forEach(r => {
    const dt = `${r.due_date.replace(/-/g, '')}T${(r.due_time || '09:00').replace(':', '')}00`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${r.id}@academic-dashboard`);
    lines.push(`DTSTAMP:${dt}`);
    lines.push(`DTSTART:${dt}`);
    lines.push(`SUMMARY:${typeIcon(r.type)} ${escapeICS(r.title)}`);
    if (r.notes) lines.push(`DESCRIPTION:${escapeICS(r.notes)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'academic-dashboard-reminders.ics';
  a.click();
  showToast('📅 Calendar file downloaded — import it into any calendar app', 'success');
}

function escapeICS(s) { return String(s).replace(/[\n,;]/g, ' '); }

// ── REAL Google Calendar OAuth — connect + live sync ──
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export function initGoogleAuth(onTokenReceived) {
  const clientId = window.APP_CONFIG?.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) { console.warn('GOOGLE_CALENDAR_CLIENT_ID not set in js/config.js'); return; }
  if (!window.google?.accounts?.oauth2) {
    // GIS script may still be loading — retry shortly.
    setTimeout(() => initGoogleAuth(onTokenReceived), 300);
    return;
  }
  gTokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GCAL_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        showToast('Google sign-in failed: ' + resp.error, 'error');
        return;
      }
      gAccessToken = resp.access_token;
      sessionStorage.setItem('gcal_token', gAccessToken);
      showToast('🔗 Connected to Google Calendar', 'success');
      if (onTokenReceived) onTokenReceived(gAccessToken);
    }
  });
  // Reuse a token from this tab session if we already have one.
  const cached = sessionStorage.getItem('gcal_token');
  if (cached) gAccessToken = cached;
}

export function connectGoogleCalendar() {
  if (!gTokenClient) { showToast('Google sign-in is still loading — try again in a second', 'info'); return; }
  gTokenClient.requestAccessToken();
}

export function disconnectGoogleCalendar() {
  gAccessToken = null;
  sessionStorage.removeItem('gcal_token');
  showToast('Disconnected from Google Calendar', 'info');
}

async function gcalFetch(path, options = {}) {
  if (!gAccessToken) throw new Error('Not connected to Google Calendar yet');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${gAccessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (res.status === 401) {
    gAccessToken = null;
    sessionStorage.removeItem('gcal_token');
    throw new Error('Google session expired — click "Connect Google Calendar" again');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Google Calendar API error (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// Pushes one reminder into the user's primary Google Calendar as a real event.
export async function syncReminderToGoogle(reminder) {
  const start = `${reminder.due_date}T${reminder.due_time || '09:00'}:00`;
  const endDate = new Date(start);
  endDate.setHours(endDate.getHours() + 1);
  const event = {
    summary: `${typeIcon(reminder.type)} ${reminder.title}`,
    description: reminder.notes || `Synced from Academic Dashboard (${reminder.type})`,
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: endDate.toISOString() }
  };
  const created = await gcalFetch('calendars/primary/events', { method: 'POST', body: JSON.stringify(event) });
  return created;
}

export async function syncAllRemindersToGoogle(list = reminders) {
  if (!gAccessToken) { showToast('Connect Google Calendar first', 'error'); return; }
  let ok = 0, fail = 0;
  for (const r of list) {
    try { await syncReminderToGoogle(r); ok++; }
    catch (e) { fail++; console.error('Sync failed for', r.title, e); }
  }
  showToast(`☁️ Synced ${ok} reminder(s) to Google Calendar${fail ? `, ${fail} failed` : ''}`, fail ? 'info' : 'success');
}

// ── Browser push notifications for due/overdue reminders ──
export async function requestNotifPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return await Notification.requestPermission();
}

export function checkDueReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date().toISOString().split('T')[0];
  reminders.filter(r => r.due_date === today && !r.notified).forEach(r => {
    new Notification(`${typeIcon(r.type)} Reminder: ${r.title}`, {
      body: r.notes || `Due today at ${r.due_time || '09:00'}`,
      icon: 'assets/icon.svg'
    });
    markNotified(r.id);
  });
}

async function markNotified(id) {
  const sb = getSupabaseClient();
  await sb.from('reminders').update({ notified: true }).eq('id', id);
  const r = reminders.find(x => x.id === id);
  if (r) r.notified = true;
}

