// =================================================================
//                      KHỐI CẤU HÌNH & BIẾN TOÀN CỤC
// =================================================================
let stationData = { "station_01": [], "station_02": [] };      // Dữ liệu mới nhất cho các thẻ live status
let historicalData = { "station_01": [], "station_02": [] }; // Toàn bộ dữ liệu lịch sử cho biểu đồ
let fullDataset = [];                                       // Dữ liệu hợp nhất cho các trang phân tích

const stationIds = ["station_01", "station_02"];

let allCharts = [];
let dataFetchInterval = null;
let currentView = '1d'; // Chế độ xem mặc định cho biểu đồ

// Biến cho các thành phần trên các trang khác
let chartDefinitions = [];
let monthlyComparisonChart = null;
let dailyRadiationChart = null;
let calendar = null;
let warningSound = null;

const API_BASE_URL_STATION_01 = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com';
const API_BASE_URL_STATION_02 = 'https://0sm3dtlbe6.execute-api.ap-southeast-1.amazonaws.com';

const CONFIG = {
    API_ENDPOINT_GET_DATA: { // API lấy dữ liệu live/mới nhất
        "station_01": `${API_BASE_URL_STATION_01}/data`,
        "station_02": `${API_BASE_URL_STATION_02}/data2`
    },
    API_ENDPOINT_HISTORICAL_DATA: { // ✨ [SỬA LỖI] API lấy dữ liệu lịch sử theo khoảng thời gian
        "station_01": `${API_BASE_URL_STATION_01}/get-historical-data`,
        "station_02": `${API_BASE_URL_STATION_02}/get-historical-data` // Cần thay bằng API tương ứng của trạm 2 nếu có
    },
    // Các API khác cho chức năng phụ
    API_ENDPOINT_SAVE_ANALYSIS: `${API_BASE_URL_STATION_01}/analysis`,
    API_ENDPOINT_GET_ANALYSES: `${API_BASE_URL_STATION_01}/analyses`,
    API_ENDPOINT_DELETE_ANALYSIS: `${API_BASE_URL_STATION_01}/analysis`,
    API_ENDPOINT_UPDATE_ANALYSIS: `${API_BASE_URL_STATION_01}/analysis`,
    API_ENDPOINT_YEARLY_DATA: `${API_BASE_URL_STATION_01}/get-yearly-data`,
    API_ENDPOINT_DEVICE_STATUS: `${API_BASE_URL_STATION_01}/device-status`,
    API_ENDPOINT_SYSTEM_LOGS: `${API_BASE_URL_STATION_01}/system-logs`,
    UPDATE_INTERVAL: 7000,
    CHART_COLORS: {
        station_01: { light: '#007aff', dark: '#0a84ff' },
        station_02: { light: '#ff9500', dark: '#ff9f0a' },
        radiation: { light: '#4bc0c0', dark: '#7ce0e0' }
    },
    GEMINI_API_KEY: "AIzaSyBdnDroZPmU5PZ3qdexL22hn1Z0aGAUnYk",
    GEMINI_MODEL: "gemini-2.5-flash-preview-05-20"
};

// =================================================================
//                      HÀM TIỆN ÍCH & ĐA NGÔN NGỮ
// =================================================================
/**
 * Lấy bản dịch cho một khóa nhất định, nếu không có thì trả về giá trị mặc định.
 * @param {string} key - Khóa dịch trong tệp i18n.js.
 * @param {string} fallback - Giá trị mặc định nếu không tìm thấy bản dịch.
 * @returns {string} Chuỗi đã được dịch hoặc chuỗi mặc định.
 */
const getTranslation = (key, fallback) => {
    const lang = getLanguage(); // getLanguage() được định nghĩa trong main.js
    return (translations[lang] && translations[lang][key]) || fallback;
};

// =================================================================
//                      LOGIC LẤY VÀ XỬ LÝ DỮ LIỆU
// =================================================================

/**
 * Lấy dữ liệu trực tiếp (mới nhất) để cập nhật live cards.
 */
async function fetchData() {
    try {
        const promises = stationIds.map(id =>
            fetch(CONFIG.API_ENDPOINT_GET_DATA[id]).then(res => res.ok ? res.json() : [])
        );
        const results = await Promise.all(promises);

        results.forEach((rawData, index) => {
            const stationId = stationIds[index];
            if (!Array.isArray(rawData) || rawData.length === 0) return;

            // ✨ [CẢI TIẾN] Chuẩn hóa dữ liệu và chỉ cập nhật dữ liệu live
            const processedData = rawData.map(item => ({
                timestamp: (rawData[0].timestamp ?? rawData[0].TimeStamp) * 1000,
                temperature: rawData[0].temperature ?? rawData[0].Temperature,
                humidity: rawData[0].humidity ?? rawData[0].Humidity,
                uSv: rawData[0].uSv
            }));

            stationData[stationId] = processedData.sort((a, b) => a.timestamp - b.timestamp);

            // ✨ [CẢI TIẾN] Chỉ nối điểm dữ liệu mới vào biểu đồ nếu đang ở chế độ xem '1d'
            if (currentView === '1d') {
                const existingTimestamps = new Set(historicalData[stationId].map(d => d.timestamp));
                const newData = processedData.filter(d => !existingTimestamps.has(d.timestamp));
                if (newData.length > 0) {
                    historicalData[stationId].push(...newData);
                    historicalData[stationId].sort((a, b) => a.timestamp - b.timestamp);
                    updateCharts(); // Chỉ cập nhật biểu đồ khi có dữ liệu mới và ở chế độ 1d
                }
            }
        });
        
        updateUI();
    } catch (error) {
        console.error("Không thể lấy dữ liệu trực tiếp:", error);
    }
}

/**
 * Lấy dữ liệu lịch sử để cập nhật biểu đồ.
 * @param {string} view - Khoảng thời gian ('1d', '5d', '1m', '6m', '1y').
 */
async function fetchHistoricalData(view) {
    if (!document.querySelector('.dashboard-grid')) return;
    console.log(`Đang tải dữ liệu lịch sử cho: ${view}...`);

    try {
        const promises = stationIds.map(id => {
            // ✨ [SỬA LỖI] Truy cập đúng endpoint cho từng trạm
            const url = `${CONFIG.API_ENDPOINT_HISTORICAL_DATA[id]}?range=${view}`;
            return fetch(url).then(res => res.ok ? res.json() : []);
        });

        const results = await Promise.all(promises);

        results.forEach((rawData, index) => {
            const stationId = stationIds[index];
            if (!Array.isArray(rawData)) return;
            const processedData = rawData.map(item => ({
                timestamp: (item.timestamp ?? item.TimeStamp) * 1000,
                temperature: item.temperature ?? item.Temperature, // Giữ nguyên logic chuẩn hóa
                humidity: item.humidity ?? item.Humidity,
                uSv: item.uSv
            }));
            historicalData[stationId] = processedData.sort((a, b) => a.timestamp - b.timestamp);
        });

        fullDataset = [...historicalData.station_01, ...historicalData.station_02].sort((a, b) => a.timestamp - b.timestamp);
        saveDatasetToSession();
        
        updateCharts();
        renderDependentComponents();
    } catch (error) {
        showToast({ type: 'error', title: 'Lỗi Tải Dữ Liệu', message: 'Không thể tải dữ liệu lịch sử từ máy chủ.' });
        console.error(`Lỗi khi tải dữ liệu lịch sử cho '${view}':`, error);
    }
}

