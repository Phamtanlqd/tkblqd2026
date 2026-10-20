/* =====================================================================
 * validator.js – Kiểm tra xung đột / thiếu dữ liệu và trang "Kiểm Tra Lỗi"
 * ===================================================================== */
import { escapeHtml, dayName, DAYS, subjectName, toast, AFTERNOON_FIRST } from './utils.js';
import { exportExcelAOA } from './export.js';

export const ISSUE_TYPES = {
  'teacher-conflict': { label: 'Giáo viên trùng tiết', sev: 'danger', icon: 'bi-person-x' },
  'class-conflict': { label: 'Lớp trùng tiết', sev: 'danger', icon: 'bi-people' },
  'room-conflict': { label: 'Phòng trùng tiết', sev: 'danger', icon: 'bi-door-closed' },
  'missing-teacher': { label: 'Thiếu giáo viên', sev: 'warning', icon: 'bi-person-dash' },
  'missing-subject': { label: 'Thiếu môn', sev: 'warning', icon: 'bi-journal-x' },
  'class-slot-missing': { label: 'Ô trống ở TKB lớp', sev: 'warning', icon: 'bi-grid-3x3-gap' },
  'subject-mismatch': { label: 'Lệch môn giữa 2 file', sev: 'warning', icon: 'bi-arrow-left-right' },
  'unknown-class': { label: 'Lớp không có trong TKB lớp', sev: 'warning', icon: 'bi-question-circle' },
  'gap': { label: 'Tiết trống giữa buổi', sev: 'info', icon: 'bi-hourglass-split' },
  'no-lessons': { label: 'Giáo viên chưa có tiết', sev: 'info', icon: 'bi-person' },
  'teacher-unresolved': { label: 'Chưa khớp giáo viên (buổi chiều)', sev: 'warning', icon: 'bi-person-question' },
  'teacher-weak': { label: 'Khớp tên nhưng khác môn (buổi chiều)', sev: 'info', icon: 'bi-person-exclamation' },
  'parse': { label: 'Ô không nhận dạng', sev: 'info', icon: 'bi-exclamation-diamond' },
};
const slotText = (d, p) => `${dayName(d)} · Tiết ${p}`;

