/* =====================================================================
 * data-loader.js – Đọc file Excel (.xls/.xlsx), nhận dạng loại TKB,
 * chuẩn hóa thành bản ghi { teacher, subject, class, room, day, period }
 * và dựng chỉ mục tra cứu nhanh.
 * ===================================================================== */
import {
  cleanText, normalize, isClassName, normClass, gradeOf, parseSubject, subjectName,
  naturalCompare, DEFAULT_SCHOOL,
} from './utils.js';

/* ---------------------------------------------------------------------
 * 1. Đọc sheet → lưới 2 chiều (đã "trải" các ô gộp)
 * --------------------------------------------------------------------- */
function cleanCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const t = cleanText(v);
  return t === '' ? null : t;
}

/** Chuyển worksheet thành mảng 2 chiều, copy giá trị ô gộp ra toàn vùng gộp */
export function sheetToGrid(XLSX, ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const width = range.e.c - range.s.c + 1;
  const height = range.e.r - range.s.r + 1;
  const grid = [];
  for (let r = 0; r < height; r++) {
    const src = rows[r] || [];
    const row = new Array(width).fill(null);
    for (let c = 0; c < width; c++) row[c] = cleanCell(src[c]);
    grid.push(row);
  }
  // Trải ô gộp (merged cells)
  for (const m of ws['!merges'] || []) {
    const r0 = m.s.r - range.s.r, c0 = m.s.c - range.s.c;
    const v = grid[r0]?.[c0];
    if (v === null || v === undefined) continue;
    for (let r = r0; r <= m.e.r - range.s.r; r++) {
      for (let c = c0; c <= m.e.c - range.s.c; c++) {
        if (grid[r] && grid[r][c] === null) grid[r][c] = v;
      }
    }
  }
  return grid;
}

/* ---------------------------------------------------------------------
 * 2. Các hàm hỗ trợ nhận dạng
 * --------------------------------------------------------------------- */
const str = (v) => (v === null || v === undefined ? '' : String(v));

/** "Thứ 2", "Thứ hai", "T2"… → 2..7 (CN → 8) */
export function parseDay(v) {
  const s = normalize(str(v)).trim();
  if (!s) return 0;
  let m = s.match(/^thu\s*([2-7])$/);
  if (m) return +m[1];
  m = s.match(/^thu\s*(hai|ba|tu|nam|sau|bay)$/);
  if (m) return { hai: 2, ba: 3, tu: 4, nam: 5, sau: 6, bay: 7 }[m[1]];
  if (/^t\s*([2-7])$/.test(s)) return +s.replace(/\D/g, '');
  if (/^(chu nhat|cn)$/.test(s)) return 8;
  return 0;
}
const asInt = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const m = str(v).match(/^\s*(?:tiet\s*)?(\d{1,2})\s*$/i);
  return m ? +m[1] : 0;
};
const countDays = (row) => row.filter((c) => parseDay(c) >= 2 && parseDay(c) <= 7).length;

/** Tìm thông tin chung (trường, tuần, ngày áp dụng) ở vài dòng đầu */
function extractMeta(grid) {
  const meta = { school: '', week: 0, start: null, end: null, term: '' };
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const t = str(row[c]);
      if (!t) continue;
      if (!meta.school && /^tr[uư][oờ]ng\b/i.test(t) && t.length > 8) meta.school = t;
      if (!meta.school && /^tr[uư][oờ]ng$/i.test(t) && row[c + 1]) meta.school = 'Trường ' + str(row[c + 1]);
      const w = t.match(/tu[aầ]n\s*(\d{1,2})/i);
      if (w && !meta.week) {
        meta.week = +w[1];
        const ds = [...t.matchAll(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/g)];
        if (ds[0]) meta.start = new Date(+ds[0][3], +ds[0][2] - 1, +ds[0][1]).toISOString();
        if (ds[1]) meta.end = new Date(+ds[1][3], +ds[1][2] - 1, +ds[1][1]).toISOString();
      }
      const y = t.match(/n[aă]m h[oọ]c\s*([\d]{4}\s*[-–]\s*[\d]{4})/i);
      if (y && !meta.term) meta.term = y[1].replace(/\s+/g, '');
    }
  }
  if (meta.start && !meta.end) meta.end = new Date(new Date(meta.start).getTime() + 5 * 864e5).toISOString();
  return meta;
}

