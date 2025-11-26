// =================================================================
//                      THEME LOGIC (GLOBAL)
// =================================================================
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

const getCurrentTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    return 'light'; // ✨ [CẬP NHẬT] Mặc định luôn là Light Mode
};

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme); // ✨ [SỬA LỖI] Đặt theme trên <html>
    localStorage.setItem('theme', theme);
    updateThemeButtonUI();
    if (typeof window.updateDashboardTheme === 'function') {
        window.updateDashboardTheme(theme);
    }
}

// =================================================================
//                      SOUND SETTINGS LOGIC
// =================================================================
function isSoundEnabled() {
    return localStorage.getItem('soundEnabled') !== 'false';
}
function setSoundEnabled(enabled) {
    localStorage.setItem('soundEnabled', String(enabled));
    updateSoundButtonUI();
}
function toggleSoundSetting() {
    setSoundEnabled(!isSoundEnabled());
}
function updateSoundButtonUI() {
    const soundToggleBtn = document.getElementById('sound-toggle');
    if (!soundToggleBtn) return;
    soundToggleBtn.innerHTML = isSoundEnabled() ? `<i class="fas fa-volume-up"></i>` : `<i class="fas fa-volume-mute"></i>`;
    soundToggleBtn.setAttribute('title', isSoundEnabled() ? 'Tắt âm thanh cảnh báo' : 'Bật âm thanh cảnh báo');
}
function updateThemeButtonUI() {
    const themeSwitchBtn = document.getElementById('theme-switch');
    if (!themeSwitchBtn) return;
    const iconHtml = getCurrentTheme() === 'dark'
        ? `<i class="fas fa-sun"></i>`
        : `<i class="fas fa-moon"></i>`;
    themeSwitchBtn.innerHTML = iconHtml;
}

// =================================================================
//                      LANGUAGE LOGIC (i18n)
// =================================================================
function getLanguage() { return localStorage.getItem('language') || 'vi'; }
function setLanguage(lang) {
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    translatePage();
}
function translatePage() {
    const lang = getLanguage();
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });
    const titleElements = document.querySelectorAll('[data-i18n-title]');
    titleElements.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (translations[lang] && translations[lang][key]) {
            el.setAttribute('title', translations[lang][key]);
        }
    });
}

// =================================================================
//                      PAGE TRANSITIONS
// =================================================================
function setupPageTransitions() {
    document.body.addEventListener('click', function (event) {
        const link = event.target.closest('a');
        if (link && link.href && link.host === window.location.host && !link.href.includes('#') && link.target !== '_blank') {
            event.preventDefault();
            const destination = link.href;
            if (destination === window.location.href) return;
            document.body.classList.add('body-fade-out');
            setTimeout(() => { window.location.href = destination; }, 500);
        }
    });
}

