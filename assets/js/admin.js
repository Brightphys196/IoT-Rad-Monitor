// ✨ [CẬP NHẬT] Thêm endpoint cho API Admin
const API_ADMIN_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/admin';

document.addEventListener('DOMContentLoaded', () => {
    const userTableBody = document.getElementById('user-table-body');
    const editModal = document.getElementById('edit-user-modal');
    const closeModalBtn = document.getElementById('modal-close-btn');
    const editForm = document.getElementById('edit-user-form');
    const searchInput = document.getElementById('user-search');
    const planFilter = document.getElementById('plan-filter'); // ✨ [MỚI]

    // ✨ [MỚI] Các element cho phần yêu cầu nâng cấp
    const requestsTableBody = document.getElementById('requests-table-body');
    const navUserManagement = document.querySelector('a[href="admin.html"]');
    const navUpgradeRequests = document.getElementById('nav-upgrade-requests');
    const navStationControl = document.getElementById('nav-station-control'); // ✨ [MỚI]
    const userManagementSection = document.querySelector('.admin-section');
    const upgradeRequestsSection = document.getElementById('upgrade-requests-section');
    const stationControlSection = document.getElementById('station-control-section'); // ✨ [MỚI]

    let allUsers = []; // Biến toàn cục để lưu trữ danh sách người dùng

    /**
     * ✨ [CẬP NHẬT] API thật: Gọi Lambda để lấy danh sách người dùng.
     * @returns {Promise<Array>} Danh sách người dùng.
     */
    async function fetchUsers() {
        console.log("Đang lấy danh sách người dùng từ API...");
        const accessToken = localStorage.getItem('accessToken'); // ✨ [SỬA LỖI] Sử dụng accessToken thay vì idToken

        try {
            const response = await fetch(API_ADMIN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ action: 'LIST_USERS' })
            });

            if (!response.ok) {
                // ✨ [CẢI TIẾN] Xử lý lỗi nhất quán hơn
                const errorData = await response.json().catch(() => ({ error: `Lỗi HTTP ${response.status}` }));
                throw new Error(errorData.error || 'Token không hợp lệ hoặc không có quyền Admin.');
            }

            const data = await response.json();
            return data.users || [];

        } catch (error) {
            // Ném lại lỗi để hàm gọi (initialize) có thể bắt và hiển thị toast
            throw error;
        }
    }

    /**
     * ✨ [MỚI] API thật: Lấy danh sách các yêu cầu nâng cấp đang chờ.
     */
    async function fetchUpgradeRequests() {
        console.log("Đang lấy danh sách yêu cầu nâng cấp...");
        const accessToken = localStorage.getItem('accessToken');
        try {
            const response = await fetch(API_ADMIN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ action: 'LIST_UPGRADE_REQUESTS' })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Lỗi lấy danh sách yêu cầu');
            }
            const data = await response.json();
            return data.requests || [];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Hiển thị danh sách người dùng lên bảng.
     * @param {Array} users - Mảng các đối tượng người dùng.
     */
    function renderUserTable(users) {
        if (!userTableBody) return;

        if (users.length === 0) {
            userTableBody.innerHTML = `<tr><td colspan="6">Không tìm thấy người dùng nào.</td></tr>`;
            return;
        }

        userTableBody.innerHTML = users.map(user => `
            <tr data-user-id="${user.id}">
                <td>
                    <div class="user-email">${user.email}</div>
                </td>
                <td>${user.name || 'Chưa cập nhật'}</td>
                <td><span class="plan-badge plan-${(user.plan || 'free').toLowerCase()}">${user.plan || 'Free'}</span></td>
                <td>${new Date(user.joinDate).toLocaleDateString('vi-VN')}</td>
                <td>
                    <span class="status-badge status-${user.status.toLowerCase()}">
                        ${user.status === 'Enabled' ? 'Hoạt động' : 'Vô hiệu hóa'}
                    </span>
                </td>
                <td class="action-buttons">
                    <!-- ✨ [MỚI] Nút bật/tắt trạng thái người dùng -->
                    <button class="action-btn toggle-btn ${user.status.toLowerCase()}" 
                            title="${user.status === 'Enabled' ? 'Vô hiệu hóa' : 'Kích hoạt'}" 
                            data-user-id="${user.id}" data-current-status="${user.status}">
                        <i class="fas fa-power-off"></i>
                    </button>
                    <button class="action-btn edit-btn" title="Chỉnh sửa gói" data-user-id="${user.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" title="Xóa người dùng" data-user-id="${user.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * ✨ [MỚI] Hiển thị danh sách yêu cầu nâng cấp.
     */
    function renderRequestsTable(requests) {
        if (!requestsTableBody) return;

        if (requests.length === 0) {
            requestsTableBody.innerHTML = `<tr><td colspan="5">Không có yêu cầu nào đang chờ.</td></tr>`;
            return;
        }

        requestsTableBody.innerHTML = requests.map(req => `
            <tr data-user-id="${req.userId}">
                <td>${req.email}</td>
                <td><span class="plan-badge plan-${(req.currentPlan || 'free').toLowerCase()}">${req.currentPlan || 'Free'}</span></td>
                <td><span class="plan-badge plan-${(req.requestedPlan || '').toLowerCase()}">${req.requestedPlan}</span></td>
                <td>${new Date(req.requestDate).toLocaleString('vi-VN')}</td>
                <td class="action-buttons">
                    <button class="action-btn approve-request-btn" title="Phê duyệt" 
                            data-user-id="${req.userId}" data-plan="${req.requestedPlan}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn reject-request-btn" title="Từ chối"
                            data-user-id="${req.userId}">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * ✨ [CẬP NHẬT] Lọc và hiển thị bảng dựa trên cả ô tìm kiếm và bộ lọc gói.
     */
    function filterAndRenderTable() {
        const query = searchInput.value.toLowerCase();
        const selectedPlan = planFilter.value;

        const filteredUsers = allUsers.filter(user => {
            const plan = user.plan || 'Free'; // Mặc định là 'Free' nếu không có

            const matchesSearch = (user.email || '').toLowerCase().includes(query) || (user.name && user.name.toLowerCase().includes(query));
            const matchesPlan = (selectedPlan === 'all') || (plan === selectedPlan);

            return matchesSearch && matchesPlan;
        });
        renderUserTable(filteredUsers);
    }

    /**
     * Mở modal chỉnh sửa và điền thông tin người dùng.
     * @param {string} userId - ID của người dùng cần chỉnh sửa.
     */
    function openEditModal(userId) {
        const user = allUsers.find(u => u.id === userId);
        if (!user || !editModal) return;

        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('edit-user-email').textContent = user.email;
        document.getElementById('edit-user-name').textContent = user.name || 'N/A';
        document.getElementById('edit-user-plan').value = user.plan || 'Free';

        editModal.style.display = 'flex';
    }

    /**
     * Đóng modal chỉnh sửa.
     */
    function closeEditModal() {
        if (editModal) editModal.style.display = 'none';
    }

    /**
     * ✨ [CẬP NHẬT] Xử lý việc xóa người dùng (gọi API thật).
     * @param {string} userId - ID của người dùng cần xóa.
     */
    async function handleDeleteUser(userId) {
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;

        if (confirm(`Bạn có chắc chắn muốn xóa người dùng "${user.email}" không?`)) {
            try {
                const accessToken = localStorage.getItem('accessToken'); // ✨ [SỬA LỖI] Sử dụng accessToken
                const response = await fetch(API_ADMIN_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'DELETE_USER',
                        userId: userId
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Xóa thất bại');
                }

                showToast({ type: 'success', title: 'Thành công', message: `Đã xóa người dùng ${user.email}.` });
                allUsers = allUsers.filter(u => u.id !== userId);
                filterAndRenderTable(); // Cập nhật lại bảng

            } catch (error) {
                console.error("Lỗi khi xóa người dùng:", error);
                showToast({ type: 'error', title: 'Lỗi', message: error.message });
            }
        }
    }

    /**
     * ✨ [MỚI] Xử lý việc bật/tắt trạng thái người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {string} currentStatus - Trạng thái hiện tại ('Enabled' hoặc 'Disabled').
     */
    async function handleToggleUserStatus(userId, currentStatus) {
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;

        const action = currentStatus === 'Enabled' ? 'disable' : 'enable';
        const actionText = action === 'enable' ? 'kích hoạt' : 'vô hiệu hóa';

        if (confirm(`Bạn có chắc chắn muốn ${actionText} người dùng "${user.email}" không?`)) {
            try {
                const accessToken = localStorage.getItem('accessToken');
                const response = await fetch(API_ADMIN_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'TOGGLE_USER_STATUS',
                        userId: userId,
                        userAction: action
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} thất bại`);
                }

                showToast({ type: 'success', title: 'Thành công', message: `Đã ${actionText} người dùng.` });
                // Cập nhật trạng thái trong mảng và render lại
                const userIndex = allUsers.findIndex(u => u.id === userId);
                if (userIndex !== -1) {
                    allUsers[userIndex].status = action === 'enable' ? 'Enabled' : 'Disabled';
                    filterAndRenderTable();
                }
            } catch (error) {
                showToast({ type: 'error', title: 'Lỗi', message: error.message });
            }
        }
    }

    /**
     * ✨ [MỚI] Xử lý yêu cầu nâng cấp (phê duyệt/từ chối).
     */
    async function handleProcessRequest(userId, newPlan, approved) {
        const actionText = approved ? 'phê duyệt' : 'từ chối';
        if (!confirm(`Bạn có chắc chắn muốn ${actionText} yêu cầu này không?`)) return;

        try {
            const accessToken = localStorage.getItem('accessToken');
            const response = await fetch(API_ADMIN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    action: 'PROCESS_UPGRADE_REQUEST',
                    userId: userId,
                    plan: newPlan, // Gửi plan ngay cả khi từ chối để backend có thể ghi log nếu cần
                    approved: approved
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Xử lý yêu cầu thất bại');
            }

            showToast({ type: 'success', title: 'Thành công', message: `Đã ${actionText} yêu cầu.` });
            // Tải lại danh sách yêu cầu
            loadUpgradeRequests();

            // Nếu phê duyệt, cập nhật lại danh sách người dùng
            if (approved) {
                const userIndex = allUsers.findIndex(u => u.id === userId);
                if (userIndex !== -1) {
                    allUsers[userIndex].plan = newPlan;
                    filterAndRenderTable();
                }
            }

        } catch (error) {
            showToast({ type: 'error', title: 'Lỗi', message: error.message });
        }
    }

    /**
     * ✨ [MỚI] Tải và hiển thị dữ liệu yêu cầu nâng cấp.
     */
    async function loadUpgradeRequests() {
        if (!requestsTableBody) return;
        requestsTableBody.innerHTML = `<tr><td colspan="5" class="loading-row"><div class="spinner"></div></td></tr>`;
        try {
            const requests = await fetchUpgradeRequests();
            renderRequestsTable(requests);
        } catch (error) {
            requestsTableBody.innerHTML = `<tr><td colspan="5" class="error-row">Không thể tải danh sách yêu cầu.</td></tr>`;
            showToast({ type: 'error', title: 'Lỗi Tải Dữ Liệu', message: error.message });
        }
    }

    // Tải và hiển thị dữ liệu ban đầu
    async function initialize() {
        try {
            allUsers = await fetchUsers();
            renderUserTable(allUsers);
        } catch (error) {
            showToast({ type: 'error', title: 'Lỗi Tải Dữ Liệu', message: error.message });
        }

        // ✨ [MỚI] Các element cho phần yêu cầu nâng cấp & Báo cáo
        const requestsTableBody = document.getElementById('requests-table-body');
        const navUserManagement = document.querySelector('a[href="admin.html"]');
        const navUpgradeRequests = document.getElementById('nav-upgrade-requests');
        const navStationControl = document.getElementById('nav-station-control');
        const navReports = document.getElementById('nav-reports'); // ✨ [FIX]

        const userManagementSection = document.querySelector('.admin-section'); // Hoặc id="user-management-section"
        const upgradeRequestsSection = document.getElementById('upgrade-requests-section');
        const stationControlSection = document.getElementById('station-control-section');
        const reportsSection = document.getElementById('reports-section'); // ✨ [FIX]

        // Helper function to switch sections
        function switchSection(activeNav, activeSection) {
            // Remove active class from all navs
            [navUserManagement, navUpgradeRequests, navStationControl, navReports].forEach(nav => {
                if (nav) nav.classList.remove('active');
            });

            // Hide all sections
            [userManagementSection, upgradeRequestsSection, stationControlSection, reportsSection].forEach(section => {
                if (section) section.style.display = 'none';
            });

            // Activate target
            if (activeNav) activeNav.classList.add('active');
            if (activeSection) activeSection.style.display = 'block';
        }

        // 1. Tab Quản lý người dùng
        navUserManagement.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(navUserManagement, userManagementSection);
        });

        // 2. Tab Yêu cầu nâng cấp
        navUpgradeRequests.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(navUpgradeRequests, upgradeRequestsSection);
            loadUpgradeRequests();
        });

        // 3. Tab Điều khiển Trạm
        navStationControl.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(navStationControl, stationControlSection);
            renderStationList();
        });

        // 4. Tab Báo cáo & Đánh giá ✨ [FIX]
        if (navReports) {
            navReports.addEventListener('click', (e) => {
                e.preventDefault();
                switchSection(navReports, reportsSection);
            });
        }

        // ✨ [MỚI] Gắn sự kiện cho bảng yêu cầu
        if (requestsTableBody) {
            requestsTableBody.addEventListener('click', (e) => {
                const approveBtn = e.target.closest('.approve-request-btn');
                const rejectBtn = e.target.closest('.reject-request-btn');

                if (approveBtn) {
                    handleProcessRequest(approveBtn.dataset.userId, approveBtn.dataset.plan, true);
                } else if (rejectBtn) {
                    handleProcessRequest(rejectBtn.dataset.userId, null, false);
                }
            });
        }
    }

    // --- LOGIC ĐIỀU KHIỂN TRẠM ---
    const stationControlModal = document.getElementById('station-control-modal');
    const closeControlModalBtn = document.getElementById('control-modal-close-btn');
    const stationListContainer = document.querySelector('.station-list'); // Container cho danh sách trạm
    let currentStationId = null;

    window.openControlModal = function (stationId) {
        currentStationId = stationId;
        document.getElementById('modal-station-id').textContent = stationId;
        if (stationControlModal) stationControlModal.style.display = 'flex';
    };

    function closeControlModal() {
        if (stationControlModal) stationControlModal.style.display = 'none';
        currentStationId = null;
    }

    if (closeControlModalBtn) {
        closeControlModalBtn.addEventListener('click', closeControlModal);
    }

    if (stationControlModal) {
        stationControlModal.addEventListener('click', (e) => {
            if (e.target === stationControlModal) closeControlModal();
        });
    }

    /**
     * ✨ [MỚI] Render danh sách trạm dựa trên dữ liệu thật từ apiService
     */
    async function renderStationList() {
        if (!stationListContainer) return;

        stationListContainer.innerHTML = '<div class="spinner"></div>'; // Loading state

        const stations = ["station_01", "station_02", "station_03", "station_04"];
        const stationCards = [];

        // Fetch status cho từng trạm song song
        const statusPromises = stations.map(async (stationId) => {
            try {
                // Sử dụng apiService từ script.js
                const data = await apiService.getDeviceStatus(stationId);
                // data trả về thường có dạng { status: "online", last_seen: ... } hoặc tương tự
                return { id: stationId, data: data };
            } catch (error) {
                console.error(`Lỗi lấy trạng thái ${stationId}:`, error);
                return { id: stationId, data: null };
            }
        });

        const results = await Promise.all(statusPromises);

        stationListContainer.innerHTML = results.map(item => {
            const stationId = item.id;
            const info = item.data;

            let isOnline = false;
            let statusText = "Offline";

            // Logic kiểm tra status tương tự script.js
            if (info && info.status) {
                isOnline = info.status.toLowerCase() === 'online';
                statusText = isOnline ? 'Online' : 'Offline';
            }

            const statusClass = isOnline ? 'status-enabled' : 'status-disabled';

            return `
                <div class="station-control-card">
                    <div class="station-info">
                        <h3>${stationId.replace('_', ' ').toUpperCase()}</h3>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="station-actions">
                        <button class="control-btn" onclick="openControlModal('${stationId}')">
                            <i class="fas fa-sliders-h"></i> Cấu hình
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Gọi render khi chuyển sang tab điều khiển trạm
    if (navStationControl) {
        navStationControl.addEventListener('click', () => {
            renderStationList();
        });
    }

    // 1. Reset Device
    document.getElementById('btn-reset-device')?.addEventListener('click', () => {
        if (!currentStationId) return;
        if (confirm(`Bạn có chắc muốn khởi động lại ${currentStationId}?`)) {
            // Mock API Call
            console.log(`[MOCK API] Sending RESET command to ${currentStationId}`);
            showToast({ type: 'success', title: 'Đã gửi lệnh', message: `Đang khởi động lại ${currentStationId}...` });
            closeControlModal();
        }
    });

    // 2. Set Interval
    document.getElementById('btn-set-interval')?.addEventListener('click', () => {
        if (!currentStationId) return;
        const interval = document.getElementById('interval-input').value;
        // Mock API Call
        console.log(`[MOCK API] Sending INTERVAL command to ${currentStationId}: ${interval}s`);
        showToast({ type: 'success', title: 'Cập nhật thành công', message: `Tần suất gửi của ${currentStationId} là ${interval}s.` });
    });

    // 3. Toggle Alert
    document.getElementById('alert-toggle')?.addEventListener('change', (e) => {
        if (!currentStationId) return;
        const isAlertOn = e.target.checked;
        // Mock API Call
        console.log(`[MOCK API] Sending ALERT command to ${currentStationId}: ${isAlertOn}`);
        const stateText = isAlertOn ? 'BẬT' : 'TẮT';
        showToast({ type: 'info', title: 'Cảnh báo', message: `Đã ${stateText} cảnh báo trên ${currentStationId}.` });
    });

    // 4. Update Firmware (OTA)
    document.getElementById('btn-update-firmware')?.addEventListener('click', async () => {
        if (!currentStationId) return;

        const fileInput = document.getElementById('firmware-file');
        const file = fileInput.files[0];

        if (!file) {
            showToast({ type: 'error', title: 'Lỗi', message: 'Vui lòng chọn file firmware (.bin).' });
            return;
        }

        if (!file.name.endsWith('.bin')) {
            showToast({ type: 'error', title: 'Lỗi', message: 'Chỉ chấp nhận file .bin' });
            return;
        }

        // UI Elements
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress');
        const statusText = document.getElementById('upload-status');
        const btn = document.getElementById('btn-update-firmware');

        // Reset UI
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        statusText.textContent = 'Đang chuẩn bị...';
        btn.disabled = true;

        try {
            // 1. Get Presigned URL (Reusing endpoint from profile.js logic)
            // Note: We might need a specific endpoint for firmware if the bucket is different, 
            // but for now we'll assume the same upload mechanism or a generic one.
            // Using the existing API_AVATAR_UPLOAD_ENDPOINT from profile.js context if available, 
            // or hardcoding the known endpoint.
            const API_UPLOAD_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/get-upload-url';
            const accessToken = localStorage.getItem('accessToken');

            statusText.textContent = 'Đang lấy link upload...';

            const presignedResponse = await fetch(API_UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    fileName: `firmware/${currentStationId}_${Date.now()}.bin`, // Organize by folder
                    fileType: 'application/octet-stream' // Binary file
                })
            });

            if (!presignedResponse.ok) throw new Error('Không thể lấy URL upload');
            const presignedData = await presignedResponse.json();

            // 2. Upload to S3
            statusText.textContent = 'Đang tải lên S3...';

            // Use XMLHttpRequest for progress tracking (fetch doesn't support upload progress easily)
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', presignedData.uploadURL);
                xhr.setRequestHeader('Content-Type', 'application/octet-stream');

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        progressBar.style.width = `${percent}%`;
                        statusText.textContent = `Đang tải lên... ${Math.round(percent)}%`;
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) resolve();
                    else reject(new Error('Upload failed'));
                };

                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send(file);
            });

            // 3. Send MQTT Command via API
            statusText.textContent = 'Đang gửi lệnh cập nhật...';
            const firmwareUrl = presignedData.finalURL; // URL of the uploaded file

            // Mock API call to trigger MQTT (Replace with real endpoint when available)
            // Assuming we have an endpoint to send commands
            console.log(`[MOCK API] Sending UPDATE_FIRMWARE to ${currentStationId} with URL: ${firmwareUrl}`);

            // Simulate API delay
            await new Promise(r => setTimeout(r, 1000));

            showToast({ type: 'success', title: 'Thành công', message: 'Đã gửi lệnh cập nhật Firmware!' });
            statusText.textContent = 'Hoàn tất! Thiết bị sẽ tự động cập nhật.';

            // Clear input
            fileInput.value = '';

        } catch (error) {
            console.error("OTA Error:", error);
            showToast({ type: 'error', title: 'Thất bại', message: error.message });
            statusText.textContent = 'Lỗi: ' + error.message;
            progressBar.style.background = '#ff4444';
        } finally {
            btn.disabled = false;
            // Hide progress after a delay if successful
            if (progressBar.style.background !== 'rgb(255, 68, 68)') { // Check if not red
                setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
            }
        }
    });

    // 5. Update WiFi (Online)
    document.getElementById('btn-update-wifi')?.addEventListener('click', () => {
        if (!currentStationId) return;

        const ssid = document.getElementById('wifi-ssid').value;
        const pass = document.getElementById('wifi-pass').value;

        if (!ssid) {
            showToast({ type: 'error', title: 'Lỗi', message: 'Vui lòng nhập tên WiFi.' });
            return;
        }

        if (confirm(`Bạn có chắc muốn đổi WiFi cho ${currentStationId} thành "${ssid}"? Thiết bị sẽ khởi động lại.`)) {
            // Mock API Call
            console.log(`[MOCK API] Sending SET_WIFI command to ${currentStationId}: SSID=${ssid}, PASS=${pass}`);
            showToast({ type: 'success', title: 'Đã gửi lệnh', message: `Đang cập nhật WiFi cho ${currentStationId}...` });

            // Clear inputs
            document.getElementById('wifi-ssid').value = '';
            document.getElementById('wifi-pass').value = '';
        }
    });

    // Gắn các sự kiện
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeEditModal);
    }

    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            const newPlan = document.getElementById('edit-user-plan').value;

            try {
                const accessToken = localStorage.getItem('accessToken'); // ✨ [SỬA LỖI] Sử dụng accessToken
                const response = await fetch(API_ADMIN_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'UPDATE_PLAN',
                        userId: userId,
                        plan: newPlan
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Cập nhật thất bại');
                }

                showToast({ type: 'success', title: 'Thành công', message: 'Đã cập nhật gói dịch vụ.' });
                const userIndex = allUsers.findIndex(u => u.id === userId);
                if (userIndex !== -1) {
                    allUsers[userIndex].plan = newPlan;
                    filterAndRenderTable(); // Cập nhật lại bảng
                }
                closeEditModal();

            } catch (error) {
                console.error("Lỗi khi cập nhật gói:", error);
                showToast({ type: 'error', title: 'Lỗi', message: error.message });
            }
        });
    }

    if (userTableBody) {
        userTableBody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            const toggleBtn = e.target.closest('.toggle-btn'); // ✨ [MỚI]

            if (!editBtn && !deleteBtn && !toggleBtn) return;

            const targetButton = editBtn || deleteBtn || toggleBtn;
            const userId = targetButton.dataset.userId;
            if (!userId) return;

            if (editBtn) openEditModal(userId);
            else if (deleteBtn) handleDeleteUser(userId);
            else if (toggleBtn) handleToggleUserStatus(userId, toggleBtn.dataset.currentStatus); // ✨ [MỚI]
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', filterAndRenderTable);
    }

    // ✨ [MỚI] Gắn sự kiện cho bộ lọc gói dịch vụ
    if (planFilter) {
        planFilter.addEventListener('change', filterAndRenderTable);
    }

    initialize();
});