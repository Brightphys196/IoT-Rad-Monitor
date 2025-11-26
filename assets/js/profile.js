// Endpoint cho /profile (cập nhật thuộc tính, đổi mật khẩu)
const API_PROFILE_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/profile';
const API_AVATAR_UPLOAD_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/get-upload-url';
// ✨ [MỚI] Endpoint để gửi yêu cầu nâng cấp gói
const API_UPGRADE_REQUEST_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/request-upgrade'; // 👈 BẠN SẼ CẦN TẠO ENDPOINT NÀY

/**
 * Hàm trợ giúp để giải mã (decode) JWT (idToken)
 */
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Lỗi giải mã token:", e);
        return null;
    }
}

/**
 * ✨ [MỚI] Lấy trạng thái yêu cầu nâng cấp của người dùng hiện tại.
 * @returns {Promise<string|null>} Trả về 'pending' nếu có yêu cầu đang chờ, ngược lại trả về null.
 */
async function getUpgradeRequestStatus() {
    const accessToken = localStorage.getItem('accessToken');
    console.log("Lấy trạng thái yêu cầu nâng cấp với accessToken:", accessToken);
    if (!accessToken) {
        return null; // Không có token, không thể kiểm tra
    }

    try {
        console.log("Gọi API để lấy trạng thái yêu cầu nâng cấp...");
        const response = await fetch(API_UPGRADE_REQUEST_ENDPOINT, {
            method: 'GET', // Sử dụng GET để lấy trạng thái
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 404) {
            return null; // 404 Not Found nghĩa là không có yêu cầu nào
        }

        if (!response.ok) {
            throw new Error('Không thể lấy trạng thái yêu cầu.');
        }

        const data = await response.json();
        return data.status; // Trả về trạng thái (ví dụ: 'pending')
    } catch (error) {
        console.error("Lỗi khi kiểm tra trạng thái nâng cấp:", error);
        return null; // Coi như không có yêu cầu nếu có lỗi
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Tải thông tin người dùng ngay khi trang được tải
    loadUserProfile();

    // Gắn sự kiện cho các form
    document.getElementById('update-profile-form')?.addEventListener('submit', handleUpdateProfile);
    document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);

    // ✨ [MỚI] Gắn sự kiện cho modal nâng cấp
    setupUpgradeModalEvents();
});

/**
 * Lấy thông tin người dùng bằng cách giải mã idToken
 */
async function loadUserProfile() {
    const idToken = localStorage.getItem('idToken');
    if (!idToken) {
        showError('profile-error', 'Không tìm thấy thông tin đăng nhập.');
        return;
    }

    try {
        const data = parseJwt(idToken);
        if (!data) {
            throw new Error('Token không hợp lệ.');
        }

        const email = data.email || data['cognito:username'];
        const name = data.name || data['custom:name'];
        const plan = data['custom:user_plan'] || 'Free'; // Lấy gói từ token

        document.getElementById('profile-display-name').textContent = name || email;
        document.getElementById('profile-display-email').textContent = email;

        document.getElementById('profile-email').value = email;
        document.getElementById('profile-name').value = name || '';
        document.getElementById('profile-birthdate').value = data.birthdate || '';
        document.getElementById('profile-gender').value = data.gender || '';
        document.getElementById('profile-phone').value = data.phone_number || '';
        document.getElementById('profile-plan').value = plan;

        const avatarUrl = data.picture || 'https://placehold.co/150x150/e9ecef/adb5bd?text=Avatar';
        document.getElementById('avatar-preview').src = avatarUrl;

        // ✨ [CẬP NHẬT] Logic xử lý nút nâng cấp
        const upgradeButton = document.getElementById('upgrade-plan-btn');
        console.log("Gói người dùng hiện tại:", plan);
        if (upgradeButton) {
            const requestStatus = await getUpgradeRequestStatus();
            console.log("Trạng thái yêu cầu:", requestStatus);

            if (plan.toLowerCase() !== 'free') {
                upgradeButton.textContent = 'Đã Nâng Cấp';
                upgradeButton.disabled = true;
            } else if (requestStatus === 'pending') {
                upgradeButton.textContent = 'Đang chờ duyệt';
                upgradeButton.disabled = true;
            } // Ngược lại, nút sẽ ở trạng thái mặc định và hoạt động
        }

    } catch (error) {
        showError('profile-error', error.message);
    }
}