/** Nhận dạng loại sheet: 'teacher' | 'class' | 'entity' | null */
export function detectSheet(grid) {
  const lim = Math.min(grid.length, 20);
  for (let r = 0; r < lim; r++) {
    const row = grid[r];
    // TKB giáo viên: ô "Giáo viên" ở đầu dòng tiêu đề
    for (let c = 0; c < Math.min(3, row.length); c++) {
      if (/^(giao vien|ho ten giao vien|ho va ten|gv)$/.test(normalize(str(row[c])))) {
        if (countDays(row) >= 3 || countDays(grid[r + 1] || []) >= 3) return { kind: 'teacher', headerRow: r, nameCol: c };
      }
    }
    // TKB lớp: một dòng có ≥3 ô là tên lớp (10A1, 11B2…)
    const classCols = row.map((v, i) => (typeof v === 'string' && isClassName(v) ? i : -1)).filter((i) => i >= 0);
    if (classCols.length >= 3) return { kind: 'class', headerRow: r, firstClassCol: classCols[0] };
  }
  // Sheet đơn (mỗi sheet 1 lớp / 1 giáo viên): dòng có ≥4 nhãn thứ
  for (let r = 0; r < lim; r++) if (countDays(grid[r]) >= 4) return { kind: 'entity', headerRow: r };
  return null;
}

/* ---------------------------------------------------------------------
 * 3. Parser từng loại
 * --------------------------------------------------------------------- */

/** Tách 1 ô TKB giáo viên → danh sách {class, subjectRaw, room} (hỗ trợ nhiều lớp / ô) */
function parseTeacherCell(text) {
  const out = [];
  for (const part of str(text).split(/[\n\r;]+/).map(cleanText).filter(Boolean)) {
    let body = part, room = '';
    const rm = body.match(/\(([^)]+)\)\s*$/);
    if (rm) { room = cleanText(rm[1]); body = cleanText(body.replace(rm[0], '')); }
    const m = body.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m && isClassName(m[1])) out.push({ cls: normClass(m[1]), subjectRaw: m[2], room });
    else if (isClassName(body)) out.push({ cls: normClass(body), subjectRaw: '', room });
    else out.push({ bad: part });
  }
  return out;
}

function parseTeacherSheet(grid, { headerRow, nameCol }) {
  // Dòng tiết nằm ngay dưới dòng thứ (hoặc cùng dòng nếu gộp)
  let periodRow = headerRow;
  for (let r = headerRow; r < Math.min(grid.length, headerRow + 4); r++) {
    if (grid[r].filter((v, i) => i > nameCol && asInt(v) > 0).length >= 5) { periodRow = r; break; }
  }
  const colMap = {};
  let lastDay = 0;
  for (let c = nameCol + 1; c < grid[headerRow].length; c++) {
    const d = parseDay(grid[headerRow][c]);
    if (d) lastDay = d;
    const p = asInt(grid[periodRow][c]);
    if (lastDay && p) colMap[c] = { day: lastDay, period: p };
  }
  const records = [], teachers = [], issues = [];
  for (let r = periodRow + 1; r < grid.length; r++) {
    const name = cleanText(grid[r][nameCol]);
    if (!name || name.length > 60 || asInt(name)) continue;
    if (!teachers.includes(name)) teachers.push(name);
    for (const [c, { day, period }] of Object.entries(colMap)) {
      const v = grid[r][c];
      if (v === null) continue;
      for (const e of parseTeacherCell(v)) {
        if (e.bad) { issues.push({ type: 'parse', msg: `Ô không nhận dạng được: "${e.bad}" (GV ${name}, thứ ${day}, tiết ${period})` }); continue; }
        const s = parseSubject(e.subjectRaw);
        records.push({ teacher: name, subjectCode: s.code, class: e.cls, room: e.room, day, period, event: s.event, eventText: s.event ? s.name : '' });
      }
    }
  }
  return { records, teachers, issues };
}

