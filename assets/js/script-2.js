// =================================================================
//                      KHỐI CẤU HÌNH VÀ TRẠNG THÁI
// =================================================================
const API_BASE_URL = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com';

const CONFIG = {
    API_BASE_URL: API_BASE_URL,
    // ✨ [CẢI TIẾN] Tách API endpoint cho từng trạm
    API_ENDPOINT_GET_DATA: {
        "station_01": `${API_BASE_URL}/data`,
        "station_02": `https://0sm3dtlbe6.execute-api.ap-southeast-1.amazonaws.com/data2`
    },
    API_ENDPOINT_HISTORICAL_DATA: {
        "station_01": `${API_BASE_URL}/get-historical-data`,
        "station_02": `https://0sm3dtlbe6.execute-api.ap-southeast-1.amazonaws.com/get-historical-data`
    },
    API_ENDPOINT_ANALYZE: `${API_BASE_URL}/analyze-data`, // Giả sử dùng chung 1 endpoint AI
    API_ENDPOINT_SAVE_ANALYSIS: `${API_BASE_URL}/analysis`,
    API_ENDPOINT_GET_ANALYSES: `${API_BASE_URL}/analyses`,
    API_ENDPOINT_DELETE_ANALYSIS: `${API_BASE_URL}/analysis`,
    API_ENDPOINT_UPDATE_ANALYSIS: `${API_BASE_URL}/analysis`,
    API_ENDPOINT_YEARLY_DATA: `${API_BASE_URL}/get-yearly-data`,
    API_ENDPOINT_DEVICE_STATUS: `${API_BASE_URL}/device-status`,
    API_ENDPOINT_SYSTEM_LOGS: `${API_BASE_URL}/system-logs`,

    UPDATE_INTERVAL: 7000,
    CHART_COLORS: {
        station_01: { light: '#007aff', dark: '#0a84ff' },
        station_02: { light: '#ff9500', dark: '#ff9f0a' },
        radiation: { light: '#4bc0c0', dark: '#7ce0e0' }
    },
    // ✨ [MỚI] Thêm danh sách trạm có thể cấu hình
    AVAILABLE_STATIONS: [
        { id: "station_01", name: "Trạm Quan Trắc 01" },
        { id: "station_02", name: "Trạm Quan Trắc 02" },
        // { id: "station_03", name: "Trạm Quan Trắc 03" }, // Ví dụ thêm trạm mới
    ]
};

const appState = {
    stationData: { "station_01": [], "station_02": [] },
    historicalData: { "station_01": [], "station_02": [] },
    fullDataset: [],
    stationIds: CONFIG.AVAILABLE_STATIONS.map(s => s.id),
    dashboardLayout: '1x2',
    dashboardPanels: [],
    dataFetchInterval: null,
    currentView: 'live',
    stationErrorState: { "station_01": false, "station_02": false },
    allCharts: [],
    chartDefinitions: [],
    monthlyComparisonChart: null,
    dailyRadiationChart: null,
    calendar: null,
};

// Khởi tạo trạng thái dữ liệu cho tất cả các trạm có sẵn
appState.stationIds.forEach(id => {
    appState.stationData[id] = [];
    appState.historicalData[id] = [];
    appState.stationErrorState[id] = false;
});