/**
 * Xử lý cập nhật thông tin (Họ tên, Ngày sinh, v.v.)
 */
async function handleUpdateProfile(event) {
    event.preventDefault();
    const updateButton = document.getElementById('update-profile-button');
    updateButton.disabled = true;
    updateButton.textContent = 'Đang cập nhật...';
    hideError('profile-error');

    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        showError('profile-error', 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.');
        return;
    }

    const formData = {
        action: 'UPDATE_ATTRIBUTES',
        name: document.getElementById('profile-name').value,
        birthdate: document.getElementById('profile-birthdate').value,
        gender: document.getElementById('profile-gender').value,
        phone_number: document.getElementById('profile-phone').value,
    };

    try {
        const response = await fetch(API_PROFILE_ENDPOINT, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Cập nhật thất bại.');
        }

        showToast({ type: 'success', title: 'Thành công', message: 'Hồ sơ của bạn đã được cập nhật. Bạn có thể cần đăng nhập lại để thấy token mới.' });
        document.getElementById('profile-display-name').textContent = formData.name || document.getElementById('profile-email').value;

    } catch (error) {
        showError('profile-error', error.message);
    } finally {
        updateButton.disabled = false;
        updateButton.textContent = 'Lưu Thay Đổi';
    }
}

/**
 * Xử lý đổi mật khẩu
 */
async function handleChangePassword(event) {
    event.preventDefault();
    const changePwdButton = document.getElementById('change-password-button');
    changePwdButton.disabled = true;
    changePwdButton.textContent = 'Đang xử lý...';
    hideError('password-error');

    const accessToken = localStorage.getItem('accessToken');
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;

    try {
        const response = await fetch(API_PROFILE_ENDPOINT, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                action: 'CHANGE_PASSWORD',
                oldPassword: oldPassword,
                newPassword: newPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Đổi mật khẩu thất bại.');
        }

        showToast({ type: 'success', title: 'Thành công', message: 'Mật khẩu của bạn đã được thay đổi.' });
        event.target.reset(); // Xóa các trường mật khẩu

    } catch (error) {
        showError('password-error', error.message);
    } finally {
        changePwdButton.disabled = false;
        changePwdButton.textContent = 'Đổi Mật Khẩu';
    }
}

/**
 * Xử lý tải lên avatar
 */
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 0. Hiển thị bản xem trước và trạng thái tải
    const preview = document.getElementById('avatar-preview');
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; };
    reader.readAsDataURL(file);
    showToast({ type: 'info', title: 'Đang tải lên', message: 'Vui lòng chờ...' });

    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        return showError('profile-error', 'Phiên làm việc hết hạn, vui lòng tải lại trang.');
    }

    try {
        // 1. Gọi Lambda (getPresignedUrlFunction) để lấy URL tải lên an toàn
        const presignedResponse = await fetch(API_AVATAR_UPLOAD_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                fileName: file.name,
                fileType: file.type
            })
        });

        const presignedData = await presignedResponse.json();
        if (!presignedResponse.ok) throw new Error(presignedData.error || 'Không thể lấy URL tải lên.');

        // 2. Tải tệp ảnh trực tiếp lên S3 bằng URL đã nhận được
        const uploadResponse = await fetch(presignedData.uploadURL, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadResponse.ok) throw new Error('Tải tệp lên S3 thất bại.');

        // 3. Cập nhật thuộc tính 'picture' trong Cognito
        const updateResponse = await fetch(API_PROFILE_ENDPOINT, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                action: 'UPDATE_ATTRIBUTES',
                picture: presignedData.finalURL // URL S3 của ảnh
            })
        });

        if (!updateResponse.ok) throw new Error('Không thể cập nhật hồ sơ Cognito.');

        showToast({ type: 'success', title: 'Thành công', message: 'Đã cập nhật ảnh đại diện. Bạn có thể cần đăng nhập lại để thấy token mới.' });

    } catch (error) {
        console.error("Lỗi tải lên avatar:", error);
        showError('profile-error', error.message);
        // Khôi phục lại ảnh cũ nếu có lỗi
        loadUserProfile();
    }
}

