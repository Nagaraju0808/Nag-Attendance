// js/charts.js
// Thin wrappers around Chart.js so attendance.js / results.js stay readable.

const charts = {};

export function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

export function renderDonut(canvasId, overall) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Present', 'Absent'], datasets: [{ data: [overall.present, overall.absent], backgroundColor: ['#00ff88', '#ff3366'], borderWidth: 0, hoverOffset: 4 }] },
    options: { cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: '#8899bb' } } } }
  });
}

export function renderBarChart(canvasId, stats, subjects) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const labels = Object.keys(stats);
  const data = labels.map(k => parseFloat(stats[k].pct.toFixed(1)));
  const colors = labels.map(k => subjects[k]?.color || '#00d4ff');
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Attendance %', data, backgroundColor: colors.map(c => c + '88'), borderColor: colors, borderWidth: 2, borderRadius: 8 },
      { type: 'line', label: '75% Target', data: Array(labels.length).fill(75), borderColor: '#ffbb00', borderDash: [6,4], pointRadius: 0 }
    ]},
    options: { scales: { y: { min: 0, max: 100, ticks: { color: '#8899bb' } }, x: { ticks: { color: '#8899bb' } } }, plugins: { legend: { display: false } } }
  });
}

export function renderTrendChart(canvasId, records, subjects, initialData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const allDates = [...new Set(records.filter(r => !r.is_holiday).map(r => r.date))].sort();
  if (!allDates.length) return;
  const weekBuckets = {};
  allDates.forEach(date => {
    const d = new Date(date + 'T00:00:00');
    const off = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() + off);
    const key = mon.toISOString().split('T')[0];
    (weekBuckets[key] = weekBuckets[key] || []).push(date);
  });
  const weeks = Object.keys(weekBuckets).sort().slice(-12);
  const datasets = Object.keys(subjects).map(key => {
    const sub = subjects[key];
    let cumP = initialData[key]?.present || 0, cumT = initialData[key]?.total || 0;
    const data = weeks.map(wk => {
      (weekBuckets[wk] || []).forEach(date => {
        const recs = records.filter(r => r.date === date && r.subject === key && !r.is_holiday);
        cumP += recs.filter(r => r.status === 'P').length;
        cumT += recs.length;
      });
      return cumT > 0 ? parseFloat((cumP / cumT * 100).toFixed(1)) : null;
    });
    return { label: sub?.name || key, data, borderColor: sub?.color || '#00d4ff', tension: 0.3, pointRadius: 3, fill: false };
  });
  const labels = weeks.map(w => new Date(w + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: { scales: { y: { min: 0, max: 100, ticks: { color: '#8899bb' } }, x: { ticks: { color: '#8899bb' } } }, plugins: { legend: { position: 'bottom', labels: { color: '#8899bb' } } } }
  });
}

export function renderSGPABars(canvasId, semesters) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: semesters.map(s => s.label), datasets: [{ label: 'SGPA', data: semesters.map(s => s.sgpa), backgroundColor: '#4fffb088', borderColor: '#4fffb0', borderWidth: 2, borderRadius: 6 }] },
    options: { scales: { y: { min: 0, max: 10, ticks: { color: '#8899bb' } }, x: { ticks: { color: '#8899bb' } } }, plugins: { legend: { display: false } } }
  });
}
