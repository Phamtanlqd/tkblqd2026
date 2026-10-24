/* =====================================================================
 * utils.js – Cấu hình, hằng số và các hàm tiện ích dùng chung
 * Smart Timetable V2
 * ===================================================================== */

export const APP_VERSION = '3.1.0';
export const DEFAULT_SCHOOL = 'THPT Chuyên Lê Quý Đôn';

/* ---------- Các thứ trong tuần (n = số thứ: 2..7) ---------- */
export const DAYS = [
  { n: 2, short: 'T2', name: 'Thứ Hai' },
  { n: 3, short: 'T3', name: 'Thứ Ba' },
  { n: 4, short: 'T4', name: 'Thứ Tư' },
  { n: 5, short: 'T5', name: 'Thứ Năm' },
  { n: 6, short: 'T6', name: 'Thứ Sáu' },
  { n: 7, short: 'T7', name: 'Thứ Bảy' },
];
export const dayName = (n) => (n === 8 ? 'Chủ Nhật' : DAYS.find((d) => d.n === n)?.name || '');

/* ---------- Cấu hình tiết học (có thể sửa trong Cài Đặt) ---------- */
export const DEFAULT_PERIODS = [
  { period: 1, start: '07:00', end: '07:45' },
  { period: 2, start: '07:50', end: '08:35' },
  { period: 3, start: '08:55', end: '09:40' },
  { period: 4, start: '09:45', end: '10:30' },
  { period: 5, start: '10:35', end: '11:20' },
  { period: 6, start: '14:00', end: '14:45' },
  { period: 7, start: '14:50', end: '15:35' },
  { period: 8, start: '15:55', end: '16:40' },
  { period: 9, start: '16:45', end: '17:30' },
  { period: 10, start: '17:35', end: '18:20' },
];
/** Tiết đầu tiên của buổi chiều (dòng thứ nhất của mỗi khối ngày trong file TKB chiều = tiết 6) */
export const AFTERNOON_FIRST = 6;
/** Ký hiệu loại tiết buổi chiều (giữ nguyên ký hiệu của nhà trường) */
export const KIND_SHORT = { CK: 'CK', HSGCT: 'HSG-CT', HSGQG: 'HSG-QG', TC: 'Tự chọn' };
/** Khoảng tiết cần hiển thị theo buổi: all | am | pm */
export function periodRange(session, maxPeriod) {
  if (session === 'am') return [1, Math.min(5, maxPeriod)];
  if (session === 'pm' && maxPeriod >= AFTERNOON_FIRST) return [AFTERNOON_FIRST, maxPeriod];
  return [1, maxPeriod];
}
/** Mảng PERIODS được sửa "tại chỗ" để mọi module luôn thấy giá trị mới nhất */
export const PERIODS = DEFAULT_PERIODS.map((p) => ({ ...p }));
export function setPeriods(list) {
  PERIODS.splice(0, PERIODS.length, ...list.map((p) => ({ ...p })));
}

/* ---------- Lưu trữ cục bộ an toàn ---------- */
export const lsGet = (k, def = null) => {
  try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; }
};
export const lsSet = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};
export const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } };

