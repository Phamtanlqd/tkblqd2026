/* =====================================================================
 * app.js – Điểm khởi chạy: router, header thời gian thực, dữ liệu, theme, PWA
 * ===================================================================== */
import {
  $, $$, lsGet, lsSet, lsDel, toast, escapeHtml, formatDate, formatTime, dayName, schoolDay, periodInfo,
  setPeriods, PERIODS, DEFAULT_PERIODS,
} from './utils.js';
import { parseFile, loadSampleSources, buildDataset } from './data-loader.js';
import { renderDashboard, renderStats, destroyCharts } from './dashboard.js';
import { renderTeacher } from './teacher.js';
import { renderClass } from './class.js';
import { renderRooms } from './room.js';
import { renderCheck, validate } from './validator.js';
import { renderSettings } from './settings.js';
import { initGlobalSearch, renderSubject } from './search.js';
import { renderHistory, saveWeek, getWeek, listWeeks, weekIdentity, groupByWeek } from './history.js';
import { fetchIndex, fetchWeek, pickCurrent } from './publish.js';
import { isAdmin, login, logout, authEnabled, sessionLeftMinutes } from './auth.js';

const LS = { sources: 'stt2.sources', theme: 'stt2.theme', settings: 'stt2.settings', periods: 'stt2.periods' };

/* ---------- Trạng thái toàn cục ---------- */
let ds = buildDataset({}, {});
let deferredInstall = null;
const ctx = {
  state: {},                                   // trạng thái giao diện (lớp / GV đang chọn…)
  sources: { teacher: null, class: null, afternoon: null },     // dữ liệu đã chuẩn hóa theo từng loại file
  settings: lsGet(LS.settings, { useClassRoom: true, subjectRooms: {} }),
  theme: 'light',
  canInstall: () => !!deferredInstall,
  install, pickFiles, importFiles, reloadSample, clearData, setTheme, savePeriods, saveSettings,
  isAdmin, authEnabled, sessionLeftMinutes, doLogin, doLogout,
  rerender: () => route(true), loadWeek, viewPublished,
};

const VIEWS = {
  dashboard: renderDashboard,
  teacher: renderTeacher,
  class: renderClass,
  stats: renderStats,
  rooms: renderRooms,
  check: renderCheck,
  settings: renderSettings,
  history: renderHistory,
  subject: renderSubject,
};
const NEEDS_DATA = new Set(['dashboard', 'teacher', 'class', 'stats', 'rooms', 'check', 'subject']);

/* ---------- Theme ---------- */
function setTheme(t, rerender = true) {
  ctx.theme = t;
  document.documentElement.setAttribute('data-bs-theme', t);
  lsSet(LS.theme, t);
  $('#btnTheme i').className = t === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  $('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b1220' : '#2563EB');
  if (rerender) route();
}