// =================================================================
//                      PAGE INITIALIZATION
// =================================================================
document.addEventListener("DOMContentLoaded", function () {
    const headerPlaceholder = document.getElementById("header-placeholder");
    const footerPlaceholder = document.getElementById("footer-placeholder");
    const loadingPromises = [];

    // Tải và chèn Header
    if (headerPlaceholder) {
        // Xác định đường dẫn đến header dựa trên vị trí file hiện tại
        const isSubDir = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/');
        const headerPath = isSubDir ? '../components/header.html' : 'components/header.html';

        const loadHeader = fetch(headerPath)
            .then(response => response.ok ? response.text() : Promise.reject(`Không tìm thấy header tại ${headerPath}`))
            .then(data => {
                headerPlaceholder.innerHTML = data;

                // 1. Đánh dấu trang hiện tại là "active"
                const currentPage = window.location.pathname.split("/").pop() || 'index.html';
                document.querySelectorAll('.main-nav a').forEach(link => {
                    if (link.getAttribute('href') === currentPage) {
                        link.classList.add('active');
                    }
                });

                // 2. Thêm hiệu ứng cho header khi cuộn
                const header = document.querySelector('.main-header');
                if (header) {
                    window.addEventListener('scroll', () => {
                        header.classList.toggle('scrolled', window.scrollY > 10);
                    });
                }

                // 3. Gắn sự kiện cho menu di động
                const mobileNavToggle = document.getElementById('mobile-nav-toggle');
                const navContainer = document.querySelector('.nav-container');
                if (mobileNavToggle && header && navContainer) {
                    mobileNavToggle.addEventListener('click', () => {
                        const isOpened = header.classList.toggle('mobile-nav-active');
                        document.body.classList.toggle('mobile-menu-open', isOpened);
                        mobileNavToggle.setAttribute('aria-expanded', isOpened);
                    });
                    navContainer.querySelectorAll('a').forEach(link => {
                        link.addEventListener('click', () => {
                            if (header.classList.contains('mobile-nav-active')) {
                                document.body.classList.remove('mobile-menu-open');
                                header.classList.remove('mobile-nav-active');
                                mobileNavToggle.setAttribute('aria-expanded', 'false');
                            }
                        });
                    });
                }

                // 4. Gắn sự kiện cho các nút điều khiển (Âm thanh, Theme, Ngôn ngữ)
                document.getElementById('sound-toggle')?.addEventListener('click', toggleSoundSetting);
                document.getElementById('theme-switch')?.addEventListener('click', () => {
                    setTheme(getCurrentTheme() === 'light' ? 'dark' : 'light');
                });
                const langSwitcher = document.getElementById('language-switcher');
                if (langSwitcher) {
                    langSwitcher.value = getLanguage();
                    langSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
                }

                // 5. ✨ [CẬP NHẬT] Gọi hàm cập nhật trạng thái đăng nhập
                // Hàm này sẽ tự động ẩn "Đăng nhập" và tạo icon người dùng nếu cần
                updateHeaderAuthState();

                // ✨ [MỚI] Kích hoạt hiệu ứng tương tác sau khi header đã tải
                setupInteractiveEffects();
            });
        loadingPromises.push(loadHeader);
    }

    // Tải và chèn Footer
    if (footerPlaceholder) {
        const isSubDir = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/');
        const footerPath = isSubDir ? '../components/footer.html' : 'components/footer.html';

        const loadFooter = fetch(footerPath)
            .then(response => response.ok ? response.text() : Promise.reject('Không tìm thấy footer'))
            .then(data => { footerPlaceholder.innerHTML = data; });
        loadingPromises.push(loadFooter);
    }

    // Thiết lập các nút cuộn trang
    setupScrollButtons();
    // Áp dụng theme đã lưu
    setTheme(getCurrentTheme());
    // ✨ [SỬA LỖI] Kích hoạt hàm chuyển trang
    setupPageTransitions();

    // Dịch trang sau khi mọi thứ đã tải xong
    Promise.all(loadingPromises)
        .then(() => {
            setLanguage(getLanguage());
            updateSoundButtonUI();
            updateThemeButtonUI();
        })
        .catch(error => console.error("Lỗi khi tải thành phần giao diện:", error));
});

// =================================================================
//                      SCROLL BUTTONS
// =================================================================
function setupScrollButtons() {
    const scrollToTopBtn = document.getElementById('scroll-to-top');

    if (!scrollToTopBtn) return;

    // Show/hide button based on scroll position
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
    });

    // Scroll to top when clicked
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// =================================================================
//                      SERVICE WORKER
// =================================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker đã được đăng ký thành công với scope: ', registration.scope);
            })
            .catch(error => {
                console.log('Đăng ký ServiceWorker thất bại: ', error);
            });
    });
}

// =================================================================
//                      ✨ [CẬP NHẬT] AUTH LOGIC
// =================================================================

/**
 * Giải mã một chuỗi JWT.
 */
function decodeJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Lỗi giải mã JWT:", e);
        return null;
    }
}

/**
 * Đăng xuất người dùng.
 */
function logout() {
    // Xóa URL miền Cognito khỏi localStorage (nếu bạn có lưu)
    // localStorage.removeItem('cognitoDomain'); 
    localStorage.removeItem('idToken');
    localStorage.removeItem('accessToken');
    window.location.href = '/auth/login.html';
}

