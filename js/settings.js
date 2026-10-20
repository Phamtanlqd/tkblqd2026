/* =====================================================================
 * settings.js – Trang "Cài Đặt": giao diện, nạp file, cấu hình tiết, phòng, PWA
 * ===================================================================== */
import { PERIODS, DEFAULT_PERIODS, escapeHtml, toast, SUBJECTS, APP_VERSION, formatDate, subjectName } from './utils.js';
import { hashPassword } from './auth.js';

/** Giao diện cho người xem: chỉ đổi giao diện, cài ứng dụng và đăng nhập quản trị */
function renderVisitor(host, ds, ctx) {
  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-gear"></i> Cài Đặt</h2></div></div>
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="glass card-pad mb-3">
          <div class="card-title-row"><h6><i class="bi bi-palette"></i> Giao diện</h6></div>
          <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="swDark" ${ctx.theme === 'dark' ? 'checked' : ''}>
            <label class="form-check-label" for="swDark">Chế độ tối (Dark Mode)</label></div>
        </div>
        <div class="glass card-pad">
          <div class="card-title-row"><h6><i class="bi bi-phone"></i> Ứng dụng (PWA)</h6></div>
          <p class="small text-muted">Cài đặt lên thiết bị để mở nhanh và dùng offline.</p>
          <button class="btn btn-primary btn-sm" id="btnInstall" ${ctx.canInstall() ? '' : 'disabled'}><i class="bi bi-download"></i> Cài đặt ứng dụng</button>
          <p class="small text-muted mt-3 mb-0">Smart Timetable V2 · phiên bản ${APP_VERSION}${ds.meta.week ? ` · Dữ liệu tuần ${ds.meta.week}` : ''}</p>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="glass card-pad">
          <div class="card-title-row"><h6><i class="bi bi-shield-lock"></i> Quản trị</h6></div>
          <p class="small text-muted">Nạp file thời khóa biểu, xóa dữ liệu, chỉnh giờ học và phòng học chỉ dành cho quản trị viên.</p>
          <form id="loginForm" class="d-flex gap-2" autocomplete="off">
            <input type="password" id="adminPw" class="form-control" placeholder="Mật khẩu quản trị" autocomplete="current-password" required>
            <button class="btn btn-primary" type="submit"><i class="bi bi-box-arrow-in-right"></i> Đăng nhập</button>
          </form>
          <div id="loginMsg" class="small text-danger mt-2"></div>
        </div>
      </div>
    </div>`;
  host.querySelector('#swDark').onchange = (e) => ctx.setTheme(e.target.checked ? 'dark' : 'light');
  host.querySelector('#btnInstall').onclick = () => ctx.install();
  host.querySelector('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const r = await ctx.doLogin(host.querySelector('#adminPw').value);
    if (!r.ok) { host.querySelector('#loginMsg').textContent = r.msg; host.querySelector('#adminPw').select(); }
  };
}

/** Thẻ gán tên giáo viên buổi chiều: các tên viết tắt chưa khớp được duy nhất */
function aliasCard(ds) {
  const names = ds.teachers.map((t) => t.name);
  const rows = ds.unresolved.map((g, i) => {
    const cand = g.candidates?.length ? g.candidates : [];
    const rest = names.filter((n) => !cand.includes(n));
    return `<div class="alias-row"><div class="small"><b>${escapeHtml(g.short)}</b> · ${escapeHtml(subjectName(g.subjectCode) || 'chưa rõ môn')}${g.kind ? ' · ' + escapeHtml(g.kind) : ''}
        <span class="text-muted">(${g.slots} tiết, lớp ${escapeHtml(g.classes.join(', '))})</span></div>
      <select class="form-select form-select-sm alias-sel" data-key="${escapeHtml(g.key)}"><option value="">— chọn giáo viên —</option>
        ${cand.length ? `<optgroup label="Gợi ý">${cand.map((n) => `<option>${escapeHtml(n)}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Tất cả giáo viên">${rest.map((n) => `<option>${escapeHtml(n)}</option>`).join('')}</optgroup></select></div>`;
  }).join('');
  return `<div class="glass card-pad mb-3"><div class="card-title-row"><h6><i class="bi bi-person-lines-fill"></i> Gán tên giáo viên buổi chiều</h6></div>
    ${rows ? `<p class="small text-muted">TKB chiều ghi tên viết tắt. Các tên sau chưa khớp được duy nhất với họ tên đầy đủ:</p>${rows}
      <button class="btn btn-primary btn-sm mt-2" id="btnAliasSave"><i class="bi bi-save"></i> Lưu cách gán</button>`
      : '<p class="small text-success mb-0"><i class="bi bi-check-circle"></i> Tất cả tên giáo viên buổi chiều đã được khớp tự động.</p>'}
    ${Object.keys(ds.aliases || {}).length ? '<button class="btn btn-link btn-sm px-0 mt-1" id="btnAliasClear">Xóa các cách gán đã lưu</button>' : ''}</div>`;
}

