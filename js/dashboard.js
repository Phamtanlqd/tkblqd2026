/* =====================================================================
 * dashboard.js – Dashboard tổng quan và trang Thống Kê (Chart.js + GV rảnh dạy thay)
 * ===================================================================== */
import { DAYS, PERIODS, escapeHtml, subjectColor, periodInfo, dayName, subjectName } from './utils.js';
import { exportChartPNG, safeName } from './export.js';

const charts = new Map();

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

/* ---------- Tính số liệu tổng quan ---------- */
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

/* ---------- Thống kê GV trống tiết theo môn & tiết (phục vụ dạy thay) ---------- */
/**
 * Xác định danh sách GV đúng chuyên môn của từng môn học (tránh nhầm lẫn GV trùng tên / khác môn chính).
 * Ưu tiên:
 *  1. GV có môn chính (ds.teachers[i].subjectCode) trùng với mã môn s.code.
 *  2. Nếu môn chưa có ai khớp môn chính, lấy từ s.teachers nhưng loại bỏ GV có môn chính khác rõ ràng.
 */
function getStrictTeachersBySubject(ds) {
  const teacherInfoByName = new Map();
  for (const t of ds.teachers || []) {
    teacherInfoByName.set(t.name, t);
  }

  // Đếm số tiết thực tế của từng GV theo từng môn (chỉ tính các tiết không phải event)
  const subjectCountsByTeacher = new Map();
  for (const r of ds.records || []) {
    if (r.event || !r.teacher || !r.subjectCode) continue;
    if (!subjectCountsByTeacher.has(r.teacher)) subjectCountsByTeacher.set(r.teacher, new Map());
    const m = subjectCountsByTeacher.get(r.teacher);
    m.set(r.subjectCode, (m.get(r.subjectCode) || 0) + 1);
  }

  const getPrimarySubjectCode = (tName) => {
    const tObj = teacherInfoByName.get(tName);
    if (tObj?.subjectCode) return tObj.subjectCode;
    const cntMap = subjectCountsByTeacher.get(tName);
    if (!cntMap || !cntMap.size) return '';
    return [...cntMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  return (ds.subjects || []).map((s) => {
    const primaryMatches = new Set();
    for (const t of ds.teachers || []) {
      if (t.subjectCode === s.code) primaryMatches.add(t.name);
    }

    let finalNames = [...primaryMatches];
    if (!finalNames.length) {
      // Dự phòng nếu ds.teachers không có subjectCode: chỉ lấy GV không thuộc môn chính khác
      finalNames = (s.teachers || []).filter((tName) => {
        const pCode = getPrimarySubjectCode(tName);
        return !pCode || pCode === s.code;
      });
    }

    finalNames.sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      code: s.code,
      name: s.name || subjectName(s.code),
      teachers: finalNames,
    };
  });
}

/**
 * Trả về danh sách GV cùng môn đang rảnh tại (ngày d, tiết p) hoặc tổng hợp theo khoảng ngày/tiết.
 * @param {Object} ds - Dataset từ buildDataset()
 * @param {Object} filter - { subjectCode: 'ALL'|string, day: 'ALL'|number, session: 'all'|'am'|'pm' }
 */
export function computeFreeTeachersBySubjectAndPeriod(ds, filter = {}) {
  const subjectCode = filter.subjectCode || 'ALL';
  const isSingleDay = filter.day && filter.day !== 'ALL';
  const dayFilter = isSingleDay ? Number(filter.day) : null;
  const session = filter.session || 'all';

  const activeDays = isSingleDay ? DAYS.filter((d) => d.n === dayFilter) : DAYS;
  const allPeriods = Array.from({ length: ds.maxPeriod }, (_, i) => i + 1);
  const visiblePeriods = allPeriods.filter((p) => {
    const info = PERIODS.find((x) => x.period === p);
    const ses = info?.session || (p >= 6 ? 'pm' : 'am');
    return session === 'all' || ses === session;
  });

  // Lưu lịch dạy của từng GV theo "day|period"
  const busySlotsByTeacher = new Map();
  for (const r of ds.records || []) {
    if (r.event || !r.teacher) continue;
    if (!busySlotsByTeacher.has(r.teacher)) busySlotsByTeacher.set(r.teacher, new Map());
    const tMap = busySlotsByTeacher.get(r.teacher);
    const k = `${r.day}|${r.period}`;
    if (!tMap.has(k)) tMap.set(k, []);
    tMap.get(k).push(r);
  }

  const teacherMeta = new Map((ds.teachers || []).map((t) => [t.name, t]));
  const subjList = getStrictTeachersBySubject(ds);

  const filteredSubjects =
    subjectCode === 'ALL' ? subjList : subjList.filter((s) => s.code === subjectCode);

  const periodTotals = {};
  visiblePeriods.forEach((p) => { periodTotals[p] = 0; });
  let grandTotal = 0;

  const rows = filteredSubjects.map((subj) => {
    const cells = {};
    let rowSum = 0;

    for (const p of visiblePeriods) {
      const freeByDay = [];
      const freeAllNames = new Set();

      for (const d of activeDays) {
        const freeNamesInDay = subj.teachers.filter((tName) => {
          const tMap = busySlotsByTeacher.get(tName);
          return !tMap || !tMap.has(`${d.n}|${p}`);
        });
        freeByDay.push({ day: d, teachers: freeNamesInDay });
        freeNamesInDay.forEach((n) => freeAllNames.add(n));
      }

      const count = isSingleDay
        ? (freeByDay[0]?.teachers.length ?? 0)
        : freeByDay.reduce((acc, item) => acc + item.teachers.length, 0);

      cells[p] = {
        count,
        totalTeachers: subj.teachers.length,
        freeTeachers: [...freeAllNames].map((name) => ({
          name,
          weekLoad: teacherMeta.get(name)?.total ?? 0,
        })),
        byDay: freeByDay,
      };
      rowSum += count;
      periodTotals[p] += count;
    }

    grandTotal += rowSum;
    return {
      code: subj.code,
      name: subj.name,
      teacherCount: subj.teachers.length,
      teachers: subj.teachers,
      cells,
      rowSum,
    };
  });

  return {
    isSingleDay,
    activeDays,
    periods: visiblePeriods,
    rows,
    periodTotals,
    grandTotal,
  };
}

function renderSubstituteDetailBox(detail) {
  if (!detail) return '';
  const { subjectName: sName, period, dayLabel, isSingleDay, cell } = detail;

  let contentHtml = '';
  if (isSingleDay) {
    if (!cell.freeTeachers.length) {
      contentHtml = `<div class="text-danger small"><i class="bi bi-exclamation-circle"></i> Không có giáo viên môn <b>${escapeHtml(sName)}</b> nào trống tiết ${period} vào ${escapeHtml(dayLabel)}.</div>`;
    } else {
      contentHtml = `
        <div class="d-flex flex-wrap gap-2">
          ${cell.freeTeachers
            .map(
              (t) => `<span class="badge text-bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-6 fw-normal">
                <i class="bi bi-person-check"></i> ${escapeHtml(t.name)} <small class="opacity-75">(${t.weekLoad} tiết/tuần)</small>
              </span>`
            )
            .join('')}
        </div>`;
    }
  } else {
    const dayBlocks = cell.byDay
      .map((dItem) => {
        const list = dItem.teachers.length
          ? dItem.teachers.map((n) => `<span class="badge text-bg-light border text-dark fw-normal">${escapeHtml(n)}</span>`).join(' ')
          : '<span class="text-muted small">Hết GV rảnh</span>';
        return `<div class="mb-1"><b class="me-1">${escapeHtml(dItem.day.name)}:</b> ${list}</div>`;
      })
      .join('');
    contentHtml = `<div class="small">${dayBlocks}</div>`;
  }

  return `
    <div class="alert alert-info mt-3 mb-0 py-2 px-3" id="subDetailBox">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <div>
          <i class="bi bi-person-lines-fill"></i>
          <b>GV môn ${escapeHtml(sName)} trống tiết ${period}</b> · <span class="text-muted">${escapeHtml(dayLabel)}</span>
        </div>
        <button type="button" class="btn-close btn-sm" id="btnCloseSubDetail" aria-label="Đóng"></button>
      </div>
      ${contentHtml}
    </div>`;
}

function renderFreeSlotSection(ds, state, selectedDetail = null) {
  const data = computeFreeTeachersBySubjectAndPeriod(ds, state);
  const subjectOptions = (ds.subjects || [])
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
    .map((s) => `<option value="${escapeHtml(s.code)}" ${state.subjectCode === s.code ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const dayOptions = DAYS
    .map((d) => `<option value="${d.n}" ${String(state.day) === String(d.n) ? 'selected' : ''}>${escapeHtml(d.name)}</option>`)
    .join('');

  const periodHeaders = data.periods.map((p) => `<th class="text-center">Tiết ${p}</th>`).join('');
  const periodFooters = data.periods
    .map((p) => `<th class="text-center text-primary">${data.periodTotals[p] ?? 0}</th>`)
    .join('');

  const bodyHtml = data.rows.length
    ? data.rows
        .map((r) => {
          const cellsHtml = data.periods
            .map((p) => {
              const c = r.cells[p];
              const count = c?.count ?? 0;
              const label = data.isSingleDay
                ? (count > 0 ? `${count} GV` : '0')
                : String(count);
              const cls = count === 0
                ? 'text-danger opacity-50'
                : 'text-success fw-semibold';
              const isSelected =
                selectedDetail &&
                selectedDetail.subjectCode === r.code &&
                selectedDetail.period === p;

              const tooltipNames = data.isSingleDay
                ? c.freeTeachers.map((x) => x.name).join(', ')
                : c.byDay.filter((x) => x.teachers.length).map((x) => `${x.day.short}: ${x.teachers.join(', ')}`).join(' | ');

              return `
                <td class="text-center p-1">
                  <button type="button"
                    class="btn btn-sm w-100 ${isSelected ? 'btn-primary' : 'btn-light'} ${isSelected ? '' : cls}"
                    data-sub-cell="${escapeHtml(r.code)}|${p}"
                    title="${escapeHtml(tooltipNames || 'Không có GV rảnh')}">
                    ${escapeHtml(label)}
                  </button>
                </td>`;
            })
            .join('');

          return `
            <tr>
              <td>
                <span class="d-inline-flex align-items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:50%;background:${subjectColor(r.code)};display:inline-block"></span>
                  <b>${escapeHtml(r.name)}</b>
                </span>
              </td>
              <td class="text-center" title="${escapeHtml(r.teachers.join(', '))}">${r.teacherCount}</td>
              ${cellsHtml}
              <td class="text-center fw-bold">${data.isSingleDay ? '—' : r.rowSum}</td>
            </tr>`;
        })
        .join('')
    : `<tr><td colspan="${data.periods.length + 3}" class="text-center text-muted py-3">Không có dữ liệu phù hợp bộ lọc.</td></tr>`;

  const scopeHint = data.isSingleDay
    ? `Hiển thị <b>số GV đúng môn đang rảnh</b> trong <b>${escapeHtml(dayName(Number(state.day)))}</b> — bấm vào từng ô để xem danh sách GV có thể dạy thay.`
    : `Hiển thị <b>tổng lượt GV rảnh (GV × ngày)</b> cả tuần — chọn một <b>Thứ</b> cụ thể để xem danh sách GV rảnh từng tiết.`;

  return `
    <div class="glass card-pad mb-3" id="freeSlotBySubjectCard">
      <div class="card-title-row flex-wrap gap-2 mb-2">
        <div>
          <h6 class="mb-0"><i class="bi bi-person-plus"></i> Giáo viên trống tiết theo môn &amp; tiết (hỗ trợ dạy thay)</h6>
          <small class="text-muted">${scopeHint}</small>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center no-export">
          <select id="fsSubject" class="form-select form-select-sm" style="width:auto;min-width:160px" aria-label="Lọc môn học">
            <option value="ALL" ${state.subjectCode === 'ALL' ? 'selected' : ''}>Tất cả môn học</option>
            ${subjectOptions}
          </select>
          <select id="fsDay" class="form-select form-select-sm" style="width:auto" aria-label="Chọn ngày">
            <option value="ALL" ${state.day === 'ALL' ? 'selected' : ''}>Cả tuần (T2–T7)</option>
            ${dayOptions}
          </select>
          <div class="btn-group btn-group-sm" role="group" aria-label="Lọc buổi">
            <button type="button" class="btn ${state.session === 'all' ? 'btn-primary' : 'btn-light'}" data-fs-ses="all">Tất cả</button>
            <button type="button" class="btn ${state.session === 'am' ? 'btn-primary' : 'btn-light'}" data-fs-ses="am">Sáng</button>
            <button type="button" class="btn ${state.session === 'pm' ? 'btn-primary' : 'btn-light'}" data-fs-ses="pm">Chiều</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-success" id="btnExportFreeSlotCsv" title="Xuất bảng CSV">
            <i class="bi bi-filetype-csv"></i> CSV
          </button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-bordered table-hover align-middle mb-0" id="freeSlotBySubjectTable">
          <thead class="table-light">
            <tr>
              <th>Môn học</th>
              <th class="text-center">Tổng GV</th>
              ${periodHeaders}
              <th class="text-center">${data.isSingleDay ? '—' : 'Tổng lượt'}</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
          <tfoot class="table-light">
            <tr>
              <th>Tổng ${data.isSingleDay ? 'GV rảnh' : 'lượt rảnh'} theo tiết</th>
              <th class="text-center">—</th>
              ${periodFooters}
              <th class="text-center text-primary">${data.isSingleDay ? '—' : data.grandTotal}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <div id="subDetailHost">${renderSubstituteDetailBox(selectedDetail)}</div>
    </div>`;
}

function exportFreeSlotCsv(data, ds) {
  const headers = ['Môn học', 'Tổng GV', ...data.periods.map((p) => `Tiết ${p}`), ...(data.isSingleDay ? [] : ['Tổng lượt rảnh'])];
  const lines = [headers];
  for (const r of data.rows) {
    const pVals = data.periods.map((p) => r.cells[p]?.count ?? 0);
    lines.push([r.name, r.teacherCount, ...pVals, ...(data.isSingleDay ? [] : [r.rowSum])]);
  }
  lines.push([
    'Tổng theo tiết',
    '',
    ...data.periods.map((p) => data.periodTotals[p] ?? 0),
    ...(data.isSingleDay ? [] : [data.grandTotal]),
  ]);

  const csv = lines
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName(`gv-trong-tiet-day-thay-${ds.meta?.week || 'tkb'}`) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
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

  const todayNum = new Date().getDay();
  const defaultDay = todayNum >= 1 && todayNum <= 6 ? String(todayNum + 1) : '2';

  ctx.state.freeSlotFilter = {
    subjectCode: 'ALL',
    day: defaultDay,
    session: 'all',
    ...(ctx.state.freeSlotFilter || {}),
  };
  let selectedDetail = null;

  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-bar-chart-line"></i> Thống Kê</h2>
      <p class="text-muted mb-0">Tra cứu GV trống tiết theo môn &amp; tiết để bố trí dạy thay, cùng biểu đồ trực quan.</p></div></div>
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-primary-soft"><i class="bi bi-calculator"></i></span><div><div class="stat-v">${avg}</div><div class="stat-l">Tiết TB / giáo viên</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-danger-soft"><i class="bi bi-lightning-charge"></i></span><div><div class="stat-v">${busiest[0]?.total ?? 0}</div><div class="stat-l">Tiết nhiều nhất${busiest[0] ? ` – ${escapeHtml(busiest[0].name.split(' ').slice(-2).join(' '))}` : ''}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-success-soft"><i class="bi bi-person-check"></i></span><div><div class="stat-v">${st.teachersSorted.length}</div><div class="stat-l">GV có tiết</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-warning-soft"><i class="bi bi-person-dash"></i></span><div><div class="stat-v">${ds.teachers.length - st.teachersSorted.length}</div><div class="stat-l">GV chưa có tiết</div></div></div></div>
    </div>

    <div id="freeSlotHost">${renderFreeSlotSection(ds, ctx.state.freeSlotFilter, selectedDetail)}</div>

    <div class="row g-3">
      ${chartCard('chTeacherAll', 'Số tiết theo giáo viên (tất cả)', rowsH, 'col-12')}
      ${chartCard('chSubject', 'Tỷ lệ tiết theo môn (Pie)', 360)}
      ${chartCard('chSubjectBar', 'Số tiết theo môn (Doughnut)', 360)}
      ${chartCard('chGrade', 'Phân bố theo khối (Doughnut)', 320)}
      ${chartCard('chHist', 'Phân bố tải giảng dạy của giáo viên (Bar)', 320)}
      ${chartCard('chDay', 'Tải giảng dạy theo ngày (Line)', 320)}
      ${chartCard('chPeriod', 'Tải theo tiết học (Line)', 320)}
    </div>`;

  const refreshFreeSlot = () => {
    const fsHost = host.querySelector('#freeSlotHost');
    if (!fsHost) return;
    fsHost.innerHTML = renderFreeSlotSection(ds, ctx.state.freeSlotFilter, selectedDetail);

    fsHost.querySelector('#fsSubject')?.addEventListener('change', (e) => {
      ctx.state.freeSlotFilter.subjectCode = e.target.value;
      selectedDetail = null;
      refreshFreeSlot();
    });
    fsHost.querySelector('#fsDay')?.addEventListener('change', (e) => {
      ctx.state.freeSlotFilter.day = e.target.value;
      selectedDetail = null;
      refreshFreeSlot();
    });
    fsHost.querySelectorAll('[data-fs-ses]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.state.freeSlotFilter.session = btn.dataset.fsSes;
        selectedDetail = null;
        refreshFreeSlot();
      });
    });
    fsHost.querySelectorAll('[data-sub-cell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [sCode, pStr] = btn.dataset.subCell.split('|');
        const period = Number(pStr);
        const computed = computeFreeTeachersBySubjectAndPeriod(ds, ctx.state.freeSlotFilter);
        const row = computed.rows.find((x) => x.code === sCode);
        const cell = row?.cells[period];
        if (!row || !cell) return;

        if (selectedDetail && selectedDetail.subjectCode === sCode && selectedDetail.period === period) {
          selectedDetail = null;
        } else {
          selectedDetail = {
            subjectCode: sCode,
            subjectName: row.name,
            period,
            dayLabel: computed.isSingleDay ? dayName(Number(ctx.state.freeSlotFilter.day)) : 'Cả tuần (T2–T7)',
            isSingleDay: computed.isSingleDay,
            cell,
          };
        }
        refreshFreeSlot();
      });
    });
    fsHost.querySelector('#btnCloseSubDetail')?.addEventListener('click', () => {
      selectedDetail = null;
      refreshFreeSlot();
    });
    fsHost.querySelector('#btnExportFreeSlotCsv')?.addEventListener('click', () => {
      exportFreeSlotCsv(computeFreeTeachersBySubjectAndPeriod(ds, ctx.state.freeSlotFilter), ds);
    });
  };
  refreshFreeSlot();

  drawTeacherBar('chTeacherAll', ds, st, 0);
  drawSubject('chSubject', ds, 'pie');
  drawSubject('chSubjectBar', ds, 'doughnut');
  drawGrade('chGrade', st);
  drawHist('chHist', st);
  drawDayLoad('chDay', st);
  drawPeriodLoad('chPeriod', st);
  wireChartButtons(host);
}
