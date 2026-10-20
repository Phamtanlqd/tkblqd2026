/* =====================================================================
 * teacher.js – Trang "TKB Giáo Viên" + khung "Lịch hôm nay" (dùng chung với class.js)
 * ===================================================================== */
import {
  DAYS, PERIODS, escapeHtml, createCombobox, buildGridTable, subjectChip, subjectColor, periodInfo, dayName, formatDate,
  sessionToggle, wireSessionToggle, periodRange,
} from './utils.js';
import { wireExportBar, exportHeader, shareUrl } from './export.js';

export const emptyState = (msg, icon = 'bi-inbox') =>
  `<div class="empty-state glass"><i class="bi ${icon}"></i><p>${msg}</p>
   <a class="btn btn-primary" href="#/settings"><i class="bi bi-upload"></i> Nạp file thời khóa biểu</a></div>`;

/**
 * Khung "Lịch hôm nay".
 * recs: các bản ghi của đối tượng đang xem; mode = 'teacher' | 'class'
 */
export function todayCard(ds, recs, mode) {
  const now = periodInfo(new Date(), ds.maxPeriod);
  const isToday = now.day <= 7;
  const day = isToday ? now.day : 2;
  const label = isToday ? `Lịch hôm nay – ${dayName(day)} ${formatDate(new Date())}` : `Hôm nay nghỉ (Chủ Nhật) – lịch ${dayName(day)}`;
  const list = recs.filter((r) => r.day === day).sort((a, b) => a.period - b.period);
  // "mốc" hiện tại tính theo tiết: đang học = số tiết, giờ ra chơi/chưa vào học = nửa tiết
  const mark = now.status === 'in' ? now.current.period : now.status === 'after' ? 99 : (now.next?.period ?? 99) - 0.5;
  const nextP = isToday ? list.find((r) => r.period > mark)?.period : null;
  const items = list.map((r) => {
    const per = PERIODS.find((p) => p.period === r.period);
    const cur = isToday && r.period === mark;
    const past = isToday && r.period < mark;
    const nxt = r.period === nextP && !cur;
    const who = mode === 'teacher' ? escapeHtml(r.class) : (r.event ? '' : escapeHtml(r.teacher || 'Chưa có GV'));
    const what = mode === 'teacher' ? '' : subjectChip(r.subjectCode, r.subject);
    return `<li class="today-item ${cur ? 'cur' : ''} ${past ? 'past' : ''} ${nxt ? 'nxt' : ''}" style="--c:${subjectColor(r.subjectCode)}">
      <div class="ti-p">Tiết ${r.period}</div>
      <div class="ti-body"><b>${r.event ? escapeHtml(r.eventText) : mode === 'teacher' ? `${who}` : escapeHtml(r.subject)}</b>
        ${mode === 'teacher' ? `<span>${subjectChip(r.subjectCode, r.subject)}</span>` : `<span class="text-muted">${who}</span>`}
        <small>${per ? `${per.start}–${per.end}` : ''}${r.room && !r.roomAuto ? ` · ${escapeHtml(r.room)}` : ''}</small></div>
      ${cur ? '<span class="badge text-bg-success">Đang diễn ra</span>' : nxt ? '<span class="badge text-bg-primary">Tiếp theo</span>' : past ? '<span class="badge text-bg-light">Đã xong</span>' : ''}
    </li>`;
  }).join('');
  return `<div class="glass card-pad today-card h-100">
    <div class="card-title-row"><h6><i class="bi bi-calendar-day"></i> ${label}</h6></div>
    ${items ? `<ul class="today-list">${items}</ul>` : '<p class="text-muted mb-0">Không có tiết nào trong ngày.</p>'}
  </div>`;
}

/** Ô lịch trong bảng TKB giáo viên */
function teacherCell(rs) {
  if (!rs?.length) return '';
  return rs.map((r) => `<div class="lesson ${rs.length > 1 ? 'clash' : ''}" style="--c:${subjectColor(r.subjectCode)}">
    <b>${escapeHtml(r.class)}</b><span>${escapeHtml(r.subject)}</span>${r.room && !r.roomAuto ? `<small><i class="bi bi-door-open"></i> ${escapeHtml(r.room)}</small>` : ''}</div>`).join('');
}

const initials = (n) => n.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();

