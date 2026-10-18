/* =====================================================================
 * search.js – Tìm kiếm thông minh toàn cục (giáo viên, lớp, môn, phòng)
 * và trang chi tiết môn học
 * ===================================================================== */
import { normalize, escapeHtml, debounce, subjectChip, subjectColor, subjectName, naturalCompare } from './utils.js';

const TYPE_META = {
  teacher: { label: 'Giáo viên', icon: 'bi-person-workspace' },
  class: { label: 'Lớp', icon: 'bi-people' },
  subject: { label: 'Môn học', icon: 'bi-journal-bookmark' },
  room: { label: 'Phòng học', icon: 'bi-door-open' },
};
const cache = new WeakMap();

/** Dựng chỉ mục tìm kiếm một lần cho mỗi dataset (O(n)) */
export function buildSearchIndex(ds) {
  if (cache.has(ds)) return cache.get(ds);
  const items = [];
  const add = (type, label, sub, href, extra = '') => items.push({ type, label, sub, href, n: normalize(`${label} ${extra}`) });
  ds.teachers.forEach((t) => add('teacher', t.name, `${t.subject || 'Chưa rõ môn'} · ${t.total} tiết`, '#/teacher/' + encodeURIComponent(t.name), t.subject));
  ds.classes.forEach((c) => add('class', c.name, `Khối ${c.grade} · ${c.total} tiết`, '#/class/' + encodeURIComponent(c.name), 'lop khoi ' + c.grade));
  ds.subjects.forEach((s) => add('subject', s.name, `${s.count} tiết · ${s.teachers.length} giáo viên`, '#/subject/' + encodeURIComponent(s.code), s.code + ' mon'));
  ds.rooms.forEach((r) => add('room', r, `${(ds.byRoom.get(r) || []).length} tiết / tuần`, '#/rooms/' + encodeURIComponent(r), 'phong'));
  cache.set(ds, items);
  return items;
}

/** Tìm kiếm: mọi từ khóa phải xuất hiện; ưu tiên khớp đầu chuỗi / đầu từ */
export function search(ds, query, perType = 6) {
  const q = normalize(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const out = { teacher: [], class: [], subject: [], room: [] };
  for (const it of buildSearchIndex(ds)) {
    if (!tokens.every((t) => it.n.includes(t))) continue;
    const ln = normalize(it.label);
    const score = ln.startsWith(tokens[0]) ? 0 : ln.includes(' ' + tokens[0]) ? 1 : 2;
    out[it.type].push({ ...it, score });
  }
  return Object.entries(out).flatMap(([type, arr]) =>
    arr.sort((a, b) => a.score - b.score || naturalCompare(a.label, b.label)).slice(0, perType));
}

/** Gắn ô tìm kiếm + bảng kết quả */
export function initGlobalSearch({ input, panel, getDataset }) {
  let results = [];
  let active = -1;
  const close = () => { panel.hidden = true; active = -1; };
  const render = () => {
    const q = input.value.trim();
    if (!q) return close();
    results = search(getDataset(), q);
    if (!results.length) { panel.innerHTML = '<div class="sr-empty">Không tìm thấy kết quả phù hợp</div>'; panel.hidden = false; return; }
    let last = '';
    panel.innerHTML = results.map((r, i) => {
      const head = r.type !== last ? `<div class="sr-group">${TYPE_META[r.type].label}</div>` : '';
      last = r.type;
      return `${head}<a class="sr-item" data-i="${i}" href="${r.href}"><i class="bi ${TYPE_META[r.type].icon}"></i>
        <span>${escapeHtml(r.label)}</span><small>${escapeHtml(r.sub)}</small></a>`;
    }).join('');
    panel.hidden = false;
    active = -1;
  };
  const setActive = (i) => {
    const nodes = [...panel.querySelectorAll('.sr-item')];
    if (!nodes.length) return;
    active = (i + nodes.length) % nodes.length;
    nodes.forEach((n, k) => n.classList.toggle('active', k === active));
    nodes[active].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', debounce(render, 60));
  input.addEventListener('focus', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      const t = results[active >= 0 ? active : 0];
      if (t) { location.hash = t.href; input.value = ''; close(); input.blur(); }
    } else if (e.key === 'Escape') { close(); input.blur(); }
  });
  panel.addEventListener('click', () => { input.value = ''; close(); });
  document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== input) close(); });
  // Phím tắt: Ctrl+K hoặc "/" để focus ô tìm kiếm
  document.addEventListener('keydown', (e) => {
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
  });
}

/** Trang chi tiết một môn: giáo viên dạy, số tiết theo lớp */
export function renderSubject(host, ds, ctx, code) {
  code = decodeURIComponent(code || '');
  const recs = ds.bySubject.get(code) || [];
  if (!recs.length) { host.innerHTML = '<div class="empty-state glass"><i class="bi bi-journal-x"></i><p>Không tìm thấy môn học.</p></div>'; return; }
  const byT = new Map(), byC = new Map();
  recs.forEach((r) => {
    if (r.teacher) { const o = byT.get(r.teacher) || { n: 0, cls: new Set() }; o.n++; o.cls.add(r.class); byT.set(r.teacher, o); }
    byC.set(r.class, (byC.get(r.class) || 0) + 1);
  });
  host.innerHTML = `
    <div class="page-head"><div><h2><i class="bi bi-journal-bookmark"></i> Môn ${escapeHtml(subjectName(code))}</h2>
      <p class="text-muted mb-0">${recs.length} tiết / tuần · ${byT.size} giáo viên · ${byC.size} lớp</p></div></div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="glass card-pad"><div class="card-title-row"><h6>Giáo viên giảng dạy</h6></div>
        <div class="table-wrap"><table class="table align-middle"><thead><tr><th>Giáo viên</th><th class="text-end">Số tiết</th><th>Các lớp</th></tr></thead><tbody>
        ${[...byT.entries()].sort((a, b) => b[1].n - a[1].n).map(([n, o]) => `<tr><td><a href="#/teacher/${encodeURIComponent(n)}">${escapeHtml(n)}</a></td><td class="text-end"><b>${o.n}</b></td>
          <td>${[...o.cls].sort(naturalCompare).map((c) => `<a class="chip" href="#/class/${encodeURIComponent(c)}">${escapeHtml(c)}</a>`).join(' ')}</td></tr>`).join('')}
        </tbody></table></div></div></div>
      <div class="col-lg-5"><div class="glass card-pad"><div class="card-title-row"><h6>Số tiết theo lớp</h6></div>
        <div class="chips">${[...byC.entries()].sort((a, b) => naturalCompare(a[0], b[0])).map(([c, n]) => `<a class="subj-chip" style="--c:${subjectColor(code)}" href="#/class/${encodeURIComponent(c)}">${escapeHtml(c)} <b>${n}</b></a>`).join('')}</div></div></div>
    </div>`;
}