// =================================================================
//                      MODULE DỊCH VỤ API
// =================================================================
const apiService = {
    async _fetch(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`API request failed: ${errorBody.message || response.statusText}`);
            }
            // ✨ [SỬA LỖI] Xử lý trường hợp response không phải JSON (ví dụ: 204 No Content)
            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error(`Fetch error for ${url}:`, error);
            throw error; // Ném lại lỗi để hàm gọi có thể xử lý
        }
    },

    fetchDataForStation(stationId, isLiveData) {
        const url = CONFIG.API_ENDPOINT_GET_DATA[stationId];
        if (!url) return Promise.resolve([]); // Trả về mảng rỗng nếu không có URL
        return this._fetch(url);
    },

    fetchHistoricalDataForStation(stationId, view) {
        const url = CONFIG.API_ENDPOINT_HISTORICAL_DATA[stationId];
        if (!url) return Promise.resolve([]); // Trả về mảng rỗng nếu không có URL
        return this._fetch(`${url}?range=${view}`);
    },

    async getAiAnalysis(prompt) {
        const data = await this._fetch(CONFIG.API_ENDPOINT_ANALYZE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        return data.analysis;
    },

    getSavedAnalyses: () => apiService._fetch(CONFIG.API_ENDPOINT_GET_ANALYSES),
    // ✨ [CẢI TIẾN] Cập nhật hàm để có thể gửi yêu cầu lọc
    getSystemLogs(stationId = 'all') {
        const url = stationId === 'all'
            ? CONFIG.API_ENDPOINT_SYSTEM_LOGS
            : `${CONFIG.API_ENDPOINT_SYSTEM_LOGS}?station=${stationId}`;
        return this._fetch(url);
    },
    getDeviceStatus: (stationId) => apiService._fetch(`${CONFIG.API_ENDPOINT_DEVICE_STATUS}?station=${stationId}`),
    getYearlyData: (metric, stationId) => {
        const stationParam = stationId && stationId !== 'all' ? `&station=${stationId}` : '';
        return apiService._fetch(`${CONFIG.API_ENDPOINT_YEARLY_DATA}?metric=${metric}${stationParam}`);
    },

    saveAnalysis: (analysisText, dataType) => apiService._fetch(CONFIG.API_ENDPOINT_SAVE_ANALYSIS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysisText, dataType }) }),
    updateAnalysis: (analysisId, analysisText) => apiService._fetch(`${CONFIG.API_ENDPOINT_UPDATE_ANALYSIS}/${analysisId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysisText }) }),
    deleteAnalysis: (analysisId) => apiService._fetch(`${CONFIG.API_ENDPOINT_DELETE_ANALYSIS}/${analysisId}`, { method: 'DELETE' })
};

// =================================================================
//                      MODULE XỬ LÝ DỮ LIỆU
// =================================================================
const dataProcessor = {
    // ✨ [CẢI TIẾN] Chuẩn hóa dữ liệu ngay tại nguồn
    normalizeDataPoint(item) {
        return {
            timestamp: (item.timestamp ?? item.TimeStamp ?? 0) * 1000,
            temperature: item.temperature ?? item.Temperature ?? null,
            humidity: item.humidity ?? item.Humidity ?? null,
            uSv: item.uSv ?? null,
        };
    },
    processData(rawData) {
        if (!Array.isArray(rawData)) return [];
        return rawData
            .map(this.normalizeDataPoint)
            // Lọc bỏ các điểm dữ liệu không hợp lệ (timestamp = 0 hoặc trong tương lai)
            .filter(p => p.timestamp > 1609459200000 && p.timestamp < Date.now() + 86400000);
    },
    processDailyAverages(data) {
        if (!data || data.length === 0) return [];
        const dailyStats = {};
        data.forEach(item => {
            const date = new Date(item.timestamp).toISOString().split('T')[0];
            if (!dailyStats[date]) dailyStats[date] = { totalRad: 0, count: 0 };
            dailyStats[date].totalRad += item.uSv;
            dailyStats[date].count++;
        });
        return Object.keys(dailyStats).map(date => ({ date: date, avgRad: dailyStats[date].totalRad / dailyStats[date].count })).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-30);
    },
    processMonthlyComparisonData(metric) {
        if (!appState.fullDataset || appState.fullDataset.length === 0) return { labels: [], data: [] };
        const monthlyStats = {};
        const dataKey = { temperature: 'temperature', humidity: 'humidity', radiation: 'uSv' }[metric];
        appState.fullDataset.forEach(item => { const date = new Date(item.timestamp); const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { total: 0, count: 0 }; monthlyStats[monthKey].total += item[dataKey]; monthlyStats[monthKey].count++; });
        const sortedKeys = Object.keys(monthlyStats).sort();
        const labels = sortedKeys.map(key => `Thg ${key.split('-')[1]}/${key.slice(2, 4)}`);
        const data = sortedKeys.map(key => monthlyStats[key].total / monthlyStats[key].count);
        return { labels, data };
    }
};

// =================================================================
//                      MODULE QUẢN LÝ LƯU TRỮ
// =================================================================
const storageService = {
    saveDatasetToSession() {
        try {
            appState.stationIds.forEach(stationId => {
                const dataForStation = appState.historicalData[stationId];
                if (dataForStation && dataForStation.length > 0) {
                    const dataToStore = dataForStation.slice(-5000);
                    sessionStorage.setItem(`historicalData_${stationId}`, JSON.stringify(dataToStore));
                }
            });
        } catch (e) { console.error("Lỗi khi lưu dữ liệu vào sessionStorage:", e); }
    },
    loadDatasetFromSession() {
        let dataLoaded = false;
        appState.stationIds.forEach(stationId => {
            try {
                const storedData = sessionStorage.getItem(`historicalData_${stationId}`);
                if (storedData) {
                    const parsedData = JSON.parse(storedData);
                    appState.historicalData[stationId] = parsedData;
                    if (parsedData.length > 0) { appState.stationData[stationId] = [parsedData[parsedData.length - 1]]; }
                    dataLoaded = true;
                }
            } catch (e) { sessionStorage.removeItem(`historicalData_${stationId}`); }
        });
        if (dataLoaded) { appState.fullDataset = [...(appState.historicalData.station_01 || []), ...(appState.historicalData.station_02 || [])].sort((a, b) => a.timestamp - b.timestamp); }
        return dataLoaded;
    }
};

// =================================================================
//                      MODULE QUẢN LÝ GIAO DIỆN (UI)
// =================================================================
const uiManager = {
    // ✨ [MỚI] Tạo một panel hiển thị dữ liệu trạm
    createDashboardPanel(panelIndex) {
        const panel = document.createElement('div');
        panel.className = 'dashboard-panel';
        panel.dataset.panelIndex = panelIndex;

        const stationOptions = CONFIG.AVAILABLE_STATIONS.map(station =>
            `<option value="${station.id}">${station.name}</option>`
        ).join('');

        panel.innerHTML = `
            <header class="panel-header">
                <select class="panel-station-selector" data-panel-index="${panelIndex}">
                    ${stationOptions}
                </select>
                <div class="panel-meta-info">
                    <div class="panel-extra-data">
                        <span class="panel-temp">--°C</span>
                        <span class="panel-humi">--%</span>
                    </div>
                    <span class="panel-last-updated">Đang chờ...</span>
                </div>
            </header>
            <div class="panel-body">
                <div class="panel-main-value">--</div>
                <div class="panel-main-unit">µSv/h</div>
            </div>
        `;

        // Gắn sự kiện thay đổi trạm cho selector
        panel.querySelector('.panel-station-selector').addEventListener('change', (e) => {
            const selectedStationId = e.target.value;
            const panelIdx = e.target.dataset.panelIndex;
            appState.dashboardPanels[panelIdx].stationId = selectedStationId;
            this.updatePanel(panelIdx);
        });

        return panel;
    },

    // ✨ [MỚI] Cập nhật giao diện dashboard dựa trên layout và panel state
    renderDashboardLayout() {
        const container = document.getElementById('dashboard-panels-container');
        if (!container) return;

        container.innerHTML = '';
        container.className = `layout-${appState.dashboardLayout}`;

        const panelCount = { '1x1': 1, '1x2': 2, '2x2': 4 }[appState.dashboardLayout] || 0;

        // Tạo hoặc cắt bớt mảng state của panel
        appState.dashboardPanels = Array.from({ length: panelCount }, (_, i) => {
            return appState.dashboardPanels[i] || {
                // Gán trạm mặc định cho các panel mới
                stationId: CONFIG.AVAILABLE_STATIONS[i % CONFIG.AVAILABLE_STATIONS.length].id
            };
        });

        appState.dashboardPanels.forEach((panelState, i) => {
            const panelElement = this.createDashboardPanel(i);
            container.appendChild(panelElement);
            // Đặt giá trị cho selector
            panelElement.querySelector('.panel-station-selector').value = panelState.stationId;
            this.updatePanel(i);
        });
    },

    // ✨ [MỚI] Cập nhật một panel cụ thể với dữ liệu mới nhất
    updatePanel(panelIndex) {
        const panelState = appState.dashboardPanels[panelIndex];
        if (!panelState) return;

        const panelElement = document.querySelector(`.dashboard-panel[data-panel-index='${panelIndex}']`);
        if (!panelElement) return;

        const stationId = panelState.stationId;
        const hasError = appState.stationErrorState[stationId];

        const tempEl = panelElement.querySelector('.panel-temp');
        const humiEl = panelElement.querySelector('.panel-humi');
        const lastUpdatedEl = panelElement.querySelector('.panel-last-updated');
        const mainValueEl = panelElement.querySelector('.panel-main-value');

        if (hasError) {
            mainValueEl.textContent = 'Lỗi';
            tempEl.textContent = '--°C';
            humiEl.textContent = '--%';
            lastUpdatedEl.textContent = 'Mất kết nối';
            lastUpdatedEl.style.color = 'var(--status-danger-bg)';
        } else {
            const data = appState.stationData[stationId];
            const latestData = data && data.length > 0 ? data[data.length - 1] : null;

            if (latestData) {
                mainValueEl.textContent = latestData.uSv.toFixed(3);
                tempEl.textContent = `${latestData.temperature.toFixed(1)}°C`;
                humiEl.textContent = `${latestData.humidity.toFixed(1)}%`;
                lastUpdatedEl.textContent = `Lúc ${new Date(latestData.timestamp).toLocaleTimeString('vi-VN')}`;
                lastUpdatedEl.style.color = '';
            } else {
                mainValueEl.textContent = '--';
                tempEl.textContent = '--°C';
                humiEl.textContent = '--%';
                lastUpdatedEl.textContent = 'Đang chờ...';
                lastUpdatedEl.style.color = '';
            }
        }
    },

    // ✨ [MỚI] Cập nhật tất cả các panel đang hiển thị
    updateAllPanels() {
        appState.dashboardPanels.forEach((_, index) => this.updatePanel(index));
    },
    showLoading(element, message = 'AI đang phân tích, vui lòng chờ...') { if (element) element.innerHTML = `<div class="loader"></div><p>${message}</p>`; },
    setChartLoadingState(isLoading) { document.querySelectorAll('.chart-wrapper').forEach(w => w.classList.toggle('loading', isLoading)); },
    renderSavedAnalyses(analyses, listElement) { if (!listElement) return; if (analyses.length === 0) { listElement.innerHTML = '<p class="placeholder">Chưa có phân tích nào được lưu.</p>'; return; } listElement.innerHTML = '<ul>' + analyses.map(item => ` <li data-id="${item.id}"> <div class="analysis-item-header"> <strong>${item.dataType}</strong> - <em>Lưu lúc: ${new Date(item.savedAt * 1000).toLocaleString('vi-VN')}</em> <div class="analysis-item-actions"> <button class="btn-edit-analysis" title="Chỉnh sửa"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button> <button class="btn-delete-analysis" title="Xóa phân tích">×</button> </div> </div> <div class="analysis-content">${item.analysisText}</div> </li>`).join('') + '</ul>'; },
    updateDeviceStatus(statusData, containerId, stationId) { const container = document.getElementById(containerId); if (!container) return; const isConnected = statusData.status === 'online'; const statusClass = isConnected ? 'connected' : 'disconnected'; const statusText = isConnected ? 'Đã kết nối' : 'Mất kết nối'; const icon = isConnected ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`; let detailsHtml = `<p><strong>ID Thiết bị:</strong> ${statusData.deviceId || stationId}</p> <p><strong>Lần cuối kết nối:</strong> ${statusData.lastSeen ? new Date(statusData.lastSeen * 1000).toLocaleString('vi-VN') : 'Chưa rõ'}</p>`; container.innerHTML = `<div class="device-status-indicator ${statusClass}">${icon}</div><p class="device-status-text ${statusClass}">${statusText}</p><div class="device-status-details">${detailsHtml}</div>`; },
    renderSystemLogs(logs, container) { if (!container) return; if (logs.length === 0) { container.innerHTML = '<p class="placeholder">Không có nhật ký hệ thống nào.</p>'; return; } container.innerHTML = logs.map(log => ` <div class="log-item"> <span class="log-timestamp">${new Date(log.timestamp * 1000).toLocaleString('vi-VN')}</span> <span class="log-level ${log.level}">${log.level}</span> <span class="log-message">${log.message}</span> </div>`).join(''); },
    updateHeatmapUI(metric) { const titleEl = document.getElementById('heatmap-title'); if (!titleEl) return; const stationText = document.querySelector('#heatmap-station-filter button.active')?.textContent || 'Cả hai'; if (metric === 'temperature') { titleEl.innerHTML = `🌡️ Tổng quan Nhiệt độ Năm (${stationText})`; } else { titleEl.innerHTML = `💧 Tổng quan Độ ẩm Năm (${stationText})`; } }
};

