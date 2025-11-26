/* =================================================================
//                      TOAST NOTIFICATION LOGIC
// ================================================================= */

/**
 * Hiển thị thông báo toast.
 * @param {object} options - Các tùy chọn cho toast.
 * @param {string} options.type - Loại toast ('success', 'warning', 'error', 'info').
 * @param {string} options.title - Tiêu đề của toast.
 * @param {string} options.message - Nội dung thông báo.
 * @param {number} [options.duration=5000] - Thời gian hiển thị (ms).
 */
function showToast({ type = 'info', title, message, duration = 5000 }) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error('Toast container not found!');
        return;
    }

    const icons = {
        success: 'fas fa-check-circle',
        warning: 'fas fa-exclamation-triangle',
        error: 'fas fa-times-circle',
        info: 'fas fa-info-circle',
        radiation: 'fas fa-biohazard'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close-btn">&times;</button>
    `;

    container.appendChild(toast);

    // Thêm animation sau khi append
    setTimeout(() => {
        toast.classList.add('show');
    }, 100); 

    const closeButton = toast.querySelector('.toast-close-btn');
    const removeToast = () => {
        // ✨ [SỬA LỖI] Thêm class 'hide' để kích hoạt animation trượt ra
        toast.classList.add('hide');
        // Chờ animation kết thúc rồi mới xóa element
        // Lắng nghe sự kiện 'animationend' thay vì 'transitionend'
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, { once: true }); // Đảm bảo sự kiện chỉ chạy một lần
    };

    closeButton.addEventListener('click', removeToast);

    setTimeout(removeToast, duration);
}
