// ✨ [CẢI TIẾN] Tăng phiên bản cache. Mỗi khi có thay đổi lớn, hãy tăng số này.
const CACHE_NAME = 'iot-dashboard-cache-v6.0';

// ✨ [CẢI TIẾN] Cập nhật danh sách cache để bao gồm các tài nguyên cần thiết và loại bỏ các file không tồn tại.
const urlsToCache = [
    '/',
    '/index.html',
    '/pages/dashboard.html',
    '/auth/login.html',
    '/auth/register.html', // ✨ [MỚI] Thêm trang đăng ký
    '/auth/auth-callback.html', // ✨ [MỚI] Thêm trang callback
    '/pages/profile.html', // ✨ [MỚI] Trang hồ sơ người dùng
    '/admin/admin.html', // ✨ [MỚI] Trang quản trị
    '/pages/status.html',
    '/pages/hardware.html',
    '/pages/data-analysis.html',
    '/pages/evaluation.html', // Trang đánh giá

    // Scripts
    '/assets/js/auth.js', // ✨ [MỚI] Script xác thực chính
    '/assets/js/auth-protect.js', // ✨ [MỚI] Thêm script bảo vệ trang
    '/assets/js/admin-protect.js', // ✨ [MỚI] Script bảo vệ trang admin
    '/assets/js/main.js',
    '/assets/js/script.js', // Đổi tên từ script-1.js thành script.js
    '/assets/js/profile.js', // ✨ [MỚI]
    '/assets/js/admin.js', // ✨ [MỚI]
    '/assets/js/admin-dashboard.js', // ✨ [MỚI]
    '/assets/js/data-analysis.js',
    '/assets/js/chat-ai.js', // ✨ [MỚI]
    '/assets/js/i18n.js', '/assets/js/toast.js', '/assets/js/workflow.js',

    // Styles & Components
    '/assets/css/style.css',
    '/assets/css/auth.css', // ✨ [MỚI] Thêm CSS cho trang xác thực
    '/components/header.html', '/components/footer.html',
    '/images/favicon-32x32.png', '/images/esp8266.jpg', '/images/geiger-counter.jpg', '/images/dht11.jpg',
    '/images/android-icon-192x192.png',
    '/manifest.json'
]; // ✨ [LƯU Ý] Cần thêm các file ảnh/icon khác nếu có trên trang login/register


// Sự kiện install: Mở cache và thêm các tệp cốt lõi
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache đã được mở. Bắt đầu thêm tài nguyên...');
                // ✨ [SỬA LỖI] Thay thế addAll bằng một vòng lặp để cache linh hoạt hơn.
                // Điều này ngăn việc một file lỗi làm hỏng toàn bộ quá trình cache.
                const cachePromises = urlsToCache.map(urlToCache => {
                    return cache.add(urlToCache).catch(err => {
                        console.warn(`Bỏ qua cache cho: ${urlToCache}`, err);
                    });
                });
                return Promise.all(cachePromises);
            })
    );
})

// Sự kiện fetch: Phục vụ từ cache hoặc lấy từ mạng
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Bỏ qua các yêu cầu không phải GET hoặc không phải http/https
    if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }

    // Bỏ qua các yêu cầu API để chúng luôn đi ra mạng
    if (url.hostname.includes('execute-api') || url.hostname.includes('googleapis.com')) {
        return;
    }

    // ✨ [CẢI TIẾN] Áp dụng chiến lược "Stale-While-Revalidate" cho các tệp chính
    // Điều này giúp tải trang nhanh từ cache, đồng thời cập nhật phiên bản mới ở chế độ nền.
    const criticalFiles = ['/assets/css/style.css', '/assets/js/script.js', '/assets/js/main.js', '/index.html', '/pages/dashboard.html'];
    if (criticalFiles.some(file => url.pathname.endsWith(file))) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Trả về từ cache ngay lập tức nếu có, nếu không thì chờ mạng
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // Chiến lược "Cache First" cho các tài nguyên còn lại (font, ảnh, thư viện CDN)
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                });
            })
    );
})

// Sự kiện activate: Dọn dẹp các cache cũ
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(caches.keys().then(cacheNames => Promise.all(cacheNames.map(cacheName => {
        if (cacheWhitelist.indexOf(cacheName) === -1) return caches.delete(cacheName);
    }))));
})