/* ---------- Phân quyền quản trị ---------- */
/** Chặn thao tác quản trị nếu chưa đăng nhập */
function guard() {
  if (isAdmin()) return true;
  toast('Chức năng này cần đăng nhập quản trị.', 'warning');
  location.hash = '#/settings';
  return false;
}
/** Cập nhật giao diện theo quyền (nút bên sidebar) */
function applyAuthUI() {
  const b = $('#btnImport');
  if (isAdmin()) b.innerHTML = '<i class="bi bi-upload"></i> Nạp file TKB';
  else b.innerHTML = '<i class="bi bi-lock"></i> Đăng nhập quản trị';
}
async function doLogin(pw) {
  const r = await login(pw);
  if (r.ok) {
    const saved = lsGet(LS.sources);               // quản trị: ưu tiên dữ liệu đang xem trước trên máy này
    if (saved && (saved.teacher || saved.class || saved.afternoon)) { ctx.sources = { teacher: saved.teacher || null, class: saved.class || null, afternoon: saved.afternoon || null }; rebuild(); }
    applyAuthUI(); route(); toast('Đã đăng nhập quản trị', 'success');
  }
  return r;
}
async function doLogout() {
  logout(); applyAuthUI();
  await loadPublished();                           // trở lại dữ liệu đã công bố
  rebuild(); route(); toast('Đã đăng xuất quản trị', 'primary');
}
/** Nạp dữ liệu đã công bố (assets/data). Trả về true nếu thành công */
async function loadPublished(key) {
  try {                                            // nhiều tuần: assets/data/weeks/index.json
    const idx = await fetchIndex();
    if (idx) {
      ctx.published = idx;
      const w = (key && idx.weeks.find((x) => x.key === key)) || pickCurrent(idx.weeks);
      const j = await fetchWeek(w);
      ctx.sources = { teacher: j.sources.teacher || null, class: j.sources.class || null, afternoon: j.sources.afternoon || null };
      ctx.currentKey = w.key; return true;
    }
  } catch (e) { console.warn('Không đọc được danh mục tuần:', e); }
  try { const s = await loadSampleSources(window.XLSX); ctx.sources = { teacher: s.teacher, class: s.class, afternoon: s.afternoon }; ctx.currentKey = ''; return true; }   // tương thích V2: 3 file đơn
  catch { return false; }
}

