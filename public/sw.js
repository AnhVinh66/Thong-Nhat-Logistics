// Service worker cho app nhân viên / lái xe.
// Không lưu dữ liệu chuyến hay ảnh vào bộ nhớ máy: luôn lấy bản mới nhất từ mạng.
// Chỉ khi mất mạng mới hiện trang /offline.html.
const CACHE = 'tnl-shell-v2'; // đổi số khi đổi logo / trang offline
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/tn-icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Chỉ xử lý khi mở trang; mọi yêu cầu khác (dữ liệu, ảnh, Supabase) đi thẳng ra mạng
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
