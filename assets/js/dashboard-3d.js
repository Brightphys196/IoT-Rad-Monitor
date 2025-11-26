/**
 * Dashboard 3D Tilt Effect
 * Adds a subtle 3D tilt interaction to station cards
 */

document.addEventListener('DOMContentLoaded', () => {
    // Observe for dynamically added station cards
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('station-card')) {
                        attachTiltEffect(node);
                        animateEntry(node);
                    }
                });
            }
        });
    });

    const container = document.getElementById('live-status-cards-container');
    if (container) {
        observer.observe(container, { childList: true });
    }

    // Attach to existing cards if any
    document.querySelectorAll('.station-card').forEach(card => {
        attachTiltEffect(card);
        animateEntry(card);
    });

    // Animate chart container
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        animateEntry(chartContainer, 200);
    }

    function attachTiltEffect(card) {
        card.addEventListener('mousemove', handleMouseMove);
        card.addEventListener('mouseleave', handleMouseLeave);
    }

    function handleMouseMove(e) {
        const card = this;
        const cardRect = card.getBoundingClientRect();

        const cardCenterX = cardRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top + cardRect.height / 2;

        const mouseX = e.clientX - cardCenterX;
        const mouseY = e.clientY - cardCenterY;

        // Subtle tilt
        const rotateX = (mouseY / (cardRect.height / 2)) * -5;
        const rotateY = (mouseX / (cardRect.width / 2)) * 5;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    }

    function handleMouseLeave(e) {
        const card = this;
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    }

    function animateEntry(element, delay = 0) {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';

        setTimeout(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, delay);
    }
});
