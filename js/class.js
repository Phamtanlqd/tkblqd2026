/* =====================================================================
 * class.js – Trang "TKB Lớp": thời khóa biểu tuần, giáo viên, môn, phòng
 * ===================================================================== */
import {
  DAYS, escapeHtml, createCombobox, buildGridTable, subjectChip, subjectColor,
  sessionToggle, wireSessionToggle, periodRange,
} from './utils.js';
import { wireExportBar, exportHeader, shareUrl } from './export.js';
import { todayCard, emptyState } from './teacher.js';

/** Ô TKB lớp: môn (tô màu) + giáo viên + phòng (chỉ hiện phòng khi khác phòng học chính của lớp) */
function classCell(rs, home) {
  if (!rs?.length) return '';
  return rs.map((r) => r.event
    ? `<div class="lesson event" style="--c:${subjectColor('EVENT')}"><span>${escapeHtml(r.eventText)}</span></div>`
    : `<div class="lesson ${rs.length > 1 ? 'clash' : ''}" style="--c:${subjectColor(r.subjectCode)}">
        <b>${escapeHtml(r.subject || '(chưa rõ môn)')}</b>
        <span>${r.teacher ? escapeHtml(r.teacher) : r.teacherShort ? `${escapeHtml(r.teacherShort)} <i class="text-warning" title="Chưa khớp được họ tên đầy đủ">(?)</i>` : '<i class="text-danger">Chưa có GV</i>'}</span>
        ${r.room && r.room !== home ? `<small><i class="bi bi-door-open"></i> ${escapeHtml(r.room)}</small>` : ''}</div>`).join('');
}

export function renderClass(host, ds, ctx, param) {
  if (!ds.classes.length) { host.innerHTML = `<div class="page-head"><h2><i class="bi bi-people"></i> TKB Lớp</h2></div>${emptyState('Chưa có dữ liệu lớp.')}`; return; }
  let name = param ? decodeURIComponent(param) : ctx.state.selClass;
  if (!ds.classes.some((c) => c.name === name)) name = ds.classes[0].name;
  ctx.state.selClass = name;
  const session = ctx.state.session || 'all';
  const range = periodRange(session, ds.maxPeriod);
  const idx = ds.classes.findIndex((c) => c.name === name);
  const cls = ds.classes[idx];
  const all = ds.byClass.get(name) || [];
  const recs = all.filter((r) => !r.event);
  const slot = new Map();
  all.forEach((r) => { const k = `${r.day}|${r.period}`; const a = slot.get(k); a ? a.push(r) : slot.set(k, [r]); });
  const teachers = [...new Set(recs.map((r) => r.teacher).filter(Boolean))];
  const subjCount = {};
  recs.forEach((r) => { subjCount[r.subjectCode] = (subjCount[r.subjectCode] || 0) + 1; });
  const subjList = Object.entries(subjCount).sort((a, b) => b[1] - a[1]);
  // Phòng học chính = phòng xuất hiện nhiều nhất trong TKB của lớp
  const roomCnt = {};
  recs.forEach((r) => { if (r.room) roomCnt[r.room] = (roomCnt[r.room] || 0) + 1; });
  const home = Object.keys(roomCnt).sort((a, b) => roomCnt[b] - roomCnt[a])[0] || '';
  const nameOf = (code) => recs.find((r) => r.subjectCode === code)?.subject || code;

  host.innerHTML = `
    <div class="page-head">
      <div><h2><i class="bi bi-people"></i> TKB Lớp</h2></div>
      <div class="actions d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-light" id="prevC" title="Lớp trước"><i class="bi bi-chevron-left"></i></button>
        <div id="cCombo" class="cbx-host"></div>
        <button class="btn btn-light" id="nextC" title="Lớp sau"><i class="bi bi-chevron-right"></i></button>
      </div>
    </div>
    <div class="glass card-pad mb-3">
      <div class="entity-head">
        <div class="avatar alt">${escapeHtml(cls.name)}</div>
        <div class="flex-grow-1"><h4 class="mb-1">Lớp ${escapeHtml(cls.name)}</h4><div class="text-muted">Khối ${cls.grade || '—'}${home ? ` · <i class="bi bi-door-open"></i> ${escapeHtml(home)}` : ''}</div></div>
        <div class="entity-stats">
          <div><b>${recs.length}</b><span>Số tiết / tuần</span></div>
          <div><b>${subjList.length}</b><span>Số môn</span></div>
          <div><b>${teachers.length}</b><span>Số giáo viên</span></div>
        </div>
      </div>
      <div class="mt-3 chips">${subjList.map(([c, n]) => `<span class="subj-chip" style="--c:${subjectColor(c)}">${escapeHtml(nameOf(c))} <b>${n}</b></span>`).join('')}</div>
    </div>
    <div class="row g-3">
      <div class="col-xl-9">
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
          <div id="cExport">
            ${exportHeader(ds.school, `Thời khóa biểu lớp ${cls.name}`, `${recs.length} tiết/tuần${ds.meta.week ? ` · Tuần ${ds.meta.week}` : ''}`)}
            ${buildGridTable(ds.maxPeriod, (d, p) => classCell(slot.get(`${d}|${p}`), home), { id: 'cTable', range })}
            ${ds.hasAfternoon && session !== 'am' ? '<p class="legend no-export">CK, HSG-CT, HSG-QG, Tự chọn: ký hiệu theo thời khóa biểu buổi chiều của trường.</p>' : ''}
          </div>
        </div>
      </div>
      <div class="col-xl-3">${todayCard(ds, all, 'class')}</div>
    </div>`;

  createCombobox(host.querySelector('#cCombo'), {
    items: ds.classes.map((c) => ({ value: c.name, label: c.name, sub: `Khối ${c.grade} · ${c.total} tiết` })),
    value: name, placeholder: 'Tìm lớp…',
    onSelect: (v) => { location.hash = '#/class/' + encodeURIComponent(v); },
  });
  const go = (d) => { location.hash = '#/class/' + encodeURIComponent(ds.classes[(idx + d + ds.classes.length) % ds.classes.length].name); };
  host.querySelector('#prevC').onclick = () => go(-1);
  host.querySelector('#nextC').onclick = () => go(1);

  wireSessionToggle(host, ctx);
  wireExportBar(host, {
    getEl: () => host.querySelector('#cExport'),
    getName: () => `tkb-lop-${cls.name}`,
    getAOA: () => [
      [`Thời khóa biểu lớp ${cls.name}`], [],
      ['Tiết', ...DAYS.map((d) => d.name)],
      ...Array.from({ length: range[1] - range[0] + 1 }, (_, k) => k + range[0] - 1).map((i) => [`Tiết ${i + 1}`, ...DAYS.map((d) => (slot.get(`${d.n}|${i + 1}`) || [])
        .map((r) => r.event ? r.eventText : [r.subject, r.teacher, r.room].filter(Boolean).join('\n')).join('\n---\n'))]),
    ],
    getQR: () => ({
      title: `TKB lớp ${cls.name}`,
      url: shareUrl('/class/' + encodeURIComponent(cls.name)),
      text: `TKB lop ${cls.name}${ds.meta.week ? ' - Tuan ' + ds.meta.week : ''}\n` +
        DAYS.map((d) => {
          const l = [...Array(ds.maxPeriod)].map((_, i) => (slot.get(`${d.n}|${i + 1}`) || [])[0]).map((r, i) => (r ? `${i + 1}.${r.event ? 'HD' : r.subject}` : '')).filter(Boolean).join(' ');
          return l ? `${d.short}: ${l}` : '';
        }).filter(Boolean).join('\n'),
    }),
  });
}
