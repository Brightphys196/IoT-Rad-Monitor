// ✨ [VIẾT LẠI] Logic bảo vệ trang với khả năng tự động làm mới token
(async function () {
    const CLIENT_ID = '7poavnchv842gaj58m4s9hhrok'; // Lấy từ auth.js
    const COGNITO_DOMAIN = 'https://ap-southeast-1znv0OtpAG.auth.ap-southeast-1.amazoncognito.com'; // Lấy từ auth.js
    const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;

    function decodeJwt(token) {
        if (!token) return null;
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) { return null; }
    }

    function clearTokensAndRedirect() {
        localStorage.removeItem('idToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.replace('/auth/login.html');
    }

    async function refreshToken() {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            console.log("Không có refreshToken, không thể làm mới. Đang chuyển hướng đăng nhập.");
            clearTokensAndRedirect();
            return false;
        }

        console.log("Token sắp hết hạn, đang thử làm mới...");
        try {
            const response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    'grant_type': 'refresh_token',
                    'client_id': CLIENT_ID,
                    'refresh_token': refreshToken
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error_description || 'Làm mới token thất bại');

            // Lưu token mới (Cognito không trả về refreshToken mới trong luồng này)
            localStorage.setItem('idToken', data.id_token);
            localStorage.setItem('accessToken', data.access_token);
            console.log("Đã làm mới token thành công.");
            return true;

        } catch (error) {
            console.error("Lỗi khi làm mới token:", error);
            alert("Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại.");
            clearTokensAndRedirect();
            return false;
        }
    }

    async function protectPage() {
        let idToken = localStorage.getItem('idToken');
        let accessToken = localStorage.getItem('accessToken');

        if (!idToken || !accessToken) {
            clearTokensAndRedirect();
            return;
        }

        const decodedAccessToken = decodeJwt(accessToken);
        // Kiểm tra nếu token hết hạn trong 5 phút tới
        if (!decodedAccessToken || decodedAccessToken.exp * 1000 < Date.now() + 5 * 60 * 1000) {
            const refreshed = await refreshToken();
            if (!refreshed) return; // Dừng lại nếu không làm mới được
            // Tải lại token mới sau khi làm mới
            idToken = localStorage.getItem('idToken');
        }

        const decodedIdToken = decodeJwt(idToken);
        if (!decodedIdToken) {
            clearTokensAndRedirect();
            return;
        }

        const userGroups = decodedIdToken['cognito:groups'] || [];
        if (!userGroups.includes('admin')) {
            alert('Bạn không có quyền truy cập trang này.');
            window.location.replace('/pages/dashboard.html');
            return;
        }

        // Nếu tất cả kiểm tra đều qua, người dùng là admin và có token hợp lệ.
        console.log("Xác thực Admin thành công.");
    }

    // Chạy hàm bảo vệ
    await protectPage();

})();