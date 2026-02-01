// Import các cấu hình
const API_BASE_URL = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com';
const CONFIG = {
    // ✨ [SỬA LỖI] Sử dụng endpoint /analyze-data đã được cấu hình đúng ở backend
    API_ENDPOINT_ANALYSIS: `${API_BASE_URL}/analyze-data`,
    CHART_COLORS: {
        // ✨ [SỬA LỖI] Cập nhật tên trạm để khớp với dữ liệu thật
        station_01: '#007aff',
        station_02: '#34c759',
        station_03: '#ff9500',
        station_04: '#ff2d55'
    }
};

document.addEventListener('DOMContentLoaded', function () {
    // Initialize variables
    let chart = null;
    let currentData = null;

    // Initialize components
    initializeStationCheckboxes();
    initializeDateInputs();
    setupEventListeners();

    // Initialize chart
    const ctx = document.getElementById('dataChart').getContext('2d');

    function initializeStationCheckboxes() {
        const selectAllCheckbox = document.getElementById('selectAllStations');
        const stationCheckboxes = document.querySelectorAll('.station-checkbox');

        selectAllCheckbox.addEventListener('change', function () {
            stationCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });

        stationCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                const allChecked = Array.from(stationCheckboxes).every(cb => cb.checked);
                selectAllCheckbox.checked = allChecked;
            });
        });
    }

    function initializeDateInputs() {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        document.getElementById('startDate').value = formatDateTime(oneWeekAgo);
        document.getElementById('endDate').value = formatDateTime(now);
    }

    function setupEventListeners() {
        document.getElementById('fetchData').addEventListener('click', fetchData);
        document.getElementById('exportData').addEventListener('click', exportToCSV);
        document.getElementById('chartType').addEventListener('change', updateChart);
        document.getElementById('dataParameter').addEventListener('change', updateChart);
        document.getElementById('resetZoomBtn').addEventListener('click', resetChartZoom);
        // ✨ [MỚI] Gắn sự kiện cho chức năng nhập dữ liệu
        document.getElementById('importDataBtn').addEventListener('click', () => document.getElementById('importDataFile').click());
        document.getElementById('importDataFile').addEventListener('change', handleFileUpload);
    }

    // ✨ [TỐI ƯU] Hằng số cấu hình chunking
    const CHUNK_SIZE_DAYS = 7; // Mỗi chunk 7 ngày
    const MAX_CONCURRENT_REQUESTS = 3; // Tối đa 3 request song song
    const REQUEST_TIMEOUT = 60000; // 60 giây mỗi request

    /**
     * ✨ [MỚI] Fetch một chunk dữ liệu
     */
    async function fetchChunk(startTime, endTime, stations, signal) {
        const response = await fetch(CONFIG.API_ENDPOINT_ANALYSIS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startTime,
                endDate: endTime,
                stations: stations
            }),
            signal: signal
        });

        if (!response.ok) {
            let errorMessage = `Lỗi HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) { }
            throw new Error(errorMessage);
        }

        const json = await response.json();
        return json.readings || [];
    }

    /**
     * ✨ [MỚI] Chia khoảng thời gian thành các chunks
     */
    function createTimeChunks(startTime, endTime, chunkSizeDays) {
        const chunks = [];
        const chunkSizeMs = chunkSizeDays * 24 * 60 * 60 * 1000;
        let currentStart = startTime;

        while (currentStart < endTime) {
            const currentEnd = Math.min(currentStart + chunkSizeMs, endTime);
            chunks.push({ start: currentStart, end: currentEnd });
            currentStart = currentEnd;
        }

        return chunks;
    }

    /**
     * ✨ [MỚI] Fetch song song với giới hạn concurrency
     */
    async function fetchWithConcurrencyLimit(chunks, stations, maxConcurrent, onProgress) {
        const allData = [];
        let completed = 0;
        let failed = 0;
        let chunkIndex = 0;

        // Xử lý từng batch tuần tự
        while (chunkIndex < chunks.length) {
            const batch = chunks.slice(chunkIndex, chunkIndex + maxConcurrent);
            const batchStartIndex = chunkIndex;

            const batchPromises = batch.map(async (chunk, idx) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

                try {
                    const data = await fetchChunk(chunk.start, chunk.end, stations, controller.signal);
                    clearTimeout(timeoutId);
                    completed++;
                    onProgress(completed, chunks.length, failed);
                    return data;
                } catch (error) {
                    clearTimeout(timeoutId);
                    failed++;
                    console.warn(`[Chunk ${batchStartIndex + idx}] Failed:`, error.message);
                    onProgress(completed, chunks.length, failed);
                    return []; // Trả về mảng rỗng để tiếp tục
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Gộp kết quả từng chunk một để tránh stack overflow
            for (const chunkData of batchResults) {
                if (Array.isArray(chunkData)) {
                    for (const item of chunkData) {
                        allData.push(item);
                    }
                }
            }

            chunkIndex += maxConcurrent;
        }

        return { data: allData, completed, failed };
    }

    async function fetchData() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const selectedStations = getSelectedStations();

        if (!startDate || !endDate) {
            alert('Vui lòng chọn khoảng thời gian');
            return;
        }

        if (selectedStations.length === 0) {
            alert('Vui lòng chọn ít nhất một trạm');
            return;
        }

        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

        // Cảnh báo nếu khoảng thời gian rất dài
        if (daysDiff > 90) {
            const confirmFetch = window.confirm(
                `⚠️ Khoảng thời gian bạn chọn là ${Math.round(daysDiff)} ngày.\n\n` +
                `Hệ thống sẽ chia thành ${Math.ceil(daysDiff / CHUNK_SIZE_DAYS)} phần và tải tuần tự.\n` +
                `Quá trình này có thể mất vài phút.\n\n` +
                `Bạn có muốn tiếp tục không?`
            );
            if (!confirmFetch) return;
        }

        const fetchButton = document.getElementById('fetchData');

        try {
            // Tạo các chunks
            const chunks = createTimeChunks(start, end, CHUNK_SIZE_DAYS);
            const totalChunks = chunks.length;

            console.log(`[Data Analysis] Fetching data in ${totalChunks} chunks (${CHUNK_SIZE_DAYS} days each)`);

            // Update button với progress
            const updateProgress = (completed, total, failed) => {
                const percent = Math.round((completed / total) * 100);
                fetchButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent}% (${completed}/${total})`;
                if (failed > 0) {
                    fetchButton.innerHTML += ` <span style="color:#ff6b6b">(${failed} lỗi)</span>`;
                }
            };

            fetchButton.disabled = true;
            fetchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang chuẩn bị...';

            // Fetch tất cả chunks
            const { data, completed, failed } = await fetchWithConcurrencyLimit(
                chunks,
                selectedStations,
                MAX_CONCURRENT_REQUESTS,
                updateProgress
            );

            // Sắp xếp dữ liệu theo thời gian
            currentData = data.sort((a, b) => a.timestamp - b.timestamp);

            console.log(`[Data Analysis] Received ${currentData.length} data points (${completed} chunks succeeded, ${failed} failed)`);

            if (currentData.length === 0) {
                alert('Không có dữ liệu trong khoảng thời gian đã chọn.');
                return;
            }

            // Thông báo nếu có chunks bị lỗi
            if (failed > 0) {
                alert(`⚠️ Đã tải ${currentData.length} bản ghi.\n\n${failed}/${totalChunks} phần bị lỗi (có thể do mất kết nối tạm thời).\n\nDữ liệu hiển thị có thể không đầy đủ.`);
            }

            // Update the visualization
            updateChart();
            updateStatistics();

            // Reset và ẩn nút Reset Zoom
            if (chart) {
                chart.resetZoom();
            }
            document.getElementById('resetZoomBtn').style.display = 'none';

            console.log(`[Data Analysis] Successfully loaded ${currentData.length} records`);

        } catch (error) {
            console.error('Error fetching data:', error);

            let userMessage = 'Có lỗi khi tải dữ liệu.';

            if (error.name === 'AbortError') {
                userMessage = 'Yêu cầu đã hết thời gian chờ.\n\nVui lòng thử lại.';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                userMessage = 'Không thể kết nối đến máy chủ.\n\nVui lòng kiểm tra kết nối mạng.';
            } else {
                userMessage = `${error.message}\n\nVui lòng thử lại sau.`;
            }

            alert(userMessage);
        } finally {
            fetchButton.disabled = false;
            fetchButton.innerHTML = 'Lấy Dữ Liệu';
        }
    }

    function updateChart() {
        if (!currentData || !currentData.length) return;

        const chartType = document.getElementById('chartType').value;
        const parameter = document.getElementById('dataParameter').value;

        // Destroy existing chart if it exists
        if (chart) {
            chart.destroy();
        }

        // Prepare data for the chart
        const datasets = prepareChartDatasets(currentData, parameter, chartType);

        // ✨ [TỐI ƯU] Cấu hình scales phù hợp với loại biểu đồ
        const isBarChart = chartType === 'bar';

        const scalesConfig = {
            x: {
                type: isBarChart ? 'category' : 'time',
                ...(isBarChart ? {} : {
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'DD/MM HH:mm'
                        }
                    }
                }),
                title: {
                    display: true,
                    text: 'Thời gian'
                }
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: getParameterLabel(parameter)
                }
            }
        };

        // ✨ [TỐI ƯU] Với bar chart, aggregate data theo giờ để hiển thị rõ ràng
        let chartLabels = undefined;
        let chartDatasets = datasets.data;

        if (isBarChart && datasets.data.length > 0 && datasets.data[0].data.length > 50) {
            // Aggregate data theo giờ cho mỗi station
            const hourlyData = {};

            datasets.data.forEach(ds => {
                ds.data.forEach(point => {
                    const date = new Date(point.x);
                    // Round xuống giờ
                    date.setMinutes(0, 0, 0);
                    const hourKey = date.getTime();

                    if (!hourlyData[hourKey]) {
                        hourlyData[hourKey] = {};
                    }
                    if (!hourlyData[hourKey][ds.label]) {
                        hourlyData[hourKey][ds.label] = [];
                    }
                    hourlyData[hourKey][ds.label].push(point.y);
                });
            });

            // Tạo labels từ các giờ
            const sortedHours = Object.keys(hourlyData).map(Number).sort((a, b) => a - b);
            chartLabels = sortedHours.map(ts =>
                new Date(ts).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            );

            // Tính trung bình cho mỗi station mỗi giờ
            chartDatasets = datasets.data.map(ds => ({
                ...ds,
                data: sortedHours.map(hourKey => {
                    const values = hourlyData[hourKey][ds.label];
                    if (values && values.length > 0) {
                        return values.reduce((a, b) => a + b, 0) / values.length;
                    }
                    return null;
                })
            }));

            console.log(`[Bar Chart] Aggregated to ${sortedHours.length} hourly data points`);
        } else if (isBarChart) {
            // Ít dữ liệu, hiển thị trực tiếp
            const allTimestamps = new Set();
            datasets.data.forEach(ds => {
                ds.data.forEach(point => allTimestamps.add(point.x));
            });
            chartLabels = Array.from(allTimestamps)
                .sort((a, b) => a - b)
                .map(ts => new Date(ts).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }));

            chartDatasets = datasets.data.map(ds => ({
                ...ds,
                data: ds.data.map(point => point.y)
            }));
        }

        // Create new chart
        chart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: chartLabels,
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: scalesConfig,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    // ✨ [MỚI] Cấu hình plugin zoom
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                        },
                        zoom: {
                            drag: {
                                enabled: true
                            },
                            mode: 'x',
                            // ✨ [MỚI] Hàm callback được gọi sau khi zoom
                            onZoomComplete: ({ chart }) => {
                                // Lấy khoảng thời gian mới từ trục x
                                const { min, max } = chart.scales.x;
                                // Lọc dữ liệu trong khoảng thời gian đã zoom
                                const zoomedData = currentData.filter(d => {
                                    const timestamp = new Date(d.timestamp).getTime();
                                    return timestamp >= min && timestamp <= max;
                                });
                                // Cập nhật lại bảng thống kê với dữ liệu đã lọc
                                updateStatistics(zoomedData);
                                // Hiển thị nút Reset Zoom
                                document.getElementById('resetZoomBtn').style.display = 'inline-block';
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }

    // ✨ [CẢI TIẾN] Thay đổi cách hiển thị thống kê thành dạng tab
    function updateStatistics(dataToAnalyze = currentData) {
        const statsContainer = document.getElementById('statistics-results');
        if (!statsContainer) return;

        if (!dataToAnalyze || dataToAnalyze.length === 0) {
            statsContainer.innerHTML = '<p class="placeholder">Không có dữ liệu để phân tích thống kê.</p>';
            return;
        }

        statsContainer.innerHTML = ''; // Xóa nội dung cũ

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'stats-tabs-container';

        const contentContainer = document.createElement('div');
        contentContainer.className = 'stats-content-container';

        const selectedStations = getSelectedStations();
        const parameters = [
            { key: 'temperature', name: 'Nhiệt độ (°C)' },
            { key: 'humidity', name: 'Độ ẩm (%)' },
            { key: 'radiation', name: 'Phóng xạ (uSv/h)' }
        ];

        selectedStations.forEach((stationId, index) => {
            const stationData = dataToAnalyze.filter(d => d.station === stationId);
            if (stationData.length === 0) return;

            // Tạo tab
            const tab = document.createElement('button');
            tab.className = 'stat-tab';
            tab.textContent = `Trạm ${stationId.replace('station', '')}`;
            tab.dataset.target = `stats-pane-${stationId}`;
            tabsContainer.appendChild(tab);

            // Tạo nội dung cho tab
            const contentPane = document.createElement('div');
            contentPane.className = 'stat-content-pane';
            contentPane.id = `stats-pane-${stationId}`;

            parameters.forEach(param => {
                const values = stationData.map(d => d[param.key]).filter(v => v != null);
                if (values.length > 0) {
                    const stats = calculateStatistics(values);
                    const statHTML = `
                        <div class="param-stats-card">
                            <h4>${param.name}</h4>
                            <div class="stats-values-grid">
                                <div class="stat-value-item">
                                    <span class="stat-value-label">Trung bình</span>
                                    <span class="stat-value-number">${stats.average.toFixed(2)}</span>
                                </div>
                                <div class="stat-value-item">
                                    <span class="stat-value-label">Lớn nhất</span>
                                    <span class="stat-value-number">${stats.max.toFixed(2)}</span>
                                </div>
                                <div class="stat-value-item">
                                    <span class="stat-value-label">Nhỏ nhất</span>
                                    <span class="stat-value-number">${stats.min.toFixed(2)}</span>
                                </div>
                                <div class="stat-value-item">
                                    <span class="stat-value-label">Độ lệch chuẩn</span>
                                    <span class="stat-value-number">${stats.stdDev.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    contentPane.innerHTML += statHTML;
                }
            });
            contentContainer.appendChild(contentPane);

            // Kích hoạt tab đầu tiên
            if (index === 0) {
                tab.classList.add('active');
                contentPane.classList.add('active');
            }
        });

        statsContainer.appendChild(tabsContainer);
        statsContainer.appendChild(contentContainer);

        // Thêm sự kiện click cho các tab
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('stat-tab')) {
                // Bỏ active tất cả
                tabsContainer.querySelectorAll('.stat-tab').forEach(t => t.classList.remove('active'));
                contentContainer.querySelectorAll('.stat-content-pane').forEach(p => p.classList.remove('active'));

                // Active tab và pane được click
                const targetPaneId = e.target.dataset.target;
                e.target.classList.add('active');
                document.getElementById(targetPaneId)?.classList.add('active');
            }
        });

        if (contentContainer.innerHTML === '') {
            statsContainer.innerHTML = '<p class="placeholder">Không có dữ liệu hợp lệ để tính toán thống kê.</p>';
        }
    }

    // ✨ [MỚI] Hàm để reset zoom và cập nhật lại thống kê
    function resetChartZoom() {
        if (chart) {
            chart.resetZoom();
            // Cập nhật lại thống kê với dữ liệu đầy đủ ban đầu
            updateStatistics(currentData);
            document.getElementById('resetZoomBtn').style.display = 'none';
        }
    }

    // ✨ [TỐI ƯU] Tính toán thống kê cho mảng lớn (tránh stack overflow)
    function calculateStatistics(values) {
        if (!values || values.length === 0) {
            return { average: 0, max: 0, min: 0, stdDev: 0 };
        }

        // Tính min, max, sum trong một vòng lặp duy nhất
        let min = values[0];
        let max = values[0];
        let sum = 0;

        for (let i = 0; i < values.length; i++) {
            const val = values[i];
            if (val < min) min = val;
            if (val > max) max = val;
            sum += val;
        }

        const avg = sum / values.length;

        // Tính độ lệch chuẩn
        let sumSquareDiff = 0;
        for (let i = 0; i < values.length; i++) {
            const diff = values[i] - avg;
            sumSquareDiff += diff * diff;
        }
        const stdDev = Math.sqrt(sumSquareDiff / values.length);

        return {
            average: avg,
            max: max,
            min: min,
            stdDev: stdDev
        };
    }

    // ✨ [CẢI TIẾN] Nâng cấp chức năng xuất CSV
    function exportToCSV() {
        if (!currentData || !currentData.length) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        let dataToExport = currentData;
        const isZoomed = document.getElementById('resetZoomBtn').style.display !== 'none';

        // 1. Lọc dữ liệu theo khoảng thời gian đã zoom (nếu có)
        if (isZoomed && chart) {
            const { min, max } = chart.scales.x;
            dataToExport = currentData.filter(d => {
                const timestamp = new Date(d.timestamp).getTime();
                return timestamp >= min && timestamp <= max;
            });
        }

        // 2. Lọc dữ liệu theo các trạm đã chọn
        const selectedStations = getSelectedStations();
        dataToExport = dataToExport.filter(d => selectedStations.includes(d.station));

        if (dataToExport.length === 0) {
            alert('Không có dữ liệu phù hợp với lựa chọn của bạn để xuất.');
            return;
        }

        // 3. Chuyển đổi dữ liệu sang định dạng CSV
        const headers = ['Timestamp', 'Station', 'Temperature', 'Humidity', 'Radiation'];
        const rows = dataToExport.map(item => {
            // Định dạng lại timestamp cho dễ đọc
            const formattedTimestamp = new Date(item.timestamp).toISOString().slice(0, 19).replace('T', ' ');
            return [
                formattedTimestamp,
                item.station,
                item.temperature?.toFixed(2) || '',
                item.humidity?.toFixed(2) || '',
                item.radiation?.toFixed(3) || ''
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        // Thêm BOM để Excel đọc đúng UTF-8
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `sensor_data_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Helper Functions
    function getSelectedStations() {
        const checkboxes = document.querySelectorAll('.station-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    function formatDateTime(date) {
        return date.toISOString().slice(0, 16);
    }

    // ✨ [TỐI ƯU] Giới hạn số điểm hiển thị trên chart
    const MAX_CHART_POINTS_PER_STATION = 2000;

    /**
     * ✨ [MỚI] Downsample dữ liệu bằng cách lấy mẫu đều
     */
    function downsampleData(data, maxPoints) {
        if (data.length <= maxPoints) return data;

        const step = Math.ceil(data.length / maxPoints);
        const sampled = [];

        for (let i = 0; i < data.length; i += step) {
            sampled.push(data[i]);
        }

        // Đảm bảo luôn có điểm cuối cùng
        if (sampled[sampled.length - 1] !== data[data.length - 1]) {
            sampled.push(data[data.length - 1]);
        }

        return sampled;
    }

    function prepareChartDatasets(data, parameter, chartType = 'line') {
        const stations = [...new Set(data.map(d => d.station))];

        const datasets = stations.map(station => {
            let stationData = data.filter(d => d.station === station);

            // Sắp xếp theo thời gian
            stationData.sort((a, b) => a.timestamp - b.timestamp);

            // Downsample nếu quá nhiều điểm
            if (stationData.length > MAX_CHART_POINTS_PER_STATION) {
                console.log(`[Chart] Downsampling station ${station}: ${stationData.length} → ${MAX_CHART_POINTS_PER_STATION} points`);
                stationData = downsampleData(stationData, MAX_CHART_POINTS_PER_STATION);
            }

            // ✨ [TỐI ƯU] Cấu hình phù hợp với từng loại biểu đồ
            let pointRadius = 0;
            let borderWidth = 2;

            if (chartType === 'scatter') {
                // Scatter chart: luôn hiển thị điểm
                pointRadius = stationData.length > 500 ? 2 : 4;
                borderWidth = 0;
            } else if (chartType === 'line') {
                // Line chart: ẩn điểm nếu quá nhiều
                pointRadius = stationData.length > 200 ? 0 : 2;
                borderWidth = stationData.length > 500 ? 1 : 2;
            } else if (chartType === 'bar') {
                // Bar chart: không cần pointRadius
                pointRadius = 0;
                borderWidth = 1;
            }

            return {
                label: `Trạm ${station.replace('station_', '').replace(/^0+/, '')}`,
                data: stationData.map(d => ({
                    x: d.timestamp,
                    y: d[parameter]
                })),
                borderColor: CONFIG.CHART_COLORS[station],
                backgroundColor: `${CONFIG.CHART_COLORS[station]}B3`,
                fill: false,
                pointRadius: pointRadius,
                borderWidth: borderWidth,
                barPercentage: 0.9,
                categoryPercentage: 0.9
            };
        });

        return {
            data: datasets
        };
    }

    function getParameterLabel(parameter) {
        const labels = {
            temperature: 'Nhiệt độ (°C)',
            humidity: 'Độ ẩm (%)',
            radiation: 'Phóng xạ (µSv/h)'
        };
        return labels[parameter] || '';
    }

    // ✨ [CẢI TIẾN] Di chuyển các hàm xử lý nhập tệp vào trong scope của DOMContentLoaded
    // để chúng có thể truy cập trực tiếp `currentData`, `updateChart`, và `updateStatistics`.
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            try {
                let parsedData;
                if (file.name.endsWith('.json')) {
                    parsedData = parseJsonData(content);
                } else if (file.name.endsWith('.csv')) {
                    parsedData = parseCsvData(content);
                } else {
                    throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp .csv hoặc .json.');
                }

                // Cập nhật dữ liệu và giao diện
                currentData = parsedData; // Gán trực tiếp vào biến cục bộ
                updateChart();
                updateStatistics();
                alert(`Đã nhập thành công dữ liệu từ tệp: ${file.name}`);

            } catch (error) {
                console.error('Lỗi khi xử lý tệp:', error);
                alert(`Lỗi: ${error.message}`);
            } finally {
                // Reset input để có thể tải lại cùng một tệp
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function parseJsonData(jsonText) {
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data)) {
            throw new Error('Tệp JSON phải chứa một mảng các đối tượng dữ liệu.');
        }
        // Chuẩn hóa dữ liệu
        return data.map(normalizeDataPoint).filter(item => item !== null);
    }

    function parseCsvData(csvText) {
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) {
            throw new Error('Tệp CSV phải có ít nhất một dòng header và một dòng dữ liệu.');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const requiredHeaders = ['timestamp', 'station', 'temperature', 'humidity', 'radiation'];
        if (!requiredHeaders.every(h => headers.includes(h))) {
            throw new Error(`Tệp CSV thiếu các cột bắt buộc. Cần có: ${requiredHeaders.join(', ')}`);
        }

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const entry = {};
            headers.forEach((header, index) => {
                entry[header] = values[index];
            });
            const normalized = normalizeDataPoint(entry);
            if (normalized) data.push(normalized);
        }
        return data;
    }

    function normalizeDataPoint(item) {
        // Chuyển đổi timestamp (có thể là chuỗi ISO hoặc số) thành mili-giây
        const timestamp = new Date(item.timestamp).getTime();
        if (isNaN(timestamp)) {
            console.warn('Bỏ qua điểm dữ liệu có timestamp không hợp lệ:', item.timestamp);
            return null; // Bỏ qua điểm dữ liệu này
        }

        return {
            timestamp: timestamp,
            station: item.station || 'unknown',
            temperature: item.temperature ? parseFloat(item.temperature) : null,
            humidity: item.humidity ? parseFloat(item.humidity) : null,
            radiation: item.radiation ? parseFloat(item.radiation) : null,
        };
    }
});