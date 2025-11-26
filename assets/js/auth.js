function handleAuthCallback() {
    // 1. Lấy thông tin từ URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const id_token = params.get('id_token');
    const access_token = params.get('access_token');

    // 2. Kiểm tra và lưu token (Tinh gọn)
    if (id_token && access_token) {
        try {
            localStorage.setItem('idToken', id_token);
            localStorage.setItem('accessToken', access_token);

            // Xóa hash khỏi URL để nhìn gọn hơn (Optional)
            history.replaceState(null, null, ' ');

            // Chuyển hướng về trang chủ
            window.location.replace('/index.html');
        } catch (e) {
            console.error("Lỗi lưu token:", e);
            alert("❌ Lỗi khi lưu phiên đăng nhập.");
        }
    } else {
        const error = params.get('error');
        if (error) {
            alert("❌ Lỗi đăng nhập: " + error);
        }
    }
}

// Tự động chạy khi ở trang callback
if (window.location.pathname.includes('auth-callback')) {
    handleAuthCallback();
}

document.addEventListener('DOMContentLoaded', () => {

    // --- [BƯỚC 1] CẤU HÌNH ---
    const COGNITO_DOMAIN = 'https://ap-southeast-1znv0OtpAG.auth.ap-southeast-1.amazoncognito.com';
    const CLIENT_ID = '7poavnchv842gaj58m4s9hhrok';

    // ✨ [CẬP NHẬT] Tự động xác định Redirect URI dựa trên môi trường
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Nếu là Local: Giữ nguyên port hiện tại (thường là 5500 hoặc 5501 với Live Server)
    // Nếu là Prod: Dùng link Amplify
    const APP_BASE_URL = isLocal
        ? `${window.location.protocol}//${window.location.host}`
        : 'https://main.d17frqb5qnxe51.amplifyapp.com';

    const REDIRECT_URI = `${APP_BASE_URL}/auth/auth-callback.html`;

    console.log("Current Env:", isLocal ? "Development" : "Production");
    console.log("Redirect URI:", REDIRECT_URI);


    // --- [BƯỚC 2] TẠO URL ĐĂNG NHẬP ---
    const SCOPES = 'email+openid+profile+aws.cognito.signin.user.admin';

    // URL Login & Register
    const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;
    const registerUrl = `${COGNITO_DOMAIN}/signup?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;
    const googleLoginUrl = `${COGNITO_DOMAIN}/oauth2/authorize?identity_provider=Google&client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=select_account`;


    // --- [BƯỚC 3] GẮN SỰ KIỆN ---
    const attachEvent = (id, url) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => window.location.href = url);
    };

    attachEvent('login-email-button', loginUrl);
    attachEvent('login-google-button', googleLoginUrl);
    attachEvent('register-email-button', registerUrl);
    attachEvent('register-google-button', googleLoginUrl);
});
