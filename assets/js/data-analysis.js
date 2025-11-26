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

        try {
            // Add loading state
            const fetchButton = document.getElementById('fetchData');
            fetchButton.disabled = true;
            fetchButton.textContent = 'Đang tải...';

            // ✨ [CẢI TIẾN] Loại bỏ hoàn toàn logic tạo dữ liệu giả.
            // Luôn gọi API thật và xử lý lỗi nếu có.
            const response = await fetch(CONFIG.API_ENDPOINT_ANALYSIS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startDate: new Date(startDate).getTime(),
                    endDate: new Date(endDate).getTime(),
                    stations: selectedStations
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Lỗi HTTP ${response.status}` }));
                throw new Error(errorData.error || 'Không thể tải dữ liệu từ máy chủ.');
            }

            const json = await response.json();
            // API trả về dữ liệu trong thuộc tính 'readings'
            currentData = json.readings || [];

            // Update the visualization
            updateChart();
            updateStatistics();

            // ✨ [MỚI] Reset và ẩn nút Reset Zoom khi lấy dữ liệu mới
            if (chart) {
                chart.resetZoom();
            }
            document.getElementById('resetZoomBtn').style.display = 'none';

        } catch (error) {
            console.error('Error fetching data:', error);
            alert('Có lỗi khi tải dữ liệu. Vui lòng thử lại sau.');
        } finally {
            // Reset button state
            const fetchButton = document.getElementById('fetchData');
            fetchButton.disabled = false;
            fetchButton.textContent = 'Lấy Dữ Liệu';
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
        const datasets = prepareChartDatasets(currentData, parameter);

        // Create new chart
        chart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: datasets.labels,
                datasets: datasets.data
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            displayFormats: {
                                hour: 'DD/MM HH:mm'
                            }
                        },
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
                },
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

    function calculateStatistics(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        // Calculate standard deviation
        const squareDiffs = values.map(value => {
            const diff = value - avg;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(avgSquareDiff);

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

    function prepareChartDatasets(data, parameter) {
        const stations = [...new Set(data.map(d => d.station))];

        const datasets = stations.map(station => {
            const stationData = data.filter(d => d.station === station);
            return {
                label: `Trạm ${station}`,
                data: stationData.map(d => ({
                    x: d.timestamp,
                    y: d[parameter]
                })).sort((a, b) => a.x - b.x), // Sắp xếp lại để đảm bảo biểu đồ vẽ đúng
                borderColor: CONFIG.CHART_COLORS[station],
                backgroundColor: `${CONFIG.CHART_COLORS[station]}B3`, // ✨ [SỬA LỖI] Thêm màu nền cho biểu đồ cột (với 70% độ mờ)
                fill: false
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