/**
 * Lọc và lấy mẫu dữ liệu để tối ưu hóa hiệu suất biểu đồ.
 * @param {Array} dataset - Mảng dữ liệu nguồn.
 * @param {string} view - Chế độ xem ('1d', '5d', '1m', '6m', '1y').
 * @param {number} [maxPoints=500] - Số điểm dữ liệu tối đa.
 * @returns {Array} Mảng dữ liệu đã được lọc và lấy mẫu.
 */
function getFilteredData(dataset, view, maxPoints = 500) {
    if (!dataset || dataset.length === 0) return [];
    const now = Date.now();
    let startTime;
    
    switch (view) {
        case '1d': startTime = now - 1 * 24 * 60 * 60 * 1000; break;
        case '5d': startTime = now - 5 * 24 * 60 * 60 * 1000; break;
        case '1m': startTime = now - 30 * 24 * 60 * 60 * 1000; break;
        case '6m': startTime = now - 180 * 24 * 60 * 60 * 1000; break;
        case '1y': startTime = now - 365 * 24 * 60 * 60 * 1000; break;
        default:   startTime = now - 1 * 24 * 60 * 60 * 1000;
    }

    const filtered = dataset.filter(d => d.timestamp >= startTime);

    if (filtered.length > maxPoints) {
        const sampledData = [];
        const step = Math.floor(filtered.length / maxPoints);
        for (let i = 0; i < filtered.length; i += step) {
            sampledData.push(filtered[i]);
        }
        return sampledData;
    }
    return filtered;
}

// =================================================================
//                      CẬP NHẬT GIAO DIỆN (UI)
// =================================================================

function updateUI() {
    if (!document.querySelector('.dashboard-grid')) return;

    stationIds.forEach((stationId) => {
        const data = stationData[stationId]; // Đọc từ dữ liệu live
        const suffix = stationId.slice(-2);
        const latestData = data && data.length > 0 ? data[data.length - 1] : null;

        const lastUpdatedEl = document.getElementById(`last-updated-${suffix}`);
        if (!latestData || typeof latestData.temperature !== 'number' || typeof latestData.humidity !== 'number' || typeof latestData.uSv !== 'number') {
            if (lastUpdatedEl) lastUpdatedEl.innerText = latestData ? `Dữ liệu lỗi...` : `Đang chờ...`;
            document.getElementById(`temp-value-${suffix}`).innerText = `-- °C`;
            document.getElementById(`humi-value-${suffix}`).innerText = `-- %`;
            document.getElementById(`usv-value-${suffix}`).innerText = `-- µSv/h`;
            ['temp', 'humi', 'usv'].forEach(s => {
                const statusEl = document.getElementById(`${s}-status-${suffix}`);
                if (statusEl) { statusEl.innerText = '--'; statusEl.className = 'status'; }
            });
            return;
        }

        const { temperature: temp, humidity: humi, uSv, timestamp } = latestData;
        document.getElementById(`temp-value-${suffix}`).innerText = `${temp.toFixed(1)} °C`;
        document.getElementById(`humi-value-${suffix}`).innerText = `${humi.toFixed(1)} %`;
        document.getElementById(`usv-value-${suffix}`).innerText = `${uSv.toFixed(2)} µSv/h`;
        
        const tempStatus = getTemperatureStatus(temp);
        const tempStatusEl = document.getElementById(`temp-status-${suffix}`);
        tempStatusEl.innerText = tempStatus.text;
        tempStatusEl.className = `status ${tempStatus.class}`;

        const humiStatus = getHumidityStatus(humi);
        const humiStatusEl = document.getElementById(`humi-status-${suffix}`);
        humiStatusEl.innerText = humiStatus.text;
        humiStatusEl.className = `status ${humiStatus.class}`;

        const radStatus = getRadiationStatus(uSv);
        const usvStatusEl = document.getElementById(`usv-status-${suffix}`);
        usvStatusEl.innerText = radStatus.text;
        usvStatusEl.className = `status ${radStatus.class}`;
        
        if (lastUpdatedEl) lastUpdatedEl.innerText = `Cập nhật: ${new Date(timestamp).toLocaleTimeString('vi-VN')}`;
    });
}

function getTemperatureStatus(temp) {
    if (temp < 20) return { text: 'Mát mẻ', class: 'good' };
    if (temp >= 20 && temp < 30) return { text: 'Ấm', class: 'warning' };
    if (temp >= 30) return { text: 'Nóng', class: 'danger' };
    return { text: '--', class: '' };
}

function getHumidityStatus(humi) {
    if (humi < 30) return { text: 'Rất khô', class: 'danger' };
    if (humi >= 30 && humi < 50) return { text: 'Khô', class: 'warning' };
    if (humi >= 50 && humi <= 70) return { text: 'Lý tưởng', class: 'good' };
    if (humi > 70 && humi < 85) return { text: 'Ẩm', class: 'warning' };
    if (humi >= 85) return { text: 'Rất ẩm', class: 'danger' };
    return { text: '--', class: '' };
}

function getRadiationStatus(usv) {
    if (usv < 1) return { text: 'An toàn', class: 'good' };
    if (usv >= 1 && usv < 10) return { text: 'Cần theo dõi', class: 'warning' };
    if (usv >= 10) return { text: 'Mức cao', class: 'danger' };
    return { text: '--', class: '' };
}


// =================================================================
//                      KHỞI TẠO BIỂU ĐỒ
// =================================================================
// Các hàm initializeChartDefinitions, createChartConfig, setupCharts giữ nguyên như phiên bản trước
function initializeChartDefinitions() {
    // [SỬA LỖI] Guard Clause: Chỉ chạy nếu có canvas tương ứng
    if (!document.getElementById('temp-chart')) return;
    chartDefinitions = [
        { id: 'temp', ctx: document.getElementById('temp-chart').getContext('2d'), label: 'Nhiệt độ', dataKey: 'temperature' },
        { id: 'humi', ctx: document.getElementById('humi-chart').getContext('2d'), label: 'Độ ẩm', dataKey: 'humidity' },
        { id: 'rad', ctx: document.getElementById('rad-chart').getContext('2d'), label: 'Phóng xạ', dataKey: 'uSv' }
    ];
}
function createChartConfig(chartDef) {
    const theme = typeof getCurrentTheme === 'function' ? getCurrentTheme() : 'light';

    const datasets = stationIds.map(id => {
        const color = CONFIG.CHART_COLORS[id][theme];
        return {
            label: `Trạm ${id.slice(-2)}`, // [CẢI TIẾN] Nhãn đơn giản
            data: [],
            borderColor: color,
            backgroundColor: `${color}30`,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
        };
    });

    return {
        type: 'line',
        data: { labels: [], datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'time', time: { unit: 'hour' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } },
                y: { beginAtZero: false, grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: theme === 'dark' ? '#adb5bd' : '#6c757d', usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: theme === 'dark' ? '#21262d' : '#fff',
                    titleColor: theme === 'dark' ? '#58a6ff' : '#000',
                    bodyColor: theme === 'dark' ? '#c9d1d9' : '#000',
                    borderColor: theme === 'dark' ? '#30363d' : '#e1e4e8',
                    borderWidth: 1,
                    callbacks: {
                        label: context => {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y !== null ? context.parsed.y.toFixed(2) : '--';
                            const unit = chartDef.dataKey === 'temperature' ? '°C' : chartDef.dataKey === 'humidity' ? '%' : 'µSv/h';
                            return `${label}: ${value} ${unit}`;
                        }
                    }
                }
            }
        }
    };
}