function parseClassSheet(grid, { headerRow, firstClassCol }) {
  const classCols = {};
  grid[headerRow].forEach((v, i) => { if (i >= firstClassCol && typeof v === 'string' && isClassName(v)) classCols[i] = normClass(v); });
  const records = [], notes = [], issues = [];
  let day = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    let period = 0;
    for (let c = 0; c < firstClassCol; c++) {
      const d = parseDay(row[c]); if (d) day = d;
      const p = asInt(row[c]); if (p) period = p;
    }
    if (!period) {
      const note = cleanText(row.find((v) => typeof v === 'string' && v.length > 25) || '');
      if (note && !notes.includes(note)) notes.push(note);
      continue;
    }
    if (!day) continue;
    for (const [c, cls] of Object.entries(classCols)) {
      const v = row[c];
      if (v === null) continue;
      const lines = str(v).split(/[\n\r]+/).map(cleanText).filter(Boolean);
      let room = '';
      const rm = lines[0].match(/\(([^)]+)\)\s*$/);
      let subjectRaw = lines[0];
      if (rm) { room = rm[1]; subjectRaw = cleanText(subjectRaw.replace(rm[0], '')); }
      const s = parseSubject(subjectRaw);
      records.push({ teacher: lines[1] || '', subjectCode: s.code, class: cls, room, day, period, event: s.event, eventText: s.event ? s.name : '' });
    }
  }
  return { records, classes: Object.values(classCols), notes, issues };
}

/** Sheet đơn: tên sheet (hoặc tiêu đề) là lớp / giáo viên; dòng = tiết, cột = thứ */
function parseEntitySheet(grid, { headerRow }, sheetName) {
  let entity = cleanText(sheetName);
  for (let r = 0; r < headerRow; r++) {
    for (const v of grid[r]) {
      const m = str(v).match(/(?:gi[aáà]o vi[eê]n|gv|l[oớ]p)\s*[:：]\s*(.+)$/i);
      if (m) entity = cleanText(m[1]);
    }
  }
  const asClass = isClassName(entity);
  const colDay = {};
  grid[headerRow].forEach((v, c) => { const d = parseDay(v); if (d) colDay[c] = d; });
  const dayCols = Object.keys(colDay).map(Number);
  const records = [], issues = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    let period = 0;
    for (let c = 0; c < Math.min(...dayCols); c++) period = period || asInt(grid[r][c]);
    if (!period) continue;
    for (const c of dayCols) {
      const v = grid[r][c];
      if (v === null) continue;
      if (asClass) {
        const [subj, tea] = str(v).split(/\s*[\n\r]+\s*|\s+[-–—]\s+/);
        const s = parseSubject(subj);
        records.push({ teacher: cleanText(tea), subjectCode: s.code, class: normClass(entity), room: '', day: colDay[c], period, event: s.event, eventText: s.event ? s.name : '' });
      } else {
        for (const e of parseTeacherCell(v)) {
          if (e.bad) continue;
          const s = parseSubject(e.subjectRaw);
          records.push({ teacher: entity, subjectCode: s.code, class: e.cls, room: e.room, day: colDay[c], period, event: s.event, eventText: '' });
        }
      }
    }
  }
  return { kind: asClass ? 'class' : 'teacher', entity, records, issues };
}

/* ---------------------------------------------------------------------
 * 4. Đọc cả workbook (nhiều sheet) → { teacher, class }
 * --------------------------------------------------------------------- */
