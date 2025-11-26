(function () {
    console.log("🛡️ Security Check: Đang kiểm tra Token...");

    const idToken = localStorage.getItem('idToken');

    if (!idToken) {
        console.error("❌ Security Check: KHÔNG TÌM THẤY TOKEN!");

        // Tạm thời DỪNG việc chuyển hướng lại để bạn kịp nhìn Console
        // Khi nào chạy ngon thì bỏ comment dòng dưới ra

        // window.location.replace('/login.html'); 

        // Thay bằng thông báo màn hình để biết lỗi
        document.body.innerHTML += `
            <div style="position:fixed; top:0; left:0; width:100%; background:red; color:white; padding:20px; z-index:9999; text-align:center;">
                ⚠️ CHẶN TRUY CẬP: Chưa có Token trong LocalStorage!<br>
                (Code auth-protect.js đã chặn bạn lại)
            </div>
        `;
        return;
    }

    console.log("✅ Security Check: Token hợp lệ. Cho phép truy cập.");
})();