// =================================================================
//                      ✨ [MỚI] LOGIC NÂNG CẤP GÓI
// =================================================================

/**
 * Gắn sự kiện cho các nút mở/đóng modal và gửi yêu cầu nâng cấp
 */
function setupUpgradeModalEvents() {
    // 1. Chọn các phần tử
    const modalElement = document.getElementById('upgrade-plan-modal');
    const openBtn = document.getElementById('upgrade-plan-btn');
    const closeBtn = document.getElementById('upgrade-modal-close-btn');

    // 2. Kiểm tra
    if (!modalElement || !openBtn || !closeBtn) {
        console.log("Không tìm thấy các thành phần của modal nâng cấp.");
        return;
    }

    // 3. Lấy/tạo một instance của Bootstrap Modal
    // Đây là bước quan trọng nhất!
    const upgradeModal = bootstrap.Modal.getOrCreateInstance(modalElement);

    // ✨ [SỬA LỖI] Đảm bảo modal được ẩn khi khởi tạo
    // Điều này khắc phục trường hợp modal có thể hiển thị do trạng thái không mong muốn.
    upgradeModal.hide();

    // 4. Gắn sự kiện MỞ
    openBtn.addEventListener("click", function () {
        document.getElementById("upgrade-plan-modal").style.display = "flex";
    });
    closeBtn.addEventListener('click', () => {
        console.log("Đóng modal nâng cấp gói");
        document.getElementById("upgrade-plan-modal").style.display = "none";
        // upgradeModal.hide(); // <-- THAY ĐỔI CHÍNH: Dùng .hide()
    });


    // 5. [SỬA LỖI] XÓA BỎ SỰ KIỆN ĐÓNG THỦ CÔNG
    // Bootstrap sẽ tự động xử lý việc đóng modal thông qua thuộc tính `data-bs-dismiss="modal"`
    // trên nút đóng trong HTML. Không cần thêm code JavaScript ở đây.

    // 7. Gắn sự kiện cho các nút yêu cầu (Đoạn này đã đúng)
    modalElement.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.plan-button[data-plan]');
        if (targetButton) {
            const planName = targetButton.dataset.plan;

            // Giả sử bạn có hàm này
            handlePlanUpgradeRequest(planName, targetButton);
        }
    });
}

/**
 * Xử lý khi người dùng nhấp vào nút "Yêu cầu Nâng cấp"
 */
async function handlePlanUpgradeRequest(planName, button) {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        return showError('profile-error', 'Phiên làm việc hết hạn, vui lòng tải lại trang.');
    }

    button.disabled = true;
    button.textContent = 'Đang gửi...';

    try {
        const response = await fetch(API_UPGRADE_REQUEST_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                plan: planName
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Gửi yêu cầu thất bại.');

        showToast({ type: 'success', title: 'Thành công', message: 'Yêu cầu của bạn đã được gửi. Quản trị viên sẽ xem xét sớm.' });

        // ✨ [SỬA LỖI] Sử dụng API của Bootstrap để đóng modal một cách chính xác
        const modalElement = document.getElementById('upgrade-plan-modal');
        bootstrap.Modal.getInstance(modalElement)?.hide();

    } catch (error) {
        console.error("Lỗi khi gửi yêu cầu nâng cấp:", error);
        showToast({ type: 'error', title: 'Lỗi', message: error.message });
    } finally {
        button.disabled = false;
        button.textContent = 'Yêu cầu Nâng cấp';
    }
}


// --- Hàm trợ giúp hiển thị lỗi ---
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('error-hidden');
    }
}

function hideError(elementId) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.classList.add('error-hidden');
    }
}

// --- Hàm hiển thị toast (nếu chưa có) ---
if (typeof showToast !== 'function') {
    window.showToast = ({ type, title, message }) => {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 3000);
    };
}