function setupCharts() {
    if (chartDefinitions.length === 0) return;
    allCharts.forEach(chart => chart.destroy());
    allCharts = [];
    chartDefinitions.forEach(def => {
        const config = createChartConfig(def);
        const chart = new Chart(def.ctx, config);
        chart.definition = def;
        allCharts.push(chart);
    });
}

function setupIndividualChartControls() {
    // Chỉ thiết lập nếu có định nghĩa biểu đồ
    if (chartDefinitions.length === 0) return;

    chartDefinitions.forEach(def => {
        const filterButtons = document.querySelectorAll(`#filter-buttons-${def.id} button`);
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                def.currentView = btn.dataset.view;
                updateCharts(); 
            });
        });

        const btnAiHistory = document.getElementById(`btn-ai-history-${def.id}`);
        if (btnAiHistory) btnAiHistory.addEventListener('click', () => handleAiHistoryClick(def));
        
        const btnResetZoom = document.getElementById(`btn-reset-zoom-${def.id}`);
        if (btnResetZoom) btnResetZoom.addEventListener('click', () => {
            const chart = allCharts.find(c => c.definition.id === def.id);
            if (chart) chart.resetZoom();
        });

        // ✨ [MỚI] Gắn sự kiện cho nút xuất CSV của từng biểu đồ
        const exportBtn = document.getElementById(`btn-export-${def.id}`);
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const chartFilteredData = getFilteredDataForChart(def);
                if (chartFilteredData.length === 0) {
                    alert("Không có dữ liệu để xuất.");
                    return;
                }

                const rows = [
                    ['Thời gian', def.label] // Header
                ];

                chartFilteredData.forEach(item => {
                    const timestamp = new Date(item.timestamp).toLocaleString('vi-VN');
                    const value = item[def.dataKey];
                    rows.push([timestamp, value]);
                });

                exportToCsv(`du-lieu-${def.id}-${def.currentView}.csv`, rows);
            });
        }
    });
}

function setupHeatmapControls() {
    const filterButtons = document.querySelectorAll('#heatmap-filter-buttons button');
    if (!filterButtons.length) return;

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Không tải lại nếu đã active
            if (btn.classList.contains('active')) return;

            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const metric = btn.dataset.metric;
            fetchAndRenderHeatmap(metric);
        });
    });
}

function setupCollapsibleSections() {
    const toggleButton = document.getElementById('toggle-saved-analyses');
    if (!toggleButton) return;

    const section = toggleButton.closest('.saved-analyses-section');

    toggleButton.addEventListener('click', () => {
        section.classList.toggle('collapsed');
    });
}

function updateCharts() {
    const currentView = document.querySelector('.global-filter-buttons button.active')?.dataset.view || 'day';

    // ✨ [SỬA LỖI] Thêm "guard clause" để ngăn hàm chạy khi chưa có dữ liệu hoặc biểu đồ
    if (allCharts.length === 0) {
        return;
    }

    allCharts.forEach(chart => {
        const def = chart.definition;
        
        // Cập nhật dữ liệu cho từng trạm
        chart.data.datasets.forEach((dataset, index) => {
            const stationId = stationIds[index];
            // ✨ [SỬA LỖI] Lấy dữ liệu từ `historicalData` thay vì `stationData`
            const dataForStation = historicalData[stationId] || [];
            const filteredData = getFilteredData(dataForStation, currentView);
            dataset.data = filteredData.map(d => ({ x: d.timestamp, y: d[def.dataKey] })); // Đảm bảo đúng định dạng {x, y}
        });
        
        const timeUnit = { 
            '1d': 'hour', 
            '5d': 'day', 
            '1m': 'day', 
            '6m': 'month', 
            '1y': 'month' 
        }[currentView];

        chart.options.scales.x.time.unit = timeUnit;
        chart.options.scales.x.time.tooltipFormat = timeUnit === 'hour' ? 'HH:mm' : 'dd/MM/yy';
        chart.update('none'); 
    });
}

function createMockData() { 
    const data = []; const now = new Date();
    for (let i = 20; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 15 * 60 * 1000);
        data.push({ 
            timestamp: time.getTime(), 
            temperature: (22 + Math.random() * 4).toFixed(1),
            humidity: (65 + Math.random() * 10).toFixed(1),
            uSv: (0.1 + Math.random() * 0.2).toFixed(2)
        });
    }
    return data;
}

// ✨ [MỚI] Hàm này sẽ cập nhật tất cả các thành phần phụ thuộc vào fullDataset
function renderDependentComponents() {
    // [SỬA LỖI] Guard Clause: Chỉ chạy nếu ở trang evaluation
    if (!document.getElementById('daily-radiation-chart')) return;
    
    const dailyAverages = processDailyAverages(fullDataset);
    renderDailyRadiationChart(dailyAverages);
    
    const activeMonthlyMetric = document.querySelector('#monthly-metric-filter button.active')?.dataset.metric || 'temperature';
    renderMonthlyComparisonChart(activeMonthlyMetric);
}

// ✨ [MỚI] Hàm xử lý dữ liệu để tính trung bình hàng ngày
function processDailyAverages(data) {
    if (!data || data.length === 0) return [];

    const dailyStats = {};

    data.forEach(item => {
        const date = new Date(item.timestamp).toISOString().split('T')[0]; // Lấy ngày YYYY-MM-DD
        if (!dailyStats[date]) {
            dailyStats[date] = { totalRad: 0, count: 0 };
        }
        dailyStats[date].totalRad += item.uSv;
        dailyStats[date].count++;
    });

    const result = Object.keys(dailyStats).map(date => ({
        date: date,
        avgRad: dailyStats[date].totalRad / dailyStats[date].count
    }));

    // Sắp xếp và chỉ lấy 30 ngày gần nhất
    return result.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-30);
}

// ✨ [MỚI] Hàm vẽ biểu đồ phóng xạ trung bình hàng ngày
function renderDailyRadiationChart(dailyData) {
    const ctx = document.getElementById('daily-radiation-chart');
    if (!ctx) return;

    const labels = dailyData.map(d => new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
    const data = dailyData.map(d => d.avgRad);
    const theme = getCurrentTheme();
    const color = CONFIG.CHART_COLORS.radiation[theme];

    if (dailyRadiationChart) {
        dailyRadiationChart.destroy();
    }

    // Lưu instance của biểu đồ mới vào biến toàn cục
    dailyRadiationChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: getTranslation('chart_daily_radiation_avg', 'Phóng xạ Trung bình (µSv/h)'),
                data: data,
                backgroundColor: `${color}b3`,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.8
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: theme === 'dark' ? '#161b22' : '#ffffff',
                    titleColor: theme === 'dark' ? '#f0f6fc' : '#212529',
                    bodyColor: theme === 'dark' ? '#adb5bd' : '#495057',
                    borderColor: theme === 'dark' ? '#30363d' : '#e9ecef',
                    borderWidth: 1,
                    padding: 15,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        // Hiển thị ngày tháng đầy đủ trong tiêu đề tooltip
                        title: function(tooltipItems) {
                            const dataIndex = tooltipItems[0].dataIndex;
                            const fullDate = new Date(dailyData[dataIndex].date);
                            // Bù lại múi giờ để đảm bảo ngày hiển thị chính xác
                            fullDate.setUTCDate(fullDate.getUTCDate() + 1);
                            return `${getTranslation('chart_date', 'Ngày')}: ${fullDate.toLocaleDateString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US')}`;
                        },
                        // Tùy chỉnh nội dung của tooltip
                        label: function(context) {
                            const avgRad = context.raw;
                            return `${getTranslation('chart_average', 'Trung bình')}: ${avgRad.toFixed(3)} µSv/h`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } },
                y: { 
                    beginAtZero: true,
                    grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' },
                    ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' }
                }
            },
        }
    });
}

