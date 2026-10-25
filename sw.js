/* =====================================================================
 * sw.js – Service Worker: cache toàn bộ ứng dụng để dùng offline
 *  - Tệp tĩnh (thư viện, icon, dữ liệu mẫu): cache-first
 *  - Mã nguồn / HTML: network-first (luôn lấy bản mới khi có mạng), rơi về cache khi offline
 * Đổi CACHE_VERSION mỗi lần phát hành để làm mới cache.
 * ===================================================================== */
const CACHE_VERSION = 'smart-tkb-v3.1.1';
const PRECACHE = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/app.js', 'js/utils.js', 'js/data-loader.js', 'js/dashboard.js', 'js/teacher.js', 'js/class.js',
  'js/room.js', 'js/search.js', 'js/export.js', 'js/validator.js', 'js/settings.js', 'js/auth.js', 'js/history.js', 'js/publish.js', 'js/config.js',
  'assets/vendor/bootstrap.min.css', 'assets/vendor/bootstrap.bundle.min.js', 'assets/vendor/xlsx.full.min.js',
  'assets/vendor/chart.umd.js', 'assets/vendor/qrcode.min.js', 'assets/vendor/html2pdf.bundle.min.js',
  'assets/vendor/bootstrap-icons/bootstrap-icons.min.css',
  'assets/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2', 'assets/vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
  'assets/icons/logo.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png',
  'assets/data/tkb-giao-vien.xlsx', 'assets/data/tkb-lop.xls', 'assets/data/tkb-lop-chieu.xlsx',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Mã nguồn và dữ liệu TKB: luôn ưu tiên bản mới nhất khi có mạng
  const isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/') || url.pathname.includes('/assets/data/');
  const isVendor = url.pathname.includes('/assets/vendor/');

  if (isCode && !isVendor) {
    // Network-first
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))),
    );
  } else {
    // Cache-first
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
