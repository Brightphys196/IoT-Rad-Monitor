document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('workflow-connectors');
    const diagram = document.getElementById('architecture-diagram');
    if (!svg || !diagram) return;

    // --- DỮ LIỆU KẾT NỐI ---
    const connections = [
        { from: 'box-esp8266', to: 'box-iot-core', type: 'ingest' },
        { from: 'box-iot-core', to: 'box-lambda-process', type: 'ingest' },
        { from: 'box-lambda-process', to: 'box-db-sensor', type: 'ingest' },
        { from: 'box-lambda-process', to: 'box-db-status', type: 'ingest' },
        { from: 'box-lambda-process', to: 'box-db-logs', type: 'ingest' },
        { from: 'box-db-sensor', to: 'box-lambda-aggregate', type: 'processing' },
        { from: 'box-lambda-aggregate', to: 'box-db-daily', type: 'processing' },
        { from: 'box-db-sensor', to: 'box-lambda-api', type: 'response' },
        { from: 'box-db-status', to: 'box-lambda-api', type: 'response' },
        { from: 'box-db-logs', to: 'box-lambda-api', type: 'response' },
        { from: 'box-db-daily', to: 'box-lambda-api', type: 'response' },
        { from: 'box-db-saved', to: 'box-lambda-api', type: 'response' },
        { from: 'box-lambda-api', to: 'box-db-saved', type: 'request' },
        { from: 'box-api-gateway', to: 'box-lambda-api', type: 'request' },
        { from: 'box-api-gateway', to: 'box-web-app', type: 'response' },
        { from: 'box-user', to: 'box-web-app', type: 'request' },
        { from: 'box-web-app', to: 'box-api-gateway', type: 'request' },
        { from: 'box-web-app', to: 'box-user', type: 'response' },
        { from: 'box-api-gateway', to: 'box-lambda-chat-ai', type: 'ai' },
        { from: 'box-lambda-chat-ai', to: 'box-db-sensor', type: 'ai' },
        { from: 'box-lambda-chat-ai', to: 'box-db-status', type: 'ai' },
        { from: 'box-lambda-chat-ai', to: 'box-db-logs', type: 'ai' },
        { from: 'box-lambda-chat-ai', to: 'box-db-daily', type: 'ai' },
        { from: 'box-lambda-chat-ai', to: 'box-api-gateway', type: 'response' },
        { from: 'box-api-gateway', to: 'box-lambda-presigned-url', type: 'request' },
        { from: 'box-lambda-presigned-url', to: 'box-api-gateway', type: 'response' },
        { from: 'box-web-app', to: 'box-github-amplify', type: 'storage' },
        { from: 'box-github-amplify', to: 'box-web-app', type: 'storage' },
    ];

    let isLegendLocked = false;

    // --- HÀM VẼ CHÍNH ---
    function drawAllConnectors() {
        svg.innerHTML = '<defs></defs>';
        const defs = svg.querySelector('defs');

        // Tính toán Fan-in/Fan-out
        const fanInMap = new Map();
        const fanOutMap = new Map();
        connections.forEach(conn => {
            fanInMap.set(conn.to, (fanInMap.get(conn.to) || 0) + 1);
            fanOutMap.set(conn.from, (fanOutMap.get(conn.from) || 0) + 1);
        });

        const fanInCounters = new Map();
        const fanOutCounters = new Map();

        connections.forEach((conn, index) => {
            const fromEl = document.getElementById(conn.from);
            const toEl = document.getElementById(conn.to);

            if (fromEl && toEl) {
                const fromTotal = fanOutMap.get(conn.from) || 1;
                const fromCurrent = fanOutCounters.get(conn.from) || 0;
                fanOutCounters.set(conn.from, fromCurrent + 1);

                const toTotal = fanInMap.get(conn.to) || 1;
                const toCurrent = fanInCounters.get(conn.to) || 0;
                fanInCounters.set(conn.to, toCurrent + 1);

                const fanInfo = { fromTotal, fromCurrent, toTotal, toCurrent };

                const { line, marker, dot } = createSmartConnector(fromEl, toEl, index, fanInfo, conn.type);

                line.dataset.from = conn.from;
                line.dataset.to = conn.to;
                line.dataset.type = conn.type;

                defs.appendChild(marker);
                svg.appendChild(line);
                svg.appendChild(dot); // Dot được thêm vào sau Line

                setTimeout(() => {
                    line.style.strokeDashoffset = '0';
                }, index * 20);
            }
        });
    }

    // --- HÀM TẠO DÂY NỐI (Đã sửa lỗi reference) ---
    // --- HÀM TẠO DÂY NỐI (Đã sửa lỗi logic & chuyển sang Orthogonal) ---
    function createSmartConnector(el1, el2, id, fanInfo, type) {
        const diagramRect = diagram.getBoundingClientRect();
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();

        const calculateOffset = (total, current, size) => {
            if (total <= 1) return size / 2;
            const padding = size * 0.25;
            const available = size - (padding * 2);
            return padding + (current * (available / (total - 1)));
        };

        const isHorizontal = Math.abs(rect1.left - rect2.left) > Math.abs(rect1.top - rect2.top);
        let start = {}, end = {};

        // 1. Tính toán điểm đầu và cuối
        if (isHorizontal) {
            const isForward = rect1.left < rect2.left;
            const startY = rect1.top - diagramRect.top + calculateOffset(fanInfo.fromTotal, fanInfo.fromCurrent, rect1.height);
            const endY = rect2.top - diagramRect.top + calculateOffset(fanInfo.toTotal, fanInfo.toCurrent, rect2.height);

            start = { x: isForward ? rect1.right - diagramRect.left : rect1.left - diagramRect.left, y: startY };
            end = { x: isForward ? rect2.left - diagramRect.left : rect2.right - diagramRect.left, y: endY };
        } else {
            const isDown = rect1.top < rect2.top;
            const startX = rect1.left - diagramRect.left + calculateOffset(fanInfo.fromTotal, fanInfo.fromCurrent, rect1.width);
            const endX = rect2.left - diagramRect.left + calculateOffset(fanInfo.toTotal, fanInfo.toCurrent, rect2.width);

            start = { x: startX, y: isDown ? rect1.bottom - diagramRect.top : rect1.top - diagramRect.top };
            end = { x: endX, y: isDown ? rect2.top - diagramRect.top : rect2.bottom - diagramRect.top };
        }

        // 2. Tính toán đường đi (Orthogonal Path với Bo góc & Tách dòng)
        let points = [];
        const bundleOffset = (id % 5 - 2) * 12; // Tách các đường trùng nhau ra 12px

        if (isHorizontal) {
            const midX = (start.x + end.x) / 2 + bundleOffset;
            points = [
                { x: start.x, y: start.y },
                { x: midX, y: start.y },
                { x: midX, y: end.y },
                { x: end.x, y: end.y }
            ];
        } else {
            const midY = (start.y + end.y) / 2 + bundleOffset;
            points = [
                { x: start.x, y: start.y },
                { x: start.x, y: midY },
                { x: end.x, y: midY },
                { x: end.x, y: end.y }
            ];
        }

        // Filter duplicate points to avoid zero-length segments which cause NaN in getRoundedPath
        points = points.filter((p, i, arr) => {
            if (i === 0) return true;
            const prev = arr[i - 1];
            // Only keep point if it's sufficiently different from the previous one
            return Math.abs(p.x - prev.x) > 0.5 || Math.abs(p.y - prev.y) > 0.5;
        });

        // Hàm tạo đường dẫn có bo góc
        const getRoundedPath = (pts, radius) => {
            if (pts.length < 2) return '';
            if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length - 1; i++) {
                const p0 = pts[i - 1];
                const p1 = pts[i];
                const p2 = pts[i + 1];

                const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
                const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
                const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
                const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

                const r = Math.min(radius, len1 / 2, len2 / 2);

                const startX = p1.x - (v1.x / len1) * r;
                const startY = p1.y - (v1.y / len1) * r;
                const endX = p1.x + (v2.x / len2) * r;
                const endY = p1.y + (v2.y / len2) * r;

                d += ` L ${startX} ${startY} Q ${p1.x} ${p1.y} ${endX} ${endY}`;
            }
            d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
            return d;
        };

        const pathData = getRoundedPath(points, 15); // Bo góc bán kính 15px

        // 3. Tạo SVG Elements
        // Line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', pathData);
        line.setAttribute('class', `connector-line connector-line--${type}`);
        line.setAttribute('marker-end', `url(#arrow-${id})`);

        const length = Math.ceil(Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)) * 1.5);
        line.style.strokeDasharray = length;
        line.style.strokeDashoffset = length;

        // Marker
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', `arrow-${id}`);
        marker.setAttribute('viewBox', '0 0 12 12');
        marker.setAttribute('refX', '10'); marker.setAttribute('refY', '6');
        marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto');
        const mCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mCircle.setAttribute('cx', '6'); mCircle.setAttribute('cy', '6'); mCircle.setAttribute('r', '3');
        mCircle.setAttribute('class', `connector-arrow-circle connector-arrow-circle--${type}`);
        marker.appendChild(mCircle);

        // Dot
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '3');
        dot.setAttribute('class', `connector-dot connector-dot--${type}`);
        dot.style.offsetPath = `path('${pathData}')`;

        const duration = Math.max(1.5, length / 300);
        dot.style.animationDuration = `${duration}s`;

        // Gắn tham chiếu dot vào line
        line.connectedDot = dot;

        return { line, marker, dot };
    }

    function setupInteractions() {
        const boxes = document.querySelectorAll('.arch-box');
        const legendItems = document.querySelectorAll('.legend-item');

        boxes.forEach(box => {
            box.addEventListener('mouseenter', () => {
                if (isLegendLocked) return;
                activateFlow(box.id, 'box');
            });
            box.addEventListener('mouseleave', () => {
                if (isLegendLocked) return;
                resetDiagram();
            });
        });

        legendItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const type = item.dataset.type;
                if (item.classList.contains('active')) {
                    item.classList.remove('active');
                    isLegendLocked = false;
                    resetDiagram();
                } else {
                    legendItems.forEach(l => l.classList.remove('active'));
                    item.classList.add('active');
                    isLegendLocked = true;
                    activateFlow(type, 'type');
                }
            });
        });
    }

    // --- HÀM KÍCH HOẠT LUỒNG (Đã sửa lỗi) ---
    function activateFlow(identifier, mode) {
        diagram.classList.add('highlighting');

        // Reset highlight cũ
        const allLines = document.querySelectorAll('.connector-line');
        const allBoxes = document.querySelectorAll('.arch-box');

        allLines.forEach(l => {
            l.classList.remove('active');
            // ✨ [FIX LỖI] Sử dụng tham chiếu trực tiếp
            if (l.connectedDot) {
                l.connectedDot.style.opacity = 0;
            }
        });

        allBoxes.forEach(b => {
            b.classList.remove('highlighted');
        });

        const activeLines = [];
        const activeBoxIds = new Set();

        if (mode === 'box') {
            allLines.forEach(line => {
                if (line.dataset.from === identifier || line.dataset.to === identifier) {
                    activeLines.push(line);
                    activeBoxIds.add(line.dataset.from);
                    activeBoxIds.add(line.dataset.to);
                }
            });
        } else if (mode === 'type') {
            diagram.className = `architecture-diagram highlighting highlighting-${identifier}`;
            allLines.forEach(line => {
                if (line.dataset.type === identifier) {
                    activeLines.push(line);
                    activeBoxIds.add(line.dataset.from);
                    activeBoxIds.add(line.dataset.to);
                }
            });
        }

        activeLines.forEach(line => {
            line.classList.add('active');
            // ✨ [FIX LỖI] Sử dụng tham chiếu trực tiếp thay vì nextSibling
            if (line.connectedDot) {
                line.connectedDot.style.opacity = 1;
            }
        });

        activeBoxIds.forEach(id => {
            const box = document.getElementById(id);
            if (box) {
                box.classList.add('highlighted');
                // Removed icon animations to prevent unwanted spinning
            }
        });
    }

    function resetDiagram() {
        diagram.classList.remove('highlighting');
        diagram.className = 'architecture-diagram';

        document.querySelectorAll('.connector-line').forEach(l => {
            l.classList.remove('active');
            // ✨ [FIX LỖI]
            if (l.connectedDot) {
                l.connectedDot.style.opacity = 0;
            }
        });

        document.querySelectorAll('.arch-box').forEach(b => {
            b.classList.remove('highlighted');
        });
    }

    setTimeout(() => {
        drawAllConnectors();
        setupInteractions();
    }, 100);

    let resizeTimer;
    const debouncedRedraw = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawAllConnectors, 150);
    };

    window.addEventListener('resize', debouncedRedraw);
    if ('ResizeObserver' in window) {
        new ResizeObserver(debouncedRedraw).observe(diagram);
    }
});