// =================================================================
//                      MODULE QUẢN LÝ BIỂU ĐỒ (ChartManager)
// =================================================================
const chartManager = {
    initDefinitions() { if (!document.getElementById('temp-chart')) return; appState.chartDefinitions = [{ id: 'temp', ctx: document.getElementById('temp-chart').getContext('2d'), label: 'Nhiệt độ (°C)', dataKey: 'temperature' }, { id: 'humi', ctx: document.getElementById('humi-chart').getContext('2d'), label: 'Độ ẩm (%)', dataKey: 'humidity' }, { id: 'rad', ctx: document.getElementById('rad-chart').getContext('2d'), label: 'Phóng xạ (µSv/h)', dataKey: 'uSv' }]; },
    _createLineChartConfig(chartDef) {
        const theme = typeof getCurrentTheme === 'function' ? getCurrentTheme() : 'light';
        const datasets = appState.stationIds.map(id => ({ label: `Trạm ${id.slice(-2)}`, data: [], borderColor: CONFIG.CHART_COLORS[id][theme], backgroundColor: `${CONFIG.CHART_COLORS[id][theme]}30`, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2 }));
        return {
            type: 'line', data: { labels: [], datasets },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: { x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } }, y: { beginAtZero: false, grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } } },
                plugins: { legend: { labels: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } }, tooltip: { backgroundColor: theme === 'dark' ? '#161b22' : '#ffffff', titleColor: theme === 'dark' ? '#f0f6fc' : '#212529', bodyColor: theme === 'dark' ? '#adb5bd' : '#495057', borderColor: theme === 'dark' ? '#30363d' : '#e9ecef', borderWidth: 1, padding: 10, callbacks: { title: (tooltipItems) => new Date(tooltipItems[0].parsed.x).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }), label: (context) => ` ${context.dataset.label || ''}: ${context.parsed.y !== null ? context.parsed.y.toFixed(2) : '--'} ${chartDef.label.match(/\(([^)]+)\)/)?.[1] || ''}` } }, zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, mode: 'x' } } }
            }
        };
    },
    setupAllCharts() { this.destroyAllCharts(); appState.chartDefinitions.forEach(def => { const config = this._createLineChartConfig(def); const chart = new Chart(def.ctx, config); chart.definition = def; appState.allCharts.push(chart); }); },
    updateAllCharts() {
        if (appState.allCharts.length === 0) return;
        const currentView = document.querySelector('.global-filter-buttons button.active')?.dataset.view || '1d';
        appState.allCharts.forEach(chart => {
            const def = chart.definition;
            chart.data.datasets.forEach((dataset, index) => {
                const stationId = appState.stationIds[index];
                const dataForStation = appState.historicalData[stationId] || [];
                // Lọc dữ liệu theo khoảng thời gian đã chọn
                const filteredData = utils.getFilteredData(dataForStation, currentView);
                dataset.data = filteredData.map(d => ({ x: d.timestamp, y: d[def.dataKey] }));
                dataset.label = `Trạm ${stationId.slice(-2)}`;
            });
            const timeUnit = { 'live': 'hour', '1d': 'hour', '5d': 'day', '1m': 'day', '6m': 'month', '1y': 'month' }[currentView];
            chart.options.scales.x.time.unit = timeUnit;
            chart.update('none');
        });
    },
    destroyAllCharts() { appState.allCharts.forEach(chart => chart.destroy()); appState.allCharts = []; },
    _createBarChartConfig(labels, data, label, metric) { const theme = typeof getCurrentTheme === 'function' ? getCurrentTheme() : 'light'; const color = CONFIG.CHART_COLORS[metric === 'radiation' ? 'radiation' : 'station_01'][theme]; return { type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: `${color}b3`, borderColor: color, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } }, y: { beginAtZero: true, grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } } } } }; },
    renderDailyRadiationChart() { const ctx = document.getElementById('daily-radiation-chart')?.getContext('2d'); if (!ctx) return; const dailyData = dataProcessor.processDailyAverages(appState.fullDataset); const labels = dailyData.map(d => new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })); const data = dailyData.map(d => d.avgRad); if (appState.dailyRadiationChart) appState.dailyRadiationChart.destroy(); appState.dailyRadiationChart = new Chart(ctx, this._createBarChartConfig(labels, data, 'Phóng xạ TB (µSv/h)', 'radiation')); },
    renderMonthlyComparisonChart(metric = 'temperature') { const ctx = document.getElementById('monthly-comparison-chart')?.getContext('2d'); if (!ctx) return; const { labels, data } = dataProcessor.processMonthlyComparisonData(metric); if (appState.monthlyComparisonChart) appState.monthlyComparisonChart.destroy(); appState.monthlyComparisonChart = new Chart(ctx, this._createBarChartConfig(labels, data, `Trung bình ${metric}`, metric)); },
    async fetchAndRenderHeatmap(metric = 'temperature', stationId = 'all') { const container = document.getElementById('cal-heatmap'); if (!container) return; uiManager.updateHeatmapUI(metric); uiManager.showLoading(container, 'Đang tải dữ liệu biểu đồ nhiệt...'); try { const data = await apiService.getYearlyData(metric, stationId); if (!data || data.length === 0) { const stationText = stationId === 'all' ? '' : ` cho trạm ${stationId.slice(-2)}`; container.innerHTML = `<p class="placeholder">Không có dữ liệu tổng hợp${stationText} để hiển thị.</p>`; return; } container.innerHTML = ''; if (appState.calendar) appState.calendar.destroy(); appState.calendar = new CalHeatmap(); appState.calendar.paint({ data: { source: data, x: 'date', y: 'value' }, date: { start: new Date(new Date().getFullYear(), 0, 1) }, range: 12, scale: { color: { type: 'quantize', scheme: metric === 'temperature' ? 'YlGnBu' : 'YlOrRd', domain: metric === 'temperature' ? [15, 25, 35] : [40, 60, 80] } }, domain: { type: 'month', gutter: 4, label: { text: 'MMM', textAlign: 'start', position: 'top' } }, subDomain: { type: 'ghDay', radius: 2, width: 11, height: 11, gutter: 4 }, itemSelector: container }); } catch (error) { container.innerHTML = '<p class="error">Lỗi: Không thể hiển thị biểu đồ nhiệt.</p>'; } }
};