/* ---------- Dữ liệu ---------- */
function rebuild() {
  ds = buildDataset(ctx.sources, ctx.settings);
  ctx.state.issueCount = validate(ds).filter((i) => i.sev !== 'info').length;
  $('#hdSchool').textContent = ds.school;
  document.title = `Thời khóa biểu – ${ds.school}`;
  const b = $('#chkBadge');
  b.textContent = ctx.state.issueCount; b.hidden = !ctx.state.issueCount;
  updateHeader();
  refreshWeekPicker();
}
/** Ô chọn tuần ở đầu trang: các tuần đã công bố + tuần chỉ có trên máy này */
async function refreshWeekPicker() {
  const sel = $('#weekPick'); if (!sel) return;
  const local = await listWeeks().catch(() => []);
  const m = new Map((ctx.published?.weeks || []).map((w) => [w.key, { ...w, tag: '' }]));
  local.forEach((w) => { if (!m.has(w.key)) m.set(w.key, { ...w, tag: ' (máy này)' }); });
  const list = [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
  const cur = ctx.currentKey || weekIdentity(ds.meta)?.key;
  sel.hidden = list.length < 2;
  sel.innerHTML = list.map((w) => `<option value="${w.key}" ${w.key === cur ? 'selected' : ''}>Tuần ${w.week} · HK${w.semester} · ${w.year}${w.tag}</option>`).join('');
}
/** Mở một tuần để xem: quản trị ưu tiên bản trên máy, người xem ưu tiên bản đã công bố */
async function loadWeek(key) {
  setBusy(true, 'Đang mở tuần…');
  try {
    const local = await getWeek(key), pub = ctx.published?.weeks.find((x) => x.key === key);
    const src = (local && (isAdmin() || !pub)) ? local.sources : pub ? (await fetchWeek(pub)).sources : local?.sources;
    if (!src) return toast('Không tìm thấy tuần này', 'danger');
    ctx.sources = { teacher: src.teacher || null, class: src.class || null, afternoon: src.afternoon || null };
    ctx.currentKey = key; rebuild(); route();
  } catch (e) { toast('Không mở được tuần: ' + e.message, 'danger', 5000); }
  finally { setBusy(false); }
}
async function viewPublished() { await loadPublished(); rebuild(); location.hash = '#/dashboard'; route(); toast('Đã quay về tuần hiện hành', 'primary'); }
function persist() {
  if (!lsSet(LS.sources, ctx.sources)) toast('Không lưu được dữ liệu vào thiết bị (bộ nhớ đầy)', 'warning');
}
function setBusy(on, msg = 'Đang xử lý…') {
  const o = $('#busy'); o.hidden = !on; $('#busyMsg').textContent = msg;
}

async function importFiles(files) {
  if (!guard()) return;
  const list = files.filter((f) => /\.(xls|xlsx)$/i.test(f.name));
  if (!list.length) return toast('Chỉ hỗ trợ file .xls / .xlsx', 'danger');
  setBusy(true, 'Đang đọc & nhận dạng file…');
  const t0 = performance.now();
  try {
    const parsed = [];
    for (const f of list) {
      const r = await parseFile(window.XLSX, f);
      if (!r.teacher && !r.class && !r.afternoon) { toast(`${f.name}: không nhận dạng được cấu trúc TKB`, 'danger', 5000); continue; }
      parsed.push({ name: f.name, r });
    }
    if (!parsed.length) return;
    const { groups, loose } = groupByWeek(parsed);        // nhiều tuần trong một lần nạp → tách theo từng tuần
    if (!groups.size) return toast('Không đọc được số tuần từ tiêu đề file (cần có dòng “Tuần …”).', 'danger', 6000);
    const saved = [];
    for (const g of groups.values()) {
      const old = await getWeek(g.id.key);                  // nạp bổ sung (ví dụ chỉ file chiều): giữ phần đã có của tuần đó
      const src = { teacher: null, class: null, afternoon: null, ...(old?.sources || {}), ...g.sources };
      await saveWeek(src, buildDataset(src, {}).meta, { id: g.id });
      saved.push({ id: g.id, src, files: g.files });
    }
    saved.sort((a, b) => a.id.key.localeCompare(b.id.key));
    const show = saved[saved.length - 1];                   // hiển thị tuần mới nhất vừa nạp
    ctx.sources = { teacher: show.src.teacher, class: show.src.class, afternoon: show.src.afternoon }; ctx.currentKey = show.id.key;
    persist(); rebuild(); route();
    toast(`Đã nạp ${saved.length} tuần: ${saved.map((x) => x.id.week).join(', ')}` + (loose.length ? ` · ${loose.length} phần chưa xác định được tuần` : ''), 'success', 5000);
    toast(`Hoàn tất trong ${Math.round(performance.now() - t0)} ms. Vào “Lịch Sử & So Sánh” để công bố.`, 'primary', 4500);
  } catch (e) {
    console.error(e); toast('Lỗi đọc file: ' + e.message, 'danger', 5000);
  } finally { setBusy(false); }
}
function pickFiles() { if (!guard()) return; const i = $('#fileInput'); i.value = ''; i.click(); }

async function reloadSample() {
  if (!guard()) return;
  setBusy(true, 'Đang nạp dữ liệu mẫu…');
  try {
    const s = await loadSampleSources(window.XLSX);
    ctx.sources = { teacher: s.teacher, class: s.class, afternoon: s.afternoon };
    lsDel(LS.sources); rebuild(); route();
    toast('Đã nạp lại dữ liệu đã công bố', 'success');
  } catch (e) {
    toast('Không nạp được dữ liệu mẫu – hãy mở ứng dụng qua máy chủ web (xem start.bat / start.sh) hoặc chọn file thủ công.', 'warning', 6000);
  } finally { setBusy(false); }
}
function clearData() {
  if (!guard()) return;
  ctx.sources = { teacher: null, class: null, afternoon: null };
  lsDel(LS.sources); rebuild(); route(); toast('Đã xóa dữ liệu lưu trên máy này', 'primary');
}
function saveSettings(s) { if (!guard()) return; ctx.settings = s; lsSet(LS.settings, s); rebuild(); route(); }
function savePeriods(list) { if (!guard()) return; setPeriods(list); lsSet(LS.periods, PERIODS); rebuild(); route(); }

/* ---------- PWA ---------- */
async function install() {
  if (!deferredInstall) return toast('Trình duyệt chưa cho phép cài đặt (hoặc ứng dụng đã được cài).', 'warning');
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null; $('#btnInstallTop').hidden = true;
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredInstall = e; $('#btnInstallTop').hidden = false;
  if (location.hash.startsWith('#/settings')) $('#btnInstall')?.removeAttribute('disabled');
});
window.addEventListener('appinstalled', () => { deferredInstall = null; $('#btnInstallTop').hidden = true; toast('Đã cài đặt ứng dụng', 'success'); });