// ✨ [MỚI] Hàm xử lý dữ liệu để so sánh hàng tháng
function processMonthlyComparisonData(metric) {
    if (!fullDataset || fullDataset.length === 0) return { labels: [], data: [] };

    const monthlyStats = {};
    const dataKey = {
        temperature: 'temperature',
        humidity: 'humidity',
        radiation: 'uSv'
    }[metric];

    fullDataset.forEach(item => {
        const date = new Date(item.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM

        if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = { total: 0, count: 0 };
        }
        monthlyStats[monthKey].total += item[dataKey];
        monthlyStats[monthKey].count++;
    });

    const sortedKeys = Object.keys(monthlyStats).sort();

    const labels = sortedKeys.map(key => {
        const [year, month] = key.split('-');
        return `Thg ${month}/${year.slice(2)}`;
    });

    const data = sortedKeys.map(key => {
        return monthlyStats[key].total / monthlyStats[key].count;
    });

    return { labels, data };
}

// ✨ [MỚI] Hàm vẽ biểu đồ so sánh hàng tháng
function renderMonthlyComparisonChart(metric = 'temperature') {
    const ctx = document.getElementById('monthly-comparison-chart');
    if (!ctx) return;

    const { labels, data } = processMonthlyComparisonData(metric);
    const theme = getCurrentTheme();
    // ✨ [SỬA LỖI] Chọn một màu mặc định (ví dụ: của trạm 1) cho biểu đồ tổng hợp
    // vì nó không thuộc về một trạm cụ thể nào.
    const color = CONFIG.CHART_COLORS['station_01'][theme];
    const unitLabel = getTranslation(`chart_${metric}`, metric);

    if (monthlyComparisonChart) {
        monthlyComparisonChart.destroy();
    }

    monthlyComparisonChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `${getTranslation('chart_monthly_avg', 'Trung bình Tháng')} ${unitLabel}`,
                data: data,
                backgroundColor: `${color}b3`,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: theme === 'dark' ? '#161b22' : '#ffffff',
                    titleColor: theme === 'dark' ? '#f0f6fc' : '#212529',
                    bodyColor: theme === 'dark' ? '#adb5bd' : '#495057',
                    borderColor: theme === 'dark' ? '#30363d' : '#e9ecef',
                    borderWidth: 1,
                    padding: 15,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `${getTranslation('chart_average', 'Trung bình')}: ${value.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: { 
                x: { ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } },
                y: { 
                    beginAtZero: true,
                    grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' },
                    ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' }
                }
            }
        }
    });
}
// =================================================================
//                      CÁC HÀM PHÂN TÍCH & TRANG KHÁC
// =================================================================
// ✨ [MỚI] Các hàm để lưu và tải dữ liệu từ sessionStorage
function saveDatasetToSession() {
    try {
        // Chỉ lưu tối đa 5000 điểm dữ liệu gần nhất để tránh đầy sessionStorage
        const dataToStore = fullDataset.slice(-5000);
        sessionStorage.setItem('fullDataset', JSON.stringify(dataToStore));
    } catch (e) {
        console.error("Lỗi khi lưu dữ liệu vào sessionStorage:", e);
    }
}

function loadDatasetFromSession() {
    try {
        const storedData = sessionStorage.getItem('fullDataset');
        if (storedData) {
            fullDataset = JSON.parse(storedData);
            console.log(`Đã tải ${fullDataset.length} điểm dữ liệu từ sessionStorage.`);
            return true;
        }
    } catch (e) {
        console.error("Lỗi khi tải dữ liệu từ sessionStorage:", e);
        sessionStorage.removeItem('fullDataset'); // Xóa dữ liệu hỏng
    }
    return false;
}

// ✨ [MỚI] Hàm tiện ích để xuất dữ liệu ra file CSV
function exportToCsv(filename, rows) {
    // BOM (Byte Order Mark) để Excel nhận dạng đúng ký tự UTF-8
    const BOM = '\uFEFF';
    
    const processRow = row => row.map(val => {
        let finalVal = val === null ? '' : val.toString();
        // Escape dấu ngoặc kép bằng cách nhân đôi chúng
        if (finalVal.includes('"')) {
            finalVal = finalVal.replace(/"/g, '""');
        }
        // Đặt trong dấu ngoặc kép nếu chứa dấu phẩy, xuống dòng, hoặc ngoặc kép
        if (finalVal.includes(',') || finalVal.includes('\n') || finalVal.includes('"')) {
            finalVal = `"${finalVal}"`;
        }
        return finalVal;
    }).join(',');

    const csvContent = rows.map(processRow).join('\n');
    
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    if (link.download !== undefined) { // Kiểm tra tính năng
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// ✨ [MỚI] Các hàm để xử lý việc xóa phân tích
async function handleDeleteAnalysis(analysisId) {
    if (!confirm('Bạn có chắc chắn muốn xóa phân tích này không?')) {
        return;
    }

    try {
        // Gọi API với phương thức DELETE, truyền ID qua URL
        const response = await fetch(`${CONFIG.API_ENDPOINT_DELETE_ANALYSIS}/${analysisId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Yêu cầu xóa thất bại');
        }

        alert('Đã xóa phân tích thành công!');
        
        // Xóa mục khỏi giao diện
        const itemToRemove = document.querySelector(`li[data-id='${analysisId}']`);
        if (itemToRemove) {
            itemToRemove.remove();
        }

        // Kiểm tra xem danh sách có còn trống không
        const listElement = document.getElementById('saved-analyses-list');
        if (listElement && !listElement.querySelector('li')) {
             listElement.innerHTML = '<p class="placeholder">Chưa có phân tích nào được lưu.</p>';
        }

    } catch (error) {
        console.error("Lỗi khi xóa phân tích:", error);
        alert('Xóa phân tích thất bại.');
    }
}