export function parseWorkbook(XLSX, buffer, fileName = '') {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const T = { records: [], teachers: [], notes: [], issues: [], meta: null, fileName };
  const C = { records: [], classes: [], notes: [], issues: [], meta: null, fileName };
  let hasT = false, hasC = false;

  for (const name of wb.SheetNames) {
    const grid = sheetToGrid(XLSX, wb.Sheets[name]);
    if (!grid.length) continue;
    const det = detectSheet(grid);
    if (!det) continue;
    const meta = extractMeta(grid);
    if (det.kind === 'teacher') {
      const r = parseTeacherSheet(grid, det);
      T.records.push(...r.records); T.teachers.push(...r.teachers); T.issues.push(...r.issues);
      T.meta = T.meta || meta; hasT = true;
    } else if (det.kind === 'class') {
      const r = parseClassSheet(grid, det);
      C.records.push(...r.records); C.classes.push(...r.classes); C.notes.push(...r.notes);
      C.meta = C.meta || meta; hasC = true;
    } else {
      const r = parseEntitySheet(grid, det, name);
      if (r.kind === 'teacher') { T.records.push(...r.records); if (!T.teachers.includes(r.entity)) T.teachers.push(r.entity); T.meta = T.meta || meta; hasT = true; }
      else { C.records.push(...r.records); if (!C.classes.includes(normClass(r.entity))) C.classes.push(normClass(r.entity)); C.meta = C.meta || meta; hasC = true; }
    }
  }
  return { teacher: hasT ? T : null, class: hasC ? C : null };
}

/** Đọc File do người dùng chọn, trả về {teacher, class} (có thể rỗng) */
export async function parseFile(XLSX, file) {
  const buf = await file.arrayBuffer();
  return parseWorkbook(XLSX, buf, file.name);
}

/** Nạp dữ liệu mẫu đi kèm (assets/data) – dùng khi chưa có dữ liệu nào */
export async function loadSampleSources(XLSX) {
  const out = { teacher: null, class: null };
  for (const [url, name] of [['assets/data/tkb-giao-vien.xlsx', 'tkb-giao-vien.xlsx'], ['assets/data/tkb-lop.xls', 'tkb-lop.xls']]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không tải được ' + url);
    const r = parseWorkbook(XLSX, await res.arrayBuffer(), name);
    if (r.teacher) out.teacher = r.teacher;
    if (r.class) out.class = r.class;
  }
  return out;
}

/* ---------------------------------------------------------------------
 * 5. Gộp 2 nguồn → dataset + chỉ mục
 * --------------------------------------------------------------------- */
const push = (map, key, val) => { const a = map.get(key); a ? a.push(val) : map.set(key, [val]); };

