// js/result-tracker.js
// Semester result tracking, merged into the main dashboard (shared sidebar/theme).
//
// HONEST SCOPE NOTE on "upload result PDF/image → auto-extract":
// Real OCR/parsing of arbitrary marks-memo layouts reliably needs either
// a server-side OCR service (e.g. Tesseract on a backend, or a vision
// model API call) — not something that can run client-side-only inside
// a static Vercel site for free. What's implemented here instead, and
// fully working:
//   - Manual entry grid with live SGPA preview (fast to fill in)
//   - "Paste text" box: paste the copied text from a PDF and it
//     auto-detects "Subject ... Credits ... Grade" patterns line by line
//   - Everything else (CGPA, goals, backlog impact, export) is fully live

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import { showToast, $ } from './ui.js';
import { renderSGPABars } from './charts.js';

export const GRADES = [
  { grade:'O', gp:10 }, { grade:'A+', gp:9 }, { grade:'A', gp:8 },
  { grade:'B+', gp:7 }, { grade:'B', gp:6 }, { grade:'C', gp:5 }, { grade:'F', gp:0 }
];

function sb() { return getSupabaseClient(); }
function uid() { return getCurrentUser()?.id; }

export let semesters = [];
export let backlog = [];

function gpFor(g) { return GRADES.find(x => x.grade === g)?.gp ?? null; }

export async function loadResults() {
  const { data } = await sb().from('result_semesters').select('*').order('label', { ascending: true });
  semesters = data || [];
  const { data: bl } = await sb().from('backlog_items').select('*');
  backlog = bl || [];
  return semesters;
}

export function calcSGPA(subjects) {
  let tcp = 0, tc = 0;
  subjects.forEach(s => {
    const gp = gpFor(s.grade);
    if (gp === null || !s.credits) return;
    tcp += s.credits * gp; tc += +s.credits;
  });
  return tc > 0 ? { sgpa: tcp / tc, credits: tc, points: tcp } : null;
}

export function calcCGPA() {
  if (!semesters.length) return null;
  let tcp = 0, tc = 0;
  semesters.forEach(s => { tcp += +s.points; tc += +s.credits; });
  return tc > 0 ? tcp / tc : null;
}

export async function saveSemesterResult(label, year, subjects) {
  const r = calcSGPA(subjects);
  if (!r) throw new Error('Add at least one valid subject with credits and grade');
  const payload = { owner_id: uid(), label, year, subjects, sgpa: r.sgpa, credits: r.credits, points: r.points, official: false };
  const { data, error } = await sb().from('result_semesters').upsert(payload, { onConflict: 'owner_id,label' }).select().single();
  if (error) throw error;
  semesters = semesters.filter(s => s.label !== label).concat(data).sort((a,b) => a.label.localeCompare(b.label));
  return data;
}

export async function deleteSemesterResult(id) {
  await sb().from('result_semesters').delete().eq('id', id);
  semesters = semesters.filter(s => s.id !== id);
}

export async function addBacklog(subject, credits, expected_grade) {
  const { data, error } = await sb().from('backlog_items').insert({ owner_id: uid(), subject, credits, expected_grade }).select().single();
  if (error) throw error;
  backlog.push(data);
  return data;
}
export async function removeBacklog(id) {
  await sb().from('backlog_items').delete().eq('id', id);
  backlog = backlog.filter(b => b.id !== id);
}

// ── "Paste text" smart-fill: parses copied PDF text into subject rows ──
// Looks for lines like: "Data Structures   3   B+"  or "Data Structures,3,B+"
export function parsePastedResultText(text) {
  const gradeSet = new Set(GRADES.map(g => g.grade));
  const rows = [];
  text.split('\n').forEach(line => {
    const clean = line.trim();
    if (!clean) return;
    const tokens = clean.split(/[\t,|]+|\s{2,}/).map(t => t.trim()).filter(Boolean);
    if (tokens.length < 3) return;
    const last = tokens[tokens.length - 1].toUpperCase();
    const secondLast = tokens[tokens.length - 2];
    if (gradeSet.has(last) && !isNaN(parseFloat(secondLast))) {
      rows.push({ name: tokens.slice(0, tokens.length - 2).join(' '), credits: parseFloat(secondLast), grade: last });
    }
  });
  return rows;
}

// ── Render: results dashboard ──
export function renderResultsDashboard() {
  const cgpa = calcCGPA();
  $('result-cgpa') && ($('result-cgpa').textContent = cgpa ? cgpa.toFixed(2) : '—');
  $('result-sem-count') && ($('result-sem-count').textContent = semesters.length);
  if ($('sgpaTrendChart')) renderSGPABars('sgpaTrendChart', semesters);

  const grid = $('result-sem-cards');
  if (grid) {
    grid.innerHTML = semesters.length ? semesters.map(s => `
      <div class="card subject-card">
        <div class="subject-header"><div class="subject-name">${s.label} ${s.official ? '✅' : ''}</div>
          <div class="pct-badge pct-green">${(+s.sgpa).toFixed(2)}</div></div>
        <div style="font-size:.78rem;color:var(--text2)">${s.year || ''} • ${s.credits} credits • ${s.subjects.length} subjects</div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn" onclick="window.__results.edit('${s.id}')">✎ Edit</button>
          <button class="btn btn-danger" onclick="window.__results.remove('${s.id}')">✕ Delete</button>
        </div>
      </div>`).join('') : '<p style="color:var(--text2);text-align:center;padding:30px">No semester results yet. Add one below.</p>';
  }
}

export function renderBacklogPanel() {
  const el = $('backlog-list');
  if (!el) return;
  el.innerHTML = backlog.length ? backlog.map(b => `
    <div class="backlog-row" style="display:grid;grid-template-columns:1fr 80px 80px 28px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${b.subject}</span><span>${b.credits} cr</span><span style="color:var(--warning)">${b.expected_grade}</span>
      <button class="del-btn" onclick="window.__results.removeBacklog('${b.id}')">✕</button>
    </div>`).join('') : '<p style="color:var(--text2);font-size:.85rem">No backlog entries.</p>';

  const currentCP = semesters.reduce((a, s) => a + (+s.points), 0);
  const currentCr = semesters.reduce((a, s) => a + (+s.credits), 0);
  const cgpaNow = calcCGPA();
  const addedGP = backlog.reduce((a, b) => a + (gpFor(b.expected_grade) || 0) * b.credits, 0);
  const addedCr = backlog.reduce((a, b) => a + (+b.credits), 0);
  const newCGPA = (currentCr + addedCr) > 0 ? (currentCP + addedGP) / (currentCr + addedCr) : null;
  const impactEl = $('backlog-impact');
  if (impactEl) {
    impactEl.innerHTML = backlog.length ? `
      <div class="insights-grid">
        <div class="insight-box safe-box"><div class="insight-num">${cgpaNow ? cgpaNow.toFixed(2) : '—'}</div><div class="insight-label">Current CGPA</div></div>
        <div class="insight-box safe-box"><div class="insight-num">${newCGPA ? newCGPA.toFixed(2) : '—'}</div><div class="insight-label">After Clearing</div></div>
        <div class="insight-box safe-box"><div class="insight-num">${newCGPA && cgpaNow ? '+' + (newCGPA-cgpaNow).toFixed(2) : '—'}</div><div class="insight-label">Change</div></div>
      </div>` : '';
  }
}