// ✨ [MỚI] Các hàm để xử lý việc chỉnh sửa phân tích
function handleEditClick(event) {
    const editButton = event.target.closest('.btn-edit-analysis');
    if (!editButton) return;

    const listItem = editButton.closest('li');
    const contentDiv = listItem.querySelector('.analysis-content');
    const actionsDiv = listItem.querySelector('.analysis-actions');

    // Lưu nội dung gốc phòng trường hợp hủy
    const originalContent = contentDiv.innerHTML;

    // Chuyển sang chế độ chỉnh sửa
    contentDiv.contentEditable = true;
    contentDiv.focus();
    contentDiv.classList.add('editing');

    // Hiển thị các nút Lưu/Hủy
    actionsDiv.innerHTML = `
        <button class="btn-save-edit">Lưu</button>
        <button class="btn-cancel-edit">Hủy</button>
    `;

    // Gắn sự kiện cho nút Lưu
    actionsDiv.querySelector('.btn-save-edit').onclick = async () => {
        const newContent = contentDiv.innerHTML;
        const analysisId = listItem.dataset.id;
        
        try {
            const response = await fetch(`${CONFIG.API_ENDPOINT_UPDATE_ANALYSIS}/${analysisId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysisText: newContent })
            });
            if (!response.ok) throw new Error('Cập nhật thất bại');
            
            alert('Đã cập nhật phân tích thành công!');
            contentDiv.contentEditable = false;
            contentDiv.classList.remove('editing');
            actionsDiv.innerHTML = `<button class="btn-edit-analysis" title="Chỉnh sửa">Chỉnh sửa</button>`;
        } catch (error) {
            alert('Lỗi: Không thể cập nhật phân tích.');
            console.error(error);
        }
    };

    // Gắn sự kiện cho nút Hủy
    actionsDiv.querySelector('.btn-cancel-edit').onclick = () => {
        contentDiv.innerHTML = originalContent;
        contentDiv.contentEditable = false;
        contentDiv.classList.remove('editing');
        actionsDiv.innerHTML = `<button class="btn-edit-analysis" title="Chỉnh sửa">Chỉnh sửa</button>`;
    };
}

function handleDeleteClick(event) {
    const deleteButton = event.target.closest('.btn-delete-analysis');
    if (deleteButton) {
        const analysisId = deleteButton.closest('li').dataset.id;
        handleDeleteAnalysis(analysisId);
    }
}

async function loadSavedAnalyses() {
    const listElement = document.getElementById('saved-analyses-list');
    if (!listElement) return;

    listElement.innerHTML = '<p class="placeholder">Đang tải nhật ký...</p>';
    try {
        const response = await fetch(CONFIG.API_ENDPOINT_GET_ANALYSES);
        if (!response.ok) throw new Error('Failed to load');
        const analyses = await response.json();

        if (analyses.length === 0) {
            listElement.innerHTML = '<p class="placeholder">Chưa có phân tích nào được lưu.</p>';
            return;
        }

        let html = '<ul>';
        analyses.forEach(item => {
            const savedDate = new Date(item.savedAt * 1000);
            // Thêm data-id vào thẻ li và nút xóa
            html += `
                <li data-id="${item.id}">
                    <div class="analysis-item-header">
                        <strong>${item.dataType}</strong> - <em>Lưu lúc: ${savedDate.toLocaleString('vi-VN')}</em>
                        <div class="analysis-item-actions">
                            <button class="btn-edit-analysis" title="Chỉnh sửa">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button class="btn-delete-analysis" title="Xóa phân tích">×</button>
                        </div>
                    </div>
                    <div class="analysis-content">${item.analysisText}</div>
                </li>
            `;
        });
        html += '</ul>';
        listElement.innerHTML = html;
        // Sử dụng event delegation để xử lý sự kiện click cho tất cả các nút xóa
        listElement.addEventListener('click', (e) => { handleDeleteClick(e); handleEditClick(e); });

    } catch (error) {
        listElement.innerHTML = '<p class="error">Lỗi: Không thể tải nhật ký phân tích.</p>';
    }
}

// =================================================================
//                   ✨ GEMINI API LOGIC
// =================================================================
async function callGeminiAPI(prompt) {
    if (CONFIG.GEMINI_API_KEY === "YOUR_API_KEY_HERE" || !CONFIG.GEMINI_API_KEY) {
        return "<p class='error'>Lỗi: Vui lòng cung cấp API Key của Gemini trong tệp script.js.</p>";
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Lỗi từ Gemini API: ${errorData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content.parts[0]) {
            return result.candidates[0].content.parts[0].text.replace(/```html|```/g, '').trim();
        } else {
            return "Không nhận được phản hồi hợp lệ từ AI.";
        }
    } catch (error) {
        console.error("Không thể gọi Gemini API:", error);
        throw error;
    }
}

function showLoading(element) {
    element.innerHTML = '<div class="loader"></div><p>AI đang phân tích, vui lòng chờ...</p>';
}

async function handleAiSummaryClick() {
    const summaryContent = document.getElementById('ai-summary-content');
    if (!summaryContent) return;

    if (!fullDataset || fullDataset.length === 0) {
        summaryContent.innerHTML = '<p class="placeholder">Chưa có dữ liệu để phân tích.</p>';
        return;
    }
    
    showLoading(summaryContent);
    
    const latestData = fullDataset[fullDataset.length - 1];
    const prompt = `
        Bạn là một chuyên gia phân tích dữ liệu môi trường, đưa ra nhận xét và khuyến nghị bằng tiếng Việt.
        Dựa trên dữ liệu thời gian thực sau:
        - Nhiệt độ: ${latestData.temperature.toFixed(1)} °C
        - Độ ẩm: ${latestData.humidity.toFixed(1)} %
        - Phóng xạ: ${latestData.uSv.toFixed(3)} µSv/h

        Hãy trả về một đoạn mã HTML được định dạng đẹp mắt. Cấu trúc phải bao gồm:
        1.  Một thẻ <h4> với nội dung "Tình hình Hiện tại".
        2.  Một đoạn văn <p> tóm tắt tình hình.
        3.  Một thẻ <h4> với nội dung "Khuyến nghị".
        4.  Một danh sách không có thứ tự <ul> với các mục <li> là các khuyến nghị cụ thể. Mỗi khuyến nghị nên bắt đầu bằng một emoji phù hợp.
        
        Sử dụng thẻ <strong> để nhấn mạnh các giá trị số và các từ quan trọng.
        Ví dụ cho một khuyến nghị: \`<li>💧 Uống đủ nước để giữ cơ thể không bị mất nước.</li>\`
        Không bao gồm thẻ \`<html>\` hay \`<body>\` trong phản hồi.
    `;

    try {
        const result = await callGeminiAPI(prompt);
        summaryContent.innerHTML = result;
    } catch (error) {
        summaryContent.innerHTML = `<p class="error">Lỗi: Không thể nhận phân tích từ AI.</p>`;
    }
}

async function handleAiHistoryClick(chartDef) {
    const modal = document.getElementById('ai-modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) return;


    const filteredData = getFilteredDataForChart(chartDef);

    if (!filteredData || filteredData.length === 0) {
        alert("Chưa có dữ liệu lịch sử để phân tích.");
        return;
    }

    // ✨ [SỬA LỖI] Sử dụng class để hiển thị modal, kích hoạt animation
    modal.classList.add('show');
    showLoading(modalBody);

    const dataPoints = filteredData.map(d => d[chartDef.dataKey]);
    
    const stats = {
        min: Math.min(...dataPoints).toFixed(1),
        max: Math.max(...dataPoints).toFixed(1),
        avg: (dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length).toFixed(1)
    };

    const timeRangeText = { 'day': '24 giờ qua', 'month': '30 ngày qua', 'year': 'năm qua' }[chartDef.currentView];
    const unit = chartDef.label.match(/\(([^)]+)\)/)[1];

    const prompt = `
        Bạn là một chuyên gia phân tích dữ liệu môi trường. Phân tích dữ liệu lịch sử cho ${chartDef.label} trong ${timeRangeText}:
        - Tối thiểu: ${stats.min} ${unit}
        - Tối đa: ${stats.max} ${unit}
        - Trung bình: ${stats.avg} ${unit}

        Hãy trả về một đoạn mã HTML đẹp mắt với cấu trúc:
        1.  <h4>Tổng quan Xu hướng</h4>
        2.  <p>Mô tả xu hướng chính.</p>
        3.  <h4>Điểm Đáng Chú ý</h4>
        4.  <ul> với các <li> nêu bật điểm quan trọng, bắt đầu bằng emoji.
        
        Sử dụng <strong> để nhấn mạnh. Không bao gồm thẻ <html> hay <body>.
    `;

    try {
        const result = await callGeminiAPI(prompt);
        modalBody.innerHTML = result;
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Lưu Phân tích này';
        saveButton.className = 'btn-save-analysis';
        saveButton.onclick = () => saveAnalysis(result, `${chartDef.label} - ${timeRangeText}`);
        modalBody.appendChild(saveButton);
    } catch (error) {
        modalBody.innerHTML = `<p class="error">Lỗi: Không thể nhận phân tích từ AI.</p>`;
    }
}

// ✨ [SỬA LỖI] Hợp nhất và hoàn thiện hàm để xử lý các nút điều khiển
function setupMonthlyComparisonControls() {
    const filterButtons = document.querySelectorAll('#monthly-metric-filter button');
    if (filterButtons.length > 0) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('active')) return;
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const metric = btn.dataset.metric;
                renderMonthlyComparisonChart(metric);
            });
        });
    }

    // Gắn sự kiện cho nút xuất CSV của biểu đồ so sánh tháng
    const exportBtn = document.getElementById('btn-export-monthly');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const activeMetric = document.querySelector('#monthly-metric-filter button.active')?.dataset.metric || 'temperature';
            const { labels, data } = processMonthlyComparisonData(activeMetric);

            if (data.length === 0) {
                alert("Không có dữ liệu để xuất.");
                return;
            }

            const unitLabel = { temperature: 'Nhiệt độ (°C)', humidity: 'Độ ẩm (%)', radiation: 'Phóng xạ (µSv/h)' }[activeMetric];
            const rows = [
                ['Tháng', `Trung bình ${unitLabel}`] // Header
            ];

            labels.forEach((label, index) => {
                rows.push([label, data[index].toFixed(2)]);
            });

            exportToCsv(`so-sanh-hang-thang-${activeMetric}.csv`, rows);
        });
    }
}

