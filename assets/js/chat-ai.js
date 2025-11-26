document.addEventListener('DOMContentLoaded', () => {
    const chatToggleButton = document.getElementById('chat-toggle-button');
    const chatWindow = document.getElementById('chat-window');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const iconChat = chatToggleButton.querySelector('.icon-chat');
    const iconClose = chatToggleButton.querySelector('.icon-close');

    // ✨ [MỚI] Biến để quản lý hiệu ứng "đang gõ" của chỉ báo
    let typingIndicatorInterval = null;

    if (!chatToggleButton || !chatWindow || !chatMessages || !chatInput || !chatSendButton) {
        console.error("Không thể khởi tạo Chatbot: Thiếu các phần tử HTML.");
        return;
    }

    const CHAT_API_ENDPOINT = 'https://z2c6um5ew3.execute-api.ap-southeast-1.amazonaws.com/chat-ai';

    chatToggleButton.addEventListener('click', () => {
        const isVisible = chatWindow.style.display === 'flex';
        if (isVisible) {
            chatWindow.classList.remove('show');
            chatWindow.style.display = 'none';
            iconChat.style.display = 'block';
            iconClose.style.display = 'none';
        } else {
            chatWindow.style.display = 'flex';
            setTimeout(() => chatWindow.classList.add('show'), 10);
            iconChat.style.display = 'none';
            iconClose.style.display = 'block';
            chatInput.focus();
        }
    });

    const handleSendMessage = () => {
        const prompt = chatInput.value.trim();
        if (!prompt) return;

        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            addMessageToChat('bot', 'Lỗi: Bạn cần đăng nhập để sử dụng tính năng này.');
            return;
        }

        addMessageToChat('user', prompt);
        chatInput.value = '';
        setTypingIndicator(true);

        fetch(CHAT_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ prompt: prompt })
        })
            .then(async response => {
                if (!response.ok) {
                    // ✨ [CẢI TIẾN] Xử lý lỗi tốt hơn: đọc body (JSON hoặc text) để hiển thị thông tin lỗi chi tiết
                    try {
                        const text = await response.text();
                        let parsed;
                        try {
                            parsed = JSON.parse(text);
                        } catch (e) {
                            parsed = null;
                        }
                        console.error('Server responded with non-OK status', response.status, response.statusText, text);
                        const errMsg = parsed ? (parsed.error || parsed.message || JSON.stringify(parsed)) : (text || response.statusText);
                        throw new Error(`Lỗi máy chủ: ${response.status} - ${errMsg}`);
                    } catch (e) {
                        // Nếu đọc body cũng lỗi (rất hiếm), fallback về statusText
                        throw new Error(`Lỗi máy chủ: ${response.status} ${response.statusText}`);
                    }
                }
                return response.json();
            })
            .then(data => {
                setTypingIndicator(false);
                addMessageToChat('bot', data.response);
            })
            .catch(error => {
                console.error("Lỗi khi gọi API chat:", error);
                setTypingIndicator(false);
                // ✨ [CẢI TIẾN] Thông báo lỗi thân thiện hơn cho trường hợp timeout
                let errorMessage = `Xin lỗi, tôi gặp lỗi: ${error.message}`;
                if (error.message.includes('504') || error.message.toLowerCase().includes('timeout')) {
                    errorMessage = 'Xin lỗi, yêu cầu của bạn mất quá nhiều thời gian để xử lý. Vui lòng thử lại sau.';
                }
                addMessageToChat('bot', errorMessage);
            });
    };

    chatSendButton.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    async function addMessageToChat(sender, text) {
        const isBot = sender === 'bot';

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);

        if (isBot) {
            // ✨ [MỚI] Bắt đầu hiệu ứng gõ chữ cho bot
            await typeMessage(contentDiv, text);
        } else {
            contentDiv.textContent = text;
        }

        scrollToBottom();
    }

    /**
     * ✨ [MỚI] Hàm tạo hiệu ứng gõ chữ cho một phần tử.
     * @param {HTMLElement} element - Phần tử để hiển thị văn bản.
     * @param {string} text - Toàn bộ văn bản cần gõ.
     */
    async function typeMessage(element, text) {
        for (let i = 0; i < text.length; i++) {
            element.innerHTML = markdownToHtml(text.substring(0, i + 1));
            scrollToBottom();
            await new Promise(resolve => setTimeout(resolve, 20)); // Điều chỉnh tốc độ gõ ở đây (ms)
        }
        // Sau khi gõ xong, đảm bảo toàn bộ nội dung được render chính xác
        element.innerHTML = markdownToHtml(text);
    }

    /**
     * ✨ [MỚI] Chuyển đổi chuỗi Markdown đơn giản sang HTML.
     * Hỗ trợ: **in đậm**, *in nghiêng*, danh sách không thứ tự (*), và xuống dòng.
     * @param {string} text - Chuỗi văn bản Markdown.
     * @returns {string} - Chuỗi HTML đã được định dạng.
     */
    function markdownToHtml(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // In đậm
            .replace(/\*(.*?)\*/g, '<em>$1</em>')       // In nghiêng
            .replace(/^\s*\*\s(.*)/gm, '<ul><li>$1</li></ul>') // Danh sách
            .replace(/<\/ul>\n<ul>/g, '') // Nối các danh sách liền kề
            .replace(/\n/g, '<br>'); // Xuống dòng
    }

    function setTypingIndicator(isTyping) {
        let typingIndicator = document.getElementById('typing-indicator');

        // Dọn dẹp interval cũ nếu có
        if (typingIndicatorInterval) {
            clearInterval(typingIndicatorInterval);
            typingIndicatorInterval = null;
        }

        if (isTyping) {
            if (!typingIndicator) {
                typingIndicator = document.createElement('div');
                typingIndicator.id = 'typing-indicator';
                typingIndicator.className = 'message bot-message typing';
                // Bắt đầu với một dấu chấm
                typingIndicator.innerHTML = '<div class="message-content">.</div>';
                chatMessages.appendChild(typingIndicator);
                scrollToBottom();
            }

            // ✨ [MỚI] Tạo hiệu ứng "đang suy nghĩ"
            const typingContent = typingIndicator.querySelector('.message-content');
            let dotCount = 1;
            typingIndicatorInterval = setInterval(() => {
                dotCount = (dotCount % 3) + 1; // Lặp lại từ 1, 2, 3
                typingContent.textContent = '.'.repeat(dotCount);
            }, 500); // Thay đổi 500ms một lần
        } else {
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});