/** Chạy toàn bộ kiểm tra, trả về mảng lỗi */
export function validate(ds) {
  const issues = [];
  const add = (type, detail, ref = {}) => issues.push({ type, sev: ISSUE_TYPES[type].sev, detail, ...ref });
  const group = (list, keyFn) => {
    const m = new Map();
    for (const r of list) { const k = keyFn(r); const a = m.get(k); a ? a.push(r) : m.set(k, [r]); }
    return m;
  };
  const real = ds.records.filter((r) => !r.event);

  // 1. Giáo viên trùng tiết (cùng GV, cùng thứ+tiết, khác lớp)
  for (const [, rs] of group(real.filter((r) => r.teacher), (r) => `${r.teacher}|${r.day}|${r.period}`)) {
    const classes = [...new Set(rs.map((r) => r.class))];
    if (classes.length > 1) add('teacher-conflict', `${rs[0].teacher} dạy cùng lúc các lớp ${classes.join(', ')} (${slotText(rs[0].day, rs[0].period)})`, { teacher: rs[0].teacher, day: rs[0].day, period: rs[0].period });
  }
  // 2. Lớp trùng tiết (cùng lớp, cùng thứ+tiết, nhiều GV/môn khác nhau)
  for (const [, rs] of group(real, (r) => `${r.class}|${r.day}|${r.period}`)) {
    const gv = [...new Set(rs.map((r) => r.teacher || r.subject))];
    if (gv.length > 1) add('class-conflict', `Lớp ${rs[0].class} có ${gv.length} giáo viên/môn cùng lúc: ${gv.join(' / ')} (${slotText(rs[0].day, rs[0].period)})`, { class: rs[0].class, day: rs[0].day, period: rs[0].period });
  }
  // 3. Phòng trùng tiết (chỉ xét phòng do dữ liệu cung cấp hoặc cấu hình phòng chuyên môn)
  for (const [, rs] of group(real.filter((r) => r.room && !r.roomAuto), (r) => `${r.room}|${r.day}|${r.period}`)) {
    const classes = [...new Set(rs.map((r) => r.class))];
    if (classes.length > 1) add('room-conflict', `${rs[0].room} được dùng bởi ${classes.join(', ')} (${slotText(rs[0].day, rs[0].period)})`, { room: rs[0].room, day: rs[0].day, period: rs[0].period });
  }
  // 4. Thiếu giáo viên / thiếu môn
  for (const r of real) {
    if (!r.teacher && !r.teacherShort && ds.hasTeacherFile) add('missing-teacher', `Lớp ${r.class} học ${r.subject || '(chưa rõ môn)'} nhưng chưa có giáo viên (${slotText(r.day, r.period)})`, { class: r.class, day: r.day, period: r.period });
    if (!r.subjectCode) add('missing-subject', `${r.teacher ? 'GV ' + r.teacher + ' – ' : ''}lớp ${r.class} chưa ghi môn (${slotText(r.day, r.period)})`, { teacher: r.teacher, class: r.class, day: r.day, period: r.period });
    if (ds.hasClassFile && ds.hasTeacherFile && r.fromTeacherFile && !r.inClassFile) add('class-slot-missing', `${r.teacher} dạy lớp ${r.class} nhưng TKB lớp để trống (${slotText(r.day, r.period)})`, { teacher: r.teacher, class: r.class, day: r.day, period: r.period });
    if (r.classSubjectCode && r.subjectCode && r.classSubjectCode !== r.subjectCode) add('subject-mismatch', `Lớp ${r.class}: TKB lớp ghi ${subjectName(r.classSubjectCode)}, TKB giáo viên (${r.teacher}) ghi ${subjectName(r.subjectCode)} (${slotText(r.day, r.period)})`, { teacher: r.teacher, class: r.class, day: r.day, period: r.period });
  }
  // 5. Lớp trong TKB giáo viên nhưng không có trong TKB lớp
  if (ds.hasClassFile && ds.hasTeacherFile) {
    const inClass = new Set(ds.records.filter((r) => !r.fromTeacherFile || r.inClassFile).map((r) => r.class));
    const seen = new Set();
    for (const r of real) if (r.fromTeacherFile && !inClass.has(r.class) && !seen.has(r.class)) { seen.add(r.class); add('unknown-class', `Lớp ${r.class} xuất hiện trong TKB giáo viên nhưng không có trong TKB lớp`, { class: r.class }); }
  }
  // 6. Tiết trống giữa buổi sáng của lớp (buổi chiều bố trí theo khối dòng nên không xét)
  for (const cls of ds.classes) {
    const recs = ds.byClass.get(cls.name) || [];
    for (const d of DAYS) {
      const ps = new Set(recs.filter((r) => r.day === d.n && r.period < AFTERNOON_FIRST).map((r) => r.period));
      if (!ps.size) continue;
      const last = Math.max(...ps);
      for (let p = Math.min(...ps); p < last; p++) if (!ps.has(p)) add('gap', `Lớp ${cls.name} trống ${slotText(d.n, p)} nhưng có tiết sau đó`, { class: cls.name, day: d.n, period: p });
    }
  }
  // 7. Giáo viên chưa có tiết
  if (ds.hasTeacherFile) for (const t of ds.teachers) if (!t.total) add('no-lessons', `${t.name} chưa có tiết nào trong tuần`, { teacher: t.name });
  // 8. Buổi chiều: tên giáo viên viết tắt chưa khớp được / khớp nhưng khác môn
  for (const g of ds.unresolved || []) {
    add('teacher-unresolved', `"${g.short}" (${subjectName(g.subjectCode) || 'chưa rõ môn'}${g.kind ? ' · ' + g.kind : ''}) – ${g.slots} tiết, lớp ${g.classes.join(', ')}. ${g.candidates?.length ? 'Có thể là: ' + g.candidates.join(' / ') : 'Không có giáo viên nào trùng tên'} → gán trong Cài Đặt.`, { class: g.classes[0] });
  }
  for (const w of ds.weakMatches || []) {
    add('teacher-weak', `"${w.short}" được khớp với ${w.teacher} nhưng giáo viên này chưa dạy ${subjectName(w.subjectCode)} ở buổi sáng – lớp ${w.cls} (${slotText(w.day, w.period)})`, { teacher: w.teacher, class: w.cls, day: w.day, period: w.period });
  }
  // 9. Lỗi đọc file
  for (const p of ds.parseIssues || []) add('parse', p.msg);

  const order = { danger: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.sev] - order[b.sev]);
}

/* ---------- Giao diện ---------- */
const SEV_BADGE = { danger: 'danger', warning: 'warning', info: 'secondary' };
const SEV_TEXT = { danger: 'Nghiêm trọng', warning: 'Cảnh báo', info: 'Thông tin' };