/* ---------- Chuỗi ---------- */
/** Bỏ dấu tiếng Việt + chữ thường – dùng cho tìm kiếm không phân biệt dấu */
export const normalize = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const cleanText = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sentenceCase = (s) => {
  const t = cleanText(s).toLowerCase().replace(/\b(gvcn|thpt|gdqp|ai)\b/g, (w) => w.toUpperCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
/** Trì hoãn gọi hàm (dùng cho ô tìm kiếm realtime) */
export const debounce = (fn, ms = 120) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* ---------- Lớp ---------- */
export const isClassName = (s) => /^\d{1,2}\s*[A-Za-zĐđ]{1,3}\s*\d{0,2}$/.test(cleanText(s));
export const normClass = (s) => cleanText(s).replace(/\s+/g, '').toUpperCase();
export const gradeOf = (cls) => parseInt(String(cls).match(/^\d{1,2}/)?.[0] || '0', 10) || 0;

/* ---------- Môn học ---------- */
export const SUBJECTS = {
  TOAN: { name: 'Toán', color: '#2563EB' },
  VAN: { name: 'Ngữ văn', color: '#EC4899' },
  NN: { name: 'Ngoại ngữ', color: '#0EA5E9' },
  SU: { name: 'Lịch sử', color: '#F59E0B' },
  LY: { name: 'Vật lý', color: '#8B5CF6' },
  HOA: { name: 'Hóa học', color: '#10B981' },
  SINH: { name: 'Sinh học', color: '#22C55E' },
  TIN: { name: 'Tin học', color: '#06B6D4' },
  DIA: { name: 'Địa lý', color: '#D97706' },
  GDTC: { name: 'GD Thể chất', color: '#EF4444' },
  GDQP: { name: 'GDQP-AN', color: '#64748B' },
  GDKTPL: { name: 'GD KT&PL', color: '#A855F7' },
  CN: { name: 'Công nghệ', color: '#14B8A6' },
  GDDP: { name: 'GD Địa phương', color: '#F97316' },
  HDTN: { name: 'HĐ Trải nghiệm', color: '#84CC16' },
  NN2: { name: 'Tiếng Trung', color: '#E11D48' },
  AI: { name: 'Trí tuệ nhân tạo (AI)', color: '#6366F1' },
  EVENT: { name: 'Hoạt động chung', color: '#94A3B8' },
};
/** Bảng đồng nghĩa: khóa (đã bỏ dấu, bỏ ký tự đặc biệt) → mã môn */
const SUBJECT_ALIASES = {
  toan: 'TOAN', van: 'VAN', vanhoc: 'VAN', nguvan: 'VAN', nn: 'NN', ngoaingu: 'NN', ngoaingu1: 'NN', tienganh: 'NN',
  su: 'SU', lichsu: 'SU', ls: 'SU', ly: 'LY', vatly: 'LY', vl: 'LY', hoa: 'HOA', hoahoc: 'HOA', sinh: 'SINH', sinhhoc: 'SINH',
  tin: 'TIN', tinhoc: 'TIN', dia: 'DIA', dialy: 'DIA', gdtc: 'GDTC', gdthechat: 'GDTC', thechat: 'GDTC', theduc: 'GDTC',
  gdqp: 'GDQP', gdqpan: 'GDQP', quocphong: 'GDQP', gdktpl: 'GDKTPL', ktpl: 'GDKTPL', gdcd: 'GDKTPL',
  cn: 'CN', congnghe: 'CN', gddp: 'GDDP', gddiaphuong: 'GDDP', diaphuong: 'GDDP',
  hdtn: 'HDTN', hdtnhn: 'HDTN', hdtnhuongnghiep: 'HDTN', hdtntn: 'HDTN', nn2: 'NN2', tiengtrung: 'NN2', trung: 'NN2', ngoaingu2: 'NN2', ai: 'AI',
  vatli: 'LY', diali: 'DIA', ta: 'NN', tanh: 'NN', anh: 'NN', tinh: 'TIN',
};
const EVENT_KEYS = ['hoatdongtrainghiem', 'chaoco', 'sinhhoatlop', 'shdc', 'shl'];

export const subjectKey = (raw) => normalize(raw).replace(/[^a-z0-9]/g, '');
const hashColor = (s) => {
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 60% 48%)`;
};
/** Chuẩn hóa tên môn thô → {code, name, event} */
export function parseSubject(raw) {
  const text = cleanText(raw);
  if (!text) return { code: '', name: '', event: false };
  const key = subjectKey(text);
  if (SUBJECT_ALIASES[key]) return { code: SUBJECT_ALIASES[key], name: SUBJECTS[SUBJECT_ALIASES[key]].name, event: false };
  if (text.length >= 20 || EVENT_KEYS.includes(key)) return { code: 'EVENT', name: sentenceCase(text), event: true };
  return { code: 'X_' + key.toUpperCase(), name: text, event: false };
}
export const subjectName = (code) => SUBJECTS[code]?.name || (code ? code.replace(/^X_/, '') : '');
export const subjectColor = (code) => SUBJECTS[code]?.color || hashColor(code || '?');

/* ---------- Thời gian ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const formatDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const formatTime = (d, sec = true) => `${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? ':' + pad(d.getSeconds()) : ''}`;
export const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
/** Thứ của JS (0 = CN) → số thứ dùng trong TKB (2..7, CN = 8) */
export const schoolDay = (d) => (d.getDay() === 0 ? 8 : d.getDay() + 1);

/**
 * Xác định tiết hiện tại / tiếp theo.
 * status: 'in' (đang trong tiết) | 'break' (giờ ra chơi) | 'before' | 'after' | 'off' (Chủ Nhật)
 */
export function periodInfo(now = new Date(), maxPeriod = 10) {
  // Chủ Nhật: không có tiết học
  if (now.getDay() === 0) return { current: null, next: null, status: 'off', day: 8 };
  const m = now.getHours() * 60 + now.getMinutes();
  const list = PERIODS.filter((p) => p.period <= maxPeriod);
  const cur = list.find((p) => m >= toMinutes(p.start) && m < toMinutes(p.end)) || null;
  const next = list.find((p) => toMinutes(p.start) > m) || null;
  let status = 'after';
  if (cur) status = 'in';
  else if (next && list.some((p) => toMinutes(p.end) <= m)) status = 'break';
  else if (next) status = 'before';
  return { current: cur, next, status, day: schoolDay(now) };
}

/* ---------- DOM ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = 'primary', delay = 3200) {
  const host = $('#toastHost');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Đóng"></button></div>`;
  el.querySelector('button').onclick = () => el.remove();
  host.appendChild(el);
  setTimeout(() => el.remove(), delay);
}

/* ---------- Combobox có tìm kiếm realtime ---------- */
export function createCombobox(host, { items = [], placeholder = 'Tìm kiếm…', value = '', onSelect }) {
  host.classList.add('cbx');
  host.innerHTML = `<i class="bi bi-search cbx-ic"></i>
    <input type="text" class="form-control cbx-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false">
    <button type="button" class="cbx-clear btn btn-sm" title="Xóa" hidden><i class="bi bi-x-lg"></i></button>
    <div class="cbx-list glass" hidden></div>`;
  const input = host.querySelector('input');
  const list = host.querySelector('.cbx-list');
  const clear = host.querySelector('.cbx-clear');
  let cur = value;
  let shown = [];
  let active = -1;

  const labelOf = (v) => items.find((i) => i.value === v)?.label || '';
  const draw = () => {
    const q = normalize(input.value.trim());
    const cur0 = labelOf(cur);
    // Khi ô nhập đang hiển thị đúng mục đã chọn → hiển thị toàn bộ danh sách
    const all = !q || input.value === cur0;
    shown = (all ? items : items.filter((i) => i._n.includes(q))).slice(0, 300);
    active = shown.findIndex((i) => i.value === cur);
    list.innerHTML = shown.length
      ? shown.map((i, idx) => `<div class="cbx-item ${i.value === cur ? 'sel' : ''}" data-i="${idx}">
          <span>${escapeHtml(i.label)}</span>${i.sub ? `<small>${escapeHtml(i.sub)}</small>` : ''}</div>`).join('')
      : '<div class="cbx-empty">Không tìm thấy kết quả</div>';
    list.hidden = false;
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (item) => {
    cur = item.value; input.value = item.label; list.hidden = true; clear.hidden = !input.value;
    onSelect?.(item.value, item);
  };
  const prep = (arr) => arr.map((i) => ({ ...i, _n: normalize(i.label + ' ' + (i.sub || '')) }));
  items = prep(items);
  input.value = labelOf(cur);
  clear.hidden = !input.value;

  input.addEventListener('focus', () => { input.select(); draw(); });
  input.addEventListener('input', () => { clear.hidden = !input.value; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) draw();
      active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      $$('.cbx-item', list).forEach((n, i) => n.classList.toggle('hl', i === active));
      $$('.cbx-item', list)[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = shown[active >= 0 ? active : 0];
      if (it) choose(it);
    } else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  list.addEventListener('mousedown', (e) => {
    const n = e.target.closest('.cbx-item');
    if (n) { e.preventDefault(); choose(shown[+n.dataset.i]); }
  });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; input.focus(); });
  input.addEventListener('blur', () => { list.hidden = true; input.value = labelOf(cur); clear.hidden = !input.value; });
  return { setValue(v) { cur = v; input.value = labelOf(v); clear.hidden = !input.value; } };
}

/* ---------- Bảng thời khóa biểu dùng chung ---------- */
/**
 * Sinh HTML bảng TKB: hàng = tiết, cột = thứ.
 * cellFn(day, period) → HTML nội dung ô (chuỗi rỗng nếu trống).
 * Ô đúng thứ + tiết hiện tại được gắn class "now".
 */
export function buildGridTable(maxPeriod, cellFn, { id = '', showTime = true, highlightNow = true, range = null } = {}) {
  const now = periodInfo(new Date(), maxPeriod);
  const rows = [];
  const [p0, p1] = range || [1, maxPeriod];
  for (let p = p0; p <= p1; p++) {
    const per = PERIODS.find((x) => x.period === p);
    const tds = DAYS.map((d) => {
      const html = cellFn(d.n, p) || '';
      const isNow = highlightNow && now.current?.period === p && now.day === d.n;
      const isDay = highlightNow && now.day === d.n;
      return `<td class="${isNow ? 'now' : ''} ${isDay ? 'today-col' : ''}" data-day="${d.n}" data-period="${p}">${html}</td>`;
    }).join('');
    rows.push(`<tr><th class="period-h" scope="row"><b>Tiết ${p}</b>${showTime && per ? `<small>${per.start}–${per.end}</small>` : ''}</th>${tds}</tr>`);
  }
  const head = DAYS.map((d) => `<th class="${highlightNow && now.day === d.n ? 'today-col' : ''}">${d.name}</th>`).join('');
  return `<div class="table-wrap"><table class="tt-table" ${id ? `id="${id}"` : ''}>
    <thead><tr><th class="corner">Tiết</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/** Chip môn học có màu (dùng biến CSS --c) */
export const subjectChip = (code, text) =>
  `<span class="subj-chip" style="--c:${subjectColor(code)}">${escapeHtml(text ?? subjectName(code))}</span>`;

/** Nút chuyển buổi Cả ngày / Sáng / Chiều (chỉ hiện khi dữ liệu có buổi chiều) */
export function sessionToggle(current, maxPeriod) {
  if (maxPeriod < AFTERNOON_FIRST) return '';
  const b = (v, label) => `<button type="button" class="chip ${current === v ? 'active' : ''}" data-session="${v}">${label}</button>`;
  return `<div class="chips session-toggle no-export">${b('all', 'Cả ngày')}${b('am', 'Sáng')}${b('pm', 'Chiều')}</div>`;
}
/** Gắn sự kiện cho nút chuyển buổi */
export function wireSessionToggle(host, ctx) {
  host.querySelectorAll('[data-session]').forEach((b) => {
    b.onclick = () => { ctx.state.session = b.dataset.session; ctx.rerender(); };
  });
}
