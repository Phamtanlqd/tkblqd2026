/* =====================================================================
 * dashboard.js – Dashboard tổng quan và trang Thống Kê (Chart.js)
 * ===================================================================== */
import { DAYS, PERIODS, escapeHtml, subjectColor, periodInfo, dayName, subjectName } from './utils.js';
import { exportChartPNG, safeName } from './export.js';

const charts = new Map();
const PALETTE = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#6366F1', '#06B6D4'];

export function destroyCharts() {
  for (const c of charts.values()) c.destroy();
  charts.clear();
}

/** Đồng bộ màu chữ / lưới của Chart.js theo giao diện sáng-tối */
function applyChartTheme() {
  const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--text-muted').trim() || '#64748b';
  Chart.defaults.borderColor = cs.getPropertyValue('--border').trim() || 'rgba(100,116,139,.25)';
  Chart.defaults.font.family = 'Segoe UI, system-ui, -apple-system, Roboto, sans-serif';
}
function mk(id, config) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts.get(id)?.destroy();
  config.options = { responsive: true, maintainAspectRatio: false, ...(config.options || {}) };
  charts.set(id, new Chart(el, config));
}
const chartCard = (id, title, h = 300, cls = 'col-lg-6') => `
  <div class="${cls}"><div class="glass card-pad h-100">
    <div class="card-title-row"><h6>${title}</h6>
      <button class="btn btn-sm btn-light no-export" data-chart="${id}" title="Xuất PNG"><i class="bi bi-image"></i> PNG</button></div>
    <div class="chart-box" style="height:${h}px"><canvas id="${id}"></canvas></div></div></div>`;

/* ---------- Tính số liệu ---------- */
function stats(ds) {
  const real = ds.records.filter((r) => !r.event);
  const byDay = DAYS.map((d) => real.filter((r) => r.day === d.n));
  const periods = Array.from({ length: ds.maxPeriod }, (_, i) => i + 1);
  const byPeriod = periods.map((p) => real.filter((r) => r.period === p));
  const grades = {};
  real.forEach((r) => { grades[r.grade] = (grades[r.grade] || 0) + 1; });
  const loads = ds.teachers.map((t) => t.total);
  const bins = [['0', 0, 0], ['1–5', 1, 5], ['6–10', 6, 10], ['11–15', 11, 15], ['16–20', 16, 20], ['>20', 21, 999]];
  return {
    real, byDay, periods, byPeriod, grades, bins,
    hist: bins.map(([, lo, hi]) => loads.filter((x) => x >= lo && x <= hi).length),
    teachersSorted: [...ds.teachers].filter((t) => t.total > 0).sort((a, b) => b.total - a.total),
  };
}