/* ---------- Header thời gian thực ---------- */
function weekNumber(now) {
  if (!ds.meta.week || !ds.meta.start) return 0;
  const start = new Date(ds.meta.start); start.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return ds.meta.week + Math.floor((today - start) / (7 * 864e5));
}
let lastKey = '';
let wasAdmin = isAdmin();
function updateHeader() {
  if (wasAdmin !== isAdmin()) { wasAdmin = isAdmin(); applyAuthUI(); if (location.hash.startsWith('#/settings')) route(true); }
  const now = new Date();
  $('#hdClock').textContent = formatTime(now);
  $('#hdDate').textContent = formatDate(now);
  $('#hdDay').textContent = now.getDay() === 0 ? 'Chủ Nhật' : dayName(schoolDay(now));
  const wk = weekNumber(now);
  const wEl = $('#hdWeek');
  wEl.textContent = wk ? `Tuần ${wk}` : '—';
  wEl.title = ds.meta.week ? `Dữ liệu đang nạp: tuần ${ds.meta.week}${wk !== ds.meta.week ? ' (khác tuần hiện tại)' : ''}` : '';
  wEl.classList.toggle('chip-warn', !!wk && wk !== ds.meta.week);
  const pi = periodInfo(now, ds.maxPeriod);
  let main = '—', sub = '';
  if (pi.status === 'in') { main = `Tiết ${pi.current.period}`; sub = `${pi.current.start}–${pi.current.end}`; if (pi.next) sub += ` · Tiếp: tiết ${pi.next.period} (${pi.next.start})`; }
  else if (pi.status === 'break') { main = 'Ra chơi'; sub = `Tiếp: tiết ${pi.next.period} (${pi.next.start})`; }
  else if (pi.status === 'before') { main = 'Chưa vào học'; sub = `Tiết ${pi.next.period} lúc ${pi.next.start}`; }
  else if (pi.status === 'off') { main = 'Hôm nay nghỉ'; sub = 'Chủ Nhật'; }
  else { main = 'Hết giờ học'; }
  $('#hdPeriod').textContent = main;
  $('#hdPeriodSub').textContent = sub;
  $('#hdPeriodBox').classList.toggle('live', pi.status === 'in');
  // Khi chuyển tiết / chuyển ngày: vẽ lại các trang phụ thuộc thời gian
  const key = `${pi.day}|${pi.current?.period || pi.status}`;
  if (lastKey && key !== lastKey && ['dashboard', 'teacher', 'class', 'rooms'].includes(currentView)) route(true);
  lastKey = key;
}