export function renderCheck(host, ds, ctx) {
  const issues = validate(ds);
  ctx.state.issues = issues;
  const count = (s) => issues.filter((i) => i.sev === s).length;
  const typeCount = {};
  issues.forEach((i) => { typeCount[i.type] = (typeCount[i.type] || 0) + 1; });
  let filter = ctx.state.checkFilter || 'all';

  host.innerHTML = `
    <div class="page-head">
      <div><h2><i class="bi bi-shield-check"></i> Kiểm Tra Lỗi</h2>
        <p class="text-muted mb-0">Phát hiện xung đột giáo viên, lớp, phòng học và dữ liệu còn thiếu.</p></div>
      <div class="actions"><button class="btn btn-outline-primary" id="chkExcel"><i class="bi bi-file-earmark-excel"></i> Xuất Excel</button></div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-danger-soft"><i class="bi bi-x-octagon"></i></span><div><div class="stat-v">${count('danger')}</div><div class="stat-l">Nghiêm trọng</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-warning-soft"><i class="bi bi-exclamation-triangle"></i></span><div><div class="stat-v">${count('warning')}</div><div class="stat-l">Cảnh báo</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-info-soft"><i class="bi bi-info-circle"></i></span><div><div class="stat-v">${count('info')}</div><div class="stat-l">Thông tin</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="stat-card glass"><span class="stat-ic bg-success-soft"><i class="bi bi-check2-circle"></i></span><div><div class="stat-v">${ds.records.length}</div><div class="stat-l">Bản ghi đã kiểm tra</div></div></div></div>
    </div>
    <div class="glass card-pad">
      <div class="chips mb-3" id="chkChips">
        <button class="chip ${filter === 'all' ? 'active' : ''}" data-f="all">Tất cả <b>${issues.length}</b></button>
        ${Object.entries(typeCount).map(([t, n]) => `<button class="chip ${filter === t ? 'active' : ''}" data-f="${t}"><i class="bi ${ISSUE_TYPES[t].icon}"></i> ${ISSUE_TYPES[t].label} <b>${n}</b></button>`).join('')}
      </div>
      <div id="chkList"></div>
    </div>`;

  const list = host.querySelector('#chkList');
  const draw = () => {
    const rows = issues.filter((i) => filter === 'all' || i.type === filter);
    if (!issues.length) { list.innerHTML = '<div class="empty-state"><i class="bi bi-check-circle text-success"></i><p>Không phát hiện lỗi nào. Thời khóa biểu hợp lệ.</p></div>'; return; }
    const shown = rows.slice(0, 500);
    list.innerHTML = `<div class="table-wrap"><table class="table table-sm align-middle issue-table"><thead><tr><th style="width:130px">Mức độ</th><th style="width:210px">Loại lỗi</th><th>Chi tiết</th><th style="width:150px"></th></tr></thead><tbody>
      ${shown.map((i) => `<tr><td><span class="badge text-bg-${SEV_BADGE[i.sev]}">${SEV_TEXT[i.sev]}</span></td>
        <td><i class="bi ${ISSUE_TYPES[i.type].icon}"></i> ${ISSUE_TYPES[i.type].label}</td><td>${escapeHtml(i.detail)}</td>
        <td class="text-end">${i.teacher ? `<a class="btn btn-sm btn-light" href="#/teacher/${encodeURIComponent(i.teacher)}">GV</a> ` : ''}${i.class ? `<a class="btn btn-sm btn-light" href="#/class/${encodeURIComponent(i.class)}">Lớp</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${rows.length > shown.length ? `<p class="text-muted small mb-0">Hiển thị ${shown.length}/${rows.length} dòng đầu – dùng "Xuất Excel" để xem đầy đủ.</p>` : ''}`;
  };
  draw();
  host.querySelector('#chkChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    filter = ctx.state.checkFilter = b.dataset.f;
    host.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
    draw();
  });
  host.querySelector('#chkExcel').onclick = () => {
    exportExcelAOA([{ name: 'Lỗi TKB', aoa: [['Mức độ', 'Loại lỗi', 'Chi tiết'], ...issues.map((i) => [SEV_TEXT[i.sev], ISSUE_TYPES[i.type].label, i.detail])] }], 'kiem-tra-loi-tkb.xlsx');
    toast('Đã xuất danh sách lỗi', 'success');
  };
}