export function renderSettings(host, ds, ctx) {
  if (!ctx.isAdmin()) return renderVisitor(host, ds, ctx);
  const s = ctx.settings;
  const src = ctx.sources;
  const fileInfo = (label, x) => x
    ? `<div class="src-row ok"><i class="bi bi-check-circle-fill"></i><div><b>${label}</b><br><small>${escapeHtml(x.fileName || 'đã nạp')} · ${x.records.length} bản ghi${x.meta?.week ? ` · Tuần ${x.meta.week}` : ''}</small></div></div>`
    : `<div class="src-row"><i class="bi bi-circle"></i><div><b>${label}</b><br><small>Chưa nạp</small></div></div>`;

  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-gear"></i> Cài Đặt</h2></div></div>
    <div class="row g-3">
      <div class="col-12"><div class="glass card-pad admin-bar">
        <div><i class="bi ${ctx.authEnabled() ? 'bi-unlock-fill text-success' : 'bi-exclamation-triangle-fill text-warning'}"></i>
          <b>${ctx.authEnabled() ? 'Đang ở chế độ quản trị' : 'Chưa bật mật khẩu quản trị – ai cũng chỉnh sửa được'}</b>
          ${ctx.authEnabled() ? `<small class="text-muted"> · phiên còn khoảng ${ctx.sessionLeftMinutes()} phút</small>` : ''}</div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-light" id="btnPwTool"><i class="bi bi-key"></i> Tạo mã mật khẩu mới</button>
          ${ctx.authEnabled() ? '<button class="btn btn-sm btn-outline-danger" id="btnLogout"><i class="bi bi-box-arrow-right"></i> Đăng xuất quản trị</button>' : ''}
        </div>
        <div class="small text-muted w-100">Dữ liệu nạp tại đây chỉ lưu trên trình duyệt này (xem trước). Để công bố cho mọi người: thay 2 file trong thư mục <code>assets/data</code> rồi đẩy lên GitHub.</div>
        <div id="pwTool" class="w-100" hidden>
          <div class="input-group input-group-sm mb-2"><input type="text" id="pwNew" class="form-control" placeholder="Nhập mật khẩu mới" autocomplete="off">
            <button class="btn btn-primary" id="pwGen">Tạo mã</button></div>
          <textarea id="pwOut" class="form-control form-control-sm" rows="2" readonly placeholder="Dán dòng ADMIN_HASH này vào js/config.js"></textarea>
        </div>
      </div></div>
      <div class="col-lg-6">
        <div class="glass card-pad mb-3">
          <div class="card-title-row"><h6><i class="bi bi-cloud-arrow-up"></i> Dữ liệu thời khóa biểu</h6></div>
          <div id="dropZone" class="drop-zone"><i class="bi bi-file-earmark-excel"></i>
            <p class="mb-1"><b>Kéo thả file .xls / .xlsx vào đây</b></p>
            <p class="small text-muted mb-2">Tự nhận dạng TKB giáo viên, TKB lớp (sáng) hoặc TKB buổi chiều – có thể chọn nhiều file cùng lúc.</p>
            <button class="btn btn-primary" id="btnPick"><i class="bi bi-upload"></i> Chọn file</button></div>
          ${fileInfo('TKB giáo viên', src.teacher)}${fileInfo('TKB lớp (buổi sáng)', src.class)}${fileInfo('TKB buổi chiều', src.afternoon)}
          ${ds.meta.start ? `<p class="small text-muted mt-2 mb-0">Tuần áp dụng: ${formatDate(new Date(ds.meta.start))} – ${formatDate(new Date(ds.meta.end))}</p>` : ''}
          <div class="d-flex gap-2 mt-3 flex-wrap">
            <button class="btn btn-outline-primary btn-sm" id="btnSample"><i class="bi bi-arrow-repeat"></i> Nạp lại dữ liệu mẫu</button>
            <button class="btn btn-outline-danger btn-sm" id="btnClear"><i class="bi bi-trash"></i> Xóa dữ liệu đã lưu</button>
          </div>
        </div>
        <div class="glass card-pad mb-3">
          <div class="card-title-row"><h6><i class="bi bi-palette"></i> Giao diện</h6></div>
          <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="swDark" ${ctx.theme === 'dark' ? 'checked' : ''}>
            <label class="form-check-label" for="swDark">Chế độ tối (Dark Mode) – lưu vào localStorage</label></div>
        </div>
        <div class="glass card-pad">
          <div class="card-title-row"><h6><i class="bi bi-phone"></i> Ứng dụng (PWA)</h6></div>
          <p class="small text-muted">Cài đặt ứng dụng lên thiết bị để mở nhanh và dùng offline sau lần tải đầu tiên.</p>
          <button class="btn btn-primary btn-sm" id="btnInstall" ${ctx.canInstall() ? '' : 'disabled'}><i class="bi bi-download"></i> Cài đặt ứng dụng</button>
          <span class="small text-muted ms-2" id="swState"></span>
          <p class="small text-muted mt-3 mb-0">Smart Timetable V2 · phiên bản ${APP_VERSION}</p>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="glass card-pad mb-3">
          <div class="card-title-row"><h6><i class="bi bi-clock-history"></i> Cấu hình giờ học</h6>
            <button class="btn btn-sm btn-light" id="btnPeriodReset">Mặc định</button></div>
          <div class="table-wrap"><table class="table table-sm align-middle mb-2"><thead><tr><th>Tiết</th><th>Bắt đầu</th><th>Kết thúc</th></tr></thead><tbody>
          ${PERIODS.map((p) => `<tr><td>Tiết ${p.period}</td>
            <td><input type="time" class="form-control form-control-sm p-start" data-p="${p.period}" value="${p.start}"></td>
            <td><input type="time" class="form-control form-control-sm p-end" data-p="${p.period}" value="${p.end}"></td></tr>`).join('')}
          </tbody></table></div>
          <button class="btn btn-primary btn-sm" id="btnPeriodSave"><i class="bi bi-save"></i> Lưu giờ học</button>
        </div>
        ${ds.hasAfternoon ? aliasCard(ds) : ''}
        <div class="glass card-pad">
          <div class="card-title-row"><h6><i class="bi bi-door-open"></i> Phòng học</h6></div>
          <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="swClassRoom" ${s.useClassRoom !== false ? 'checked' : ''}>
            <label class="form-check-label" for="swClassRoom">Nếu file không có phòng: mỗi lớp học tại phòng riêng "Phòng &lt;tên lớp&gt;"</label></div>
          <label class="form-label small fw-semibold">Phòng chuyên môn theo môn (tùy chọn)</label>
          <div class="row g-2" id="roomMap">
            ${['TIN', 'GDTC', 'GDQP', 'AI', 'LY', 'HOA', 'SINH'].map((c) => `<div class="col-6"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:96px">${SUBJECTS[c].name}</span>
              <input class="form-control" data-code="${c}" placeholder="vd: Phòng Tin học" value="${escapeHtml((s.subjectRooms || {})[c] || '')}"></div></div>`).join('')}
          </div>
          <p class="small text-muted mt-2">Môn có phòng chuyên môn sẽ dùng chung phòng đó → hệ thống sẽ cảnh báo nếu hai lớp học cùng phòng cùng tiết.</p>
          <button class="btn btn-primary btn-sm" id="btnRoomSave"><i class="bi bi-save"></i> Lưu cấu hình phòng</button>
        </div>
      </div>
    </div>`;

  /* --- sự kiện --- */
  host.querySelector('#btnLogout')?.addEventListener('click', () => ctx.doLogout());
  host.querySelector('#btnPwTool').onclick = () => { const t = host.querySelector('#pwTool'); t.hidden = !t.hidden; };
  host.querySelector('#pwGen').onclick = async () => {
    const pw = host.querySelector('#pwNew').value;
    if (pw.length < 6) return toast('Mật khẩu nên có ít nhất 6 ký tự', 'warning');
    host.querySelector('#pwOut').value = `ADMIN_HASH: '${await hashPassword(pw)}',`;
  };
  host.querySelector('#btnAliasSave')?.addEventListener('click', () => {
    const alias = { ...(s.teacherAlias || {}) };
    host.querySelectorAll('.alias-sel').forEach((sel) => { if (sel.value) alias[sel.dataset.key] = sel.value; });
    ctx.saveSettings({ ...s, teacherAlias: alias }); toast('Đã lưu cách gán tên giáo viên', 'success');
  });
  host.querySelector('#btnAliasClear')?.addEventListener('click', () => { ctx.saveSettings({ ...s, teacherAlias: {} }); toast('Đã xóa các cách gán', 'primary'); });
  const pick = host.querySelector('#btnPick');
  pick.onclick = () => ctx.pickFiles();
  const dz = host.querySelector('#dropZone');
  ['dragenter', 'dragover'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (ev) => ctx.importFiles([...ev.dataTransfer.files]));

  host.querySelector('#btnSample').onclick = () => ctx.reloadSample();
  host.querySelector('#btnClear').onclick = () => { if (confirm('Xóa toàn bộ dữ liệu TKB đã lưu trên thiết bị này?')) ctx.clearData(); };
  host.querySelector('#swDark').onchange = (e) => ctx.setTheme(e.target.checked ? 'dark' : 'light');
  host.querySelector('#btnInstall').onclick = () => ctx.install();
  host.querySelector('#btnPeriodReset').onclick = () => { ctx.savePeriods(DEFAULT_PERIODS); toast('Đã khôi phục giờ học mặc định', 'success'); };
  host.querySelector('#btnPeriodSave').onclick = () => {
    const list = PERIODS.map((p) => ({
      period: p.period,
      start: host.querySelector(`.p-start[data-p="${p.period}"]`).value || p.start,
      end: host.querySelector(`.p-end[data-p="${p.period}"]`).value || p.end,
    }));
    if (list.some((p) => p.start >= p.end)) return toast('Giờ kết thúc phải sau giờ bắt đầu', 'danger');
    ctx.savePeriods(list); toast('Đã lưu giờ học', 'success');
  };
  host.querySelector('#btnRoomSave').onclick = () => {
    const subjectRooms = {};
    host.querySelectorAll('#roomMap input').forEach((i) => { if (i.value.trim()) subjectRooms[i.dataset.code] = i.value.trim(); });
    ctx.saveSettings({ ...s, useClassRoom: host.querySelector('#swClassRoom').checked, subjectRooms });
    toast('Đã lưu cấu hình phòng', 'success');
  };
  host.querySelector('#swState').textContent = ('serviceWorker' in navigator)
    ? (navigator.serviceWorker.controller ? '✔ Offline đã sẵn sàng' : 'Offline sẽ sẵn sàng sau lần tải đầu') : 'Trình duyệt không hỗ trợ offline';
}
