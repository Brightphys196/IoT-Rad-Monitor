document.addEventListener('DOMContentLoaded', () => {
    const API_ADMIN_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/admin';
    let planChart = null;
    let newUsersChart = null;

    async function fetchAdminStats() {
        const accessToken = localStorage.getItem('accessToken');
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
                // ✨ [CẢI TIẾN] Xử lý lỗi nhất quán với admin.js
                const errorData = await response.json().catch(() => ({ error: `Lỗi HTTP ${response.status}` }));
                throw new Error(errorData.error || 'Không thể lấy dữ liệu người dùng.');
            }
            const data = await response.json();
            return data.users || [];
        } catch (error) {
            console.error("Lỗi khi tải thống kê admin:", error);
            showToast({ type: 'error', title: 'Lỗi API', message: error.message });
            return [];
        }
    }

    function processStats(users) {
        // 1. Cập nhật các thẻ thống kê
        document.getElementById('total-users').textContent = users.length;
        document.getElementById('active-users').textContent = users.filter(u => u.status === 'Enabled').length;

        // 2. Thống kê theo gói
        const planCounts = users.reduce((acc, user) => {
            const plan = user.plan || 'Free';
            acc[plan] = (acc[plan] || 0) + 1;
            return acc;
        }, {});

        document.getElementById('pro-users').textContent = planCounts.Pro || 0;
        document.getElementById('enterprise-users').textContent = planCounts.Enterprise || 0;

        // 3. Thống kê người dùng mới
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newUsersByDay = users.reduce((acc, user) => {
            const joinDate = new Date(user.joinDate);
            if (joinDate >= thirtyDaysAgo) {
                const day = joinDate.toISOString().split('T')[0];
                acc[day] = (acc[day] || 0) + 1;
            }
            return acc;
        }, {});

        return { planCounts, newUsersByDay };
    }

    function renderPlanChart(planCounts) {
        const ctx = document.getElementById('plan-distribution-chart')?.getContext('2d');
        if (!ctx) return;

        const labels = Object.keys(planCounts);
        const data = Object.values(planCounts);

        if (planChart) planChart.destroy();
        planChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số lượng người dùng',
                    data: data,
                    backgroundColor: [
                        'rgba(108, 117, 125, 0.7)', // Free
                        'rgba(0, 122, 255, 0.7)',  // Pro
                        'rgba(255, 149, 0, 0.7)'   // Enterprise
                    ],
                    borderColor: [
                        '#6c757d',
                        '#007aff',
                        '#ff9500'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    }
                }
            }
        });
    }

    function renderNewUsersChart(newUsersByDay) {
        const ctx = document.getElementById('new-users-chart')?.getContext('2d');
        if (!ctx) return;

        const labels = [];
        const data = [];
        const today = new Date();

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dayString = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
            data.push(newUsersByDay[dayString] || 0);
        }

        if (newUsersChart) newUsersChart.destroy();
        newUsersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Người dùng mới',
                    data: data,
                    backgroundColor: 'rgba(52, 199, 89, 0.6)',
                    borderColor: '#34c759',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    async function initialize() {
        const users = await fetchAdminStats();
        const { planCounts, newUsersByDay } = processStats(users);
        renderPlanChart(planCounts);
        renderNewUsersChart(newUsersByDay);
    }

    initialize();
});