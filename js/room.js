/* =====================================================================
 * room.js – Trang "Phòng Học": phòng đang dùng, tiết hiện tại, lớp & giáo viên
 * ===================================================================== */
import {
  DAYS, PERIODS, escapeHtml, normalize, periodInfo, buildGridTable, subjectChip, subjectColor, debounce, dayName,
} from './utils.js';
import { emptyState } from './teacher.js';
import { wireExportBar, exportHeader } from './export.js';

export function renderRooms(host, ds, ctx, param) {
  if (!ds.rooms.length) {
    host.innerHTML = `<div class="page-head"><h2><i class="bi bi-door-open"></i> Phòng Học</h2></div>${emptyState('Chưa có thông tin phòng học.', 'bi-door-closed')}`;
    return;
  }
  if (param) return renderRoomDetail(host, ds, ctx, decodeURIComponent(param));

  const now = periodInfo(new Date(), ds.maxPeriod);
  const st = ctx.state;
  if (!st.roomDay) { st.roomDay = now.day <= 7 ? now.day : 2; st.roomPeriod = now.current?.period || now.next?.period || 1; }
  const autoRooms = ds.records.some((r) => r.room) && ds.records.filter((r) => r.room).every((r) => r.roomAuto);
  const isLive = () => st.roomDay === now.day && st.roomPeriod === now.current?.period;

  host.innerHTML = `
    <div class="page-head">
      <div><h2><i class="bi bi-door-open"></i> Phòng Học</h2>
        <p class="text-muted mb-0">Tình trạng sử dụng phòng theo thứ và tiết.</p></div>
      <div class="actions d-flex gap-2 flex-wrap align-items-center">
        <select id="rDay" class="form-select w-auto">${DAYS.map((d) => `<option value="${d.n}" ${d.n === st.roomDay ? 'selected' : ''}>${d.name}</option>`).join('')}</select>
        <select id="rPeriod" class="form-select w-auto">${Array.from({ length: ds.maxPeriod }, (_, i) => {
          const p = PERIODS.find((x) => x.period === i + 1);
          return `<option value="${i + 1}" ${i + 1 === st.roomPeriod ? 'selected' : ''}>Tiết ${i + 1}${p ? ` (${p.start}–${p.end})` : ''}</option>`;
        }).join('')}</select>
        <button class="btn btn-outline-primary" id="rNow"><i class="bi bi-broadcast"></i> Hiện tại</button>
      </div>
    </div>
    ${autoRooms ? `<div class="alert alert-info glass-alert"><i class="bi bi-info-circle"></i> File thời khóa biểu chưa có cột phòng học nên hệ thống mặc định
      <b>mỗi lớp học tại một phòng riêng</b>. Bạn có thể ghi phòng trong ô dạng <code>11B1 - HOA (P201)</code> hoặc gán phòng chuyên môn trong <a href="#/settings">Cài Đặt</a>.</div>` : ''}
    <div class="row g-3 mb-3" id="rStats"></div>
    <div class="glass card-pad">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div class="chips" id="rChips">
          <button class="chip active" data-f="all">Tất cả</button><button class="chip" data-f="use">Đang sử dụng</button><button class="chip" data-f="free">Trống</button>
        </div>
        <input id="rSearch" class="form-control w-auto" placeholder="Lọc phòng / lớp / giáo viên…" style="min-width:240px">
      </div>
      <div class="table-wrap"><table class="table align-middle room-table"><thead><tr>
        <th>Phòng</th><th>Trạng thái</th><th>Lớp đang học</th><th>Môn</th><th>Giáo viên phụ trách</th></tr></thead><tbody id="rBody"></tbody></table></div>
    </div>`;

  let filter = 'all';
  const draw = () => {
    const q = normalize(host.querySelector('#rSearch').value.trim());
    const slot = (ds.bySlot.get(`${st.roomDay}|${st.roomPeriod}`) || []).filter((r) => r.room && !r.event);
    const used = new Map();
    slot.forEach((r) => { const a = used.get(r.room); a ? a.push(r) : used.set(r.room, [r]); });
    const rows = ds.rooms.map((room) => ({ room, rs: used.get(room) || [] }));
    host.querySelector('#rStats').innerHTML = [
      ['bi-door-open', 'primary', ds.rooms.length, 'Tổng số phòng'],
      ['bi-play-circle', 'success', used.size, 'Đang sử dụng'],
      ['bi-pause-circle', 'warning', ds.rooms.length - used.size, 'Đang trống'],
    ].map(([i, c, v, l]) => `<div class="col-4"><div class="stat-card glass"><span class="stat-ic bg-${c}-soft"><i class="bi ${i}"></i></span><div><div class="stat-v">${v}</div><div class="stat-l">${l}</div></div></div></div>`).join('');
    const shown = rows.filter(({ room, rs }) => {
      if (filter === 'use' && !rs.length) return false;
      if (filter === 'free' && rs.length) return false;
      if (!q) return true;
      return normalize(room + ' ' + rs.map((r) => `${r.class} ${r.subject} ${r.teacher}`).join(' ')).includes(q);
    });
    host.querySelector('#rBody').innerHTML = shown.length ? shown.map(({ room, rs }) => `<tr class="${rs.length ? '' : 'room-free'}">
      <td><a href="#/rooms/${encodeURIComponent(room)}"><b>${escapeHtml(room)}</b></a></td>
      <td>${rs.length ? '<span class="badge text-bg-success">Đang sử dụng</span>' : '<span class="badge text-bg-secondary">Trống</span>'}${isLive() && rs.length ? ' <span class="live-dot" title="Đang diễn ra"></span>' : ''}</td>
      <td>${rs.map((r) => `<a class="chip" href="#/class/${encodeURIComponent(r.class)}">${escapeHtml(r.class)}</a>`).join(' ') || '—'}</td>
      <td>${rs.map((r) => subjectChip(r.subjectCode, r.subject)).join(' ') || '—'}</td>
      <td>${rs.map((r) => r.teacher ? `<a href="#/teacher/${encodeURIComponent(r.teacher)}">${escapeHtml(r.teacher)}</a>` : '<i class="text-danger">Chưa có GV</i>').join('<br>') || '—'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="text-center text-muted py-4">Không có phòng phù hợp.</td></tr>';
  };
  draw();
  host.querySelector('#rDay').onchange = (e) => { st.roomDay = +e.target.value; draw(); };
  host.querySelector('#rPeriod').onchange = (e) => { st.roomPeriod = +e.target.value; draw(); };
  host.querySelector('#rNow').onclick = () => {
    st.roomDay = now.day <= 7 ? now.day : 2; st.roomPeriod = now.current?.period || now.next?.period || 1;
    host.querySelector('#rDay').value = st.roomDay; host.querySelector('#rPeriod').value = st.roomPeriod; draw();
  };
  host.querySelector('#rSearch').oninput = debounce(draw, 100);
  host.querySelector('#rChips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    filter = b.dataset.f; host.querySelectorAll('#rChips .chip').forEach((c) => c.classList.toggle('active', c === b)); draw();
  };
}

/** Chi tiết một phòng: lịch sử dụng cả tuần */
function renderRoomDetail(host, ds, ctx, room) {
  const recs = (ds.byRoom.get(room) || []).filter((r) => !r.event);
  const slot = new Map();
  recs.forEach((r) => { const k = `${r.day}|${r.period}`; const a = slot.get(k); a ? a.push(r) : slot.set(k, [r]); });
  const cell = (rs) => (rs || []).map((r) => `<div class="lesson ${rs.length > 1 ? 'clash' : ''}" style="--c:${subjectColor(r.subjectCode)}">
      <b>${escapeHtml(r.class)} · ${escapeHtml(r.subject)}</b><span>${escapeHtml(r.teacher || 'Chưa có GV')}</span></div>`).join('');
  const total = ds.maxPeriod * DAYS.length;
  host.innerHTML = `
    <div class="page-head"><div><a class="btn btn-sm btn-light mb-2" href="#/rooms"><i class="bi bi-arrow-left"></i> Danh sách phòng</a>
      <h2><i class="bi bi-door-open"></i> ${escapeHtml(room)}</h2>
      <p class="text-muted mb-0">${slot.size}/${total} tiết có sử dụng · ${Math.round((slot.size / total) * 100)}% công suất</p></div>
      <div class="export-bar no-export"><button class="btn btn-sm btn-light" data-export="print"><i class="bi bi-printer"></i> In</button>
      <button class="btn btn-sm btn-light" data-export="pdf"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
      <button class="btn btn-sm btn-light" data-export="png"><i class="bi bi-image"></i> PNG</button>
      <button class="btn btn-sm btn-light" data-export="excel"><i class="bi bi-file-earmark-excel"></i> Excel</button></div></div>
    <div class="glass card-pad"><div id="rmExport">${exportHeader(ds.school, `Lịch sử dụng ${room}`, ds.meta.week ? `Tuần ${ds.meta.week}` : '')}
      ${buildGridTable(ds.maxPeriod, (d, p) => cell(slot.get(`${d}|${p}`)))}</div></div>`;
  wireExportBar(host, {
    getEl: () => host.querySelector('#rmExport'), getName: () => `phong-${room}`,
    getAOA: () => [['Tiết', ...DAYS.map((d) => d.name)], ...Array.from({ length: ds.maxPeriod }, (_, i) => [`Tiết ${i + 1}`, ...DAYS.map((d) => (slot.get(`${d.n}|${i + 1}`) || []).map((r) => `${r.class} - ${r.subject} (${r.teacher})`).join('\n'))])],
    getQR: () => ({ title: room, url: location.href, text: room }),
  });
}
