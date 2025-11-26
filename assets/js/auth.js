function handleAuthCallback() {
    // 1. Lấy thông tin từ URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const id_token = params.get('id_token');
    const access_token = params.get('access_token');

    // 2. Hiện thông báo kiểm tra (Sẽ chặn trình duyệt lại)
    if (id_token) {
        alert("✅ ĐÃ NHẬN ĐƯỢC TOKEN TỪ COGNITO!\n\nNhấn OK để lưu vào LocalStorage.");

        // 3. Lưu vào bộ nhớ
        try {
            localStorage.setItem('idToken', id_token);
            localStorage.setItem('accessToken', access_token);
            alert("✅ Đã lưu Token thành công! Kiểm tra Application > LocalStorage.");

            // 4. Chuyển hướng thủ công
            // Hỏi người dùng trước khi chuyển để chắc chắn không bị loop
            if (confirm("Bạn có muốn vào trang chủ ngay bây giờ không?")) {
                window.location.replace('/index.html');
            }
        } catch (e) {
            alert("❌ Lỗi khi lưu LocalStorage: " + e.message);
        }

    } else {
        // Nếu không thấy token
        const error = params.get('error');
        if (error) {
            alert("❌ Lỗi từ Cognito: " + error);
        } else {
            // Chỉ hiện alert nếu đang ở đúng trang callback mà không thấy token
            if (window.location.pathname.includes("auth-callback.html")) {
                alert("⚠️ Cảnh báo: Không tìm thấy Token trong URL. \nHash hiện tại: " + hash);
            }
        }
    }
}

// Tự động chạy
if (window.location.pathname.includes('auth-callback')) {
    handleAuthCallback();
}

document.addEventListener('DOMContentLoaded', () => {

    // --- [BƯỚC 1] CẤU HÌNH CỦA BẠN ---
    const COGNITO_DOMAIN = 'https://ap-southeast-1znv0OtpAG.auth.ap-southeast-1.amazoncognito.com';
    const CLIENT_ID = '7poavnchv842gaj58m4s9hhrok';

    const PROD_DOMAIN = 'https://dzh6es5lalpto.cloudfront.net';
    const DEV_DOMAIN = 'http://localhost:5500';

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const APP_BASE_URL = isLocal ? DEV_DOMAIN : PROD_DOMAIN;

    const REDIRECT_URI = `${APP_BASE_URL}/auth/auth-callback.html`;


    // --- [BƯỚC 2] TẠO CÁC URL ĐĂNG NHẬP/ĐĂNG KÝ ---

    // ✨ [SỬA LỖI] Thêm 'aws.cognito.signin.user.admin' vào SCOPE
    // Điều này là BẮT BUỘC để cho phép các hàm Lambda (như /profile) có thể 
    // sử dụng AccessToken để quản lý thông tin người dùng.
    const SCOPES = 'email+openid+profile+aws.cognito.signin.user.admin';

    // URL để Cognito hiển thị trang đăng nhập (Email + Google)
    const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;

    // URL để Cognito hiển thị trang đăng ký (Email + Google)
    const registerUrl = `${COGNITO_DOMAIN}/signup?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;

    // URL để Cognito chỉ hiển thị đăng nhập Google
    const googleLoginUrl = `${COGNITO_DOMAIN}/oauth2/authorize?identity_provider=Google&client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;


    // --- [BƯỚC 3] GẮN SỰ KIỆN CHO CÁC NÚT BẤM ---

    // Trang Đăng nhập
    document.getElementById('login-email-button')?.addEventListener('click', () => {
        window.location.href = loginUrl;
    });
    document.getElementById('login-google-button')?.addEventListener('click', () => {
        window.location.href = googleLoginUrl;
    });

    // Trang Đăng ký
    document.getElementById('register-email-button')?.addEventListener('click', () => {
        window.location.href = registerUrl;
    });
    document.getElementById('register-google-button')?.addEventListener('click', () => {
        window.location.href = googleLoginUrl;
    });
});