function setupGlobalEventListeners() {
    const btnPauseResume = document.getElementById('btn-pause-resume');
    if (btnPauseResume) btnPauseResume.addEventListener('click', handlePauseResumeClick);

    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) btnDownload.addEventListener('click', () => {
        // Chuẩn bị dữ liệu để xuất
        const exportData = {
            timestamp: new Date().toISOString(),
            data: fullDataset.map(item => ({
                timestamp: new Date(item.timestamp).toISOString(),
                temperature: item.temperature,
                humidity: item.humidity,
                radiation: item.uSv
            }))
        };

        // Tạo và tải file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sensor-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    });

    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', () => {
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
            if (!document.fullscreenElement) {
                // Vào chế độ toàn màn hình
                if (chartContainer.requestFullscreen) {
                    chartContainer.requestFullscreen();
                } else if (chartContainer.webkitRequestFullscreen) {
                    chartContainer.webkitRequestFullscreen();
                } else if (chartContainer.msRequestFullscreen) {
                    chartContainer.msRequestFullscreen();
                }
            } else {
                // Thoát chế độ toàn màn hình
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        }
    });

    const btnAiSummary = document.getElementById('btn-ai-summary');
    if (btnAiSummary) btnAiSummary.addEventListener('click', handleAiSummaryClick);

    const btnFetchHistory = document.getElementById('btn-fetch-history');
    if (btnFetchHistory) btnFetchHistory.addEventListener('click', handleFetchHistory);

    // Modal listeners
    // ✨ [SỬA LỖI] Cập nhật logic đóng modal để sử dụng class, kích hoạt animation
    const modal = document.getElementById('ai-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    if (modal) {
        const closeModal = () => modal.classList.remove('show');

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeModal);
        }

        // Thêm sự kiện để đóng modal khi click vào nền mờ (overlay)
        modal.addEventListener('click', (event) => {
            // Chỉ đóng nếu click trực tiếp vào overlay, không phải vào content bên trong
            if (event.target === modal) {
                closeModal();
            }
        });
    }
}

function handlePauseResumeClick() {
    const button = document.getElementById('btn-pause-resume');
    if (!button) return;

    const statusIndicator = document.querySelector('.station-status .status-indicator');

    if (dataFetchInterval) {
        clearInterval(dataFetchInterval);
        dataFetchInterval = null;
        button.classList.add('paused');
        button.title = "Tiếp tục cập nhật";
        if (statusIndicator) {
            statusIndicator.style.animation = 'none';
            statusIndicator.style.backgroundColor = '#6c757d';
        }
    } else {
        dataFetchInterval = setInterval(fetchData, CONFIG.UPDATE_INTERVAL);
        button.classList.remove('paused');
        button.title = "Tạm dừng cập nhật";
        if (statusIndicator) {
            statusIndicator.style.animation = '';
            statusIndicator.style.backgroundColor = '';
        }
    }
}
// HÀM THỐNG KÊ 
async function saveAnalysis(analysisText, dataType) {
    try {
        const response = await fetch(CONFIG.API_ENDPOINT_SAVE_ANALYSIS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysisText, dataType })
        });
        if (!response.ok) throw new Error('Failed to save');
        alert('Đã lưu phân tích thành công!');
        loadSavedAnalyses();
    } catch (error) {
        console.error("Lỗi khi lưu phân tích:", error);
        alert('Lưu phân tích thất bại.');
    }
}
async function handleFetchHistory() {
    const datePicker = document.getElementById('history-date-picker');
    const resultsDiv = document.getElementById('history-results');
    if (!datePicker || !resultsDiv) return;

    const selectedDate = datePicker.value;

    if (!selectedDate) {
        resultsDiv.innerHTML = `<p class="error">Vui lòng chọn một ngày.</p>`;
        return;
    }

    showLoading(resultsDiv);

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dataForDay = fullDataset.filter(d => 
        d.timestamp >= startOfDay.getTime() && d.timestamp <= endOfDay.getTime()
    );

    if (dataForDay.length === 0) {
        resultsDiv.innerHTML = `<p class="placeholder">Không tìm thấy dữ liệu cho ngày đã chọn.</p>`;
        return;
    }

    // Rút gọn dữ liệu để gửi đi, tránh quá tải
    const simplifiedData = dataForDay.map(d => ({
        t: new Date(d.timestamp).toLocaleTimeString('vi-VN'),
        temp: d.temperature,
        humi: d.humidity,
        rad: d.uSv
    }));

    const prompt = `
        Bạn là một trợ lý phân tích, tóm tắt lại các sự kiện từ dữ liệu của trạm quan trắc trong ngày ${selectedDate}.
        Dữ liệu được cung cấp dưới dạng một chuỗi JSON các điểm dữ liệu rút gọn (t: thời gian, temp: nhiệt độ, humi: độ ẩm, rad: phóng xạ).

        Dữ liệu: ${JSON.stringify(simplifiedData)}

        Dựa vào dữ liệu trên, hãy tạo một báo cáo HTML với các phần sau:
        1.  <h4>Tổng kết trong ngày</h4>: Một đoạn văn <p> tóm tắt chung về điều kiện môi trường.
        2.  <h4>Sự kiện Nổi bật</h4>: Một danh sách <ul> các sự kiện quan trọng nhất, ví dụ: nhiệt độ cao nhất/thấp nhất, độ ẩm cao nhất/thấp nhất, mức phóng xạ cao nhất được ghi nhận.
        3.  <h4>Nhật ký Cảnh báo</h4>: Một danh sách <ul>, trong đó mỗi <li> ghi lại thời gian và chi tiết mỗi khi một chỉ số vượt ngưỡng 'Ấm'/'Khô' (warning) hoặc 'Nóng'/'Rất khô'/'Mức cao' (danger). Ví dụ: "<li><strong>14:35:</strong> Nhiệt độ tăng lên <strong>30.5°C</strong> (Nóng).</li>". Nếu không có cảnh báo, hãy ghi "Không có cảnh báo nào được ghi nhận."

        Sử dụng emoji phù hợp cho mỗi mục. Định dạng chuyên nghiệp, dễ đọc.
    `;

    try {
        const result = await callGeminiAPI(prompt);
        resultsDiv.innerHTML = result;
    } catch (error) {
        resultsDiv.innerHTML = `<p class="error">Lỗi: Không thể nhận phân tích từ AI.</p>`;
    }
}
// ✨ [MỚI] Hàm cập nhật tiêu đề và chú thích của biểu đồ nhiệt
function updateHeatmapUI(metric) {
    const titleEl = document.getElementById('heatmap-title');
    const legendEl = document.getElementById('heatmap-legend');
    if (!titleEl || !legendEl) return;

    if (metric === 'temperature') {
        titleEl.innerHTML = '🌡️ Tổng quan Nhiệt độ Năm';
        legendEl.innerHTML = `
            <span class="legend-text">Mát</span>
            <div class="legend-color" style="background-color: #1c7ed6;"></div>
            <div class="legend-color" style="background-color: #f59f00;"></div>
            <div class="legend-color" style="background-color: #f03e3e;"></div>
            <span class="legend-text">Nóng</span>
        `;
    } else if (metric === 'humidity') {
        titleEl.innerHTML = '💧 Tổng quan Độ ẩm Năm';
        legendEl.innerHTML = `
            <span class="legend-text">Khô</span>
            <div class="legend-color" style="background-color: #f03e3e;"></div>
            <div class="legend-color" style="background-color: #f59f00;"></div>
            <div class="legend-color" style="background-color: #1c7ed6;"></div>
            <span class="legend-text">Ẩm</span>
        `;
    }
}