// =================================================================
//                      MODULE XỬ LÝ SỰ KIỆN (EventHandler)
// =================================================================
const eventHandler = {
    // ✨ [MỚI] Thiết lập các sự kiện cho thanh công cụ dashboard
    setupDashboardToolbar() {
        // Layout Selector
        document.querySelectorAll('#layout-selector button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#layout-selector button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                appState.dashboardLayout = btn.dataset.layout;
                uiManager.renderDashboardLayout();
            });
        });

        // Toggle Charts Button
        document.getElementById('toggle-charts-btn')?.addEventListener('click', (e) => {
            document.getElementById('chart-section')?.classList.toggle('hidden');
            e.currentTarget.classList.toggle('active');
        });
    },
    setupGlobalChartFilters() { const filterButtons = document.querySelectorAll('.global-filter-buttons button'); filterButtons.forEach(btn => { btn.addEventListener('click', () => { if (btn.classList.contains('active')) return; filterButtons.forEach(b => b.classList.remove('active')); btn.classList.add('active'); const newView = btn.dataset.view || '1d'; appState.currentView = newView; mainController.handleViewChange(newView); }); }); },
    setupPauseResume() { const btn = document.getElementById('btn-pause-resume'); if (btn) btn.addEventListener('click', () => { const isPaused = !appState.dataFetchInterval; if (isPaused) { mainController.handleViewChange('live'); } else { clearInterval(appState.dataFetchInterval); appState.dataFetchInterval = null; btn.classList.add('paused'); btn.title = "Tiếp tục"; } }); },
    setupAiHandlers() { document.getElementById('btn-ai-summary')?.addEventListener('click', mainController.handleAiSummaryClick); document.getElementById('btn-fetch-history')?.addEventListener('click', mainController.handleFetchHistory); },
    setupGlobalEventListeners() { document.getElementById('btn-download')?.addEventListener('click', () => { if (!appState.fullDataset || appState.fullDataset.length === 0) { alert('Chưa có dữ liệu.'); return; } const blob = new Blob([JSON.stringify({ timestamp: new Date().toISOString(), data: appState.fullDataset }, null, 2)], { type: 'application/json' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sensor-data-${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }); document.getElementById('btn-fullscreen')?.addEventListener('click', () => { document.querySelector('.chart-container')?.requestFullscreen(); }); document.getElementById('btn-reset-zoom')?.addEventListener('click', () => { appState.allCharts.forEach(chart => chart.resetZoom()); }); const modal = document.getElementById('ai-modal'); if (modal) { const closeModal = () => modal.classList.remove('show'); modal.querySelector('#modal-close-btn')?.addEventListener('click', closeModal); modal.addEventListener('click', e => { if (e.target === modal) closeModal(); }); } },
    setupCollapsibleSections() { document.getElementById('toggle-saved-analyses')?.addEventListener('click', e => e.currentTarget.closest('.saved-analyses-section')?.classList.toggle('collapsed')); },
    setupAnalysisPageHandlers() { const listEl = document.getElementById('saved-analyses-list'); if (!listEl) return; listEl.addEventListener('click', e => { const delBtn = e.target.closest('.btn-delete-analysis'); if (delBtn) mainController.handleDeleteAnalysisClick(delBtn); const editBtn = e.target.closest('.btn-edit-analysis'); if (editBtn) this._handleEditAnalysisClick(editBtn); }); },
    _handleEditAnalysisClick(editButton) { const item = editButton.closest('li'); const content = item.querySelector('.analysis-content'); const actions = item.querySelector('.analysis-item-actions'); const original = content.innerHTML; content.contentEditable = true; content.classList.add('editing'); content.focus(); actions.innerHTML = `<button class="btn-save-edit">Lưu</button><button class="btn-cancel-edit">Hủy</button>`; const cancel = () => { content.innerHTML = original; content.contentEditable = false; content.classList.remove('editing'); actions.innerHTML = `<button class="btn-edit-analysis" title="Chỉnh sửa"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button><button class="btn-delete-analysis" title="Xóa">×</button>`; }; actions.querySelector('.btn-save-edit').addEventListener('click', async () => { await mainController.handleSaveAnalysisEdit(item, content.innerHTML); cancel(); }); actions.querySelector('.btn-cancel-edit').addEventListener('click', cancel); },
    setupHeatmapControls() { const metricButtons = document.querySelectorAll('#heatmap-filter-buttons button'); const stationButtons = document.querySelectorAll('#heatmap-station-filter button'); const triggerHeatmapUpdate = () => { const activeMetric = document.querySelector('#heatmap-filter-buttons button.active')?.dataset.metric || 'temperature'; const activeStation = document.querySelector('#heatmap-station-filter button.active')?.dataset.station || 'all'; chartManager.fetchAndRenderHeatmap(activeMetric, activeStation); }; metricButtons.forEach(btn => btn.addEventListener('click', () => { if (btn.classList.contains('active')) return; metricButtons.forEach(b => b.classList.remove('active')); btn.classList.add('active'); triggerHeatmapUpdate(); })); stationButtons.forEach(btn => btn.addEventListener('click', () => { if (btn.classList.contains('active')) return; stationButtons.forEach(b => b.classList.remove('active')); btn.classList.add('active'); triggerHeatmapUpdate(); })); },
    setupMonthlyComparisonControls() { document.querySelectorAll('#monthly-metric-filter button').forEach(btn => { btn.addEventListener('click', () => { if (btn.classList.contains('active')) return; document.querySelectorAll('#monthly-metric-filter button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); chartManager.renderMonthlyComparisonChart(btn.dataset.metric); }); }); document.getElementById('btn-export-monthly')?.addEventListener('click', () => { const activeMetric = document.querySelector('#monthly-metric-filter button.active')?.dataset.metric || 'temperature'; const { labels, data } = dataProcessor.processMonthlyComparisonData(activeMetric); if (data.length === 0) { alert("Không có dữ liệu để xuất."); return; } const unitLabel = { temperature: 'Nhiệt độ (°C)', humidity: 'Độ ẩm (%)', radiation: 'Phóng xạ (µSv/h)' }[activeMetric]; const rows = [['Tháng', `Trung bình ${unitLabel}`]]; labels.forEach((label, index) => rows.push([label, data[index].toFixed(2)])); utils.exportToCsv(`so-sanh-hang-thang-${activeMetric}.csv`, rows); }); },

    // ✨ [CẢI TIẾN] Gắn sự kiện cho các nút lọc và làm mới nhật ký
    setupStatusPageHandlers() {
        // Nút làm mới cho từng trạm
        document.querySelectorAll('.refresh-status-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const stationId = e.currentTarget.dataset.station;
                if (stationId) mainController.fetchSingleDeviceStatus(stationId);
            });
        });

        // Các nút lọc cho bảng nhật ký hệ thống
        const logFilterButtons = document.querySelectorAll('#log-filter-buttons button');
        logFilterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('active')) return;
                logFilterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const stationId = btn.dataset.station || 'all';
                mainController.fetchSystemLogs(stationId); // Gọi hàm fetch với bộ lọc
            });
        });
    }
};