/**
 * ✨ [CẬP NHẬT] Viết lại hoàn toàn hàm này để xử lý menu thả xuống mới
 */
function updateHeaderAuthState() {
    const idToken = localStorage.getItem('idToken');
    const loginBtn = document.getElementById('login-btn');
    const userProfileMenu = document.getElementById('user-profile-menu'); // <div> chứa menu

    if (idToken) {
        // --- Đã đăng nhập ---
        if (loginBtn) loginBtn.style.display = 'none';
        if (userProfileMenu) userProfileMenu.style.display = 'inline-flex'; // Hiển thị toàn bộ menu

        const userProfileBtnIcon = document.getElementById('user-profile-btn-icon');
        const adminLink = document.getElementById('dropdown-admin-link');
        const logoutBtn = document.getElementById('dropdown-logout-btn');

        // Gắn sự kiện để mở/đóng menu thả xuống
        if (userProfileBtnIcon) {
            userProfileBtnIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Ngăn sự kiện click lan ra window
                userProfileMenu.classList.toggle('active');
            });
        }

        // Gắn sự kiện cho nút đăng xuất
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Kiểm tra quyền Admin để hiển thị nút "Quản trị"
        const decodedToken = decodeJwt(idToken);
        const userGroups = decodedToken ? (decodedToken['cognito:groups'] || []) : [];
        const isAdmin = userGroups.includes('admin');

        if (adminLink) {
            adminLink.style.display = isAdmin ? 'block' : 'none'; // Hiển thị nếu là admin
        }

    } else {
        // --- Chưa đăng nhập ---
        if (loginBtn) {
            loginBtn.style.display = 'inline-flex';
            loginBtn.addEventListener('click', () => {
                window.location.href = '/auth/login.html';
            });
        }
        if (userProfileMenu) userProfileMenu.style.display = 'none';
    }

    // Thêm sự kiện để đóng menu khi nhấp ra ngoài
    window.addEventListener('click', (e) => {
        if (userProfileMenu && !userProfileMenu.contains(e.target)) {
            userProfileMenu.classList.remove('active');
        }
    });
}


/**
 * =================================================================
 *                      HIỆU ỨNG HOẠT HÌNH KHI CUỘN
 * =================================================================
 * Sử dụng Intersection Observer để thêm class 'is-visible' khi phần tử
 * lọt vào màn hình, kích hoạt hiệu ứng đã định nghĩa trong CSS.
 */
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    if (!animatedElements.length) {
        return;
    }

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Lấy độ trễ từ thuộc tính data-animation-delay
                const delay = entry.target.dataset.animationDelay || 0;

                setTimeout(() => {
                    entry.target.classList.add('is-visible');
                }, parseInt(delay, 10));

                // Ngừng quan sát phần tử sau khi đã hiển thị
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1 // Kích hoạt khi 10% phần tử hiển thị
    });

    animatedElements.forEach(element => {
        observer.observe(element);
    });
});


// =================================================================
//                      INTERACTIVE EFFECTS (Phase 3)
// =================================================================
function setupInteractiveEffects() {
    // --- Magnetic Buttons ---
    const magneticBtns = document.querySelectorAll('.magnetic-button');
    magneticBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Calculate distance from center
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Strength of attraction
            const strength = 20;
            const deltaX = (x - centerX) / centerX * strength;
            const deltaY = (y - centerY) / centerY * strength;

            btn.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

            // Update CSS vars for glow effect
            btn.style.setProperty('--x', `${x}px`);
            btn.style.setProperty('--y', `${y}px`);
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });

    // --- 3D Tilt Cards ---
    const tiltCards = document.querySelectorAll('.tilt-card, .hero-text'); // Include hero text
    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Rotation limit (degrees)
            const limit = 10;
            const rotateY = ((x - centerX) / centerX) * limit;
            const rotateX = ((centerY - y) / centerY) * limit; // Invert Y axis

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
        });
    });
}