// ✨ [MỚI] Hàm chuyên để tải dữ liệu cho biểu đồ nhiệt từ API
async function loadHeatmapData(metric = 'temperature') {
    try {
        const response = await fetch(`${CONFIG.API_ENDPOINT_YEARLY_DATA}?metric=${metric}`);
        if (!response.ok) {
            // Ném lỗi với thông tin chi tiết để hàm gọi có thể xử lý
            throw new Error(`Không thể tải dữ liệu: ${response.statusText}`);
        }
        const data = await response.json();
        console.log(`Dữ liệu heatmap nhận được cho metric '${metric}':`, data);
        return data;
    } catch (error) {
        console.error(`Lỗi khi tải dữ liệu heatmap cho metric '${metric}':`, error);
        // Ném lại lỗi để hàm gọi biết rằng đã có sự cố
        throw error;
    }
}

// Hàm xử lý việc hiển thị biểu đồ nhiệt, gọi hàm loadHeatmapData để lấy dữ liệu
async function fetchAndRenderHeatmap(metric = 'temperature') {
    const heatmapContainer = document.getElementById('cal-heatmap');
    if (!heatmapContainer) return; // Chỉ chạy nếu có phần tử heatmap

    // Cập nhật giao diện (tiêu đề, chú thích) cho metric được chọn
    updateHeatmapUI(metric);

    // Hiển thị trạng thái đang tải
    heatmapContainer.innerHTML = '<p class="placeholder">Đang tải dữ liệu biểu đồ nhiệt...</p>';

    try {
        const data = await loadHeatmapData(metric);

        // Kiểm tra nếu không có dữ liệu
        if (!data || data.length === 0) {
            console.warn("Cảnh báo: API không trả về dữ liệu cho biểu đồ nhiệt. Vui lòng kiểm tra Lambda 'aggregate-daily-data' và bảng 'DailyAggregates' trên AWS.");
            heatmapContainer.innerHTML = '<p class="placeholder">Không có dữ liệu tổng hợp để hiển thị.</p>';
            return; // Dừng lại nếu không có dữ liệu
        }

        // Ghi log dữ liệu ngay trước khi vẽ để kiểm tra lần cuối
        console.log("Dữ liệu hợp lệ, chuẩn bị vẽ heatmap:", data.slice(0, 5)); // Log 5 mục đầu tiên

        // Xóa trạng thái đang tải trước khi vẽ
        heatmapContainer.innerHTML = ''; 
        initHeatmap(data, metric);

    } catch (error) {
        // Lỗi đã được ghi lại trong loadHeatmapData, ở đây chỉ cần cập nhật giao diện
        heatmapContainer.innerHTML = '<p class="error">Lỗi: Không thể hiển thị biểu đồ nhiệt.</p>';
    }
}

//HÀM VẼ HEATMAP
function initHeatmap(data, metric) {
    const heatmapElement = document.getElementById('cal-heatmap');
    if (!heatmapElement) return;

    // ✨ [SỬA LỖI] Hủy instance cũ của biểu đồ nhiệt trước khi vẽ lại
    if (calendar) {
        calendar.destroy();
    }

    // ✨ [CẢI TIẾN] Sử dụng thang màu định sẵn để gỡ lỗi và đảm bảo tính tương thích
    let colorScheme, domain;
    if (metric === 'temperature') {
        colorScheme = 'YlGnBu';
        domain = [15, 25, 35]; // Miền giá trị cho nhiệt độ
    } else { // humidity
        colorScheme = 'YlOrRd';
        domain = [40, 60, 80]; // Miền giá trị cho độ ẩm
    }

    calendar = new CalHeatmap();
    calendar.paint({
        data: {
            source: data, // Dữ liệu từ API, có dạng [{date: "YYYY-MM-DD", value: 28.5}, ...]
            x: 'date',
            y: 'value'
        },
        date: { start: new Date(new Date().getFullYear(), 0, 1) }, // Bắt đầu từ đầu năm
        range: 12, // Hiển thị 12 tháng
        scale: {
            color: {
                type: 'quantize', // Phân chia miền giá trị thành các khoảng màu
                scheme: colorScheme,
                domain: domain
            }
        },
        domain: {
            type: 'month',
            gutter: 4,
            label: { text: 'MMM', textAlign: 'start', position: 'top' }
        },
        subDomain: { type: 'ghDay', radius: 2, width: 11, height: 11, gutter: 4 },
        itemSelector: heatmapElement
    });
}

