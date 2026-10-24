/* =====================================================================
 * history.js – V3: lưu nhiều tuần / học kỳ / năm học (IndexedDB),
 * so sánh hai tuần, báo cáo học kỳ & năm học, sao lưu – khôi phục.
 * Dữ liệu lưu trên chính thiết bị này (không gửi đi đâu).
 * ===================================================================== */
import { escapeHtml as esc, toast, dayName, subjectName, naturalCompare } from './utils.js';
import { buildDataset } from './data-loader.js';
import { buildPackage, fetchWeek } from './publish.js';

const DB_NAME = 'stt-history', STORE = 'weeks';
const open = () => new Promise((ok, no) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
async function tx(mode, fn) {
  const d = await open();
  return new Promise((ok, no) => {
    const t = d.transaction(STORE, mode); const q = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(q && q.result); t.onerror = t.onabort = () => no(t.error);
  });
}
const clone = (o) => JSON.parse(JSON.stringify(o));
export const listWeeks = async () => ((await tx('readonly', (s) => s.getAll())) || []).sort((a, b) => b.key.localeCompare(a.key));
export const getWeek = (key) => tx('readonly', (s) => s.get(key));
export const removeWeek = (key) => tx('readwrite', (s) => s.delete(key));

/** Xác định năm học / học kỳ / tuần từ metadata của file */
export function weekIdentity(meta) {
  const week = +meta?.week; if (!week) return null;
  const st = meta.start ? new Date(meta.start) : new Date();
  const y = st.getFullYear(), m = st.getMonth() + 1;
  const year = /\d{4}-\d{4}/.test(meta.term || '') ? meta.term : (m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`);
  const semester = week <= 18 ? 1 : 2;               // HK1: tuần 1–18, HK2: từ tuần 19
  return { year, semester, week, key: `${year}|${semester}|${String(week).padStart(2, '0')}` };
}
/** Lưu (hoặc cập nhật) dữ liệu một tuần. overwrite=false: chỉ lưu nếu tuần chưa có */
export async function saveWeek(sources, meta, { overwrite = true, id: forced } = {}) {
  const id = forced || weekIdentity(meta); if (!id) return null;
  if (!overwrite && await getWeek(id.key)) return null;
  const src = clone({ teacher: sources.teacher, class: sources.class, afternoon: sources.afternoon });
  const periods = buildDataset(src, {}).totals.periods;
  await tx('readwrite', (s) => s.put({ ...id, start: meta.start || null, end: meta.end || null, savedAt: Date.now(), periods, sources: src }));
  return id.key;
}

/* ---------- So sánh hai tuần ---------- */
export function compareDatasets(A, B) {
  const live = (d) => d.records.filter((r) => !r.event);
  const k = (r) => `${r.class}|${r.day}|${r.period}`;
  const a = new Map(live(A).map((r) => [k(r), r])), b = new Map(live(B).map((r) => [k(r), r]));
  const out = { add: [], del: [], teacher: [], room: [], subject: [], klass: [] };
  for (const [key, rb] of b) {
    const ra = a.get(key);
    if (!ra) { out.add.push(rb); continue; }
    if ((ra.teacher || '') !== (rb.teacher || '')) out.teacher.push({ r: rb, note: `${ra.teacher || '—'} → ${rb.teacher || '—'}` });
    if ((ra.room || '') !== (rb.room || '')) out.room.push({ r: rb, note: `${ra.room || '—'} → ${rb.room || '—'}` });
    if ((ra.subjectCode || '') !== (rb.subjectCode || '')) out.subject.push({ r: rb, note: `${ra.subject || '—'} → ${rb.subject || '—'}` });
  }
  for (const [key, ra] of a) if (!b.has(key)) out.del.push(ra);
  // Cùng giáo viên, cùng thứ/tiết nhưng đổi sang lớp khác → "đổi lớp"
  const tk = (r) => `${r.teacher}|${r.day}|${r.period}`;
  const addBy = new Map(out.add.filter((r) => r.teacher).map((r) => [tk(r), r]));
  const keepDel = [];
  for (const d of out.del) {
    const n = d.teacher && addBy.get(tk(d));
    if (n) { out.klass.push({ r: n, note: `${d.class} → ${n.class}` }); addBy.delete(tk(d)); } else keepDel.push(d);
  }
  const moved = new Set(out.klass.map((x) => x.r));
  out.add = out.add.filter((r) => !moved.has(r)); out.del = keepDel;
  return out;
}

/* ---------- Tổng hợp báo cáo ---------- */
export function aggregate(list) {
  const T = new Map(), S = new Map(), R = new Map(), perWeek = [];
  const inc = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
  for (const { w, ds } of list) {
    const live = ds.records.filter((r) => !r.event);
    perWeek.push({ label: `T${w.week}`, n: live.length });
    live.forEach((r) => { inc(T, r.teacher); inc(S, subjectName(r.subjectCode) || r.subject); inc(R, r.room); });
  }
  const sorted = (m) => [...m.entries()].sort((x, y) => y[1] - x[1] || naturalCompare(x[0], y[0]));
  return { perWeek, teachers: sorted(T), subjects: sorted(S), rooms: sorted(R) };
}

/** Gom nhiều file (nhiều tuần) theo tuần: mỗi nhóm = {id, sources:{teacher,class,afternoon}, files} */
export function groupByWeek(parsed) {
  const items = [];
  for (const { name, r } of parsed) for (const kind of ['teacher', 'class', 'afternoon']) if (r[kind]) items.push({ name, kind, d: r[kind], id: weekIdentity(r[kind].meta) });
  items.sort((a, b) => !!b.d.meta?.start - !!a.d.meta?.start);          // file có ngày tháng xử lý trước
  const groups = new Map(), loose = [];
  for (const it of items) {
    if (!it.id) { loose.push(it); continue; }
    let g = groups.get(it.id.key);
    if (!g && !it.d.meta.start) g = [...groups.values()].find((x) => x.id.week === it.id.week);   // file không ghi ngày: ghép theo số tuần
    if (!g) { g = { id: it.id, sources: {}, files: [] }; groups.set(it.id.key, g); }
    g.sources[it.kind] = it.d; if (!g.files.includes(it.name)) g.files.push(it.name);
  }
  if (groups.size === 1) { const g = [...groups.values()][0]; loose.splice(0).forEach((it) => { g.sources[it.kind] = it.d; }); }
  return { groups, loose };
}

/* ---------- Giao diện ---------- */
let charts = [];
const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
const wLabel = (w) => `Tuần ${w.week} · HK${w.semester} · ${w.year}`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
const download = (blob, name) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

export async function renderHistory(host, ds, ctx) {
  killCharts();
  let local;
  try { local = await listWeeks(); } catch (e) {
    host.innerHTML = `<div class="empty-state glass"><p>Trình duyệt không cho phép lưu lịch sử (IndexedDB): ${esc(e.message)}</p></div>`; return;
  }
  const pubList = ctx.published?.weeks || [];
  const map = new Map(pubList.map((p) => [p.key, { ...p, pub: true }]));
  local.forEach((l) => map.set(l.key, { ...(map.get(l.key) || {}), ...l, local: true, pub: map.has(l.key) }));
  const weeks = [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  const st = (ctx.state.hist = ctx.state.hist || {});
  const admin = ctx.isAdmin();
  const years = [...new Set(weeks.map((w) => w.year))].sort().reverse();
  st.year = years.includes(st.year) ? st.year : years[0];
  st.sem = st.sem || 'all';
  const opt = (sel) => weeks.map((w) => `<option value="${w.key}" ${w.key === sel ? 'selected' : ''}>${esc(wLabel(w))}</option>`).join('');
  st.a = map.has(st.a) ? st.a : (weeks[1] || weeks[0])?.key; st.b = map.has(st.b) ? st.b : weeks[0]?.key;
  const badge = (w) => (w.pub ? `<span class="badge text-bg-success">Đã công bố</span>${w.local ? ' <span class="badge text-bg-secondary">có trên máy</span>' : ''}` : '<span class="badge text-bg-warning">Chỉ trên máy này</span>');

  host.innerHTML = `
  <div class="page-head"><h1 class="h3 mb-1"><i class="bi bi-clock-history"></i> Lịch sử, so sánh &amp; báo cáo</h1>
    <p class="text-muted mb-3">${weeks.length} tuần (${pubList.length} đã công bố cho mọi người xem).</p></div>
  <section class="glass p-3 mb-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h2 class="h5 mb-0 me-auto">Các tuần</h2>
    <button class="btn btn-outline-secondary btn-sm" id="hPub"><i class="bi bi-cloud-check"></i> Về tuần hiện hành</button>
    ${admin ? `<button class="btn btn-primary btn-sm" id="hPack"><i class="bi bi-box-seam"></i> Xuất gói công bố (.zip)</button>
    <button class="btn btn-outline-primary btn-sm" id="hBackup"><i class="bi bi-download"></i> Sao lưu</button>
    <button class="btn btn-outline-primary btn-sm" id="hRestore"><i class="bi bi-upload"></i> Khôi phục</button><input type="file" id="hFile" accept=".json" hidden>` : ''}</div>
    ${admin ? `<div class="alert alert-info py-2 small mb-2"><b>Công bố nhiều tuần:</b> (1) bấm “Nạp file TKB”, chọn cùng lúc file của nhiều tuần; (2) tích các tuần cần công bố bên dưới → “Xuất gói công bố”; (3) giải nén, chép thư mục <code>weeks</code> vào <code>assets/data/</code> rồi push lên GitHub. Mọi người sẽ thấy các tuần mới sau khi tải lại trang.</div>` : ''}
    ${weeks.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>${admin ? '<th></th>' : ''}<th>Năm học</th><th>HK</th><th>Tuần</th><th>Thời gian</th><th class="text-end">Số tiết</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${weeks.map((w) => `<tr>${admin ? `<td>${w.local ? `<input class="form-check-input" type="checkbox" data-pk="${w.key}" ${w.pub ? '' : 'checked'} aria-label="Chọn công bố">` : ''}</td>` : ''}<td>${esc(w.year)}</td><td>HK${w.semester}</td><td>${w.week}</td><td>${fmt(w.start)} – ${fmt(w.end)}</td><td class="text-end">${w.periods}</td><td>${badge(w)}</td>
    <td class="text-end text-nowrap"><button class="btn btn-sm btn-primary" data-view="${w.key}">Xem</button>
    ${admin && w.local ? `<button class="btn btn-sm btn-outline-danger" data-del="${w.key}" aria-label="Xóa khỏi máy này"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="text-muted mb-0">Chưa có tuần nào. Quản trị viên nạp file TKB để bắt đầu.</p>'}</section>
  <section class="glass p-3 mb-3"><h2 class="h5">So sánh hai tuần</h2>
    <div class="d-flex flex-wrap gap-2 align-items-center"><select class="form-select form-select-sm w-auto" id="cA">${opt(st.a)}</select><i class="bi bi-arrow-right"></i>
    <select class="form-select form-select-sm w-auto" id="cB">${opt(st.b)}</select><button class="btn btn-primary btn-sm" id="cGo">So sánh</button></div><div id="cOut" class="mt-3"></div></section>
  <section class="glass p-3 mb-3"><h2 class="h5">Báo cáo học kỳ / năm học</h2>
    <div class="d-flex flex-wrap gap-2 align-items-center"><select class="form-select form-select-sm w-auto" id="rY">${years.map((y) => `<option ${y === st.year ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>
    <select class="form-select form-select-sm w-auto" id="rS">${[['all', 'Cả năm học'], ['1', 'Học kỳ 1'], ['2', 'Học kỳ 2']].map(([v, t]) => `<option value="${v}" ${v === st.sem ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <button class="btn btn-primary btn-sm" id="rGo">Tạo báo cáo</button><button class="btn btn-outline-success btn-sm" id="rXl" hidden><i class="bi bi-file-earmark-excel"></i> Xuất Excel</button></div><div id="rOut" class="mt-3"></div></section>`;
  if (!weeks.length) host.querySelectorAll('#cGo,#rGo').forEach((b) => (b.disabled = true));

  const dsCache = new Map(), srcCache = new Map();
  const sourcesOf = async (w) => { if (w.sources) return w.sources; if (!srcCache.has(w.key)) srcCache.set(w.key, (await fetchWeek(w)).sources); return srcCache.get(w.key); };
  const dsOf = async (w) => { if (!dsCache.has(w.key)) dsCache.set(w.key, buildDataset(await sourcesOf(w), ctx.settings)); return dsCache.get(w.key); };

  host.querySelectorAll('[data-view]').forEach((b) => (b.onclick = async () => { await ctx.loadWeek(b.dataset.view); location.hash = '#/dashboard'; }));
  host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Xóa tuần này khỏi máy này? (Bản đã công bố trên GitHub không bị ảnh hưởng)')) return;
    await removeWeek(b.dataset.del); toast('Đã xóa', 'primary'); ctx.rerender();
  }));
  host.querySelector('#hPub').onclick = () => ctx.viewPublished();
  if (admin) {
    host.querySelector('#hPack').onclick = () => {
      const keys = [...host.querySelectorAll('[data-pk]:checked')].map((c) => c.dataset.pk);
      const sel = local.filter((w) => keys.includes(w.key));
      if (!sel.length) return toast('Hãy tích ít nhất một tuần có trên máy này', 'warning');
      download(buildPackage(sel, pubList), `tkb-cong-bo-${new Date().toISOString().slice(0, 10)}.zip`);
      toast(`Đã tạo gói ${sel.length} tuần. Giải nén vào assets/data/ rồi push lên GitHub.`, 'success', 6000);
    };
    host.querySelector('#hBackup').onclick = () => download(new Blob([JSON.stringify({ app: 'smart-tkb', version: 3, weeks: local })], { type: 'application/json' }), `tkb-lich-su-${new Date().toISOString().slice(0, 10)}.json`);
    host.querySelector('#hRestore').onclick = () => host.querySelector('#hFile').click();
    host.querySelector('#hFile').onchange = async (e) => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (j.app !== 'smart-tkb' || !Array.isArray(j.weeks)) throw new Error('Không phải file sao lưu hợp lệ');
        for (const w of j.weeks) if (w.key && w.sources) await tx('readwrite', (s) => s.put(w));
        toast(`Đã khôi phục ${j.weeks.length} tuần`, 'success'); ctx.rerender();
      } catch (err) { toast('Lỗi khôi phục: ' + err.message, 'danger', 5000); }
    };
  }

  host.querySelector('#cGo').onclick = async () => {
    st.a = host.querySelector('#cA').value; st.b = host.querySelector('#cB').value;
    const out = host.querySelector('#cOut');
    if (st.a === st.b) { out.innerHTML = '<p class="text-muted">Hãy chọn hai tuần khác nhau.</p>'; return; }
    out.innerHTML = '<p class="text-muted">Đang so sánh…</p>';
    let d;
    try { d = compareDatasets(await dsOf(map.get(st.a)), await dsOf(map.get(st.b))); } catch (e) { out.innerHTML = `<p class="text-danger">${esc(e.message)}</p>`; return; }
    const sec = [['add', 'Tiết mới', 'success'], ['del', 'Tiết bị xóa', 'danger'], ['teacher', 'Đổi giáo viên', 'warning'], ['room', 'Đổi phòng', 'warning'], ['klass', 'Đổi lớp', 'warning'], ['subject', 'Đổi môn', 'warning']];
    const slot = (r) => `${dayName(r.day)} · tiết ${r.period} · ${esc(r.class)}`;
    out.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-2">${sec.map(([k, t, c]) => `<span class="badge text-bg-${c}">${t}: ${d[k].length}</span>`).join('')}</div>` +
      (sec.every(([k]) => !d[k].length) ? '<p class="text-muted">Hai tuần giống nhau.</p>' : sec.filter(([k]) => d[k].length).map(([k, t]) => `<details class="mb-2" ${k === 'add' || k === 'del' ? '' : 'open'}><summary><b>${t}</b> (${d[k].length})</summary><div class="table-responsive"><table class="table table-sm mb-0"><tbody>
      ${d[k].slice(0, 300).map((x) => { const r = x.r || x; return `<tr><td>${slot(r)}</td><td>${esc(r.subject || '')}</td><td>${esc(x.note || r.teacher || '')}</td></tr>`; }).join('')}</tbody></table></div>${d[k].length > 300 ? '<small class="text-muted">Hiển thị 300 dòng đầu.</small>' : ''}</details>`).join(''));
  };

  let report = null;
  host.querySelector('#rGo').onclick = async () => {
    killCharts(); st.year = host.querySelector('#rY').value; st.sem = host.querySelector('#rS').value;
    const sel = weeks.filter((w) => w.year === st.year && (st.sem === 'all' || String(w.semester) === st.sem)).sort((x, y) => x.key.localeCompare(y.key));
    const out = host.querySelector('#rOut');
    if (!sel.length) { out.innerHTML = '<p class="text-muted">Chưa có tuần nào trong phạm vi này.</p>'; host.querySelector('#rXl').hidden = true; return; }
    const list = [];
    try { for (const w of sel) { out.innerHTML = `<p class="text-muted">Đang tải tuần ${w.week} (${list.length + 1}/${sel.length})…</p>`; list.push({ w, ds: await dsOf(w) }); } }
    catch (e) { out.innerHTML = `<p class="text-danger">${esc(e.message)}</p>`; return; }
    report = { sel, ...aggregate(list) };
    const total = report.perWeek.reduce((s, x) => s + x.n, 0);
    out.innerHTML = `<p><b>${sel.length}</b> tuần · <b>${total}</b> tiết · <b>${report.teachers.length}</b> giáo viên · <b>${report.subjects.length}</b> môn</p>
      <div class="row g-3"><div class="col-lg-6"><canvas id="g1" height="160"></canvas></div><div class="col-lg-6"><canvas id="g2" height="160"></canvas></div>
      <div class="col-lg-6"><canvas id="g3" height="160"></canvas></div><div class="col-lg-6"><canvas id="g4" height="160"></canvas></div></div>`;
    const bar = (id, title, rows, horiz) => charts.push(new window.Chart(out.querySelector('#' + id), {
      type: 'bar', data: { labels: rows.map((x) => x.label || x[0]), datasets: [{ label: 'Số tiết', data: rows.map((x) => x.n ?? x[1]), backgroundColor: '#2563EB' }] },
      options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: false }, title: { display: true, text: title } } } }));
    bar('g1', 'Số tiết theo tuần', report.perWeek, false); bar('g2', 'Top 10 giáo viên', report.teachers.slice(0, 10), true);
    bar('g3', 'Top 10 môn học', report.subjects.slice(0, 10), true); bar('g4', 'Top 10 phòng học', report.rooms.slice(0, 10), true);
    host.querySelector('#rXl').hidden = false;
  };
  host.querySelector('#rXl').onclick = () => {
    if (!report || !window.XLSX) return;
    const X = window.XLSX, wb = X.utils.book_new();
    const add = (n, head, rows) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head, ...rows]), n);
    add('Theo tuần', ['Tuần', 'Số tiết'], report.perWeek.map((x) => [x.label, x.n]));
    add('Giáo viên', ['Giáo viên', 'Số tiết'], report.teachers); add('Môn học', ['Môn', 'Số tiết'], report.subjects); add('Phòng học', ['Phòng', 'Số tiết'], report.rooms);
    X.writeFile(wb, `bao-cao-${st.year}-${st.sem === 'all' ? 'ca-nam' : 'HK' + st.sem}.xlsx`);
  };
}