/* ---------- Các biểu đồ ---------- */
function drawTeacherBar(id, ds, st, limit) {
  const list = limit ? st.teachersSorted.slice(0, limit) : st.teachersSorted;
  mk(id, {
    type: 'bar',
    data: { labels: list.map((t) => t.name), datasets: [{ label: 'Số tiết/tuần', data: list.map((t) => t.total), backgroundColor: list.map((t) => subjectColor(t.subjectCode)), borderRadius: 5 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (c) => list[c.dataIndex].subject } } }, scales: { x: { beginAtZero: true, grid: { display: true } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } },
  });
}
function drawSubject(id, ds, type = 'pie') {
  mk(id, {
    type,
    data: { labels: ds.subjects.map((s) => s.name), datasets: [{ data: ds.subjects.map((s) => s.count), backgroundColor: ds.subjects.map((s) => subjectColor(s.code)), borderWidth: 2, borderColor: 'transparent' }] },
    options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } },
  });
}
function drawGrade(id, st) {
  const keys = Object.keys(st.grades).sort();
  mk(id, {
    type: 'doughnut',
    data: { labels: keys.map((k) => `Khối ${k}`), datasets: [{ data: keys.map((k) => st.grades[k]), backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6'], borderWidth: 2, borderColor: 'transparent' }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } },
  });
}
function drawDayLoad(id, st) {
  mk(id, {
    type: 'line',
    data: {
      labels: DAYS.map((d) => d.name),
      datasets: [
        { label: 'Số tiết', data: st.byDay.map((a) => a.length), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,.15)', fill: true, tension: 0.35, pointRadius: 4 },
        { label: 'Số giáo viên có tiết', data: st.byDay.map((a) => new Set(a.map((r) => r.teacher).filter(Boolean)).size), borderColor: '#10B981', tension: 0.35, pointRadius: 4 },
      ],
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
  });
}
function drawPeriodLoad(id, st) {
  mk(id, {
    type: 'line',
    data: {
      labels: st.periods.map((p) => `Tiết ${p}`),
      datasets: [
        { label: 'Số lớp học cùng lúc (cả tuần)', data: st.byPeriod.map((a) => a.length), borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,.15)', fill: true, tension: 0.3, pointRadius: 4 },
        { label: 'Số GV đứng lớp (cả tuần)', data: st.byPeriod.map((a) => new Set(a.map((r) => r.teacher).filter(Boolean)).size), borderColor: '#EF4444', tension: 0.3, pointRadius: 4 },
      ],
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
  });
}
function drawHist(id, st) {
  mk(id, {
    type: 'bar',
    data: { labels: st.bins.map((b) => b[0] + ' tiết'), datasets: [{ label: 'Số giáo viên', data: st.hist, backgroundColor: ['#94A3B8', '#0EA5E9', '#10B981', '#F59E0B', '#F97316', '#EF4444'], borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}
function wireChartButtons(host) {
  host.querySelectorAll('[data-chart]').forEach((b) => {
    b.onclick = () => exportChartPNG(charts.get(b.dataset.chart), safeName(b.dataset.chart) + '.png');
  });
}

/* ---------- Thẻ thống kê ---------- */
const statCard = (icon, color, value, label) => `
  <div class="col-6 col-md-4 col-xl"><div class="stat-card glass"><span class="stat-ic bg-${color}-soft"><i class="bi ${icon}"></i></span>
    <div><div class="stat-v" data-count="${value}">${value}</div><div class="stat-l">${label}</div></div></div></div>`;

/* ---------- Dashboard ---------- */
export function renderDashboard(host, ds, ctx) {
  destroyCharts(); applyChartTheme();
  const st = stats(ds);
  const t = ds.totals;
  const now = periodInfo(new Date(), ds.maxPeriod);
  const live = now.current ? (ds.bySlot.get(`${now.day}|${now.current.period}`) || []).filter((r) => !r.event) : [];
  const liveTeachers = new Set(live.map((r) => r.teacher).filter(Boolean)).size;
  const statusText = {
    in: `Tiết ${now.current?.period} đang diễn ra`, break: 'Giờ ra chơi', before: 'Chưa vào học', after: 'Đã hết giờ học', off: 'Hôm nay nghỉ (Chủ Nhật)',
  }[now.status];
  const weekRange = ds.meta.start ? `${new Date(ds.meta.start).toLocaleDateString('vi-VN')} – ${new Date(ds.meta.end).toLocaleDateString('vi-VN')}` : '';

  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-speedometer2"></i> Dashboard</h2>
      <p class="text-muted mb-0">${escapeHtml(ds.school)}${ds.meta.week ? ` · Thời khóa biểu tuần ${ds.meta.week}` : ''}${weekRange ? ` (${weekRange})` : ''}</p></div></div>
    <div class="row g-3 mb-3">
      ${statCard('bi-person-workspace', 'primary', t.teachers, 'Tổng giáo viên')}
      ${statCard('bi-people', 'info', t.classes, 'Tổng lớp')}
      ${statCard('bi-journal-bookmark', 'success', t.subjects, 'Tổng môn')}
      ${statCard('bi-calendar3-week', 'warning', t.periods, 'Tổng số tiết / tuần')}
      ${statCard('bi-door-open', 'danger', t.rooms, 'Số phòng học')}
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-4"><div class="glass card-pad h-100 live-card">
        <div class="card-title-row"><h6><i class="bi bi-broadcast"></i> Thời gian thực</h6></div>
        <div class="live-status ${now.status}">${statusText}</div>
        <div class="text-muted small mb-2">${now.current ? `${now.current.start}–${now.current.end}` : ''}${now.next ? ` · Tiết kế tiếp: Tiết ${now.next.period} (${now.next.start})` : ''}</div>
        ${now.current && now.day <= 7 ? `<div class="live-numbers"><div><b>${live.length}</b><span>lớp đang học</span></div><div><b>${liveTeachers}</b><span>giáo viên đứng lớp</span></div></div>` : '<p class="text-muted small mb-0">Không có tiết học nào đang diễn ra lúc này.</p>'}
      </div></div>
      <div class="col-lg-8"><div class="glass card-pad h-100">
        <div class="card-title-row"><h6><i class="bi bi-sticky"></i> Ghi chú của thời khóa biểu</h6></div>
        ${ds.notes.length ? `<ul class="note-list">${ds.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '<p class="text-muted small mb-0">TKB không có ghi chú.</p>'}
      </div></div>
    </div>
    <div class="row g-3">
      ${chartCard('chTeacher', 'Số tiết theo giáo viên (Top 12)', 340)}
      ${chartCard('chSubject', 'Số tiết theo môn', 340)}
      ${chartCard('chGrade', 'Phân bố theo khối', 300)}
      ${chartCard('chDay', 'Tải giảng dạy theo ngày', 300)}
    </div>`;
  drawTeacherBar('chTeacher', ds, st, 12);
  drawSubject('chSubject', ds, 'pie');
  drawGrade('chGrade', st);
  drawDayLoad('chDay', st);
  wireChartButtons(host);
}

/* ---------- Thống kê chi tiết ---------- */
export function renderStats(host, ds, ctx) {
  destroyCharts(); applyChartTheme();
  const st = stats(ds);
  const rowsH = Math.max(340, st.teachersSorted.length * 20 + 60);
  const busiest = st.teachersSorted.slice(0, 5);
  const avg = st.teachersSorted.length ? (st.teachersSorted.reduce((a, t) => a + t.total, 0) / st.teachersSorted.length).toFixed(1) : 0;

  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-bar-chart-line"></i> Thống Kê</h2>
      <p class="text-muted mb-0">Biểu đồ trực quan – mỗi biểu đồ có thể xuất PNG.</p></div></div>
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-primary-soft"><i class="bi bi-calculator"></i></span><div><div class="stat-v">${avg}</div><div class="stat-l">Tiết TB / giáo viên</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-danger-soft"><i class="bi bi-lightning-charge"></i></span><div><div class="stat-v">${busiest[0]?.total ?? 0}</div><div class="stat-l">Tiết nhiều nhất${busiest[0] ? ` – ${escapeHtml(busiest[0].name.split(' ').slice(-2).join(' '))}` : ''}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-success-soft"><i class="bi bi-person-check"></i></span><div><div class="stat-v">${st.teachersSorted.length}</div><div class="stat-l">GV có tiết</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-warning-soft"><i class="bi bi-person-dash"></i></span><div><div class="stat-v">${ds.teachers.length - st.teachersSorted.length}</div><div class="stat-l">GV chưa có tiết</div></div></div></div>
    </div>
    <div class="row g-3">
      ${chartCard('chTeacherAll', 'Số tiết theo giáo viên (tất cả)', rowsH, 'col-12')}
      ${chartCard('chSubject', 'Tỷ lệ tiết theo môn (Pie)', 360)}
      ${chartCard('chSubjectBar', 'Số tiết theo môn (Doughnut)', 360)}
      ${chartCard('chGrade', 'Phân bố theo khối (Doughnut)', 320)}
      ${chartCard('chHist', 'Phân bố tải giảng dạy của giáo viên (Bar)', 320)}
      ${chartCard('chDay', 'Tải giảng dạy theo ngày (Line)', 320)}
      ${chartCard('chPeriod', 'Tải theo tiết học (Line)', 320)}
    </div>`;
  drawTeacherBar('chTeacherAll', ds, st, 0);
  drawSubject('chSubject', ds, 'pie');
  drawSubject('chSubjectBar', ds, 'doughnut');
  drawGrade('chGrade', st);
  drawHist('chHist', st);
  drawDayLoad('chDay', st);
  drawPeriodLoad('chPeriod', st);
  wireChartButtons(host);
}