/* ---------- Router ---------- */
let currentView = 'dashboard';
function route(keepScroll = false) {
  const m = location.hash.match(/^#\/([^/]*)(?:\/(.*))?$/);
  const name = VIEWS[m?.[1]] ? m[1] : 'dashboard';
  const param = m?.[2] || '';
  currentView = name;
  $$('#sidebar .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.view === name || (name === 'subject' && a.dataset.view === 'stats')));
  const host = $('#view');
  destroyCharts();
  const y = window.scrollY;
  try {
    if (NEEDS_DATA.has(name) && !ds.records.length) renderWelcome(host);
    else VIEWS[name](host, ds, ctx, param);
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div class="empty-state glass"><i class="bi bi-bug text-danger"></i><p><b>Có lỗi khi hiển thị trang.</b><br><small>${escapeHtml(e.message)}</small></p></div>`;
  }
  if (!keepScroll) window.scrollTo(0, 0); else window.scrollTo(0, y);
  closeSidebar();
}

function renderWelcome(host) {
  host.innerHTML = `<div class="welcome glass">
    <img src="assets/icons/logo.svg" alt="" width="84" height="84">
    <h2>Chào mừng đến Smart Timetable V2</h2>
    <p class="text-muted">Nạp file thời khóa biểu (.xls / .xlsx) để bắt đầu. Hệ thống tự nhận dạng TKB giáo viên và TKB lớp, không cần cấu hình.</p>
    ${isAdmin() ? `<div class="d-flex gap-2 justify-content-center flex-wrap">
      <button class="btn btn-primary btn-lg" id="wPick"><i class="bi bi-upload"></i> Chọn file Excel</button>
      <button class="btn btn-outline-primary btn-lg" id="wSample"><i class="bi bi-magic"></i> Nạp dữ liệu đã công bố</button></div>
    <div class="drop-zone mt-4" id="wDrop"><i class="bi bi-cloud-arrow-up"></i><p class="mb-0">hoặc kéo thả file vào đây</p></div>`
    : `<p class="text-muted">Hiện chưa có dữ liệu thời khóa biểu. Vui lòng liên hệ quản trị viên.</p>
       <a class="btn btn-outline-primary" href="#/settings"><i class="bi bi-lock"></i> Đăng nhập quản trị</a>`}</div>`;
  if (!isAdmin()) return;
  $('#wPick').onclick = pickFiles;
  $('#wSample').onclick = reloadSample;
  const dz = $('#wDrop');
  ['dragenter', 'dragover'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (ev) => importFiles([...ev.dataTransfer.files]));
}

/* ---------- Sidebar (mobile) ---------- */
const openSidebar = () => { $('#sidebar').classList.add('open'); $('#backdrop').hidden = false; };
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').hidden = true; }

/* ---------- Khởi động ---------- */
async function init() {
  // Giờ học đã lưu
  const savedPeriods = lsGet(LS.periods);
  if (Array.isArray(savedPeriods) && savedPeriods.length) setPeriods(savedPeriods); else setPeriods(DEFAULT_PERIODS);

  // Theme: ưu tiên lựa chọn đã lưu, nếu chưa có theo hệ điều hành
  setTheme(lsGet(LS.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);

  // Sự kiện giao diện
  $('#btnTheme').onclick = () => setTheme(ctx.theme === 'dark' ? 'light' : 'dark');
  $('#weekPick').onchange = (e) => loadWeek(e.target.value);
  $('#btnMenu').onclick = openSidebar;
  $('#backdrop').onclick = closeSidebar;
  $('#btnImport').onclick = () => { if (isAdmin()) pickFiles(); else location.hash = '#/settings'; };
  applyAuthUI();
  $('#btnInstallTop').onclick = install;
  $('#fileInput').onchange = (e) => importFiles([...e.target.files]);
  window.addEventListener('hashchange', () => route());
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { if (!e.target.closest?.('.drop-zone')) { e.preventDefault(); if (e.dataTransfer?.files?.length && isAdmin()) importFiles([...e.dataTransfer.files]); } });
  initGlobalSearch({ input: $('#globalSearch'), panel: $('#searchPanel'), getDataset: () => ds });

  // Dữ liệu: đã lưu → mẫu đi kèm → trống
  // Người xem luôn thấy dữ liệu đã công bố (assets/data); quản trị đang đăng nhập thì ưu tiên bản xem trước lưu trên máy.
  const saved = lsGet(LS.sources);
  const hasSaved = saved && (saved.teacher || saved.class || saved.afternoon);
  const fromSaved = () => { ctx.sources = { teacher: saved.teacher || null, class: saved.class || null, afternoon: saved.afternoon || null }; };
  if (isAdmin() && authEnabled() && hasSaved) fromSaved();
  else if (!(await loadPublished()) && hasSaved) fromSaved();
  rebuild();
  route();
  setInterval(updateHeader, 1000);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
  }
}
init();