// =================================================================
//                      MODULE ĐIỀU KHIỂN CHÍNH (MainController)
// =================================================================
const mainController = {
    async fetchLiveData() {
        const isDashboard = !!document.querySelector('.dashboard-grid');
        if (isDashboard) uiManager.setChartLoadingState(true);

        try {
            const results = await Promise.allSettled(
                appState.stationIds.map(id => apiService.fetchDataForStation(id, true))
            );

            results.forEach((result, index) => {
                const stationId = appState.stationIds[index];
                if (result.status === 'rejected') {
                    console.error(`Failed to fetch data for ${stationId}:`, result.reason);
                    appState.stationErrorState[stationId] = true;
                    return;
                }

                const processed = dataProcessor.processData(result.value);
                appState.stationErrorState[stationId] = (result.value.length > 0 && processed.length === 0);

                appState.stationData[stationId] = processed.sort((a, b) => a.timestamp - b.timestamp);

                // Chỉ nối dữ liệu mới vào biểu đồ nếu đang ở chế độ xem 'live' hoặc '1d'
                if (appState.currentView === 'live' || appState.currentView === '1d') {
                    const existingTimestamps = new Set((appState.historicalData[stationId] || []).map(d => d.timestamp));
                    const newData = processed.filter(d => !existingTimestamps.has(d.timestamp));
                    if (newData.length > 0) {
                        appState.historicalData[stationId].push(...newData);
                        appState.historicalData[stationId].sort((a, b) => a.timestamp - b.timestamp);
                    }
                }
            });

            appState.fullDataset = [...(appState.historicalData.station_01 || []), ...(appState.historicalData.station_02 || [])].sort((a, b) => a.timestamp - b.timestamp);
            storageService.saveDatasetToSession();

            if (isDashboard) {
                uiManager.updateAllPanels();
                if (appState.currentView === 'live' || appState.currentView === '1d') {
                    chartManager.updateAllCharts();
                }
            }

        } catch (error) {
            console.error(`Lỗi khi tải dữ liệu live:`, error);
        } finally {
            if (isDashboard) setTimeout(() => uiManager.setChartLoadingState(false), 300);
        }
    },

    async fetchHistoricalData(view) {
        const isDashboard = !!document.querySelector('.dashboard-grid');
        if (isDashboard) uiManager.setChartLoadingState(true);

        try {
            const results = await Promise.allSettled(
                appState.stationIds.map(id => apiService.fetchHistoricalDataForStation(id, view))
            );

            results.forEach((result, index) => {
                const stationId = appState.stationIds[index];
                if (result.status === 'rejected') {
                    console.error(`Failed to fetch historical data for ${stationId}:`, result.reason);
                    appState.stationErrorState[stationId] = true;
                    return;
                }
                const processed = dataProcessor.processData(result.value);
                appState.historicalData[stationId] = processed.sort((a, b) => a.timestamp - b.timestamp);
            });

            if (isDashboard) chartManager.updateAllCharts();

        } catch (error) {
            console.error(`Lỗi khi tải dữ liệu cho view '${view}':`, error);
        } finally {
            if (isDashboard) setTimeout(() => uiManager.setChartLoadingState(false), 300);
        }
    },
    async initDashboard() {
        chartManager.initDefinitions();
        chartManager.setupAllCharts();
        eventHandler.setupGlobalChartFilters();
        eventHandler.setupPauseResume();
        eventHandler.setupGlobalEventListeners();

        // ✨ [MỚI] Thiết lập các điều khiển mới
        eventHandler.setupDashboardToolbar();
        uiManager.renderDashboardLayout(); // Render layout mặc định

        const hasSessionData = storageService.loadDatasetFromSession();
        if (hasSessionData) {
            uiManager.updateAllPanels();
            chartManager.updateAllCharts();
        }

        // Tải dữ liệu ban đầu
        await this.fetchLiveData(); // Lấy dữ liệu live mới nhất
        await this.fetchHistoricalData(appState.currentView); // Tải dữ liệu lịch sử ban đầu

        // Bắt đầu chu trình cập nhật live
        if (appState.dataFetchInterval) clearInterval(appState.dataFetchInterval);
        appState.dataFetchInterval = setInterval(() => this.fetchLiveData(), CONFIG.UPDATE_INTERVAL);
    },


    async initEvaluationPage() {
        if (!document.querySelector('.evaluation-layout')) return;
        eventHandler.setupAiHandlers();
        eventHandler.setupCollapsibleSections();
        eventHandler.setupAnalysisPageHandlers();
        eventHandler.setupMonthlyComparisonControls();
        eventHandler.setupHeatmapControls();
        await this.loadSavedAnalyses();
        await chartManager.fetchAndRenderHeatmap('temperature', 'all');
        await this.fetchHistoricalData('1y');
        chartManager.renderDailyRadiationChart();
        chartManager.renderMonthlyComparisonChart('temperature');
    },

    async initStatusPage() {
        if (!document.getElementById('device-status-content-station_01')) return;
        this.fetchDeviceStatus();
        this.fetchSystemLogs(); // Ban đầu tải tất cả nhật ký
        eventHandler.setupStatusPageHandlers();
    },

    async handleAiSummaryClick() { const el = document.getElementById('ai-summary-content'); if (!el) return; if (!appState.fullDataset?.length) { el.innerHTML = '<p class="placeholder">Chưa có dữ liệu.</p>'; return; } uiManager.showLoading(el); const d = appState.fullDataset[appState.fullDataset.length - 1]; const prompt = `Tóm tắt dữ liệu môi trường bằng tiếng Việt: Nhiệt độ ${d.temperature.toFixed(1)}°C, Độ ẩm ${d.humidity.toFixed(1)}%, Phóng xạ ${d.uSv.toFixed(3)}µSv/h. Trả về HTML đẹp mắt với tình hình và khuyến nghị, dùng emoji và <strong>.`; try { el.innerHTML = await apiService.getAiAnalysis(prompt); } catch (e) { el.innerHTML = `<p class="error">Lỗi AI: ${e.message}</p>`; } },
    async handleAiHistoryClick(chartDef) { const modal = document.getElementById('ai-modal'); const body = document.getElementById('modal-body'); if (!modal || !body) return; const data = chartManager.getDataForChart(chartDef); if (!data.length) { alert("Chưa có dữ liệu."); return; } modal.classList.add('show'); uiManager.showLoading(body); const points = data.map(d => d[chartDef.dataKey]); const stats = { min: Math.min(...points).toFixed(1), max: Math.max(...points).toFixed(1), avg: (points.reduce((a, b) => a + b, 0) / points.length).toFixed(1) }; const unit = chartDef.label.match(/\(([^)]+)\)/)?.[1] || ''; const range = document.querySelector('.global-filter-buttons button.active')?.textContent || ''; const prompt = `Phân tích dữ liệu lịch sử cho ${chartDef.label} trong ${range}: Min ${stats.min}${unit}, Max ${stats.max}${unit}, Avg ${stats.avg}${unit}. Trả về HTML đẹp mắt, tổng quan xu hướng, điểm đáng chú ý, dùng emoji và <strong>.`; try { const result = await apiService.getAiAnalysis(prompt); body.innerHTML = result; const saveBtn = document.createElement('button'); saveBtn.textContent = 'Lưu Phân tích'; saveBtn.className = 'btn-save-analysis'; saveBtn.onclick = () => this.saveAnalysis(result, `${chartDef.label} - ${range}`); body.appendChild(saveBtn); } catch (e) { body.innerHTML = `<p class="error">Lỗi AI: ${e.message}</p>`; } },
    async handleFetchHistory() { const datePicker = document.getElementById('history-date-picker'); const resultsDiv = document.getElementById('history-results'); if (!datePicker || !resultsDiv) return; const selectedDate = datePicker.value; if (!selectedDate) { resultsDiv.innerHTML = `<p class="error">Vui lòng chọn một ngày.</p>`; return; } uiManager.showLoading(resultsDiv); const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0); const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999); const dataForDay = appState.fullDataset.filter(d => d.timestamp >= startOfDay.getTime() && d.timestamp <= endOfDay.getTime()); if (dataForDay.length === 0) { resultsDiv.innerHTML = `<p class="placeholder">Không tìm thấy dữ liệu cho ngày đã chọn.</p>`; return; } const simplifiedData = dataForDay.map(d => ({ t: new Date(d.timestamp).toLocaleTimeString('vi-VN'), temp: d.temperature, humi: d.humidity, rad: d.uSv })); const prompt = `Bạn là trợ lý phân tích, tóm tắt sự kiện từ dữ liệu trạm quan trắc ngày ${selectedDate}. Tạo báo cáo HTML với: <h4>Tổng kết trong ngày</h4>, <h4>Sự kiện Nổi bật</h4>, và <h4>Nhật ký Cảnh báo</h4>. Sử dụng emoji và <strong>.`; try { resultsDiv.innerHTML = await apiService.getAiAnalysis(prompt); } catch (error) { resultsDiv.innerHTML = `<p class="error">Lỗi: Không thể nhận phân tích từ AI.</p>`; } },
    async saveAnalysis(text, type) { try { await apiService.saveAnalysis(text, type); alert('Đã lưu thành công!'); if (document.getElementById('saved-analyses-list')) this.loadSavedAnalyses(); } catch (e) { alert('Lưu thất bại.'); } },
    handleDeleteAnalysisClick(btn) { const id = btn.closest('li').dataset.id; if (confirm('Bạn có chắc muốn xóa?')) { apiService.deleteAnalysis(id).then(() => { alert('Đã xóa!'); this.loadSavedAnalyses(); }).catch(e => alert(`Xóa thất bại: ${e.message}`)); } },
    async handleSaveAnalysisEdit(item, content) { const id = item.dataset.id; try { await apiService.updateAnalysis(id, content); alert('Đã cập nhật!'); } catch (e) { alert('Cập nhật thất bại.'); console.error(e); } },
    async loadSavedAnalyses() { const el = document.getElementById('saved-analyses-list'); if (!el) return; uiManager.showLoading(el, 'Đang tải...'); try { const data = await apiService.getSavedAnalyses(); uiManager.renderSavedAnalyses(data, el); } catch (e) { el.innerHTML = `<p class="error">Lỗi tải nhật ký.</p>`; } },
    async fetchDeviceStatus() { appState.stationIds.forEach(stationId => this.fetchSingleDeviceStatus(stationId)); },
    async fetchSingleDeviceStatus(stationId) { const containerId = `device-status-content-${stationId}`; const el = document.getElementById(containerId); if (!el) return; el.innerHTML = `<div class="loader"></div>`; try { const status = await apiService.getDeviceStatus(stationId); uiManager.updateDeviceStatus(status, containerId, stationId); } catch (e) { el.innerHTML = `<p class="error">Lỗi tải trạng thái.</p>`; } },

    // ✨ [CẢI TIẾN] Cập nhật hàm để nhận stationId cho việc lọc
    async fetchSystemLogs(stationId = 'all') {
        const el = document.getElementById('system-logs-content');
        if (!el) return;
        uiManager.showLoading(el, 'Đang tải...');
        try {
            const logs = await apiService.getSystemLogs(stationId);
            uiManager.renderSystemLogs(logs, el);
        } catch (e) {
            el.innerHTML = `<p class="error">Lỗi tải nhật ký.</p>`;
        }
    },

    // ✨ [MỚI] Xử lý khi người dùng thay đổi chế độ xem (live, 1d, 5d,...)
    handleViewChange(newView) {
        appState.currentView = newView;
        const btnPauseResume = document.getElementById('btn-pause-resume');
        // Dừng chu trình cập nhật live hiện tại trước khi quyết định hành động tiếp theo
        if (appState.dataFetchInterval) clearInterval(appState.dataFetchInterval);

        if (newView === 'live') {
            // Bắt đầu hoặc tiếp tục chu trình cập nhật live
            if (appState.dataFetchInterval) clearInterval(appState.dataFetchInterval);
            appState.dataFetchInterval = setInterval(() => this.fetchLiveData(), CONFIG.UPDATE_INTERVAL);
            if (btnPauseResume) btnPauseResume.classList.remove('paused');
        } else {
            // Dừng cập nhật live và tải dữ liệu lịch sử
            appState.dataFetchInterval = null; // Đánh dấu là đã dừng
            this.fetchHistoricalData(newView);
        }
    },
};

// =================================================================
//                      KHỞI TẠO ỨNG DỤNG
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.dashboard-grid')) { // Chỉ khởi tạo nếu đây là trang dashboard
        mainController.initDashboard();
    } else if (document.querySelector('.evaluation-layout')) {
        mainController.initEvaluationPage();
    } else if (document.getElementById('device-status-content-station_01')) {
        mainController.initStatusPage();
    }
});

window.updateDashboardTheme = function () {
    if (document.querySelector('.dashboard-grid')) {
        chartManager.setupAllCharts();
        chartManager.updateAllCharts();
    }
    if (document.querySelector('.evaluation-layout')) {
        chartManager.renderDailyRadiationChart();
        const activeMetric = document.querySelector('#monthly-metric-filter button.active')?.dataset.metric || 'temperature';
        chartManager.renderMonthlyComparisonChart(activeMetric);
    }
};