export function buildDataset(sources, settings = {}) {
  const T = sources?.teacher?.records || [];
  const C = sources?.class?.records || [];
  const subjectRooms = settings.subjectRooms || {};
  const useClassRoom = settings.useClassRoom !== false;

  /* --- gộp theo khóa lớp|thứ|tiết --- */
  const key = (r) => `${r.class}|${r.day}|${r.period}`;
  const cMap = new Map();
  for (const c of C) push(cMap, key(c), c);
  const used = new Set();
  const records = [];

  for (const t of T) {
    const cs = cMap.get(key(t));
    if (cs) used.add(key(t));
    records.push({
      teacher: t.teacher, class: t.class, day: t.day, period: t.period,
      subjectCode: t.subjectCode || cs?.[0]?.subjectCode || '',
      classSubjectCode: cs ? cs[0].subjectCode : null,
      room: t.room || cs?.[0]?.room || '', event: !!t.event, eventText: t.eventText || '',
      inClassFile: !!cs, fromTeacherFile: true,
    });
  }
  for (const c of C) {
    if (!c.event && used.has(key(c))) continue;
    records.push({
      teacher: c.teacher || '', class: c.class, day: c.day, period: c.period, subjectCode: c.subjectCode,
      classSubjectCode: c.subjectCode, room: c.room || '', event: !!c.event, eventText: c.eventText || '',
      inClassFile: true, fromTeacherFile: false,
    });
  }

  /* --- gán phòng, tên môn, khối --- */
  for (const r of records) {
    r.subject = r.event ? r.eventText : subjectName(r.subjectCode);
    r.grade = gradeOf(r.class);
    r.roomAuto = false;
    if (!r.room && !r.event) {
      if (subjectRooms[r.subjectCode]) r.room = subjectRooms[r.subjectCode];
      else if (useClassRoom) { r.room = `Phòng ${r.class}`; r.roomAuto = true; }
    }
  }

  /* --- chỉ mục --- */
  const byTeacher = new Map(), byClass = new Map(), byRoom = new Map(), bySlot = new Map(), bySubject = new Map();
  for (const r of records) {
    if (r.teacher) push(byTeacher, r.teacher, r);
    push(byClass, r.class, r);
    if (r.room) push(byRoom, r.room, r);
    push(bySlot, `${r.day}|${r.period}`, r);
    if (r.subjectCode && !r.event) push(bySubject, r.subjectCode, r);
  }

  /* --- danh sách giáo viên --- */
  const names = [...(sources?.teacher?.teachers || [])];
  for (const n of byTeacher.keys()) if (!names.includes(n)) names.push(n);
  const teachers = names.map((name) => {
    const recs = (byTeacher.get(name) || []).filter((x) => !x.event);
    const cnt = {};
    recs.forEach((x) => { if (x.subjectCode) cnt[x.subjectCode] = (cnt[x.subjectCode] || 0) + 1; });
    const subjectCode = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    return {
      name, subjectCode, subject: subjectName(subjectCode), total: recs.length,
      classes: [...new Set(recs.map((x) => x.class))].sort(naturalCompare),
    };
  });

  /* --- danh sách lớp --- */
  const classNames = new Set([...(sources?.class?.classes || []), ...byClass.keys()]);
  const classes = [...classNames].sort(naturalCompare).map((name) => ({
    name, grade: gradeOf(name), total: (byClass.get(name) || []).filter((x) => !x.event).length,
  }));

  /* --- môn học --- */
  const subjects = [...bySubject.entries()].map(([code, rs]) => ({
    code, name: subjectName(code), count: rs.length,
    teachers: [...new Set(rs.map((x) => x.teacher).filter(Boolean))],
  })).sort((a, b) => b.count - a.count);

  const rooms = [...byRoom.keys()].sort(naturalCompare);
  const maxPeriod = Math.max(5, ...records.map((r) => r.period));
  const metas = [sources?.class?.meta, sources?.teacher?.meta].filter(Boolean);
  const meta = { ...(metas[1] || {}), ...(metas[0] || {}) };
  meta.school = metas.map((m) => m.school).find((s) => /thpt/i.test(s || '')) || metas[0]?.school || metas[1]?.school || '';
  meta.week = metas[0]?.week || metas[1]?.week || 0;
  meta.start = metas[0]?.start || metas[1]?.start || null;
  meta.end = metas[0]?.end || metas[1]?.end || null;
  const teaching = records.filter((r) => !r.event);
  const notes = sources?.class?.notes || [];

  return {
    records, teachers, classes, subjects, rooms, byTeacher, byClass, byRoom, bySlot, bySubject,
    maxPeriod, meta, notes, school: cleanSchool(meta.school),
    totals: { teachers: teachers.length, classes: classes.length, subjects: subjects.length, periods: teaching.length, rooms: rooms.length },
    hasTeacherFile: !!sources?.teacher, hasClassFile: !!sources?.class,
    parseIssues: [...(sources?.teacher?.issues || []), ...(sources?.class?.issues || [])],
  };
}

/** "TRƯỜNG THPT CHUYÊN LÊ QUÝ ĐÔN" → "THPT Chuyên Lê Quý Đôn" */
function cleanSchool(s) {
  const t = cleanText(s).replace(/^tr[uư][oờ]ng\s*/i, '');
  if (!t) return DEFAULT_SCHOOL;
  if (/^[A-ZÀ-Ỹ\s]+$/.test(t)) {
    return t.toLowerCase().split(' ').map((w) => (w === 'thpt' ? 'THPT' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  return /^(thpt|thcs|chuyên|chuyen)/i.test(t) ? t : 'THPT ' + t;
}