export function renderTeacher(host, ds, ctx, param) {
  if (!ds.teachers.length) { host.innerHTML = `<div class="page-head"><h2><i class="bi bi-person-workspace"></i> TKB Giáo Viên</h2></div>${emptyState('Chưa có dữ liệu giáo viên. Hãy nạp file "TKB giáo viên".')}`; return; }
  let name = param ? decodeURIComponent(param) : ctx.state.selTeacher;
  if (!ds.teachers.some((t) => t.name === name)) name = (ds.teachers.find((t) => t.total > 0) || ds.teachers[0]).name;
  ctx.state.selTeacher = name;
  const session = ctx.state.session || 'all';
  const range = periodRange(session, ds.maxPeriod);
  const idx = ds.teachers.findIndex((t) => t.name === name);
  const t = ds.teachers[idx];
  const recs = (ds.byTeacher.get(name) || []).filter((r) => !r.event);
  const slot = new Map();
  recs.forEach((r) => { const k = `${r.day}|${r.period}`; const a = slot.get(k); a ? a.push(r) : slot.set(k, [r]); });
  const days = new Set(recs.map((r) => r.day)).size;

  host.innerHTML = `
    <div class="page-head">
      <div><h2><i class="bi bi-person-workspace"></i> TKB Giáo Viên</h2></div>
      <div class="actions d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-light" id="prevT" title="Giáo viên trước"><i class="bi bi-chevron-left"></i></button>
        <div id="tCombo" class="cbx-host"></div>
        <button class="btn btn-light" id="nextT" title="Giáo viên sau"><i class="bi bi-chevron-right"></i></button>
      </div>
    </div>
    <div class="glass card-pad mb-3">
      <div class="entity-head">
        <div class="avatar">${escapeHtml(initials(t.name))}</div>
        <div class="flex-grow-1">
          <h4 class="mb-1">${escapeHtml(t.name)}</h4>
          <div>${t.subjectCode ? subjectChip(t.subjectCode, t.subject) : '<span class="text-muted">Chưa rõ môn</span>'}</div>
        </div>
        <div class="entity-stats">
          <div><b>${t.total}</b><span>Tổng số tiết</span></div>
          <div><b>${t.classes.length}</b><span>Số lớp phụ trách</span></div>
          <div><b>${days}</b><span>Số ngày dạy</span></div>
        </div>
      </div>
      <div class="mt-3 chips">${t.classes.map((c) => `<a class="chip" href="#/class/${encodeURIComponent(c)}">${escapeHtml(c)}</a>`).join('') || '<span class="text-muted small">Chưa phụ trách lớp nào.</span>'}</div>
    </div>
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="glass card-pad">
          <div class="card-title-row"><h6><i class="bi bi-table"></i> Thời khóa biểu tuần</h6>
            ${sessionToggle(session, ds.maxPeriod)}
            <div class="export-bar no-export">
              <button class="btn btn-sm btn-light" data-export="print"><i class="bi bi-printer"></i> In</button>
              <button class="btn btn-sm btn-light" data-export="pdf"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
              <button class="btn btn-sm btn-light" data-export="png"><i class="bi bi-image"></i> PNG</button>
              <button class="btn btn-sm btn-light" data-export="excel"><i class="bi bi-file-earmark-excel"></i> Excel</button>
              <button class="btn btn-sm btn-primary" data-export="qr"><i class="bi bi-qr-code"></i> QR</button>
            </div></div>
          <div id="tExport">
            ${exportHeader(ds.school, `TKB giáo viên: ${t.name}`, `${t.subject || ''} · ${t.total} tiết/tuần${ds.meta.week ? ` · Tuần ${ds.meta.week}` : ''}`)}
            ${buildGridTable(ds.maxPeriod, (d, p) => teacherCell(slot.get(`${d}|${p}`)), { id: 'tTable', range })}
            ${ds.hasAfternoon && session !== 'am' ? '<p class="legend no-export">CK, HSG-CT, HSG-QG, Tự chọn: ký hiệu theo thời khóa biểu buổi chiều của trường.</p>' : ''}
          </div>
        </div>
      </div>
      <div class="col-xl-4">${todayCard(ds, recs, 'teacher')}</div>
    </div>`;

  const items = ds.teachers.map((x) => ({ value: x.name, label: x.name, sub: `${x.subject || '—'} · ${x.total} tiết` }));
  createCombobox(host.querySelector('#tCombo'), {
    items, value: name, placeholder: 'Tìm giáo viên…',
    onSelect: (v) => { location.hash = '#/teacher/' + encodeURIComponent(v); },
  });
  const go = (d) => { location.hash = '#/teacher/' + encodeURIComponent(ds.teachers[(idx + d + ds.teachers.length) % ds.teachers.length].name); };
  host.querySelector('#prevT').onclick = () => go(-1);
  host.querySelector('#nextT').onclick = () => go(1);

  wireSessionToggle(host, ctx);
  wireExportBar(host, {
    getEl: () => host.querySelector('#tExport'),
    getName: () => `tkb-${t.name}`,
    getAOA: () => [
      [`TKB giáo viên: ${t.name}`, t.subject, `${t.total} tiết`], [],
      ['Tiết', ...DAYS.map((d) => d.name)],
      ...Array.from({ length: range[1] - range[0] + 1 }, (_, k) => k + range[0] - 1).map((i) => [`Tiết ${i + 1}`, ...DAYS.map((d) => (slot.get(`${d.n}|${i + 1}`) || []).map((r) => `${r.class} - ${r.subject}`).join('\n'))]),
    ],
    getQR: () => ({
      title: `TKB ${t.name}`,
      url: shareUrl('/teacher/' + encodeURIComponent(t.name)),
      text: `TKB ${t.name} (${t.subject || ''})${ds.meta.week ? ' - Tuan ' + ds.meta.week : ''}\n` +
        DAYS.map((d) => {
          const l = recs.filter((r) => r.day === d.n).sort((a, b) => a.period - b.period).map((r) => `T${r.period}:${r.class}`).join(' ');
          return l ? `${d.short}: ${l}` : '';
        }).filter(Boolean).join('\n'),
    }),
  });
}
