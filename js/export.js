/* =====================================================================
 * export.js – Xuất dữ liệu: In, PDF, PNG, Excel và sinh mã QR
 * Phụ thuộc thư viện toàn cục: XLSX, html2pdf, QRCode, bootstrap
 * ===================================================================== */
import { toast, escapeHtml, normalize } from './utils.js';

/** Tải một Blob/URL về máy */
export function downloadBlob(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const safeName = (s) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tkb';

/**
 * Nhân bản phần tử vào khung nền sáng (để xuất đẹp kể cả khi đang ở Dark Mode),
 * chạy callback rồi dọn dẹp.
 */
/** Đổi mọi màu CSS (hex/hsl/tên) → [r,g,b] nhờ canvas */
function toRGB(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = color;
  const v = c.fillStyle;
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  return (v.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
}
/** html2canvas không hiểu color-mix(): gán màu rgba cụ thể cho phần tử dùng biến --c */
function flattenColors(root) {
  root.querySelectorAll('[style*="--c"]').forEach((n) => {
    const col = n.style.getPropertyValue('--c').trim();
    if (!col) return;
    const [r, g, b] = toRGB(col);
    n.style.backgroundColor = `rgba(${r},${g},${b},.16)`;
    if (n.classList.contains('subj-chip')) { n.style.color = col; n.style.border = `1px solid rgba(${r},${g},${b},.45)`; }
    else n.style.borderLeft = `4px solid ${col}`;
  });
}

async function withLightClone(el, fn, width = 1100) {
  const wrap = document.createElement('div');
  wrap.className = 'export-sheet';
  wrap.setAttribute('data-bs-theme', 'light');
  wrap.style.width = width + 'px';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.no-export').forEach((n) => n.remove());
  wrap.appendChild(clone);
  flattenColors(wrap);
  // Khung "holder" nằm ngoài màn hình; bản thân wrap giữ vị trí tĩnh để html2pdf/html2canvas nhân bản được
  const holder = document.createElement('div');
  holder.className = 'export-holder';
  holder.appendChild(wrap);
  document.body.appendChild(holder);
  try { return await fn(wrap); } finally { holder.remove(); }
}

/** In phần tử (dùng khung #printRoot, CSS @media print ẩn phần còn lại) */
export function exportPrint(el) {
  let root = document.getElementById('printRoot');
  if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
  root.setAttribute('data-bs-theme', 'light');
  root.innerHTML = '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.no-export').forEach((n) => n.remove());
  root.appendChild(clone);
  const cleanup = () => { root.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
}

/** Xuất PDF khổ A4 ngang */
export async function exportPDF(el, filename = 'tkb.pdf', landscape = true) {
  if (!window.html2pdf) return toast('Thư viện html2pdf chưa sẵn sàng', 'danger');
  toast('Đang tạo PDF…', 'primary', 1500);
  await withLightClone(el, (wrap) => window.html2pdf().set({
    margin: 8, filename,
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
  }).from(wrap).save());
  toast('Đã xuất PDF', 'success');
}

/** Xuất ảnh PNG (dùng html2canvas có sẵn trong html2pdf.bundle) */
export async function exportPNG(el, filename = 'tkb.png') {
  if (!window.html2pdf) return toast('Thư viện html2pdf chưa sẵn sàng', 'danger');
  toast('Đang tạo ảnh…', 'primary', 1500);
  await withLightClone(el, async (wrap) => {
    const canvas = await window.html2pdf().set({ html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true } })
      .from(wrap).toCanvas().get('canvas');
    downloadBlob(canvas.toDataURL('image/png'), filename);
  });
  toast('Đã xuất PNG', 'success');
}

/** Xuất Excel: sheets = [{name, aoa}] */
export function exportExcelAOA(sheets, filename = 'tkb.xlsx') {
  if (!window.XLSX) return toast('Thư viện SheetJS chưa sẵn sàng', 'danger');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    const w = s.aoa.reduce((m, r) => r.map((c, i) => Math.max(m[i] || 8, Math.min(40, String(c ?? '').split('\n').reduce((a, l) => Math.max(a, l.length), 0) + 2))), []);
    ws['!cols'] = w.map((x) => ({ wch: x }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

/** Xuất biểu đồ Chart.js thành PNG */
export function exportChartPNG(chart, filename = 'bieu-do.png') {
  if (!chart) return;
  downloadBlob(chart.toBase64Image('image/png', 1), filename);
  toast('Đã xuất biểu đồ PNG', 'success');
}

/**
 * Gắn thanh nút xuất cho một trang.
 * root chứa các nút [data-export="print|pdf|png|excel|qr"]; opts cung cấp phần tử cần xuất.
 */
export function wireExportBar(root, { getEl, getName, getAOA, getQR }) {
  root.querySelector('[data-export="print"]')?.addEventListener('click', () => exportPrint(getEl()));
  root.querySelector('[data-export="pdf"]')?.addEventListener('click', () => exportPDF(getEl(), safeName(getName()) + '.pdf'));
  root.querySelector('[data-export="png"]')?.addEventListener('click', () => exportPNG(getEl(), safeName(getName()) + '.png'));
  root.querySelector('[data-export="excel"]')?.addEventListener('click', () => {
    exportExcelAOA([{ name: getName(), aoa: getAOA() }], safeName(getName()) + '.xlsx');
    toast('Đã xuất Excel', 'success');
  });
  root.querySelector('[data-export="qr"]')?.addEventListener('click', () => showQR(getQR()));
}

/**
 * Hiển thị hộp thoại QR.
 * info = { title, url, text } – người dùng chọn QR dạng liên kết hoặc dạng văn bản (xem offline).
 */
export function showQR(info) {
  const modalEl = document.getElementById('qrModal');
  if (!modalEl || !window.QRCode) return toast('Thư viện QRCode chưa sẵn sàng', 'danger');
  const box = modalEl.querySelector('#qrBox');
  const title = modalEl.querySelector('#qrTitle');
  const hint = modalEl.querySelector('#qrHint');
  const modeBtns = modalEl.querySelectorAll('[name="qrMode"]');
  title.textContent = info.title;

  const draw = () => {
    const mode = [...modeBtns].find((b) => b.checked)?.value || 'url';
    // qrcodejs lỗi với ký tự Unicode → bản văn bản được chuyển sang không dấu (ASCII)
    const text = mode === 'url' ? info.url : stripAccents(info.text);
    box.innerHTML = '';
    try {
      new QRCode(box, { text, width: 260, height: 260, colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.L });
      hint.textContent = mode === 'url'
        ? 'Quét để mở trang này trên thiết bị khác (cần truy cập cùng địa chỉ ứng dụng).'
        : 'Quét để xem bản tóm tắt TKB dạng văn bản – dùng được khi không có mạng.';
      hint.className = 'small text-muted mt-2';
    } catch {
      box.innerHTML = '';
      hint.textContent = 'Nội dung quá dài cho một mã QR. Hãy chọn chế độ "Liên kết".';
      hint.className = 'small text-danger mt-2';
    }
  };
  modeBtns.forEach((b) => { b.onchange = draw; });
  modeBtns[0].checked = true;
  draw();

  modalEl.querySelector('#qrDownload').onclick = () => {
    const c = box.querySelector('canvas'); const img = box.querySelector('img');
    const src = c ? c.toDataURL('image/png') : img?.src;
    if (src) downloadBlob(src, 'qr-' + safeName(info.title) + '.png');
  };
  modalEl.querySelector('#qrCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(info.url); toast('Đã sao chép liên kết', 'success'); }
    catch { toast('Không sao chép được – hãy chọn và copy thủ công', 'warning'); }
  };
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

const stripAccents = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7E\n]/g, '');

/** Tạo liên kết chia sẻ tới một trang trong ứng dụng */
export const shareUrl = (hash) => location.href.split('#')[0] + '#' + hash;

/** Khối tiêu đề dùng khi in / xuất (hiện cả trên màn hình trong vùng export) */
export const exportHeader = (school, title, sub) =>
  `<div class="export-head"><div><div class="eh-school">${escapeHtml(school)}</div><h3>${escapeHtml(title)}</h3></div><div class="eh-sub">${escapeHtml(sub || '')}</div></div>`;