async function fetchDeviceStatus() {
    const container = document.getElementById('device-status-content');
    if (!container) return;

    try {
        const response = await fetch(CONFIG.API_ENDPOINT_DEVICE_STATUS);
        if (!response.ok) throw new Error('Failed to fetch status');
        const statusData = await response.json();

        // ✨ [SỬA LỖI] Kiểm tra trạng thái 'online' thay vì 'connected' để khớp với phản hồi từ API.
        const isConnected = statusData.status === 'online'; 
        const statusClass = isConnected ? 'connected' : 'disconnected';
        
        const lang = getLanguage();
        // ✨ [SỬA LỖI] Xóa định nghĩa getTranslation cục bộ, sử dụng hàm toàn cục
        const statusText = isConnected 
            ? getTranslation('status_connected', 'Đã kết nối') 
            : getTranslation('status_disconnected', 'Mất kết nối');

        const icon = isConnected 
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
        
        // ✨ [CẢI TIẾN] Hiển thị thông tin chi tiết từ API nếu có.
        let detailsHtml = '';
        if (statusData.details) {
            detailsHtml = `<p><strong>${getTranslation('status_details', 'Chi tiết')}:</strong> ${statusData.details}</p>`;
        } else if (statusData.lastSeen) {
            const lastSeen = new Date(statusData.lastSeen * 1000).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
            detailsHtml = `
                <p><strong>${getTranslation('device_id', 'ID Thiết bị')}:</strong> ${statusData.deviceId}</p>
                <p><strong>${getTranslation('last_seen', 'Lần cuối kết nối')}:</strong> ${lastSeen}</p>
            `;
        }

        container.innerHTML = `
            <div class="device-status-indicator ${statusClass}">
                ${icon}
            </div>
            <p class="device-status-text ${statusClass}">${statusText}</p>
            <div class="device-status-details">
                ${detailsHtml}
            </div>
        `;

    } catch (error) {
        console.error("Lỗi khi tải trạng thái thiết bị:", error);
        container.innerHTML = `<p class="error">Không thể tải trạng thái thiết bị.</p>`;
    }
}

async function fetchSystemLogs() {
    const container = document.getElementById('system-logs-content');
    const refreshBtn = document.getElementById('refresh-logs-btn');
    if (!container) return;

    container.innerHTML = '<p class="placeholder">Đang tải nhật ký...</p>';
    if (refreshBtn) refreshBtn.classList.add('loading');

    try {
        const response = await fetch(CONFIG.API_ENDPOINT_SYSTEM_LOGS);
        if (!response.ok) throw new Error('Failed to fetch logs');
        const logs = await response.json();

        if (logs.length === 0) {
            container.innerHTML = '<p class="placeholder">Không có nhật ký hệ thống nào.</p>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const timestamp = new Date(log.timestamp * 1000).toLocaleString('vi-VN');
            html += `
                <div class="log-item">
                    <span class="log-timestamp">${timestamp}</span>
                    <span class="log-level ${log.level}">${log.level}</span>
                    <span class="log-message">${log.message}</span>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error("Lỗi khi tải nhật ký hệ thống:", error);
        container.innerHTML = `<p class="error">Không thể tải nhật ký hệ thống.</p>`;
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('loading');
    }
}
// ✨ [MỚI] Hàm này sẽ được gọi bởi main.js khi theme thay đổi
function updateDashboardTheme(theme) {
    if (typeof setupCharts === 'function') {
        setupCharts();
    }
    // ✨ [CẢI TIẾN] Vẽ lại các biểu đồ để áp dụng theme mới một cách toàn diện
    // Cách này đảm bảo tất cả các style, bao gồm cả gradient, được cập nhật chính xác.
    if (document.getElementById('temp-chart')) {
        setupCharts(); // Hủy và tạo lại các biểu đồ đường với theme mới
        updateCharts(); // Điền dữ liệu vào biểu đồ mới đã được tạo lại
    }
    if (typeof updateUI === 'function') {
        updateUI();
    }
}
window.updateDashboardTheme = updateDashboardTheme;

function initializeChartDefinitions() {
    // [SỬA LỖI] Guard Clause: Chỉ chạy nếu có canvas tương ứng
    if (!document.getElementById('temp-chart')) return;
    chartDefinitions = [
        { id: 'temp', ctx: document.getElementById('temp-chart').getContext('2d'), label: 'Nhiệt độ', dataKey: 'temperature' },
        { id: 'humi', ctx: document.getElementById('humi-chart').getContext('2d'), label: 'Độ ẩm', dataKey: 'humidity' },
        { id: 'rad', ctx: document.getElementById('rad-chart').getContext('2d'), label: 'Phóng xạ', dataKey: 'uSv' }
    ];
}

function createChartConfig(chartDef) {
    const theme = typeof getCurrentTheme === 'function' ? getCurrentTheme() : 'light';

    const datasets = stationIds.map(id => {
        const color = CONFIG.CHART_COLORS[id][theme];
        return {
            label: `Trạm ${id.slice(-2)}`, // [CẢI TIẾN] Nhãn đơn giản
            data: [],
            borderColor: color,
            backgroundColor: `${color}30`,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
        };
    });

    return {
        type: 'line',
        data: { labels: [], datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'time', time: { unit: 'hour' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } },
                y: { beginAtZero: false, grid: { color: theme === 'dark' ? '#30363d' : '#e9ecef' }, ticks: { color: theme === 'dark' ? '#adb5bd' : '#6c757d' } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: theme === 'dark' ? '#adb5bd' : '#6c757d', usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    // ... Tooltip options giữ nguyên ...
                }
            }
        }
    };
}

// =================================================================
//                      KHỞI TẠO & GẮN SỰ KIỆN
// =================================================================

function setupGlobalChartFilters() {
    const filterButtons = document.querySelectorAll('.global-filter-buttons button');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            fetchHistoricalData(currentView); // Gọi hàm lấy dữ liệu lịch sử
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Ưu tiên hiển thị dữ liệu từ session trước
    const hasSessionData = loadDatasetFromSession();
    if (hasSessionData) {
        // Tạm giả định dữ liệu session thuộc về cả hai trạm để hiển thị
        historicalData.station_01 = fullDataset;
        historicalData.station_02 = fullDataset;
        stationData.station_01 = fullDataset.length > 0 ? [fullDataset[fullDataset.length - 1]] : [];
        stationData.station_02 = fullDataset.length > 0 ? [fullDataset[fullDataset.length - 1]] : [];
        updateUI();
        renderDependentComponents();
    }
    
    // Khởi tạo các thành phần giao diện
    initializeChartDefinitions();
    setupCharts();
    
    // Gắn các sự kiện
    setupGlobalEventListeners();
    setupGlobalChartFilters();
    setupIndividualChartControls();
    setupHeatmapControls();
    setupCollapsibleSections();
    
    // Tải dữ liệu phân tích đã lưu
    loadSavedAnalyses();
    
    // Tải dữ liệu ban đầu
    fetchData(); // Lấy dữ liệu live mới nhất
    fetchHistoricalData(currentView); // Tải dữ liệu lịch sử ban đầu cho chế độ xem mặc định
    
    // Bắt đầu chu trình cập nhật live
    if (document.querySelector('.dashboard-grid')) {
        dataFetchInterval = setInterval(fetchData, CONFIG.UPDATE_INTERVAL);
    }
});

function updateDashboardTheme() {
    setupCharts(); 
    updateUI();
}
window.updateDashboardTheme = updateDashboardTheme;