// ✨ [CẬP NHẬT] Thêm endpoint cho API Admin
const API_ADMIN_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/admin';
// ✨ [MỚI] Endpoint điều khiển thiết bị
const API_DEVICE_CONTROL = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/device-control';

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
    let currentStationData = null; // ✨ [MỚI] Lưu trữ dữ liệu trạm hiện tại

    /**
     * ✨ [MỚI] Hàm gửi lệnh điều khiển xuống thiết bị thông qua API
     * @param {string} stationId - ID của trạm (vd: station_01)
     * @param {string} command - Lệnh điều khiển (RESET, INTERVAL, ALERT, SET_WIFI, UPDATE_FIRMWARE)
     * @param {object} payload - Dữ liệu đi kèm lệnh
     */
    async function sendDeviceCommand(stationId, command, payload = {}) {
        const accessToken = localStorage.getItem('accessToken');

        // Hiển thị trạng thái đang gửi
        showToast({ type: 'info', title: 'Đang gửi...', message: `Đang gửi lệnh ${command} đến ${stationId}` });

        try {
            const response = await fetch(API_DEVICE_CONTROL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    stationId: stationId,
                    command: command,
                    payload: payload
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Lỗi HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log(`[API] Command ${command} sent to ${stationId}:`, result);
            return result;
        } catch (error) {
            console.error(`[API Error] Failed to send ${command}:`, error);
            throw error;
        }
    }

    window.openControlModal = function (stationId) {
        currentStationId = stationId;
        // ✨ [SỬA LỖI] Lấy data từ cache thay vì nhận qua tham số
        const stationInfo = window.stationDataCache?.[stationId] || null;
        currentStationData = stationInfo;
        document.getElementById('modal-station-id').textContent = stationId.replace('_', ' ').toUpperCase();

        // Reset các input khi mở modal
        const intervalInput = document.getElementById('interval-input');
        if (intervalInput) intervalInput.value = stationInfo?.interval || 10;

        const alertToggle = document.getElementById('alert-toggle');
        if (alertToggle) alertToggle.checked = stationInfo?.alertEnabled || false;

        if (stationControlModal) {
            stationControlModal.style.display = 'flex';
            stationControlModal.classList.add('modal-open');
        }
    };

    function closeControlModal() {
        if (stationControlModal) {
            stationControlModal.style.display = 'none';
            stationControlModal.classList.remove('modal-open');
        }
        currentStationId = null;
        currentStationData = null;
        // Reset tab to first
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector('.tab-btn[data-tab="basic"]')?.classList.add('active');
        document.getElementById('tab-basic')?.classList.add('active');
    }

    if (closeControlModalBtn) {
        closeControlModalBtn.addEventListener('click', closeControlModal);
    }

    if (stationControlModal) {
        stationControlModal.addEventListener('click', (e) => {
            if (e.target === stationControlModal) closeControlModal();
        });
    }

    // ✨ [MỚI] Tab Switching Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Remove active from all tabs and content
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active to clicked tab and corresponding content
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`)?.classList.add('active');
        });
    });

    // ✨ [MỚI] Password Toggle
    document.getElementById('toggle-password')?.addEventListener('click', () => {
        const passInput = document.getElementById('wifi-pass');
        const icon = document.querySelector('#toggle-password i');
        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            passInput.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // ✨ [MỚI] Alert Toggle Text Update
    document.getElementById('alert-toggle')?.addEventListener('change', (e) => {
        const statusText = document.getElementById('alert-status-text');
        if (statusText) {
            statusText.textContent = `Trạng thái: ${e.target.checked ? 'Bật' : 'Tắt'}`;
        }
    });

    // ✨ [MỚI] File Drag & Drop for Firmware
    const dropZone = document.getElementById('firmware-drop-zone');
    const fileInput = document.getElementById('firmware-file');
    const selectedFileName = document.getElementById('selected-file-name');

    if (dropZone && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'));
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].name.endsWith('.bin')) {
                fileInput.files = files;
                if (selectedFileName) selectedFileName.textContent = files[0].name;
            } else {
                showToast({ type: 'error', title: 'Lỗi', message: 'Chỉ chấp nhận file .bin' });
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files[0] && selectedFileName) {
                selectedFileName.textContent = fileInput.files[0].name;
            }
        });
    }

    // ✨ [CẬP NHẬT] WiFi Scanning với API thật
    const API_WIFI_SCAN = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/wifi-scan';

    async function requestWifiScan(stationId) {
        const accessToken = localStorage.getItem('accessToken');
        const response = await fetch(API_WIFI_SCAN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                action: 'REQUEST_SCAN',
                stationId: stationId
            })
        });
        if (!response.ok) throw new Error('Không thể gửi lệnh quét WiFi');
        return response.json();
    }

    async function getWifiScanResults(stationId) {
        const accessToken = localStorage.getItem('accessToken');
        const response = await fetch(API_WIFI_SCAN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                action: 'GET_SCAN_RESULT',
                stationId: stationId
            })
        });
        if (!response.ok) throw new Error('Không thể lấy kết quả quét WiFi');
        return response.json();
    }

    function renderWifiList(networks, wifiList, wifiListContainer) {
        if (!networks || networks.length === 0) {
            wifiList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-color-muted);">
                    <i class="fas fa-wifi" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>Không tìm thấy mạng WiFi nào</p>
                </div>
            `;
            wifiListContainer.style.display = 'block';
            return;
        }

        wifiList.innerHTML = networks.map(network => {
            const rssi = network.rssi || -70;
            const signalClass = rssi > -50 ? 'strong' : (rssi > -70 ? 'medium' : 'weak');
            const ssid = network.ssid || 'Unknown';
            return `
                <div class="wifi-item" data-ssid="${ssid}">
                    <div class="wifi-item-info">
                        <i class="fas fa-wifi"></i>
                        <span class="wifi-ssid">${ssid}</span>
                    </div>
                    <div class="wifi-signal ${signalClass}">
                        <span></span><span></span><span></span><span></span>
                    </div>
                </div>
            `;
        }).join('');

        wifiListContainer.style.display = 'block';

        // Thêm sự kiện click cho mỗi WiFi item
        wifiList.querySelectorAll('.wifi-item').forEach(item => {
            item.addEventListener('click', () => {
                wifiList.querySelectorAll('.wifi-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                document.getElementById('wifi-ssid').value = item.dataset.ssid;
                document.getElementById('wifi-pass').focus();
            });
        });
    }

    document.getElementById('btn-scan-wifi')?.addEventListener('click', async () => {
        if (!currentStationId) return;

        const btn = document.getElementById('btn-scan-wifi');
        const wifiListContainer = document.getElementById('wifi-list-container');
        const wifiList = document.getElementById('wifi-list');

        btn.classList.add('scanning');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" id="scan-icon"></i> Đang quét...';
        btn.disabled = true;

        try {
            // 1. Gửi lệnh quét WiFi xuống thiết bị
            await requestWifiScan(currentStationId);
            showToast({ type: 'info', title: 'Đang quét', message: 'Đã gửi lệnh quét. Đang chờ thiết bị phản hồi...' });

            // 2. Polling để lấy kết quả (tối đa 10 lần, mỗi lần cách 2 giây)
            let attempts = 0;
            const maxAttempts = 10;
            let networks = [];

            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 2000)); // Chờ 2 giây
                attempts++;

                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang chờ (${attempts}/${maxAttempts})...`;

                const result = await getWifiScanResults(currentStationId);

                if (result.networks && result.networks.length > 0) {
                    networks = result.networks;
                    break;
                }

                if (result.expired) {
                    // Kết quả đã hết hạn, tiếp tục chờ
                    continue;
                }
            }

            if (networks.length > 0) {
                renderWifiList(networks, wifiList, wifiListContainer);
                showToast({ type: 'success', title: 'Hoàn tất', message: `Tìm thấy ${networks.length} mạng WiFi` });
            } else {
                renderWifiList([], wifiList, wifiListContainer);
                showToast({ type: 'warning', title: 'Hết thời gian', message: 'Không nhận được kết quả từ thiết bị. Vui lòng thử lại.' });
            }

        } catch (error) {
            showToast({ type: 'error', title: 'Lỗi', message: error.message });
        } finally {
            btn.classList.remove('scanning');
            btn.innerHTML = '<i class="fas fa-sync-alt" id="scan-icon"></i> Quét WiFi';
            btn.disabled = false;
        }
    });

    /**
     * ✨ [CẬP NHẬT] Render danh sách trạm với UI cải tiến
     */
    async function renderStationList() {
        if (!stationListContainer) return;

        stationListContainer.innerHTML = `
            <div class="station-loading">
                <div class="spinner"></div>
                <span>Đang tải trạng thái các trạm...</span>
            </div>
        `;

        const stations = ["station_01", "station_02", "station_03", "station_04"];

        // Fetch status cho từng trạm song song
        const statusPromises = stations.map(async (stationId) => {
            try {
                const data = await apiService.getDeviceStatus(stationId);
                return { id: stationId, data: data };
            } catch (error) {
                console.error(`Lỗi lấy trạng thái ${stationId}:`, error);
                return { id: stationId, data: null };
            }
        });

        const results = await Promise.all(statusPromises);

        // ✨ [SỬA LỖI] Lưu dữ liệu trạm vào cache thay vì truyền qua onclick
        window.stationDataCache = {};

        stationListContainer.innerHTML = results.map(item => {
            const stationId = item.id;
            const info = item.data;
            const stationNum = stationId.split('_')[1];

            // Lưu vào cache
            window.stationDataCache[stationId] = info;

            let isOnline = false;
            let statusText = "Offline";
            let lastSeen = "Không rõ";

            if (info && info.status) {
                isOnline = info.status.toLowerCase() === 'online';
                statusText = isOnline ? 'Online' : 'Offline';
                if (info.last_seen) {
                    const lastSeenDate = new Date(info.last_seen);
                    const now = new Date();
                    const diffMs = now - lastSeenDate;
                    const diffMins = Math.floor(diffMs / 60000);

                    if (diffMins < 1) lastSeen = 'Vừa xong';
                    else if (diffMins < 60) lastSeen = `${diffMins} phút trước`;
                    else if (diffMins < 1440) lastSeen = `${Math.floor(diffMins / 60)} giờ trước`;
                    else lastSeen = lastSeenDate.toLocaleDateString('vi-VN');
                }
            }

            const statusClass = isOnline ? 'online' : 'offline';

            return `
                <div class="station-control-card ${statusClass}">
                    <div class="station-card-header">
                        <div class="station-icon">
                            <i class="fas fa-broadcast-tower"></i>
                        </div>
                        <div class="station-title-area">
                            <h3>Trạm ${stationNum}</h3>
                            <span class="station-id">${stationId}</span>
                        </div>
                        <div class="station-status-indicator ${statusClass}">
                            <span class="status-dot"></span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                    <div class="station-card-body">
                        <div class="station-metric">
                            <i class="fas fa-clock"></i>
                            <span>Lần cuối: ${lastSeen}</span>
                        </div>
                        ${info?.temperature ? `
                        <div class="station-metric">
                            <i class="fas fa-thermometer-half"></i>
                            <span>${info.temperature}°C</span>
                        </div>` : ''}
                        ${info?.humidity ? `
                        <div class="station-metric">
                            <i class="fas fa-tint"></i>
                            <span>${info.humidity}%</span>
                        </div>` : ''}
                    </div>
                    <div class="station-card-footer">
                        <button class="control-btn primary" onclick="openControlModal('${stationId}')">
                            <i class="fas fa-cog"></i> Cấu hình
                        </button>
                        <button class="control-btn secondary" onclick="refreshStationStatus('${stationId}')">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ✨ [MỚI] Hàm làm mới trạng thái một trạm
    window.refreshStationStatus = async function (stationId) {
        showToast({ type: 'info', title: 'Đang làm mới...', message: `Đang cập nhật trạng thái ${stationId}` });
        await renderStationList();
        showToast({ type: 'success', title: 'Hoàn tất', message: 'Đã cập nhật trạng thái các trạm' });
    };

    // Gọi render khi chuyển sang tab điều khiển trạm
    if (navStationControl) {
        navStationControl.addEventListener('click', () => {
            renderStationList();
        });
    }

    // 1. Reset Device
    document.getElementById('btn-reset-device')?.addEventListener('click', async () => {
        if (!currentStationId) return;

        if (confirm(`Bạn có chắc muốn khởi động lại ${currentStationId}? Thiết bị sẽ mất kết nối tạm thời.`)) {
            const btn = document.getElementById('btn-reset-device');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
            btn.disabled = true;

            try {
                await sendDeviceCommand(currentStationId, 'RESET');
                showToast({ type: 'success', title: 'Thành công', message: `Đã gửi lệnh khởi động lại ${currentStationId}` });
                closeControlModal();
                // Refresh status sau 5s
                setTimeout(() => renderStationList(), 5000);
            } catch (error) {
                showToast({ type: 'error', title: 'Lỗi', message: error.message });
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    });

    // 2. Set Interval
    document.getElementById('btn-set-interval')?.addEventListener('click', async () => {
        if (!currentStationId) return;

        const interval = parseInt(document.getElementById('interval-input').value);

        if (isNaN(interval) || interval < 5 || interval > 3600) {
            showToast({ type: 'error', title: 'Lỗi', message: 'Tần suất phải từ 5 đến 3600 giây' });
            return;
        }

        const btn = document.getElementById('btn-set-interval');
        const originalText = btn.textContent;
        btn.textContent = 'Đang gửi...';
        btn.disabled = true;

        try {
            await sendDeviceCommand(currentStationId, 'INTERVAL', { val: interval });
            showToast({ type: 'success', title: 'Thành công', message: `Tần suất gửi của ${currentStationId} đã được đặt thành ${interval}s` });
        } catch (error) {
            showToast({ type: 'error', title: 'Lỗi', message: error.message });
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    // 3. Toggle Alert
    document.getElementById('alert-toggle')?.addEventListener('change', async (e) => {
        if (!currentStationId) return;

        const isAlertOn = e.target.checked;
        const stateText = isAlertOn ? 'BẬT' : 'TẮT';

        try {
            await sendDeviceCommand(currentStationId, 'ALERT', { enabled: isAlertOn });
            showToast({ type: 'success', title: 'Thành công', message: `Đã ${stateText} cảnh báo trên ${currentStationId}` });
        } catch (error) {
            // Revert toggle nếu lỗi
            e.target.checked = !isAlertOn;
            showToast({ type: 'error', title: 'Lỗi', message: error.message });
        }
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

            // 3. Send MQTT Command via real API
            statusText.textContent = 'Đang gửi lệnh cập nhật...';
            const firmwareUrl = presignedData.finalURL || presignedData.uploadURL?.split('?')[0];

            await sendDeviceCommand(currentStationId, 'UPDATE_FIRMWARE', { url: firmwareUrl });

            showToast({ type: 'success', title: 'Thành công', message: 'Đã gửi lệnh cập nhật Firmware!' });
            statusText.textContent = 'Hoàn tất! Thiết bị sẽ tự động cập nhật.';
            progressBar.style.background = '#4CAF50';

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
            setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
        }
    });

    // 5. Update WiFi (Online)
    document.getElementById('btn-update-wifi')?.addEventListener('click', async () => {
        if (!currentStationId) return;

        const ssid = document.getElementById('wifi-ssid').value.trim();
        const pass = document.getElementById('wifi-pass').value;

        if (!ssid) {
            showToast({ type: 'error', title: 'Lỗi', message: 'Vui lòng nhập tên WiFi.' });
            return;
        }

        if (confirm(`Bạn có chắc muốn đổi WiFi cho ${currentStationId} thành "${ssid}"? Thiết bị sẽ khởi động lại.`)) {
            const btn = document.getElementById('btn-update-wifi');
            const originalText = btn.textContent;
            btn.textContent = 'Đang gửi...';
            btn.disabled = true;

            try {
                await sendDeviceCommand(currentStationId, 'SET_WIFI', { ssid: ssid, pass: pass });
                showToast({ type: 'success', title: 'Thành công', message: `Đã gửi cấu hình WiFi mới cho ${currentStationId}` });

                // Clear inputs
                document.getElementById('wifi-ssid').value = '';
                document.getElementById('wifi-pass').value = '';

                closeControlModal();
            } catch (error) {
                showToast({ type: 'error', title: 'Lỗi', message: error.message });
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
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