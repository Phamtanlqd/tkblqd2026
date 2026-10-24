/* =====================================================================
 * publish.js – V3: công bố NHIỀU tuần cho mọi người xem.
 * Mỗi tuần = 1 file JSON trong assets/data/weeks/, kèm index.json (danh mục).
 * Quản trị xuất "gói công bố" (.zip) → giải nén vào assets/data/ → push GitHub.
 * ===================================================================== */
export const WEEK_DIR = 'assets/data/weeks/';
export const weekFile = (w) => `${w.year}_HK${w.semester}_T${String(w.week).padStart(2, '0')}.json`;
const byKeyDesc = (a, b) => b.key.localeCompare(a.key);

export async function fetchIndex() {
  try {
    const r = await fetch(WEEK_DIR + 'index.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.weeks) && j.weeks.length ? j : null;
  } catch { return null; }
}
export async function fetchWeek(entry) {
  const r = await fetch(WEEK_DIR + entry.file, { cache: 'no-store' });
  if (!r.ok) throw new Error('Không tải được ' + entry.file);
  return r.json();
}
/** Tuần hiện hành theo ngày hôm nay; nếu chưa có thì tuần mới nhất đã qua; cuối cùng là tuần mới nhất */
export function pickCurrent(weeks, now = new Date()) {
  const t = now.getTime(), DAY = 864e5;
  const inRange = weeks.filter((w) => w.start && t >= new Date(w.start).getTime() && t < new Date(w.end || w.start).getTime() + 2 * DAY);
  if (inRange.length) return inRange.sort(byKeyDesc)[0];
  const past = weeks.filter((w) => w.start && new Date(w.start).getTime() <= t).sort(byKeyDesc);
  return past[0] || [...weeks].sort(byKeyDesc)[0];
}

/* ---------- Tạo file .zip (không nén) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], cent = []; let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const nm = enc.encode(f.name), data = enc.encode(f.text), c = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
    lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true);
    ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cent.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + data.length;
  }
  const csz = cent.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cent, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
/** Gói công bố: weeks/index.json (gộp các tuần đã công bố + tuần mới) và weeks/<tuần>.json */
export function buildPackage(selected, existing = []) {
  const map = new Map(existing.map((w) => [w.key, w])), files = [];
  for (const w of selected) {
    const e = { key: w.key, year: w.year, semester: w.semester, week: w.week, start: w.start, end: w.end, periods: w.periods, file: weekFile(w) };
    map.set(w.key, e);
    files.push({ name: 'weeks/' + e.file, text: JSON.stringify({ ...e, sources: w.sources }) });
  }
  const weeks = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  files.unshift({ name: 'weeks/index.json', text: JSON.stringify({ version: 1, updated: new Date().toISOString(), weeks }, null, 1) });
  return makeZip(files);
}
